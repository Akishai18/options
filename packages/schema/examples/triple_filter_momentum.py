"""Three-level nested entry on BTC 4h — the schema stress test.

Entry: RSI > 50  AND  (EMA20 cross_above EMA50  AND  NOT (vol30 > vol180))
i.e. trend+momentum is firing AND not in a high-vol regime.

Tests:
  - Three levels of compound nesting (the upper bound the plan §11 D1 calls
    out before flat-clause sugar would be needed).
  - Logical NOT.
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
    name="BTC triple-filter momentum",
    description=(
        "Long BTC when (a) RSI(14) > 50 AND (b) EMA20 crosses above EMA50 AND "
        "(c) NOT (30-day realized vol > 180-day realized vol). Exit on the "
        "inverse EMA cross."
    ),
    side=Side.LONG,
    data=DataSpec(
        asset=Asset.BTC,
        timeframe=Timeframe.H4,
        start=date(2022, 1, 1),
        end=date(2024, 12, 31),
    ),
    entry=Logical(
        op="and",
        operands=[
            Comparison(
                op="gt",
                left=IndicatorRef(name="rsi", params={"period": 14}),
                right=Constant(value=50),
            ),
            Logical(
                op="and",
                operands=[
                    Comparison(
                        op="cross_above",
                        left=IndicatorRef(name="ema", params={"period": 20}),
                        right=IndicatorRef(name="ema", params={"period": 50}),
                    ),
                    Logical(
                        op="not",
                        operands=[
                            Comparison(
                                op="gt",
                                left=IndicatorRef(name="realized_vol", params={"period": 30}),
                                right=IndicatorRef(name="realized_vol", params={"period": 180}),
                            ),
                        ],
                    ),
                ],
            ),
        ],
    ),
    exit=Comparison(
        op="cross_below",
        left=IndicatorRef(name="ema", params={"period": 20}),
        right=IndicatorRef(name="ema", params={"period": 50}),
    ),
    risk=RiskRules(stop_loss_pct=0.05),
    perturbable_params=[
        "entry.operands.0.left.params.period",
        "entry.operands.1.operands.0.left.params.period",
        "entry.operands.1.operands.0.right.params.period",
        "risk.stop_loss_pct",
    ],
)
