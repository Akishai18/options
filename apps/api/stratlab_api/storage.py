"""Storage facade.

Two backends share one Protocol (storage_protocol.Store):

  - MemoryStore (this file)  — in-process, single user, dev mode
  - SupabaseStore (storage_supabase.py) — persistent, multi-user, prod

`get_store()` dispatches based on settings:
  - dev_mode=true       → MemoryStore
  - dev_mode=false      → SupabaseStore (raises if Supabase env not set)

Routes import only this module; they never know which backend is active.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from stratlab_engine.results import BacktestResult
from stratlab_schema import StrategySchema

from stratlab_api.storage_protocol import Store
from stratlab_api.storage_types import (
    BacktestRecord,
    ChatMessage,
    StrategyRecord,
    StrategyVersion,
)

# Re-export the dataclasses so existing callers `from stratlab_api.storage import StrategyRecord`
# keep working.
__all__ = [
    "BacktestRecord",
    "ChatMessage",
    "MemoryStore",
    "Store",
    "StrategyRecord",
    "StrategyVersion",
    "get_store",
    "reset_store",
]


def _new_id() -> str:
    return str(uuid.uuid4())


class MemoryStore:
    """In-process store. Volatile — state vanishes on restart."""

    def __init__(self) -> None:
        self._strategies: dict[str, StrategyRecord] = {}
        self._backtests: dict[str, BacktestRecord] = {}
        # chat history is keyed by (user_id, strategy_id); list is chronological.
        self._chats: dict[tuple[str, str], list[ChatMessage]] = {}

    # ---- strategies ---------------------------------------------------------

    def create_strategy(self, user_id: str, schema_obj: StrategySchema) -> StrategyRecord:
        sid = _new_id()
        now = datetime.now(UTC)
        v = StrategyVersion(id=_new_id(), schema_obj=schema_obj, created_at=now)
        rec = StrategyRecord(
            id=sid, user_id=user_id, name=schema_obj.name,
            versions=[v], created_at=now,
        )
        self._strategies[sid] = rec
        return rec

    def add_version(
        self, user_id: str, strategy_id: str, schema_obj: StrategySchema
    ) -> StrategyVersion:
        rec = self.get_strategy(user_id, strategy_id)
        v = StrategyVersion(id=_new_id(), schema_obj=schema_obj, created_at=datetime.now(UTC))
        rec.versions.append(v)
        return v

    def get_strategy(self, user_id: str, strategy_id: str) -> StrategyRecord:
        rec = self._strategies.get(strategy_id)
        if rec is None or rec.user_id != user_id:
            raise KeyError(strategy_id)
        return rec

    def list_strategies(self, user_id: str) -> list[StrategyRecord]:
        return [r for r in self._strategies.values() if r.user_id == user_id]

    def find_version(
        self, user_id: str, version_id: str
    ) -> tuple[StrategyRecord, StrategyVersion]:
        for rec in self._strategies.values():
            if rec.user_id != user_id:
                continue
            for v in rec.versions:
                if v.id == version_id:
                    return rec, v
        raise KeyError(version_id)

    # ---- backtests ----------------------------------------------------------

    def create_backtest(
        self, user_id: str, strategy_id: str, version_id: str
    ) -> BacktestRecord:
        bid = _new_id()
        rec = BacktestRecord(
            id=bid, user_id=user_id, strategy_id=strategy_id,
            version_id=version_id, status="queued",
        )
        self._backtests[bid] = rec
        return rec

    def get_backtest(self, user_id: str, backtest_id: str) -> BacktestRecord:
        rec = self._backtests.get(backtest_id)
        if rec is None or rec.user_id != user_id:
            raise KeyError(backtest_id)
        return rec

    def update_backtest(
        self,
        backtest_id: str,
        *,
        status: str | None = None,
        result: BacktestResult | None = None,
        error: str | None = None,
    ) -> None:
        rec = self._backtests[backtest_id]
        if status is not None:
            rec.status = status  # type: ignore[assignment]
        if result is not None:
            rec.result = result
        if error is not None:
            rec.error = error

    # ---- chat ---------------------------------------------------------------

    def add_chat_message(
        self, user_id: str, strategy_id: str, role: str, content: str
    ) -> ChatMessage:
        msg = ChatMessage(role=role, content=content)  # type: ignore[arg-type]
        self._chats.setdefault((user_id, strategy_id), []).append(msg)
        return msg

    def get_chat_history(self, user_id: str, strategy_id: str) -> list[ChatMessage]:
        return list(self._chats.get((user_id, strategy_id), []))


_store: Store | None = None


def get_store() -> Store:
    """Return the active store (memoized).

    Construction is lazy so test fixtures can monkeypatch env vars before the
    first call. Reset via `reset_store()`.
    """
    global _store
    if _store is None:
        _store = _build_store()
    return _store


def _build_store() -> Store:
    from stratlab_api.config import get_settings

    settings = get_settings()
    if settings.dev_mode:
        return MemoryStore()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "dev_mode=false requires STRATLAB_SUPABASE_URL and "
            "STRATLAB_SUPABASE_SERVICE_ROLE_KEY to be set."
        )
    # Lazy import to keep MemoryStore-only deployments from importing supabase.
    from stratlab_api.storage_supabase import SupabaseStore
    return SupabaseStore(settings.supabase_url, settings.supabase_service_role_key)


def reset_store() -> None:
    """Test helper: drop the cached store so the next call rebuilds."""
    global _store
    _store = None
