"""Shared dataclasses returned by both MemoryStore and SupabaseStore.

These types are the *interface*. Storage backends construct these and hand
them back; routes consume them without caring which backend produced them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from stratlab_engine.results import BacktestResult
from stratlab_schema import StrategySchema


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
class ChatMessage:
    """One conversation turn within a strategy thread."""

    role: Literal["user", "assistant"]
    content: str
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


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
