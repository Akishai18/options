"""Intraday breakout on BTC 1h.

Long when close breaks above the prior 24-hour high; exit on close below the
12-period EMA. Distinct from the daily Donchian example: shorter timeframe,
EMA-based exit instead of risk-only.

Tests: 1h timeframe coverage; rolling_max on `high`; EMA-based exit.
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
    name="BTC intraday breakout",
    description=(
        "Long BTC on a 1-hour close above the prior 24-hour high. Exit when "
        "close falls below the 12-period EMA."
    ),
    side=Side.LONG,
    data=DataSpec(
        asset=Asset.BTC,
        timeframe=Timeframe.H1,
        start=date(2023, 1, 1),
        end=date(2024, 12, 31),
    ),
    entry=Comparison(
        op="gt",
        left=IndicatorRef(name="close"),
        right=IndicatorRef(name="rolling_max", params={"period": 24}, on="high"),
    ),
    exit=Comparison(
        op="lt",
        left=IndicatorRef(name="close"),
        right=IndicatorRef(name="ema", params={"period": 12}),
    ),
    risk=RiskRules(stop_loss_pct=0.02),
    perturbable_params=[
        "entry.right.params.period",
        "exit.right.params.period",
        "risk.stop_loss_pct",
    ],
)
