"""Donchian channel breakout on BTC 1d.

Buy on a 20-day high break; exits are risk-driven (no exit signal).
Tests: rolling_max indicator on `high`; exit=None with stop_loss + take_profit.
"""

from datetime import date

from stratlab_schema import (
    Asset,
    Comparison,
    DataSpec,
    IndicatorRef,
    RiskRules,
    Side,
    StrategySchema,
    Timeframe,
)

STRATEGY = StrategySchema(
    name="BTC Donchian breakout",
    description="Buy when close breaks above the 20-day high; exit via stop-loss or take-profit.",
    side=Side.LONG,
    data=DataSpec(
        asset=Asset.BTC,
        timeframe=Timeframe.D1,
        start=date(2020, 1, 1),
        end=date(2024, 12, 31),
    ),
    entry=Comparison(
        op="gt",
        left=IndicatorRef(name="close"),
        right=IndicatorRef(name="rolling_max", params={"period": 20}, on="high"),
    ),
    # exit=None on purpose — exits driven entirely by risk rules below.
    exit=None,
    risk=RiskRules(stop_loss_pct=0.05, take_profit_pct=0.15),
    perturbable_params=[
        "entry.right.params.period",
        "risk.stop_loss_pct",
        "risk.take_profit_pct",
    ],
)
