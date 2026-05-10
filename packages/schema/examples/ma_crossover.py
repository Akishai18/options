"""Classic golden cross on BTC 1d.

Long when 50-day SMA crosses above 200-day SMA; exit on the inverse cross.
Tests: cross_above/cross_below operators.
"""

from datetime import date

from stratlab_schema import (
    Asset,
    Comparison,
    DataSpec,
    IndicatorRef,
    Side,
    Sizing,
    StrategySchema,
    Timeframe,
)

STRATEGY = StrategySchema(
    name="BTC golden cross",
    description="Long when 50-day SMA crosses above 200-day SMA; exit on the inverse cross.",
    side=Side.LONG,
    data=DataSpec(
        asset=Asset.BTC,
        timeframe=Timeframe.D1,
        start=date(2020, 1, 1),
        end=date(2024, 12, 31),
    ),
    entry=Comparison(
        op="cross_above",
        left=IndicatorRef(name="sma", params={"period": 50}),
        right=IndicatorRef(name="sma", params={"period": 200}),
    ),
    exit=Comparison(
        op="cross_below",
        left=IndicatorRef(name="sma", params={"period": 50}),
        right=IndicatorRef(name="sma", params={"period": 200}),
    ),
    sizing=Sizing(mode="fixed_fraction", fraction=0.95),
    perturbable_params=[
        "entry.left.params.period",
        "entry.right.params.period",
    ],
)
