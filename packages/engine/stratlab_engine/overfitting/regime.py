"""Regime decomposition: where does the strategy actually make money?

Slices the test-period equity curve by two independent classifiers:
  - Volatility regime: rolling stdev of log returns, median split → low / high
  - Trend regime: sign of slope of price 50-bar SMA → trending / sideways

For each regime, we recompute Sharpe from the per-bar strategy returns when
the bar belongs to that regime. This surfaces strategies that look great
overall but only work in one regime — a common overfit signature.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from pydantic import BaseModel
from stratlab_schema import Timeframe

from stratlab_engine.data.universe import periods_per_year

VOL_LOOKBACK_BARS = 30
TREND_SMA_BARS = 50


class RegimeStat(BaseModel):
    """One regime cell: how the strategy did during these bars."""

    label: str        # "low_vol" | "high_vol" | "trending" | "sideways"
    bars: int         # how many bars matched this regime
    fraction: float   # share of the test window that fell in this regime
    sharpe: float     # annualized, using only bars in this regime
    mean_return: float  # mean per-bar return in this regime


class RegimeBreakdown(BaseModel):
    """Bundle of regime stats for the test window."""

    low_vol: RegimeStat
    high_vol: RegimeStat
    trending: RegimeStat
    sideways: RegimeStat
    note: str = ""    # human-readable note when regimes are degenerate


def compute_regimes(
    equity: pd.Series,
    closes: pd.Series,
    timeframe: Timeframe,
    test_slice: slice,
) -> RegimeBreakdown | None:
    """Compute regime stats for the test window.

    `equity` and `closes` must be the FULL series; test_slice picks the OOS
    region. Regime classifiers are computed on full-series data so the median
    isn't biased by the small test window, but the per-regime Sharpe is
    computed only on test-window bars.

    Returns None if the test window is too small (<60 bars) to be meaningful.
    """
    test_eq = equity.iloc[test_slice]
    if len(test_eq) < 60:
        return None

    ppy = periods_per_year(timeframe)
    log_ret = np.log(closes / closes.shift(1))
    vol = log_ret.rolling(VOL_LOOKBACK_BARS, min_periods=VOL_LOOKBACK_BARS).std()
    sma = closes.rolling(TREND_SMA_BARS, min_periods=TREND_SMA_BARS).mean()
    trend_slope = sma - sma.shift(20)

    # Per-bar strategy returns (full series).
    strat_ret = equity.pct_change()

    # Slice to the test window.
    vol_test = vol.iloc[test_slice]
    trend_test = trend_slope.iloc[test_slice]
    ret_test = strat_ret.iloc[test_slice]

    # Drop bars where any classifier is NaN.
    valid = vol_test.notna() & trend_test.notna() & ret_test.notna()
    vol_v = vol_test[valid]
    trend_v = trend_test[valid]
    ret_v = ret_test[valid]

    notes: list[str] = []
    if len(ret_v) < 60:
        notes.append("regime stats limited — fewer than 60 valid bars")

    # Classify by vol/trend medians (so we always get a balanced split).
    vol_thr = vol_v.median()
    low_mask = vol_v <= vol_thr
    high_mask = vol_v > vol_thr
    trending_mask = trend_v > 0
    sideways_mask = trend_v <= 0

    return RegimeBreakdown(
        low_vol=_stat("low_vol", ret_v[low_mask], len(ret_v), ppy),
        high_vol=_stat("high_vol", ret_v[high_mask], len(ret_v), ppy),
        trending=_stat("trending", ret_v[trending_mask], len(ret_v), ppy),
        sideways=_stat("sideways", ret_v[sideways_mask], len(ret_v), ppy),
        note=" · ".join(notes),
    )


def _stat(label: str, returns: pd.Series, total_bars: int, ppy: float) -> RegimeStat:
    bars = int(len(returns))
    fraction = bars / total_bars if total_bars > 0 else 0.0
    if bars < 5 or returns.std(ddof=0) == 0:
        return RegimeStat(
            label=label, bars=bars, fraction=fraction,
            sharpe=0.0, mean_return=float(returns.mean()) if bars else 0.0,
        )
    mean = float(returns.mean())
    std = float(returns.std(ddof=0))
    sharpe = mean / std * float(np.sqrt(ppy)) if std > 0 else 0.0
    return RegimeStat(
        label=label, bars=bars, fraction=fraction,
        sharpe=sharpe, mean_return=mean,
    )
