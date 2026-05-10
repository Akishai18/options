"""Critique endpoints — synchronous (POST) and streaming (GET ?stream=sse).

The streaming variant pipes provider chunks back as Server-Sent Events:
    event: token  · data: <chunk text>
    event: done   · data: {}
The frontend uses EventSource to render the critique progressively.
"""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from stratlab_api.auth import current_user
from stratlab_api.llm import LLMProvider
from stratlab_api.llm.critique import format_critique_input
from stratlab_api.routes.chat import get_llm_provider_dep
from stratlab_api.schemas import CritiqueResponse
from stratlab_api.storage import get_store
from stratlab_api.storage_protocol import Store

router = APIRouter(prefix="/critique", tags=["critique"])

UserDep = Annotated[str, Depends(current_user)]
StoreDep = Annotated[Store, Depends(get_store)]
ProviderDep = Annotated[LLMProvider, Depends(get_llm_provider_dep)]


def _resolve_critique_input(
    backtest_id: str,
    user_id: str,
    store: Store,
) -> str:
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
    try:
        _, version = store.find_version(user_id, bt.version_id)
    except KeyError as e:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"version not found: {bt.version_id}",
        ) from e
    asset = version.schema_obj.data.asset.value
    timeframe = version.schema_obj.data.timeframe.value
    return format_critique_input(bt.result, asset, timeframe)


@router.post("/{backtest_id}", response_model=CritiqueResponse)
async def get_critique(
    backtest_id: str,
    user_id: UserDep,
    store: StoreDep,
    provider: ProviderDep,
) -> CritiqueResponse:
    critique_input = _resolve_critique_input(backtest_id, user_id, store)
    text = await provider.generate_critique(critique_input)
    return CritiqueResponse(backtest_id=backtest_id, text=text)


@router.get("/{backtest_id}/stream")
async def stream_critique(
    backtest_id: str,
    user_id: UserDep,
    store: StoreDep,
    provider: ProviderDep,
) -> StreamingResponse:
    critique_input = _resolve_critique_input(backtest_id, user_id, store)

    async def event_stream():
        try:
            async for chunk in provider.stream_critique(critique_input):
                # SSE wire format: each event is one line per field, blank-line terminated.
                payload = json.dumps({"text": chunk})
                yield f"event: token\ndata: {payload}\n\n"
        except Exception as e:
            err = json.dumps({"error": str(e)})
            yield f"event: error\ndata: {err}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
