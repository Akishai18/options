"""Chat endpoints — natural language → strategy schema → (optional) backtest.

POST /chat/parse  - parse only (no backtest)
POST /chat/turn   - parse + create version + run backtest + return everything
GET  /chat/{strategy_id}/messages - conversation history for a strategy
"""

from typing import Annotated

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from stratlab_engine import run_backtest as engine_run
from stratlab_engine.data import default_store as ohlcv_store_factory

from stratlab_api.auth import current_user
from stratlab_api.config import Settings, get_settings
from stratlab_api.llm import LLMProvider, ParseTurn, get_llm_provider
from stratlab_api.schemas import (
    BacktestStatusResponse,
    ChatMessageInfo,
    ChatTurnRequest,
    ChatTurnResponse,
    ParseStrategyResponse,
)
from stratlab_api.storage import MemoryStore, get_store

router = APIRouter(prefix="/chat", tags=["chat"])

UserDep = Annotated[str, Depends(current_user)]
StoreDep = Annotated[MemoryStore, Depends(get_store)]


def get_llm_provider_dep(
    settings: Annotated[Settings, Depends(get_settings)],
) -> LLMProvider:
    """FastAPI dependency wrapper around the provider factory.

    Tests override this via `app.dependency_overrides[get_llm_provider_dep]`
    to inject a MockProvider without configuring a real API key.
    """
    return get_llm_provider(settings)


ProviderDep = Annotated[LLMProvider, Depends(get_llm_provider_dep)]


# ---- /chat/parse -----------------------------------------------------------


@router.post("/parse", response_model=ParseStrategyResponse)
async def chat_parse(
    body: ChatTurnRequest,
    user_id: UserDep,
    store: StoreDep,
    provider: ProviderDep,
) -> ParseStrategyResponse:
    """Parse a natural-language message into a strategy schema (or
    clarification request). No backtest. Persists a new strategy version
    if the result is a valid strategy."""
    history, prior = _load_context(store, user_id, body.strategy_id)
    result = await provider.parse_strategy(body.message, history, prior)

    if result.mode == "clarification":
        # Persist the user message + assistant clarification under the existing
        # thread (if any). Don't create a new strategy when no spec exists.
        if body.strategy_id:
            store.add_chat_message(user_id, body.strategy_id, "user", body.message)
            store.add_chat_message(
                user_id, body.strategy_id, "assistant",
                result.clarification_question or "",
            )
        return ParseStrategyResponse(
            mode="clarification",
            strategy_id=body.strategy_id,
            clarification_question=result.clarification_question,
            missing_fields=result.missing_fields,
        )

    # mode == "strategy"
    assert result.strategy is not None  # invariant of provider
    if body.strategy_id:
        try:
            store.get_strategy(user_id, body.strategy_id)
        except KeyError as e:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, f"strategy not found: {body.strategy_id}",
            ) from e
        version = store.add_version(user_id, body.strategy_id, result.strategy)
        strategy_id = body.strategy_id
    else:
        rec = store.create_strategy(user_id, result.strategy)
        strategy_id = rec.id
        version = rec.latest_version

    store.add_chat_message(user_id, strategy_id, "user", body.message)
    store.add_chat_message(
        user_id, strategy_id, "assistant",
        result.explanation or "(no explanation provided)",
    )

    return ParseStrategyResponse(
        mode="strategy",
        strategy_id=strategy_id,
        version_id=version.id,
        strategy=result.strategy,
        explanation=result.explanation,
    )


# ---- /chat/turn ------------------------------------------------------------


@router.post("/turn", response_model=ChatTurnResponse)
async def chat_turn(
    body: ChatTurnRequest,
    user_id: UserDep,
    store: StoreDep,
    provider: ProviderDep,
) -> ChatTurnResponse:
    """Combined endpoint: parse → create version → run backtest. The "easy
    button" the chat UI calls for every user message.

    On clarification: returns the question, no backtest run.
    On valid strategy: backtest runs synchronously, full result included.
    """
    history, prior = _load_context(store, user_id, body.strategy_id)
    result = await provider.parse_strategy(body.message, history, prior)

    if result.mode == "clarification":
        if body.strategy_id:
            store.add_chat_message(user_id, body.strategy_id, "user", body.message)
            store.add_chat_message(
                user_id, body.strategy_id, "assistant",
                result.clarification_question or "",
            )
        return ChatTurnResponse(
            mode="clarification",
            strategy_id=body.strategy_id,
            clarification_question=result.clarification_question,
            missing_fields=result.missing_fields,
        )

    assert result.strategy is not None
    if body.strategy_id:
        try:
            store.get_strategy(user_id, body.strategy_id)
        except KeyError as e:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, f"strategy not found: {body.strategy_id}",
            ) from e
        version = store.add_version(user_id, body.strategy_id, result.strategy)
        strategy_id = body.strategy_id
    else:
        rec = store.create_strategy(user_id, result.strategy)
        strategy_id = rec.id
        version = rec.latest_version

    store.add_chat_message(user_id, strategy_id, "user", body.message)
    store.add_chat_message(
        user_id, strategy_id, "assistant",
        result.explanation or "(no explanation provided)",
    )

    backtest_response = _run_and_persist_backtest(
        store, user_id, strategy_id, version.id, result.strategy,
    )

    return ChatTurnResponse(
        mode="strategy",
        strategy_id=strategy_id,
        version_id=version.id,
        backtest_id=backtest_response.backtest_id,
        strategy=result.strategy,
        explanation=result.explanation,
        backtest=backtest_response,
    )


# ---- /chat/{strategy_id}/messages ------------------------------------------


@router.get("/{strategy_id}/messages", response_model=list[ChatMessageInfo])
async def list_chat_messages(
    strategy_id: str,
    user_id: UserDep,
    store: StoreDep,
) -> list[ChatMessageInfo]:
    try:
        store.get_strategy(user_id, strategy_id)
    except KeyError as e:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"strategy not found: {strategy_id}",
        ) from e
    return [
        ChatMessageInfo(role=m.role, content=m.content, created_at=m.created_at)
        for m in store.get_chat_history(user_id, strategy_id)
    ]


# ---- helpers ---------------------------------------------------------------


def _load_context(
    store: MemoryStore, user_id: str, strategy_id: str | None,
) -> tuple[list[ParseTurn], "object | None"]:
    """Load the conversation history and the latest schema for an existing
    strategy. Returns ([], None) when starting a fresh thread."""
    if strategy_id is None:
        return [], None
    try:
        rec = store.get_strategy(user_id, strategy_id)
    except KeyError as e:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"strategy not found: {strategy_id}",
        ) from e
    history = [
        ParseTurn(role=m.role, content=m.content)  # type: ignore[arg-type]
        for m in store.get_chat_history(user_id, strategy_id)
    ]
    prior = rec.latest_version.schema_obj
    return history, prior


def _run_and_persist_backtest(
    store: MemoryStore,
    user_id: str,
    strategy_id: str,
    version_id: str,
    schema_obj,
) -> BacktestStatusResponse:
    bt = store.create_backtest(user_id, strategy_id, version_id)
    try:
        ohlcv_store = ohlcv_store_factory()
        df = ohlcv_store.read(
            schema_obj.data.asset,
            schema_obj.data.timeframe,
            start=pd.Timestamp(schema_obj.data.start, tz="UTC"),
            end=pd.Timestamp(schema_obj.data.end, tz="UTC") + pd.Timedelta(days=1),
        )
        if len(df) < 30:
            raise ValueError(
                f"insufficient data: only {len(df)} bars in range "
                f"({schema_obj.data.start} → {schema_obj.data.end})"
            )
        result = engine_run(schema_obj, df)
        store.update_backtest(bt.id, status="completed", result=result)
        return BacktestStatusResponse(
            backtest_id=bt.id,
            strategy_id=strategy_id,
            version_id=version_id,
            status="completed",
            result=result,
        )
    except Exception as e:
        store.update_backtest(bt.id, status="failed", error=str(e))
        return BacktestStatusResponse(
            backtest_id=bt.id,
            strategy_id=strategy_id,
            version_id=version_id,
            status="failed",
            error=str(e),
        )
