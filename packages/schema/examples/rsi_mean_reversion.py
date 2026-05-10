"""RSI mean-reversion on ETH 4h.

Buy oversold; exit when momentum recovers. Tests: lt/gt with constants.
"""

from datetime import date

from stratlab_schema import (
    Asset,
    Comparison,
    Constant,
    DataSpec,
    IndicatorRef,
    RiskRules,
    Side,
    StrategySchema,
    Timeframe,
)

STRATEGY = StrategySchema(
    name="ETH RSI mean reversion",
    description="Buy ETH when 14-period RSI drops below 30; exit when it climbs above 55.",
    side=Side.LONG,
    data=DataSpec(
        asset=Asset.ETH,
        timeframe=Timeframe.H4,
        start=date(2022, 1, 1),
        end=date(2024, 12, 31),
    ),
    entry=Comparison(
        op="lt",
        left=IndicatorRef(name="rsi", params={"period": 14}),
        right=Constant(value=30),
    ),
    exit=Comparison(
        op="gt",
        left=IndicatorRef(name="rsi", params={"period": 14}),
        right=Constant(value=55),
    ),
    risk=RiskRules(stop_loss_pct=0.04),
    perturbable_params=[
        "entry.right.value",
        "exit.right.value",
        "entry.left.params.period",
        "risk.stop_loss_pct",
    ],
)
