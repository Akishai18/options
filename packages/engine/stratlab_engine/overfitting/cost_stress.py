"""Cost stress: how does the strategy hold up at higher transaction costs?

Reruns the same schema with the fee_bps scaled by each multiplier in
DEFAULT_MULTIPLIERS. Cheap (each rerun is one full backtest) but illuminating —
strategies that look great at 5 bps fees often die at 10 bps.

The cost-stress curves are computed against the TEST split (out-of-sample)
because that's where robustness actually matters.
"""

from __future__ import annotations

import pandas as pd
from pydantic import BaseModel
from stratlab_schema import StrategySchema

DEFAULT_MULTIPLIERS: tuple[float, ...] = (1.0, 1.5, 2.0)


class CostStressPoint(BaseModel):
    """One bar of the cost-stress chart — strategy results at this fee level."""

    multiplier: float
    fee_bps: float
    sharpe: float
    total_return: float
    max_drawdown: float
    num_trades: int


def run_cost_stress(
    schema: StrategySchema,
    df: pd.DataFrame,
    multipliers: tuple[float, ...] = DEFAULT_MULTIPLIERS,
) -> list[CostStressPoint]:
    """Rerun `schema` on `df` at each fee multiplier; return per-multiplier metrics.

    Reads the TEST-split metrics (or full-period if no split). Designed to be
    called from `run_backtest` after the main run has been executed; the 1.0×
    multiplier is computed here too (rather than reusing the caller's metrics)
    so the comparison is exactly apples-to-apples.
    """
    from stratlab_engine.backtester import run_backtest  # local to avoid cycle

    base_fee = schema.costs.fee_bps
    out: list[CostStressPoint] = []
    for mult in multipliers:
        scaled = schema.model_copy(deep=True)
        scaled.costs.fee_bps = base_fee * mult
        result = run_backtest(scaled, df, _skip_overfitting=True)  # type: ignore[call-arg]
        m = result.metrics_test or result.metrics_full
        out.append(
            CostStressPoint(
                multiplier=mult,
                fee_bps=scaled.costs.fee_bps,
                sharpe=m.sharpe,
                total_return=m.total_return,
                max_drawdown=m.max_drawdown,
                num_trades=m.num_trades,
            )
        )
    return out
