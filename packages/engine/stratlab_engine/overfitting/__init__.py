"""Anti-overfitting analyses computed alongside the headline backtest.

Each module here is deterministic — no LLM, no randomness. The output feeds
the dashboard's anti-overfit-by-default layout (the product wedge) and is
also passed verbatim into the critique prompt so the model can cite specific
numbers (e.g., "Sharpe falls 60% at 2× fees").
"""

from stratlab_engine.overfitting.cost_stress import CostStressPoint, run_cost_stress
from stratlab_engine.overfitting.regime import RegimeBreakdown, RegimeStat, compute_regimes
from stratlab_engine.overfitting.sensitivity import (
    PerturbationStat,
    SensitivityHalo,
    run_sensitivity,
)
from stratlab_engine.overfitting.walk_forward import (
    WalkForwardFold,
    WalkForwardReport,
    run_walk_forward,
)

__all__ = [
    "CostStressPoint",
    "PerturbationStat",
    "RegimeBreakdown",
    "RegimeStat",
    "SensitivityHalo",
    "WalkForwardFold",
    "WalkForwardReport",
    "compute_regimes",
    "run_cost_stress",
    "run_sensitivity",
    "run_walk_forward",
]
