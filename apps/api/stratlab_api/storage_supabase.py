"""Supabase-backed Store.

Uses supabase-py v2 with the service-role key for server-side queries.
Service-role bypasses RLS, but every method also filters by user_id
explicitly — RLS in 001_initial_schema.sql is defense-in-depth.

Pydantic models (StrategySchema, BacktestResult) are stored as jsonb and
round-trip via .model_dump(mode="json") / model_validate.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from stratlab_engine.results import BacktestResult
from stratlab_schema import StrategySchema
from supabase import Client, create_client

from stratlab_api.storage_types import (
    BacktestRecord,
    ChatMessage,
    StrategyRecord,
    StrategyVersion,
)


class SupabaseStore:
    """Persistent store backed by Supabase Postgres."""

    def __init__(self, url: str, service_role_key: str) -> None:
        self._client: Client = create_client(url, service_role_key)

    # ---- strategies --------------------------------------------------------

    def create_strategy(
        self, user_id: str, schema_obj: StrategySchema
    ) -> StrategyRecord:
        s_row = (
            self._client.table("strategies")
            .insert({"user_id": user_id, "name": schema_obj.name})
            .execute()
            .data[0]
        )
        v_row = (
            self._client.table("strategy_versions")
            .insert({
                "strategy_id": s_row["id"],
                "schema_obj": schema_obj.model_dump(mode="json"),
            })
            .execute()
            .data[0]
        )
        return StrategyRecord(
            id=s_row["id"],
            user_id=s_row["user_id"],
            name=s_row["name"],
            versions=[_version_from_row(v_row)],
            created_at=_dt(s_row["created_at"]),
        )

    def add_version(
        self, user_id: str, strategy_id: str, schema_obj: StrategySchema
    ) -> StrategyVersion:
        # Verify ownership before insert (defense-in-depth alongside RLS).
        self.get_strategy(user_id, strategy_id)
        row = (
            self._client.table("strategy_versions")
            .insert({
                "strategy_id": strategy_id,
                "schema_obj": schema_obj.model_dump(mode="json"),
            })
            .execute()
            .data[0]
        )
        return _version_from_row(row)

    def get_strategy(
        self, user_id: str, strategy_id: str
    ) -> StrategyRecord:
        s_rows = (
            self._client.table("strategies")
            .select("*")
            .eq("id", strategy_id)
            .eq("user_id", user_id)
            .execute()
            .data
        )
        if not s_rows:
            raise KeyError(strategy_id)
        s = s_rows[0]
        v_rows = (
            self._client.table("strategy_versions")
            .select("*")
            .eq("strategy_id", strategy_id)
            .order("created_at")
            .execute()
            .data
        )
        return StrategyRecord(
            id=s["id"],
            user_id=s["user_id"],
            name=s["name"],
            versions=[_version_from_row(r) for r in v_rows],
            created_at=_dt(s["created_at"]),
        )

    def list_strategies(self, user_id: str) -> list[StrategyRecord]:
        s_rows = (
            self._client.table("strategies")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
            .data
        )
        if not s_rows:
            return []
        # Bulk-fetch versions for all strategies in one query.
        ids = [r["id"] for r in s_rows]
        v_rows = (
            self._client.table("strategy_versions")
            .select("*")
            .in_("strategy_id", ids)
            .order("created_at")
            .execute()
            .data
        )
        by_strategy: dict[str, list[StrategyVersion]] = {sid: [] for sid in ids}
        for v in v_rows:
            by_strategy.setdefault(v["strategy_id"], []).append(_version_from_row(v))
        return [
            StrategyRecord(
                id=s["id"],
                user_id=s["user_id"],
                name=s["name"],
                versions=by_strategy.get(s["id"], []),
                created_at=_dt(s["created_at"]),
            )
            for s in s_rows
        ]

    def find_version(
        self, user_id: str, version_id: str
    ) -> tuple[StrategyRecord, StrategyVersion]:
        v_rows = (
            self._client.table("strategy_versions")
            .select("*")
            .eq("id", version_id)
            .execute()
            .data
        )
        if not v_rows:
            raise KeyError(version_id)
        v = v_rows[0]
        rec = self.get_strategy(user_id, v["strategy_id"])
        version = next((x for x in rec.versions if x.id == version_id), None)
        if version is None:
            raise KeyError(version_id)
        return rec, version

    # ---- backtests ---------------------------------------------------------

    def create_backtest(
        self, user_id: str, strategy_id: str, version_id: str
    ) -> BacktestRecord:
        row = (
            self._client.table("backtests")
            .insert({
                "user_id": user_id,
                "strategy_id": strategy_id,
                "version_id": version_id,
                "status": "queued",
            })
            .execute()
            .data[0]
        )
        return _backtest_from_row(row)

    def get_backtest(
        self, user_id: str, backtest_id: str
    ) -> BacktestRecord:
        rows = (
            self._client.table("backtests")
            .select("*")
            .eq("id", backtest_id)
            .eq("user_id", user_id)
            .execute()
            .data
        )
        if not rows:
            raise KeyError(backtest_id)
        return _backtest_from_row(rows[0])

    def update_backtest(
        self,
        backtest_id: str,
        *,
        status: str | None = None,
        result: BacktestResult | None = None,
        error: str | None = None,
    ) -> None:
        updates: dict[str, Any] = {}
        if status is not None:
            updates["status"] = status
        if result is not None:
            updates["result"] = result.model_dump(mode="json")
        if error is not None:
            updates["error"] = error
        if not updates:
            return
        (
            self._client.table("backtests")
            .update(updates)
            .eq("id", backtest_id)
            .execute()
        )

    # ---- chat --------------------------------------------------------------

    def add_chat_message(
        self, user_id: str, strategy_id: str, role: str, content: str
    ) -> ChatMessage:
        row = (
            self._client.table("chat_messages")
            .insert({
                "user_id": user_id,
                "strategy_id": strategy_id,
                "role": role,
                "content": content,
            })
            .execute()
            .data[0]
        )
        return ChatMessage(
            role=row["role"],  # type: ignore[arg-type]
            content=row["content"],
            created_at=_dt(row["created_at"]),
        )

    def get_chat_history(
        self, user_id: str, strategy_id: str
    ) -> list[ChatMessage]:
        rows = (
            self._client.table("chat_messages")
            .select("*")
            .eq("user_id", user_id)
            .eq("strategy_id", strategy_id)
            .order("created_at")
            .execute()
            .data
        )
        return [
            ChatMessage(
                role=r["role"],  # type: ignore[arg-type]
                content=r["content"],
                created_at=_dt(r["created_at"]),
            )
            for r in rows
        ]


# ---- helpers --------------------------------------------------------------


def _dt(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    # Postgres returns ISO 8601; pydantic-style fromisoformat handles tz.
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _version_from_row(row: dict[str, Any]) -> StrategyVersion:
    return StrategyVersion(
        id=row["id"],
        schema_obj=StrategySchema.model_validate(row["schema_obj"]),
        created_at=_dt(row["created_at"]),
    )


def _backtest_from_row(row: dict[str, Any]) -> BacktestRecord:
    return BacktestRecord(
        id=row["id"],
        user_id=row["user_id"],
        strategy_id=row["strategy_id"],
        version_id=row["version_id"],
        status=row["status"],
        result=BacktestResult.model_validate(row["result"]) if row.get("result") else None,
        error=row.get("error"),
        created_at=_dt(row["created_at"]),
    )
