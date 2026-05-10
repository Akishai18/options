"""In-memory storage for V1 local. Will be replaced by Supabase repositories
in the M2 external half. The interface is deliberately small so the swap is
contained.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from stratlab_engine.results import BacktestResult
from stratlab_schema import StrategySchema


def _new_id() -> str:
    return str(uuid.uuid4())


@dataclass
class StrategyVersion:
    id: str
    schema_obj: StrategySchema
    created_at: datetime


@dataclass
class StrategyRecord:
    id: str
    user_id: str
    name: str
    versions: list[StrategyVersion]
    created_at: datetime

    @property
    def latest_version(self) -> StrategyVersion:
        return self.versions[-1]


@dataclass
class BacktestRecord:
    id: str
    user_id: str
    strategy_id: str
    version_id: str
    status: Literal["queued", "running", "completed", "failed"]
    result: BacktestResult | None = None
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class MemoryStore:
    def __init__(self) -> None:
        self._strategies: dict[str, StrategyRecord] = {}
        self._backtests: dict[str, BacktestRecord] = {}

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

    def update_backtest(self, backtest_id: str, **fields) -> None:
        rec = self._backtests[backtest_id]
        for k, v in fields.items():
            setattr(rec, k, v)


_store: MemoryStore | None = None


def get_store() -> MemoryStore:
    global _store
    if _store is None:
        _store = MemoryStore()
    return _store


def reset_store() -> None:
    """Test helper: drop the in-memory state."""
    global _store
    _store = None
