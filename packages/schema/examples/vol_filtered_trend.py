"""Trend strategy gated by a low-volatility regime, BTC 1d.

Trade an EMA crossover only when realized vol is compressed. Uses vol-target
sizing to scale exposure inversely with volatility.

Tests: AND combining cross_above with a vol-regime filter, vol_target sizing.
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
    Sizing,
    StrategySchema,
    Timeframe,
)

STRATEGY = StrategySchema(
    name="BTC vol-filtered trend",
    description=(
        "Trade BTC's 20/50 EMA cross only in low-volatility regimes (30-day "
        "realized vol below the 180-day baseline). Vol-target sizing."
    ),
    side=Side.LONG,
    data=DataSpec(
        asset=Asset.BTC,
        timeframe=Timeframe.D1,
        start=date(2020, 1, 1),
        end=date(2024, 12, 31),
    ),
    entry=Logical(
        op="and",
        operands=[
            Comparison(
                op="cross_above",
                left=IndicatorRef(name="ema", params={"period": 20}),
                right=IndicatorRef(name="ema", params={"period": 50}),
            ),
            Comparison(
                op="lt",
                left=IndicatorRef(name="realized_vol", params={"period": 30}),
                right=IndicatorRef(name="realized_vol", params={"period": 180}),
            ),
        ],
    ),
    exit=Comparison(
        op="cross_below",
        left=IndicatorRef(name="ema", params={"period": 20}),
        right=IndicatorRef(name="ema", params={"period": 50}),
    ),
    sizing=Sizing(mode="vol_target", fraction=0.5, vol_target_annual=0.20),
    risk=RiskRules(stop_loss_pct=0.08),
    perturbable_params=[
        "entry.operands.0.left.params.period",
        "entry.operands.0.right.params.period",
        "entry.operands.1.left.params.period",
        "risk.stop_loss_pct",
    ],
)
