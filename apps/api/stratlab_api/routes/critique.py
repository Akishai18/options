"""POST /critique/{backtest_id} — generate an AI critique of a completed
backtest, grounded in the actual computed metrics."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from stratlab_api.auth import current_user
from stratlab_api.llm import LLMProvider
from stratlab_api.llm.critique import format_critique_input
from stratlab_api.routes.chat import get_llm_provider_dep
from stratlab_api.schemas import CritiqueResponse
from stratlab_api.storage import MemoryStore, get_store

router = APIRouter(prefix="/critique", tags=["critique"])

UserDep = Annotated[str, Depends(current_user)]
StoreDep = Annotated[MemoryStore, Depends(get_store)]
ProviderDep = Annotated[LLMProvider, Depends(get_llm_provider_dep)]


@router.post("/{backtest_id}", response_model=CritiqueResponse)
async def get_critique(
    backtest_id: str,
    user_id: UserDep,
    store: StoreDep,
    provider: ProviderDep,
) -> CritiqueResponse:
    try:
        bt = store.get_backtest(user_id, backtest_id)
    except KeyError as e:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"backtest not found: {backtest_id}",
        ) from e
    if bt.status != "completed" or bt.result is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"backtest not completed (status={bt.status}); cannot critique",
        )

    # Pull the asset/timeframe from the originating strategy version so the
    # critique input has the framing the model expects.
    try:
        _, version = store.find_version(user_id, bt.version_id)
    except KeyError as e:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"version not found: {bt.version_id}",
        ) from e
    asset = version.schema_obj.data.asset.value
    timeframe = version.schema_obj.data.timeframe.value

    critique_input = format_critique_input(bt.result, asset, timeframe)
    text = await provider.generate_critique(critique_input)
    return CritiqueResponse(backtest_id=backtest_id, text=text)
