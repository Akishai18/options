"""Walk-forward analysis: is the strategy consistent over time?

We slice the existing equity curve into N rolling forward windows and compute
Sharpe / return / drawdown per window. The strategy code never changes —
this is "rolling out-of-sample evaluation" rather than true walk-forward
re-optimization (we don't fit parameters, so there's nothing to re-optimize).

Why this is distinct from regime_breakdown: regime slices by *what kind of
market* the bars belong to (low_vol, trending, …). Walk-forward slices by
*time*. A strategy could pass one and fail the other:

  - Pass walk-forward, fail regime → consistent through time, but only because
    your window was dominated by one regime.
  - Pass regime, fail walk-forward → works in every regime, but performance is
    decaying year-over-year (regime mix is shifting against you).

Cheap by construction: no re-running backtests, just numpy slicing of the
already-computed equity curve.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from pydantic import BaseModel
from stratlab_schema import Timeframe

from stratlab_engine.data.universe import periods_per_year

DEFAULT_FOLDS = 5
INITIAL_TRAIN_FRACTION = 0.5     # first half of data is the warmup / "train"
MIN_FOLD_BARS = 30               # smaller and the per-fold Sharpe is meaningless


class WalkForwardFold(BaseModel):
    """One forward-rolling test window."""

    index: int                   # 0-based
    train_start: int             # bar index (inclusive)
    train_end: int               # bar index (exclusive)
    test_start: int              # bar index (inclusive)
    test_end: int                # bar index (exclusive)
    bars: int                    # = test_end - test_start
    sharpe: float                # annualized, on this fold's test window
    total_return: float
    max_drawdown: float
    start_ts: str                # ISO timestamp at test_start
    end_ts: str                  # ISO timestamp at test_end - 1


class WalkForwardReport(BaseModel):
    """Bundle of per-fold stats + aggregates."""

    n_folds: int
    folds: list[WalkForwardFold]
    mean_sharpe: float
    median_sharpe: float
    sharpe_stdev: float
    pct_positive_sharpe: float   # 0..1
    note: str = ""               # populated when folds are skipped or degenerate


def run_walk_forward(
    equity: pd.Series,
    timeframe: Timeframe,
    n_folds: int = DEFAULT_FOLDS,
) -> WalkForwardReport | None:
    """Walk forward through `equity` and compute per-fold metrics.

    Returns None if the series is too short to fit `n_folds` meaningful folds.
    """
    n_bars = len(equity)
    train_bars = int(n_bars * INITIAL_TRAIN_FRACTION)
    remaining = n_bars - train_bars
    fold_bars = remaining // n_folds

    if fold_bars < MIN_FOLD_BARS:
        # Not enough data — try fewer folds before giving up.
        for trial in (4, 3, 2):
            if trial >= n_folds:
                continue
            fold_bars_trial = (n_bars - train_bars) // trial
            if fold_bars_trial >= MIN_FOLD_BARS:
                n_folds = trial
                fold_bars = fold_bars_trial
                break
        else:
            return None

    ppy = periods_per_year(timeframe)
    folds: list[WalkForwardFold] = []
    sharpes: list[float] = []
    notes: list[str] = []

    for i in range(n_folds):
        train_start = i * fold_bars
        train_end = train_start + train_bars
        test_start = train_end
        test_end = test_start + fold_bars
        if test_end > n_bars:
            notes.append(f"fold {i} truncated to fit data")
            test_end = n_bars
        eq = equity.iloc[test_start:test_end]
        if len(eq) < MIN_FOLD_BARS or eq.iloc[0] == 0:
            continue
        eq_normed = eq / eq.iloc[0]
        bar_ret = eq_normed.pct_change().dropna()
        if len(bar_ret) < 2 or bar_ret.std(ddof=0) == 0:
            sharpe = 0.0
        else:
            sharpe = float(bar_ret.mean() / bar_ret.std(ddof=0) * np.sqrt(ppy))
        total_return = float(eq_normed.iloc[-1] - 1.0)
        running_max = eq_normed.cummax()
        max_dd = float((eq_normed / running_max - 1).min()) if len(eq_normed) else 0.0
        folds.append(WalkForwardFold(
            index=i,
            train_start=train_start, train_end=train_end,
            test_start=test_start, test_end=test_end,
            bars=test_end - test_start,
            sharpe=sharpe,
            total_return=total_return,
            max_drawdown=max_dd,
            start_ts=pd.Timestamp(equity.index[test_start]).isoformat(),
            end_ts=pd.Timestamp(equity.index[test_end - 1]).isoformat(),
        ))
        sharpes.append(sharpe)

    if not folds:
        return None

    arr = np.asarray(sharpes, dtype=float)
    return WalkForwardReport(
        n_folds=len(folds),
        folds=folds,
        mean_sharpe=float(arr.mean()),
        median_sharpe=float(np.median(arr)),
        sharpe_stdev=float(arr.std(ddof=0)),
        pct_positive_sharpe=float((arr > 0).mean()),
        note=" · ".join(notes),
    )
