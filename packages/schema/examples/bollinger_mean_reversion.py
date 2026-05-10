"""Bollinger Band mean reversion on BTC 4h.

Buy when close drops below the lower band; exit at the band middle.
Tests: comparing two indicator outputs (close vs bbands_lower).
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
    name="BTC Bollinger mean reversion",
    description="Buy BTC when close drops below the lower Bollinger Band; exit at the band middle.",
    side=Side.LONG,
    data=DataSpec(
        asset=Asset.BTC,
        timeframe=Timeframe.H4,
        start=date(2022, 1, 1),
        end=date(2024, 12, 31),
    ),
    entry=Comparison(
        op="lt",
        left=IndicatorRef(name="close"),
        right=IndicatorRef(name="bbands_lower", params={"period": 20, "num_std": 2.0}),
    ),
    exit=Comparison(
        op="gt",
        left=IndicatorRef(name="close"),
        right=IndicatorRef(name="bbands_mid", params={"period": 20}),
    ),
    risk=RiskRules(stop_loss_pct=0.05),
    perturbable_params=[
        "entry.right.params.period",
        "entry.right.params.num_std",
        "risk.stop_loss_pct",
    ],
)
