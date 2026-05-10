"""Trend + momentum confirmation on ETH 1d.

Long when 30-day price slope is positive AND 14-period RSI is above 55.
Tests: logical AND with two Comparison operands.
"""

from datetime import date

from stratlab_schema import (
    Asset,
    Comparison,
    Constant,
    DataSpec,
    IndicatorRef,
    Logical,
    RiskRules,
    Side,
    StrategySchema,
    Timeframe,
)

STRATEGY = StrategySchema(
    name="ETH momentum with RSI confirmation",
    description=(
        "Long ETH when the 30-day price slope is positive AND the 14-period RSI is "
        "above 55. Exit when RSI dips below 45."
    ),
    side=Side.LONG,
    data=DataSpec(
        asset=Asset.ETH,
        timeframe=Timeframe.D1,
        start=date(2021, 1, 1),
        end=date(2024, 12, 31),
    ),
    entry=Logical(
        op="and",
        operands=[
            Comparison(
                op="gt",
                left=IndicatorRef(name="slope", params={"period": 30}),
                right=Constant(value=0),
            ),
            Comparison(
                op="gt",
                left=IndicatorRef(name="rsi", params={"period": 14}),
                right=Constant(value=55),
            ),
        ],
    ),
    exit=Comparison(
        op="lt",
        left=IndicatorRef(name="rsi", params={"period": 14}),
        right=Constant(value=45),
    ),
    risk=RiskRules(stop_loss_pct=0.06),
    perturbable_params=[
        "entry.operands.0.left.params.period",
        "entry.operands.1.left.params.period",
        "entry.operands.1.right.value",
        "exit.right.value",
    ],
)
