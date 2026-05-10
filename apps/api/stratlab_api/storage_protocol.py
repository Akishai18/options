"""Store protocol shared by MemoryStore (local) and SupabaseStore (production).

Both implementations satisfy this same interface so routes don't care which
one is wired in. Dispatch is in storage.get_store() based on env config.
"""

from __future__ import annotations

from typing import Protocol

from stratlab_engine.results import BacktestResult
from stratlab_schema import StrategySchema

from stratlab_api.storage_types import (
    BacktestRecord,
    ChatMessage,
    StrategyRecord,
    StrategyVersion,
)


class Store(Protocol):
    """Persistence interface. Methods raise KeyError on missing rows."""

    # ---- strategies ---------------------------------------------------------

    def create_strategy(
        self, user_id: str, schema_obj: StrategySchema
    ) -> StrategyRecord: ...

    def add_version(
        self, user_id: str, strategy_id: str, schema_obj: StrategySchema
    ) -> StrategyVersion: ...

    def get_strategy(
        self, user_id: str, strategy_id: str
    ) -> StrategyRecord: ...

    def list_strategies(self, user_id: str) -> list[StrategyRecord]: ...

    def find_version(
        self, user_id: str, version_id: str
    ) -> tuple[StrategyRecord, StrategyVersion]: ...

    # ---- backtests ----------------------------------------------------------

    def create_backtest(
        self, user_id: str, strategy_id: str, version_id: str
    ) -> BacktestRecord: ...

    def get_backtest(
        self, user_id: str, backtest_id: str
    ) -> BacktestRecord: ...

    def update_backtest(
        self,
        backtest_id: str,
        *,
        status: str | None = None,
        result: BacktestResult | None = None,
        error: str | None = None,
    ) -> None: ...

    # ---- chat ---------------------------------------------------------------

    def add_chat_message(
        self, user_id: str, strategy_id: str, role: str, content: str
    ) -> ChatMessage: ...

    def get_chat_history(
        self, user_id: str, strategy_id: str
    ) -> list[ChatMessage]: ...
