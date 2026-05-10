"""Indicator registry: name → callable. The closed vocabulary the LLM is
allowed to reference (mirrored in stratlab_schema.strategy.INDICATOR_NAMES).

Every indicator function takes (df: pd.DataFrame, on: str, **params) and
returns a Series aligned to df.index. `on` is honored for series-of-prices
indicators (sma, ema, rsi, etc.) and ignored for OHLCV-aware ones (atr, adx)
where the formula reads multiple columns.

Look-ahead discipline: every indicator computes from rolling/ewm/diff windows
that look BACKWARD only. Never .shift(-N). The compiler also .shift(1)s the
final entry/exit signal, but indicators must already be causal on their own.
"""

from collections.abc import Callable

import numpy as np
import pandas as pd

# ---- price/volume accessors (trivial, but registered for symmetry) ---------


def _close(df, on="close", **_):
    return df[on if on in df.columns else "close"]


def _open(df, on="close", **_):
    return df["open"]


def _high(df, on="close", **_):
    return df["high"]


def _low(df, on="close", **_):
    return df["low"]


def _volume(df, on="close", **_):
    return df["volume"]


# ---- moving averages -------------------------------------------------------


def sma(df, period: int, on: str = "close", **_):
    return df[on].rolling(int(period), min_periods=int(period)).mean()


def ema(df, period: int, on: str = "close", **_):
    p = int(period)
    return df[on].ewm(span=p, adjust=False, min_periods=p).mean()


# ---- RSI (Wilder) ----------------------------------------------------------


def rsi(df, period: int, on: str = "close", **_):
    p = int(period)
    series = df[on]
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.ewm(alpha=1 / p, adjust=False, min_periods=p).mean()
    avg_loss = loss.ewm(alpha=1 / p, adjust=False, min_periods=p).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


# ---- Bollinger Bands -------------------------------------------------------


def _bbands_components(series: pd.Series, period: int, num_std: float):
    mid = series.rolling(period, min_periods=period).mean()
    std = series.rolling(period, min_periods=period).std(ddof=0)
    return mid, std


def bbands_mid(df, period: int, num_std: float = 2.0, on: str = "close", **_):
    p = int(period)
    return df[on].rolling(p, min_periods=p).mean()


def bbands_upper(df, period: int, num_std: float = 2.0, on: str = "close", **_):
    p = int(period)
    mid, std = _bbands_components(df[on], p, num_std)
    return mid + float(num_std) * std


def bbands_lower(df, period: int, num_std: float = 2.0, on: str = "close", **_):
    p = int(period)
    mid, std = _bbands_components(df[on], p, num_std)
    return mid - float(num_std) * std


# ---- ATR / true range ------------------------------------------------------


def _true_range(df: pd.DataFrame) -> pd.Series:
    high, low, close = df["high"], df["low"], df["close"]
    prev_close = close.shift(1)
    return pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)


def atr(df, period: int, on: str = "close", **_):
    p = int(period)
    tr = _true_range(df)
    return tr.ewm(alpha=1 / p, adjust=False, min_periods=p).mean()


# ---- volatility ------------------------------------------------------------


def stdev(df, period: int, on: str = "close", **_):
    p = int(period)
    return df[on].rolling(p, min_periods=p).std(ddof=0)


def realized_vol(df, period: int, on: str = "close", **_):
    """Rolling stdev of log returns (NOT annualized).

    Two `realized_vol` values from the same dataframe are unit-compatible —
    that's all the schema needs (e.g. `realized_vol(30) < realized_vol(180)`).
    """
    p = int(period)
    log_ret = np.log(df[on] / df[on].shift(1))
    return log_ret.rolling(p, min_periods=p).std(ddof=0)


# ---- trend -----------------------------------------------------------------


def slope(df, period: int, on: str = "close", **_):
    """Simple proxy for the `period`-bar slope of `on`: (current - past) / past.

    Returns a unitless rate of change. Positive = uptrend over the window.
    """
    p = int(period)
    return (df[on] - df[on].shift(p)) / df[on].shift(p)


def adx(df, period: int, on: str = "close", **_):
    """Wilder's ADX. Reads high/low/close from df; `on` is ignored."""
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


# ---- rolling extremes ------------------------------------------------------


def rolling_max(df, period: int, on: str = "high", **_):
    """Max of the PRIOR `period` bars (excluding current).

    This matches Donchian-channel convention: a breakout strategy compares
    today's close to the highest high of the prior N bars. Including today
    would make `close > rolling_max(high, N)` impossible, since close ≤ high.
    """
    p = int(period)
    return df[on].shift(1).rolling(p, min_periods=p).max()


def rolling_min(df, period: int, on: str = "low", **_):
    """Min of the PRIOR `period` bars (excluding current). See `rolling_max`."""
    p = int(period)
    return df[on].shift(1).rolling(p, min_periods=p).min()


# ---- registry --------------------------------------------------------------

INDICATORS: dict[str, Callable[..., pd.Series]] = {
    # price/volume accessors
    "close": _close,
    "open": _open,
    "high": _high,
    "low": _low,
    "volume": _volume,
    # moving averages
    "sma": sma,
    "ema": ema,
    # oscillators
    "rsi": rsi,
    # bands
    "bbands_mid": bbands_mid,
    "bbands_upper": bbands_upper,
    "bbands_lower": bbands_lower,
    # volatility
    "atr": atr,
    "stdev": stdev,
    "realized_vol": realized_vol,
    # trend
    "slope": slope,
    "adx": adx,
    # rolling extremes
    "rolling_max": rolling_max,
    "rolling_min": rolling_min,
}


def compute_indicator(name: str, df: pd.DataFrame, params: dict, on: str) -> pd.Series:
    if name not in INDICATORS:
        raise KeyError(f"unknown indicator '{name}'; allowed: {sorted(INDICATORS)}")
    return INDICATORS[name](df, on=on, **params)
