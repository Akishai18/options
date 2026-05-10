"""Two-condition entry via OR on BTC 4h.

Long either on a 50-period close breakout OR on a deep oversold RSI.
Tests: logical OR.
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
    name="BTC breakout or oversold",
    description=(
        "Long BTC when EITHER close breaks above the 50-period high OR RSI(14) "
        "drops below 25. Exit when RSI exceeds 60."
    ),
    side=Side.LONG,
    data=DataSpec(
        asset=Asset.BTC,
        timeframe=Timeframe.H4,
        start=date(2022, 1, 1),
        end=date(2024, 12, 31),
    ),
    entry=Logical(
        op="or",
        operands=[
            Comparison(
                op="gt",
                left=IndicatorRef(name="close"),
                right=IndicatorRef(name="rolling_max", params={"period": 50}),
            ),
            Comparison(
                op="lt",
                left=IndicatorRef(name="rsi", params={"period": 14}),
                right=Constant(value=25),
            ),
        ],
    ),
    exit=Comparison(
        op="gt",
        left=IndicatorRef(name="rsi", params={"period": 14}),
        right=Constant(value=60),
    ),
    risk=RiskRules(stop_loss_pct=0.05),
    perturbable_params=[
        "entry.operands.0.right.params.period",
        "entry.operands.1.right.value",
        "exit.right.value",
    ],
)
