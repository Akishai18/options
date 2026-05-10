"""Universe metadata: assets, timeframes, data coverage, indicator names.

Used by the M3 LLM prompt layer (so the model knows what's available) and by
the dev test page to validate user input client-side.
"""

from fastapi import APIRouter
from stratlab_engine.data import default_store
from stratlab_engine.indicators import INDICATORS
from stratlab_schema import Asset, Timeframe

from stratlab_api.schemas import (
    DataRange,
    IndicatorListResponse,
    UniverseResponse,
)

router = APIRouter(tags=["universe"])


@router.get("/universe", response_model=UniverseResponse)
async def get_universe() -> UniverseResponse:
    store = default_store()
    ranges: dict[str, DataRange] = {}
    for asset in Asset:
        for tf in Timeframe:
            if not store.has(asset, tf):
                continue
            df = store.read(asset, tf)
            if df.empty:
                continue
            ranges[f"{asset.value}_{tf.value}"] = DataRange(
                start=df.index[0].to_pydatetime(),
                end=df.index[-1].to_pydatetime(),
                bars=len(df),
            )
    return UniverseResponse(
        assets=[a.value for a in Asset],
        timeframes=[t.value for t in Timeframe],
        data_ranges=ranges,
    )


@router.get("/indicators", response_model=IndicatorListResponse)
async def get_indicators() -> IndicatorListResponse:
    return IndicatorListResponse(indicators=sorted(INDICATORS.keys()))
