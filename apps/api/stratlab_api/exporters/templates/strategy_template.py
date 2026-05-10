"""StratLab — exported strategy: __STRATEGY_NAME__

This is a self-contained Python script. It depends only on `ccxt`, `numpy`,
and `pandas` (see requirements.txt). It loads OHLCV from Binance, computes
the indicators, runs a simplified long-only bar-loop backtester, and prints
the headline metrics.

Run:
    pip install -r requirements.txt
    python strategy.py

The strategy spec at the top of this file is the same JSON the StratLab
backend uses — the LLM emitted it via tool-use, Pydantic validated it, and
the engine ran it. You can edit the params in-place and re-run to iterate
locally.

Note: this is a SIMPLIFIED port of the production engine. It is long-only,
uses fixed-fraction sizing (no vol-target), and does not compute the
anti-overfit views (sensitivity halo, regime decomposition, cost stress).
For those, run the strategy in StratLab itself.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime, timedelta

import ccxt
import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Strategy spec — edit values here to iterate locally.
# ---------------------------------------------------------------------------

STRATEGY: dict = json.loads(r"""
__SCHEMA_JSON__
""")


# ---------------------------------------------------------------------------
# Indicator library — closed vocabulary; matches StratLab's registry.
# Every function is causal (look-ahead-free) on its own. The signal evaluator
# also shifts the final entry/exit by 1 bar so a rule formed at bar t fires
# at bar t+1.
# ---------------------------------------------------------------------------


def _close(df, on="close", **_):
    return df[on if on in df.columns else "close"]


def _open(df, **_):
    return df["open"]


def _high(df, **_):
    return df["high"]


def _low(df, **_):
    return df["low"]


def _volume(df, **_):
    return df["volume"]


def _sma(df, period, on="close", **_):
    return df[on].rolling(int(period), min_periods=int(period)).mean()


def _ema(df, period, on="close", **_):
    p = int(period)
    return df[on].ewm(span=p, adjust=False, min_periods=p).mean()


def _rsi(df, period, on="close", **_):
    p = int(period)
    delta = df[on].diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_g = gain.ewm(alpha=1 / p, adjust=False, min_periods=p).mean()
    avg_l = loss.ewm(alpha=1 / p, adjust=False, min_periods=p).mean()
    rs = avg_g / avg_l.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


def _bbands_mid(df, period, on="close", **_):
    p = int(period)
    return df[on].rolling(p, min_periods=p).mean()


def _bbands_upper(df, period, num_std=2.0, on="close", **_):
    p = int(period)
    mid = df[on].rolling(p, min_periods=p).mean()
    std = df[on].rolling(p, min_periods=p).std(ddof=0)
    return mid + float(num_std) * std


def _bbands_lower(df, period, num_std=2.0, on="close", **_):
    p = int(period)
    mid = df[on].rolling(p, min_periods=p).mean()
    std = df[on].rolling(p, min_periods=p).std(ddof=0)
    return mid - float(num_std) * std


def _true_range(df):
    high, low, close = df["high"], df["low"], df["close"]
    prev_close = close.shift(1)
    return pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)


def _atr(df, period, **_):
    p = int(period)
    return _true_range(df).ewm(alpha=1 / p, adjust=False, min_periods=p).mean()


def _stdev(df, period, on="close", **_):
    p = int(period)
    return df[on].rolling(p, min_periods=p).std(ddof=0)


def _realized_vol(df, period, on="close", **_):
    p = int(period)
    log_ret = np.log(df[on] / df[on].shift(1))
    return log_ret.rolling(p, min_periods=p).std(ddof=0)


def _slope(df, period, on="close", **_):
    p = int(period)
    return (df[on] - df[on].shift(p)) / df[on].shift(p)


def _adx(df, period, **_):
    p = int(period)
    high, low = df["high"], df["low"]
    up_move = high.diff()
    down_move = -low.diff()
    plus_dm = up_move.where((up_move > down_move) & (up_move > 0), 0.0)
    minus_dm = down_move.where((down_move > up_move) & (down_move > 0), 0.0)
    tr = _true_range(df)
    atr_v = tr.ewm(alpha=1 / p, adjust=False, min_periods=p).mean()
    plus_di = 100 * plus_dm.ewm(alpha=1 / p, adjust=False, min_periods=p).mean() / atr_v
    minus_di = 100 * minus_dm.ewm(alpha=1 / p, adjust=False, min_periods=p).mean() / atr_v
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return dx.ewm(alpha=1 / p, adjust=False, min_periods=p).mean()


def _rolling_max(df, period, on="high", **_):
    p = int(period)
    return df[on].shift(1).rolling(p, min_periods=p).max()


def _rolling_min(df, period, on="low", **_):
    p = int(period)
    return df[on].shift(1).rolling(p, min_periods=p).min()


INDICATORS = {
    "close": _close, "open": _open, "high": _high, "low": _low, "volume": _volume,
    "sma": _sma, "ema": _ema, "rsi": _rsi,
    "bbands_mid": _bbands_mid, "bbands_upper": _bbands_upper, "bbands_lower": _bbands_lower,
    "atr": _atr, "stdev": _stdev, "realized_vol": _realized_vol,
    "slope": _slope, "adx": _adx,
    "rolling_max": _rolling_max, "rolling_min": _rolling_min,
}


# ---------------------------------------------------------------------------
# Signal evaluator — recursive over the ExprNode tree.
# ---------------------------------------------------------------------------


def evaluate(node: dict, df: pd.DataFrame) -> pd.Series:
    t = node["type"]
    if t == "constant":
        return pd.Series(float(node["value"]), index=df.index, dtype="float64")
    if t == "indicator":
        fn = INDICATORS[node["name"]]
        return fn(df, on=node.get("on", "close"), **(node.get("params") or {}))
    if t == "comparison":
        left = evaluate(node["left"], df)
        right = evaluate(node["right"], df)
        op = node["op"]
        if op == "gt":
            return (left > right).fillna(False)
        if op == "lt":
            return (left < right).fillna(False)
        if op == "gte":
            return (left >= right).fillna(False)
        if op == "lte":
            return (left <= right).fillna(False)
        if op == "eq":
            return (left == right).fillna(False)
        if op == "cross_above":
            diff = left - right
            return ((diff > 0) & (diff.shift(1) <= 0)).fillna(False)
        if op == "cross_below":
            diff = left - right
            return ((diff < 0) & (diff.shift(1) >= 0)).fillna(False)
        raise ValueError(f"unknown comparison op: {op}")
    if t == "logical":
        op = node["op"]
        operands = [evaluate(o, df) for o in node["operands"]]
        if op == "and":
            out = operands[0]
            for s in operands[1:]:
                out = out & s
            return out.fillna(False)
        if op == "or":
            out = operands[0]
            for s in operands[1:]:
                out = out | s
            return out.fillna(False)
        if op == "not":
            return (~operands[0]).fillna(False)
    raise ValueError(f"unknown node type: {t}")


def build_signals(spec: dict, df: pd.DataFrame) -> tuple[pd.Series, pd.Series | None]:
    """Build entry/exit signals from the spec, with the load-bearing 1-bar shift.

    The shift means a signal computable at the close of bar t fires at bar t+1.
    Without it, the engine would peek into the future.
    """
    entries = evaluate(spec["entry"], df).astype(bool).shift(1).fillna(False)
    exits = None
    if spec.get("exit"):
        exits = evaluate(spec["exit"], df).astype(bool).shift(1).fillna(False)
    return entries, exits


# ---------------------------------------------------------------------------
# Simplified bar-loop backtester (long-only, fixed-fraction sizing).
# ---------------------------------------------------------------------------


def simulate(spec: dict, df: pd.DataFrame, entries: pd.Series, exits: pd.Series | None) -> dict:
    n = len(df)
    fee = spec["costs"]["fee_bps"] / 10_000.0
    slip = spec["costs"]["slippage_bps"] / 10_000.0
    sl = spec["risk"].get("stop_loss_pct")
    tp = spec["risk"].get("take_profit_pct")
    fraction = spec["sizing"].get("fraction", 1.0)

    closes = df["close"].to_numpy()
    highs = df["high"].to_numpy()
    lows = df["low"].to_numpy()
    e = entries.to_numpy(dtype=bool)
    x = exits.to_numpy(dtype=bool) if exits is not None else None

    cash = 1.0
    units = 0.0
    in_pos = False
    entry_price = 0.0
    entry_idx = -1
    equity_hist = np.zeros(n)
    trades: list[dict] = []

    for i in range(n):
        price = float(closes[i])
        eq = cash + units * price if in_pos else cash

        if in_pos:
            exit_price = None
            reason = None
            high = float(highs[i])
            low = float(lows[i])
            if sl is not None and low <= entry_price * (1 - sl):
                exit_price = entry_price * (1 - sl)
                reason = "stop_loss"
            elif tp is not None and high >= entry_price * (1 + tp):
                exit_price = entry_price * (1 + tp)
                reason = "take_profit"
            elif x is not None and x[i]:
                exit_price = price * (1 - slip)
                reason = "signal"

            if exit_price is not None:
                proceeds = units * exit_price
                exit_fee = proceeds * fee
                cost_basis = units * entry_price
                pnl = (exit_price - entry_price) * units - exit_fee
                cash = cash + proceeds - exit_fee
                trades.append({
                    "entry_idx": entry_idx, "exit_idx": i,
                    "entry_price": entry_price, "exit_price": exit_price,
                    "size": units, "pnl": pnl,
                    "return_pct": pnl / cost_basis if cost_basis else 0.0,
                    "bars_held": i - entry_idx, "exit_reason": reason,
                })
                in_pos = False
                units = 0.0
                eq = cash

        if not in_pos and e[i]:
            fill = price * (1 + slip)
            notional = max(eq, 0.0) * fraction
            entry_fee = notional * fee
            cash -= notional + entry_fee
            units = notional / fill
            entry_price = fill
            entry_idx = i
            in_pos = True
            eq = cash + units * price

        equity_hist[i] = eq

    if in_pos:
        i = n - 1
        exit_price = float(closes[i]) * (1 - slip)
        proceeds = units * exit_price
        exit_fee = proceeds * fee
        cost_basis = units * entry_price
        pnl = (exit_price - entry_price) * units - exit_fee
        cash = cash + proceeds - exit_fee
        trades.append({
            "entry_idx": entry_idx, "exit_idx": i,
            "entry_price": entry_price, "exit_price": exit_price,
            "size": units, "pnl": pnl,
            "return_pct": pnl / cost_basis if cost_basis else 0.0,
            "bars_held": i - entry_idx, "exit_reason": "end_of_data",
        })
        equity_hist[-1] = cash

    return {"equity": pd.Series(equity_hist, index=df.index), "trades": trades}


# ---------------------------------------------------------------------------
# Metrics — annualized using bars-per-year by timeframe.
# ---------------------------------------------------------------------------

PPY = {"1h": 365 * 24, "4h": 365 * 6, "1d": 365}


def metrics(equity: pd.Series, trades: list[dict], timeframe: str) -> dict:
    ppy = PPY.get(timeframe, 365)
    bar_ret = equity.pct_change().dropna()
    if len(bar_ret) > 1 and bar_ret.std(ddof=0) > 0:
        sharpe = float(bar_ret.mean() / bar_ret.std(ddof=0) * np.sqrt(ppy))
    else:
        sharpe = 0.0
    total = (
        float(equity.iloc[-1] / equity.iloc[0] - 1)
        if len(equity) and equity.iloc[0] != 0 else 0.0
    )
    dd = (equity / equity.cummax() - 1).min() if len(equity) else 0.0
    wins = [t for t in trades if t["pnl"] > 0]
    return {
        "sharpe": sharpe,
        "total_return": total,
        "max_drawdown": float(dd),
        "num_trades": len(trades),
        "win_rate": len(wins) / len(trades) if trades else 0.0,
    }


# ---------------------------------------------------------------------------
# OHLCV loader — Binance public REST via ccxt.
# Note: Binance.com is geo-blocked from US IPs. If you hit a 451, swap
# `binance` for `binanceus` or `bybit` (both ccxt-supported and free).
# ---------------------------------------------------------------------------

ASSET_TO_SYMBOL = {"BTC": "BTC/USDT", "ETH": "ETH/USDT", "SOL": "SOL/USDT"}
TF_TO_CCXT = {"1h": "1h", "4h": "4h", "1d": "1d"}
TF_TO_DELTA = {"1h": timedelta(hours=1), "4h": timedelta(hours=4), "1d": timedelta(days=1)}


def fetch_ohlcv(asset: str, timeframe: str, start: str, end: str) -> pd.DataFrame:
    symbol = ASSET_TO_SYMBOL[asset]
    tf = TF_TO_CCXT[timeframe]
    delta = TF_TO_DELTA[timeframe]
    exchange = ccxt.binance({"enableRateLimit": True})
    start_ms = int(datetime.fromisoformat(start).replace(tzinfo=UTC).timestamp() * 1000)
    end_ms = int(datetime.fromisoformat(end).replace(tzinfo=UTC).timestamp() * 1000)
    rows: list[list[float]] = []
    cursor = start_ms
    while cursor < end_ms:
        chunk = exchange.fetch_ohlcv(symbol, timeframe=tf, since=cursor, limit=1000)
        if not chunk:
            break
        rows.extend(chunk)
        last_ts = chunk[-1][0]
        cursor = last_ts + int(delta.total_seconds() * 1000)
        if last_ts >= end_ms:
            break
    if not rows:
        raise SystemExit(f"no OHLCV returned for {symbol} {tf}")
    df = pd.DataFrame(rows, columns=["ts", "open", "high", "low", "close", "volume"])
    df["ts"] = pd.to_datetime(df["ts"], unit="ms", utc=True)
    df = df.drop_duplicates("ts").set_index("ts").sort_index()
    df = df[(df.index >= pd.Timestamp(start, tz="UTC")) & (df.index <= pd.Timestamp(end, tz="UTC"))]
    return df


# ---------------------------------------------------------------------------
# Entrypoint.
# ---------------------------------------------------------------------------


def main():
    spec = STRATEGY
    print(f"strategy: {spec['name']}")
    print(f"asset:    {spec['data']['asset']} · {spec['data']['timeframe']}")
    print(f"period:   {spec['data']['start']} → {spec['data']['end']}")
    print()
    print("loading OHLCV from Binance...", flush=True)
    df = fetch_ohlcv(
        spec["data"]["asset"], spec["data"]["timeframe"],
        spec["data"]["start"], spec["data"]["end"],
    )
    print(f"loaded {len(df)} bars from {df.index[0]} to {df.index[-1]}")
    print()
    entries, exits = build_signals(spec, df)
    result = simulate(spec, df, entries, exits)
    m = metrics(result["equity"], result["trades"], spec["data"]["timeframe"])
    print("=" * 50)
    print("results")
    print("=" * 50)
    print(f"  Sharpe:        {m['sharpe']:+.2f}")
    print(f"  Total return:  {m['total_return']:+.2%}")
    print(f"  Max drawdown:  {m['max_drawdown']:+.2%}")
    print(f"  Trades:        {m['num_trades']}")
    print(f"  Win rate:      {m['win_rate']:.1%}")
    print()
    print("(StratLab-side anti-overfit views — sensitivity halo, regime "
          "decomposition, cost stress — are not reproduced here. Run the "
          "strategy in the workbench to see them.)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
