"""Train/val/test split logic + metric computation per split.

Splits are by FRACTION OF BARS, in chronological order. No shuffling — this is
financial data; later bars must be the test set.
"""

import numpy as np
import pandas as pd
from stratlab_schema import Splits, Timeframe

from stratlab_engine.data.universe import periods_per_year
from stratlab_engine.results import MetricsBlock, TradeRecord


def split_indices(n: int, splits: Splits) -> tuple[slice, slice, slice]:
    """Return slices into a length-n bar array for train / val / test."""
    train_end = int(n * splits.train)
    val_end = train_end + int(n * splits.val)
    return slice(0, train_end), slice(train_end, val_end), slice(val_end, n)


def compute_metrics(
    label: str,
    equity: pd.Series,
    trades: list[TradeRecord],
    timeframe: Timeframe,
    in_position: pd.Series | None = None,
) -> MetricsBlock:
    """Compute summary metrics over an equity slice.

    `equity` should start with the equity at the slice start (we re-base
    internally so total_return is segment-local).
    """
    if equity.empty:
        return _zero_metrics(label)

    # Re-base so the segment starts at 1.0; preserves shape, makes returns local.
    equity = equity / equity.iloc[0]
    bar_returns = equity.pct_change().dropna()
    bars = len(equity)
    ppy = periods_per_year(timeframe)

    total_return = float(equity.iloc[-1] - 1.0)
    years = bars / ppy if ppy else 0.0
    cagr = float((equity.iloc[-1]) ** (1 / years) - 1) if years > 0 and equity.iloc[-1] > 0 else 0.0

    if len(bar_returns) > 1 and bar_returns.std(ddof=0) > 0:
        sharpe = float(bar_returns.mean() / bar_returns.std(ddof=0) * np.sqrt(ppy))
    else:
        sharpe = 0.0

    downside = bar_returns[bar_returns < 0]
    if len(downside) > 1 and downside.std(ddof=0) > 0:
        sortino = float(bar_returns.mean() / downside.std(ddof=0) * np.sqrt(ppy))
    else:
        sortino = 0.0

    running_max = equity.cummax()
    drawdown = equity / running_max - 1
    max_dd = float(drawdown.min()) if len(drawdown) else 0.0

    if trades:
        wins = [t for t in trades if t.pnl > 0]
        losses = [t for t in trades if t.pnl < 0]
        win_rate = len(wins) / len(trades)
        gross_win = sum(t.pnl for t in wins)
        gross_loss = abs(sum(t.pnl for t in losses))
        profit_factor = float(gross_win / gross_loss) if gross_loss > 0 else float("inf")
        avg_trade = float(np.mean([t.pnl for t in trades]))
    else:
        win_rate = 0.0
        profit_factor = 0.0
        avg_trade = 0.0

    if in_position is not None and len(in_position) > 0:
        exposure = float(in_position.sum() / len(in_position))
    else:
        exposure = 0.0

    return MetricsBlock(
        label=label,
        bars=bars,
        num_trades=len(trades),
        total_return=total_return,
        cagr=cagr,
        sharpe=sharpe,
        sortino=sortino,
        max_drawdown=max_dd,
        win_rate=win_rate,
        profit_factor=profit_factor if profit_factor != float("inf") else 9999.0,
        avg_trade_pnl=avg_trade,
        exposure=exposure,
    )


def _zero_metrics(label: str) -> MetricsBlock:
    return MetricsBlock(
        label=label, bars=0, num_trades=0,
        total_return=0.0, cagr=0.0, sharpe=0.0, sortino=0.0,
        max_drawdown=0.0, win_rate=0.0, profit_factor=0.0,
        avg_trade_pnl=0.0, exposure=0.0,
    )
