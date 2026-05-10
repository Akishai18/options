"""The bar-loop backtester.

Single-position long or short, fixed-fraction or vol-target sizing,
fee + slippage modeling in bps, intra-bar stop-loss / take-profit using
high/low.

Look-ahead is the compiler's responsibility: signals coming in are already
shifted, so signal[t] == True means "act at bar t's close." This module
trusts that invariant and never .shift()s anything.
"""

from __future__ import annotations

import hashlib
import warnings
from datetime import UTC, datetime

import numpy as np
import pandas as pd
from stratlab_schema import Side, StrategySchema

from stratlab_engine.compiler import SignalSpec, compile_strategy
from stratlab_engine.data.universe import periods_per_year
from stratlab_engine.overfitting.cost_stress import run_cost_stress
from stratlab_engine.overfitting.regime import compute_regimes
from stratlab_engine.overfitting.sensitivity import run_sensitivity
from stratlab_engine.results import BacktestResult, MetricsBlock, TradeRecord
from stratlab_engine.splits import compute_metrics, split_indices

# Lookback for realized-vol estimate when sizing.mode == "vol_target".
# 30 bars is a reasonable default for any timeframe; not exposed in the schema
# yet — could promote to a sizing parameter later.
VOL_LOOKBACK_BARS = 30


def run_backtest(
    schema: StrategySchema,
    df: pd.DataFrame,
    *,
    _skip_overfitting: bool = False,
) -> BacktestResult:
    """Run a backtest of `schema` against the provided OHLCV `df`.

    `df` must already be sliced to schema.data.start..end and have a
    tz-aware DatetimeIndex with columns [open, high, low, close, volume].

    `_skip_overfitting` is a private flag used by the cost_stress reruns
    so they don't recurse into more cost-stress passes.
    """
    if df.empty:
        raise ValueError("OHLCV DataFrame is empty")

    spec = compile_strategy(schema, df)
    equity_history, in_pos_history, trades = _simulate(schema, spec)

    equity = pd.Series(equity_history, index=df.index, dtype="float64")
    in_position = pd.Series(in_pos_history, index=df.index, dtype="bool")

    benchmark = (df["close"] / df["close"].iloc[0]).astype("float64")
    drawdown = (equity / equity.cummax() - 1).astype("float64")

    metrics_full = compute_metrics("full", equity, trades, schema.data.timeframe, in_position)
    metrics_benchmark = compute_metrics("benchmark", benchmark, [], schema.data.timeframe, None)

    n = len(df)
    s_train, s_val, s_test = split_indices(n, schema.splits)
    metrics_train = _split_metrics("train", equity, trades, in_position, s_train, schema)
    metrics_val = _split_metrics("val", equity, trades, in_position, s_val, schema)
    metrics_test = _split_metrics("test", equity, trades, in_position, s_test, schema)

    cost_stress = []
    regime_breakdown = None
    sensitivity_halo = None
    if not _skip_overfitting:
        cost_stress = run_cost_stress(schema, df)
        regime_breakdown = compute_regimes(equity, df["close"], schema.data.timeframe, s_test)
        sensitivity_halo = run_sensitivity(schema, df, equity, metrics_test, s_test)

    return BacktestResult(
        schema_name=schema.name,
        schema_hash=_schema_hash(schema),
        ran_at=datetime.now(UTC),
        equity_curve=list(zip(equity.index.to_pydatetime(), equity.to_list(), strict=True)),
        benchmark_curve=list(
            zip(benchmark.index.to_pydatetime(), benchmark.to_list(), strict=True)
        ),
        drawdown_curve=list(
            zip(drawdown.index.to_pydatetime(), drawdown.to_list(), strict=True)
        ),
        trades=trades,
        metrics_full=metrics_full,
        metrics_train=metrics_train,
        metrics_val=metrics_val,
        metrics_test=metrics_test,
        metrics_benchmark_full=metrics_benchmark,
        cost_stress=cost_stress,
        regime_breakdown=regime_breakdown,
        sensitivity_halo=sensitivity_halo,
        data_start=df.index[0].to_pydatetime(),
        data_end=df.index[-1].to_pydatetime(),
        bars=n,
    )


# ---- core simulation -------------------------------------------------------


def _simulate(
    schema: StrategySchema,
    spec: SignalSpec,
) -> tuple[list[float], list[bool], list[TradeRecord]]:
    df = spec.df
    n = len(df)

    side_long = schema.side != Side.SHORT  # BOTH falls through to LONG (warned below)
    if schema.side == Side.BOTH:
        warnings.warn(
            "side='both' is not supported by V1 engine; treated as long-only.",
            stacklevel=2,
        )
    if schema.sizing.mode == "fixed_notional":
        warnings.warn(
            "sizing.mode='fixed_notional' is not implemented in V1; "
            "falling back to fixed_fraction with cap=fraction.",
            stacklevel=2,
        )
    fee = schema.costs.fee_bps / 10_000.0
    slip = schema.costs.slippage_bps / 10_000.0
    sl = schema.risk.stop_loss_pct
    tp = schema.risk.take_profit_pct
    sizing_cap = schema.sizing.fraction  # used as cap for vol_target, as size for fixed_fraction
    sizing_mode = schema.sizing.mode
    vol_target = schema.sizing.vol_target_annual
    ppy = periods_per_year(schema.data.timeframe)

    cash = 1.0           # starting equity, normalized
    units = 0.0          # asset units held (positive long, "negative" short via separate flag)
    position_dir = 0     # +1 long, -1 short, 0 flat
    entry_price = 0.0
    entry_idx = -1

    closes = df["close"].to_numpy()
    highs = df["high"].to_numpy()
    lows = df["low"].to_numpy()
    entries = spec.entries.to_numpy(dtype=bool)
    exits = spec.exits.to_numpy(dtype=bool) if spec.exits is not None else None

    equity_history: list[float] = [0.0] * n
    in_pos_history: list[bool] = [False] * n
    trades: list[TradeRecord] = []

    for i in range(n):
        price = float(closes[i])

        # Mark-to-market equity for this bar.
        if position_dir == 1:
            equity = cash + units * price
        elif position_dir == -1:
            # Short: we received `entry_price * units` cash at entry, owe `price * units` now.
            equity = cash - units * price
        else:
            equity = cash

        # ---- exit logic ----
        if position_dir != 0:
            exit_price = None
            exit_reason: str | None = None
            high = float(highs[i])
            low = float(lows[i])

            if position_dir == 1:
                if sl is not None and low <= entry_price * (1 - sl):
                    exit_price = entry_price * (1 - sl)
                    exit_reason = "stop_loss"
                elif tp is not None and high >= entry_price * (1 + tp):
                    exit_price = entry_price * (1 + tp)
                    exit_reason = "take_profit"
                elif exits is not None and exits[i]:
                    exit_price = price * (1 - slip)
                    exit_reason = "signal"
            else:  # short
                if sl is not None and high >= entry_price * (1 + sl):
                    exit_price = entry_price * (1 + sl)
                    exit_reason = "stop_loss"
                elif tp is not None and low <= entry_price * (1 - tp):
                    exit_price = entry_price * (1 - tp)
                    exit_reason = "take_profit"
                elif exits is not None and exits[i]:
                    exit_price = price * (1 + slip)
                    exit_reason = "signal"

            if exit_price is not None:
                cash, pnl, ret = _settle_exit(
                    cash, units, entry_price, exit_price, position_dir, fee
                )
                trades.append(TradeRecord(
                    entry_ts=df.index[entry_idx].to_pydatetime(),
                    exit_ts=df.index[i].to_pydatetime(),
                    side="long" if position_dir == 1 else "short",
                    entry_price=entry_price,
                    exit_price=exit_price,
                    size=units,
                    pnl=pnl,
                    return_pct=ret,
                    bars_held=i - entry_idx,
                    exit_reason=exit_reason,  # type: ignore[arg-type]
                ))
                position_dir = 0
                units = 0.0
                entry_idx = -1
                # recompute equity post-exit so this bar's mark reflects the close
                equity = cash

        # ---- entry logic ----
        if position_dir == 0 and entries[i]:
            target_dir = 1 if side_long else -1
            fill_price = price * (1 + slip) if target_dir == 1 else price * (1 - slip)
            position_pct = _position_size_pct(
                sizing_mode, sizing_cap, vol_target, closes, i, ppy,
            )
            target_notional = max(equity, 0.0) * position_pct
            entry_fee = target_notional * fee
            if target_dir == 1:
                # Long: pay cash, receive units.
                cash -= target_notional + entry_fee
                units = target_notional / fill_price
            else:
                # Short: receive cash from sale, owe units back at exit.
                cash += target_notional - entry_fee
                units = target_notional / fill_price
            entry_price = fill_price
            entry_idx = i
            position_dir = target_dir
            # Re-mark equity at the just-opened position.
            equity = cash + units * price if position_dir == 1 else cash - units * price

        equity_history[i] = equity
        in_pos_history[i] = position_dir != 0

    # ---- close out at end of data ----
    if position_dir != 0:
        i = n - 1
        exit_price = float(closes[i]) * ((1 - slip) if position_dir == 1 else (1 + slip))
        cash, pnl, ret = _settle_exit(cash, units, entry_price, exit_price, position_dir, fee)
        trades.append(TradeRecord(
            entry_ts=df.index[entry_idx].to_pydatetime(),
            exit_ts=df.index[i].to_pydatetime(),
            side="long" if position_dir == 1 else "short",
            entry_price=entry_price,
            exit_price=exit_price,
            size=units,
            pnl=pnl,
            return_pct=ret,
            bars_held=i - entry_idx,
            exit_reason="end_of_data",
        ))
        equity_history[-1] = cash

    return equity_history, in_pos_history, trades


def _position_size_pct(
    mode: str,
    cap: float,
    vol_target: float | None,
    closes: np.ndarray,
    i: int,
    periods_per_year_value: float,
) -> float:
    """Return the position size as a fraction of equity for an entry at bar i.

    - fixed_fraction: returns `cap` directly.
    - vol_target: scales position so realized vol of the asset matches target,
      capped at `cap`. Uses trailing VOL_LOOKBACK_BARS log returns.
      Falls back to `cap` if not enough history or asset_vol is ~zero.
    - fixed_notional: not implemented; falls back to `cap`.
    """
    if mode == "vol_target" and vol_target is not None and i >= VOL_LOOKBACK_BARS:
        prior = closes[i - VOL_LOOKBACK_BARS : i]
        log_ret = np.diff(np.log(prior))
        asset_vol = float(np.std(log_ret, ddof=0)) * np.sqrt(periods_per_year_value)
        if asset_vol > 1e-9:
            return float(min(vol_target / asset_vol, cap))
    return cap


def _settle_exit(
    cash: float, units: float, entry_price: float, exit_price: float, dir_: int, fee: float
) -> tuple[float, float, float]:
    """Close out a position; return (new_cash, pnl, return_pct on cost basis)."""
    if dir_ == 1:
        proceeds = units * exit_price
        exit_fee = proceeds * fee
        new_cash = cash + proceeds - exit_fee
        cost_basis = units * entry_price
        pnl = (exit_price - entry_price) * units - exit_fee
        ret = pnl / cost_basis if cost_basis > 0 else 0.0
        return new_cash, pnl, ret
    else:
        # Short: we owe `units * exit_price` to close, after pocketing entry proceeds.
        cost_to_cover = units * exit_price
        exit_fee = cost_to_cover * fee
        new_cash = cash - cost_to_cover - exit_fee
        cost_basis = units * entry_price
        pnl = (entry_price - exit_price) * units - exit_fee
        ret = pnl / cost_basis if cost_basis > 0 else 0.0
        return new_cash, pnl, ret


def _split_metrics(
    label: str,
    equity: pd.Series,
    trades: list[TradeRecord],
    in_position: pd.Series,
    s: slice,
    schema: StrategySchema,
) -> MetricsBlock | None:
    if s.stop <= s.start:
        return None
    eq_slice = equity.iloc[s]
    if eq_slice.empty:
        return None
    start_ts = eq_slice.index[0]
    end_ts = eq_slice.index[-1]
    trades_in = [t for t in trades if start_ts <= pd.Timestamp(t.exit_ts) <= end_ts]
    return compute_metrics(label, eq_slice, trades_in, schema.data.timeframe, in_position.iloc[s])


def _schema_hash(schema: StrategySchema) -> str:
    return hashlib.sha256(schema.model_dump_json().encode()).hexdigest()[:16]
