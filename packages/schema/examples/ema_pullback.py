"""EMA pullback in an uptrend on SOL 4h.

Long SOL when price is above the 50-EMA (uptrend) but below the 20-EMA
(short-term pullback). Exit when price reclaims the 20-EMA.

Tests: AND combining gt and lt against indicator outputs.
"""

from datetime import date

from stratlab_schema import (
    Asset,
    Comparison,
    DataSpec,
    IndicatorRef,
    Logical,
    RiskRules,
    Side,
    StrategySchema,
    Timeframe,
)

STRATEGY = StrategySchema(
    name="SOL EMA pullback",
    description=(
        "Long SOL when close is above the 50-period EMA (uptrend) but below the "
        "20-period EMA (pullback). Exit when close reclaims the 20-EMA."
    ),
    side=Side.LONG,
    data=DataSpec(
        asset=Asset.SOL,
        timeframe=Timeframe.H4,
        start=date(2022, 1, 1),
        end=date(2024, 12, 31),
    ),
    entry=Logical(
        op="and",
        operands=[
            Comparison(
                op="gt",
                left=IndicatorRef(name="close"),
                right=IndicatorRef(name="ema", params={"period": 50}),
            ),
            Comparison(
                op="lt",
                left=IndicatorRef(name="close"),
                right=IndicatorRef(name="ema", params={"period": 20}),
            ),
        ],
    ),
    exit=Comparison(
        op="gt",
        left=IndicatorRef(name="close"),
        right=IndicatorRef(name="ema", params={"period": 20}),
    ),
    risk=RiskRules(stop_loss_pct=0.03),
    perturbable_params=[
        "entry.operands.0.right.params.period",
        "entry.operands.1.right.params.period",
        "risk.stop_loss_pct",
    ],
)
