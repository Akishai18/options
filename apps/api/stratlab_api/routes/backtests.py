"""Backtest endpoints. V1 runs synchronously inside the request handler since
crypto backtests on the V1 universe complete in <2s. The M2-external work
(or first slow strategy) will move this to a background task.
"""

from typing import Annotated

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from stratlab_engine import run_backtest as engine_run
from stratlab_engine.data import default_store as ohlcv_store_factory

from stratlab_api.auth import current_user
from stratlab_api.schemas import (
    BacktestStatusResponse,
    CreateBacktestRequest,
)
from stratlab_api.storage import get_store
from stratlab_api.storage_protocol import Store

router = APIRouter(prefix="/backtests", tags=["backtests"])

MIN_BARS_FOR_BACKTEST = 30

UserDep = Annotated[str, Depends(current_user)]
StoreDep = Annotated[Store, Depends(get_store)]


@router.post("", response_model=BacktestStatusResponse)
async def create_backtest(
    body: CreateBacktestRequest,
    user_id: UserDep,
    store: StoreDep,
) -> BacktestStatusResponse:
    # Resolve strategy + version (use existing version OR materialize an ad-hoc one).
    if body.version_id is not None:
        try:
            strategy_rec, version = store.find_version(user_id, body.version_id)
        except KeyError as e:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, f"version not found: {body.version_id}"
            ) from e
        schema = version.schema_obj
        strategy_id = strategy_rec.id
        version_id = version.id
    else:
        assert body.strategy is not None  # validated by CreateBacktestRequest
        strategy_rec = store.create_strategy(user_id, body.strategy)
        strategy_id = strategy_rec.id
        version_id = strategy_rec.latest_version.id
        schema = body.strategy

    bt = store.create_backtest(user_id, strategy_id, version_id)

    try:
        ohlcv_store = ohlcv_store_factory()
        df = ohlcv_store.read(
            schema.data.asset,
            schema.data.timeframe,
            start=pd.Timestamp(schema.data.start, tz="UTC"),
            end=pd.Timestamp(schema.data.end, tz="UTC") + pd.Timedelta(days=1),
        )
        if len(df) < MIN_BARS_FOR_BACKTEST:
            raise ValueError(
                f"insufficient data: only {len(df)} bars in range "
                f"({schema.data.start} → {schema.data.end}); need ≥{MIN_BARS_FOR_BACKTEST}"
            )
        result = engine_run(schema, df)
        store.update_backtest(bt.id, status="completed", result=result)
        return BacktestStatusResponse(
            backtest_id=bt.id,
            strategy_id=strategy_id,
            version_id=version_id,
            status="completed",
            result=result,
            error=None,
        )
    except FileNotFoundError as e:
        a, tf = schema.data.asset.value, schema.data.timeframe.value
        msg = f"data not backfilled for ({a}, {tf}): {e}"
        store.update_backtest(bt.id, status="failed", error=msg)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, msg) from e
    except ValueError as e:
        store.update_backtest(bt.id, status="failed", error=str(e))
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    except Exception as e:
        store.update_backtest(bt.id, status="failed", error=str(e))
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, f"backtest failed: {e}"
        ) from e


@router.get("/{backtest_id}", response_model=BacktestStatusResponse)
async def get_backtest(
    backtest_id: str,
    user_id: UserDep,
    store: StoreDep,
) -> BacktestStatusResponse:
    try:
        rec = store.get_backtest(user_id, backtest_id)
    except KeyError as e:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"backtest not found: {backtest_id}"
        ) from e
    return BacktestStatusResponse(
        backtest_id=rec.id,
        strategy_id=rec.strategy_id,
        version_id=rec.version_id,
        status=rec.status,
        result=rec.result,
        error=rec.error,
    )
