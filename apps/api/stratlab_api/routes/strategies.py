from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from stratlab_api.auth import current_user
from stratlab_api.schemas import (
    CreateStrategyRequest,
    CreateStrategyResponse,
    StrategyDetail,
    StrategySummary,
    StrategyVersionInfo,
)
from stratlab_api.storage import MemoryStore, get_store

router = APIRouter(prefix="/strategies", tags=["strategies"])

UserDep = Annotated[str, Depends(current_user)]
StoreDep = Annotated[MemoryStore, Depends(get_store)]


@router.post("", response_model=CreateStrategyResponse)
async def create_strategy(
    body: CreateStrategyRequest,
    user_id: UserDep,
    store: StoreDep,
) -> CreateStrategyResponse:
    rec = store.create_strategy(user_id, body.strategy)
    return CreateStrategyResponse(
        strategy_id=rec.id,
        version_id=rec.latest_version.id,
        name=rec.name,
        strategy=body.strategy,
    )


@router.get("", response_model=list[StrategySummary])
async def list_strategies(
    user_id: UserDep,
    store: StoreDep,
) -> list[StrategySummary]:
    return [
        StrategySummary(
            id=s.id,
            name=s.name,
            num_versions=len(s.versions),
            latest_version_id=s.latest_version.id,
            created_at=s.created_at,
        )
        for s in store.list_strategies(user_id)
    ]


@router.get("/{strategy_id}", response_model=StrategyDetail)
async def get_strategy(
    strategy_id: str,
    user_id: UserDep,
    store: StoreDep,
) -> StrategyDetail:
    try:
        rec = store.get_strategy(user_id, strategy_id)
    except KeyError as e:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"strategy not found: {strategy_id}"
        ) from e
    return StrategyDetail(
        id=rec.id,
        name=rec.name,
        created_at=rec.created_at,
        versions=[
            StrategyVersionInfo(id=v.id, created_at=v.created_at, strategy=v.schema_obj)
            for v in rec.versions
        ],
    )
