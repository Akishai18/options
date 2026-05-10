"""Short ETH on overbought RSI signals, ETH 1d.

Tests: SHORT side, gt comparison against constant.
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
    name="ETH short overbought",
    description="Short ETH when 14-period RSI exceeds 70 (overbought); cover at 50.",
    side=Side.SHORT,
    data=DataSpec(
        asset=Asset.ETH,
        timeframe=Timeframe.D1,
        start=date(2022, 1, 1),
        end=date(2024, 12, 31),
    ),
    entry=Comparison(
        op="gt",
        left=IndicatorRef(name="rsi", params={"period": 14}),
        right=Constant(value=70),
    ),
    exit=Comparison(
        op="lt",
        left=IndicatorRef(name="rsi", params={"period": 14}),
        right=Constant(value=50),
    ),
    risk=RiskRules(stop_loss_pct=0.05),
    perturbable_params=[
        "entry.right.value",
        "exit.right.value",
        "risk.stop_loss_pct",
    ],
)
