"""SupabaseStore round-trip tests against the user's real Supabase project.

Skipped automatically unless STRATLAB_SUPABASE_URL + STRATLAB_SUPABASE_SERVICE_ROLE_KEY
are set in the environment. These tests use a synthetic UUID user_id and
clean up after themselves.

Run only when changing SupabaseStore code:
    uv run pytest apps/api/tests/test_supabase_store.py -v
"""

from __future__ import annotations

import os
import uuid
from datetime import date

import pytest
from stratlab_schema import (
    Asset,
    Comparison,
    DataSpec,
    IndicatorRef,
    Side,
    Sizing,
    StrategySchema,
    Timeframe,
)


def _supabase_configured() -> bool:
    return bool(
        os.environ.get("STRATLAB_SUPABASE_URL")
        and os.environ.get("STRATLAB_SUPABASE_SERVICE_ROLE_KEY")
    )


pytestmark = pytest.mark.skipif(
    not _supabase_configured(),
    reason=(
        "Supabase env not configured (set STRATLAB_SUPABASE_URL "
        "+ STRATLAB_SUPABASE_SERVICE_ROLE_KEY)"
    ),
)


@pytest.fixture
def store_and_user():
    """Build a real SupabaseStore and a synthetic user_id.

    Cleans the user's rows after the test. Note: the user_id is a fake UUID
    that doesn't exist in auth.users — for this to insert, you'd normally hit
    an FK constraint. Either run with RLS off + FK off, or create a real test
    user beforehand. Skip these tests in CI unless you've prepped a sandbox.
    """
    from stratlab_api.storage_supabase import SupabaseStore
    store = SupabaseStore(
        os.environ["STRATLAB_SUPABASE_URL"],
        os.environ["STRATLAB_SUPABASE_SERVICE_ROLE_KEY"],
    )
    # Use a real test user id from the env if you've created one; otherwise
    # tests will fail at insert due to the auth.users FK.
    user_id = os.environ.get("STRATLAB_TEST_USER_ID")
    if not user_id:
        pytest.skip("set STRATLAB_TEST_USER_ID to a real auth.users.id")
    yield store, user_id
    # Cleanup: delete every strategy this test created (cascades to versions/backtests/chat).
    try:
        rows = (
            store._client.table("strategies")
            .select("id")
            .eq("user_id", user_id)
            .execute()
            .data
        )
        for r in rows:
            store._client.table("strategies").delete().eq("id", r["id"]).execute()
    except Exception:
        pass


def _example_schema(name: str = "supabase round-trip") -> StrategySchema:
    return StrategySchema(
        name=name,
        side=Side.LONG,
        data=DataSpec(
            asset=Asset.BTC, timeframe=Timeframe.D1,
            start=date(2023, 1, 1), end=date(2024, 1, 1),
        ),
        entry=Comparison(
            op="cross_above",
            left=IndicatorRef(name="sma", params={"period": 20}),
            right=IndicatorRef(name="sma", params={"period": 50}),
        ),
        exit=Comparison(
            op="cross_below",
            left=IndicatorRef(name="sma", params={"period": 20}),
            right=IndicatorRef(name="sma", params={"period": 50}),
        ),
        sizing=Sizing(mode="fixed_fraction", fraction=0.5),
    )


def test_create_and_get_strategy_roundtrip(store_and_user):
    store, user = store_and_user
    schema = _example_schema(f"rt-{uuid.uuid4().hex[:6]}")
    rec = store.create_strategy(user, schema)
    assert rec.user_id == user
    assert rec.name == schema.name
    assert len(rec.versions) == 1

    again = store.get_strategy(user, rec.id)
    assert again.id == rec.id
    assert again.versions[0].schema_obj.name == schema.name


def test_add_version_appends(store_and_user):
    store, user = store_and_user
    rec = store.create_strategy(user, _example_schema())
    v2 = store.add_version(user, rec.id, _example_schema("v2"))
    refreshed = store.get_strategy(user, rec.id)
    assert len(refreshed.versions) == 2
    assert refreshed.versions[-1].id == v2.id
    assert refreshed.versions[-1].schema_obj.name == "v2"


def test_chat_messages_roundtrip(store_and_user):
    store, user = store_and_user
    rec = store.create_strategy(user, _example_schema())
    store.add_chat_message(user, rec.id, "user", "hello")
    store.add_chat_message(user, rec.id, "assistant", "hi back")
    history = store.get_chat_history(user, rec.id)
    assert len(history) == 2
    assert history[0].content == "hello"
    assert history[1].content == "hi back"


def test_user_isolation_cross_user_returns_404(store_and_user):
    store, user = store_and_user
    rec = store.create_strategy(user, _example_schema())
    with pytest.raises(KeyError):
        store.get_strategy("00000000-0000-0000-0000-000000000000", rec.id)
