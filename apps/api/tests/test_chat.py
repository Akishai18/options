"""Chat + critique route tests using a mocked LLM provider.

The MockProvider lets us exercise the route logic (storage writes, version
chaining, backtest dispatch) without making any real Gemini calls.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
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


def _example_schema() -> StrategySchema:
    return StrategySchema(
        name="test ma cross",
        side=Side.LONG,
        data=DataSpec(
            asset=Asset.BTC, timeframe=Timeframe.D1,
            start=date(2022, 1, 1), end=date(2024, 12, 31),
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


def _fresh_app_with_mock(monkeypatch):
    """Create a TestClient with the mock LLM provider injected."""
    monkeypatch.setenv("STRATLAB_DEV_MODE", "true")
    monkeypatch.setenv("STRATLAB_GEMINI_API_KEY", "fake-key-for-tests")
    monkeypatch.setenv("STRATLAB_SENTRY_DSN_BACKEND", "")  # disable Sentry in tests
    monkeypatch.setenv("STRATLAB_SUPABASE_URL", "")
    monkeypatch.setenv("STRATLAB_SUPABASE_SERVICE_ROLE_KEY", "")
    from stratlab_api import config, storage
    from stratlab_api.llm.providers.mock import MockProvider
    from stratlab_api.main import create_app
    from stratlab_api.routes.chat import get_llm_provider_dep

    config._cached = None
    storage._store = storage.MemoryStore()
    app = create_app()

    mock = MockProvider()
    app.dependency_overrides[get_llm_provider_dep] = lambda: mock
    return TestClient(app), mock


# ---- /chat/parse ----------------------------------------------------------


def test_parse_strategy_creates_strategy_and_persists_messages(monkeypatch):
    client, mock = _fresh_app_with_mock(monkeypatch)
    schema = _example_schema()
    mock.queue_parse_strategy(schema, "Built a 20/50 SMA crossover on BTC daily.")

    r = client.post("/api/v1/chat/parse", json={"message": "do an MA cross on BTC"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "strategy"
    assert body["strategy_id"]
    assert body["version_id"]
    assert body["explanation"].startswith("Built a 20/50")
    assert body["strategy"]["name"] == "test ma cross"

    # Messages persisted in order: user then assistant.
    msgs = client.get(f"/api/v1/chat/{body['strategy_id']}/messages").json()
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    assert msgs[0]["content"] == "do an MA cross on BTC"


def test_parse_clarification_does_not_create_strategy(monkeypatch):
    client, mock = _fresh_app_with_mock(monkeypatch)
    mock.queue_parse_clarification(
        "Which asset and timeframe?", missing_fields=["asset", "timeframe"],
    )
    r = client.post("/api/v1/chat/parse", json={"message": "make me money"})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "clarification"
    assert body["strategy_id"] is None
    assert "asset" in body["missing_fields"]
    # No strategy should have been created.
    assert client.get("/api/v1/strategies").json() == []


def test_parse_continues_existing_strategy_creates_new_version(monkeypatch):
    client, mock = _fresh_app_with_mock(monkeypatch)
    s1 = _example_schema()
    s2 = _example_schema()
    s2.risk.stop_loss_pct = 0.03
    mock.queue_parse_strategy(s1, "v1")
    mock.queue_parse_strategy(s2, "tightened the stop")

    r1 = client.post("/api/v1/chat/parse", json={"message": "MA cross BTC"})
    sid = r1.json()["strategy_id"]

    r2 = client.post(
        "/api/v1/chat/parse",
        json={"message": "tighten the stop to 3%", "strategy_id": sid},
    )
    assert r2.status_code == 200
    body = r2.json()
    assert body["strategy_id"] == sid
    assert body["version_id"] != r1.json()["version_id"]

    # Strategy now has two versions.
    detail = client.get(f"/api/v1/strategies/{sid}").json()
    assert len(detail["versions"]) == 2

    # Provider was called with prior_schema on the second turn.
    second_call = mock.parse_calls[1]
    _, history, prior = second_call
    assert prior is not None
    # History contains the user+assistant from turn 1.
    assert len(history) == 2


# ---- /chat/turn ------------------------------------------------------------


def test_turn_runs_backtest_after_parse(monkeypatch):
    client, mock = _fresh_app_with_mock(monkeypatch)
    schema = _example_schema()
    mock.queue_parse_strategy(schema, "built it")

    r = client.post("/api/v1/chat/turn", json={"message": "MA cross BTC"})
    if r.status_code == 200 and r.json().get("backtest", {}).get("status") == "failed":
        msg = r.json()["backtest"].get("error", "")
        if "not backfilled" in msg or "insufficient" in msg:
            pytest.skip(f"backfill missing: {msg}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "strategy"
    assert body["backtest_id"]
    assert body["backtest"]["status"] == "completed"
    assert body["backtest"]["result"]["bars"] > 100


def test_turn_clarification_skips_backtest(monkeypatch):
    client, mock = _fresh_app_with_mock(monkeypatch)
    mock.queue_parse_clarification("which asset?", missing_fields=["asset"])
    r = client.post("/api/v1/chat/turn", json={"message": "make money"})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "clarification"
    assert body["backtest_id"] is None
    assert body["backtest"] is None


def test_chat_messages_404_for_unknown_strategy(monkeypatch):
    client, _ = _fresh_app_with_mock(monkeypatch)
    r = client.get("/api/v1/chat/no-such-strategy/messages")
    assert r.status_code == 404


def test_parse_with_unknown_strategy_id_404(monkeypatch):
    client, mock = _fresh_app_with_mock(monkeypatch)
    mock.queue_parse_strategy(_example_schema(), "x")  # won't be reached
    r = client.post(
        "/api/v1/chat/parse",
        json={"message": "tweak it", "strategy_id": "nope"},
    )
    assert r.status_code == 404


# ---- /critique -------------------------------------------------------------


def test_critique_returns_text_for_completed_backtest(monkeypatch):
    client, mock = _fresh_app_with_mock(monkeypatch)
    schema = _example_schema()
    mock.queue_parse_strategy(schema, "built it")

    turn_r = client.post("/api/v1/chat/turn", json={"message": "MA cross BTC"})
    if turn_r.json().get("backtest", {}).get("status") != "completed":
        pytest.skip("backfill missing")
    bt_id = turn_r.json()["backtest_id"]

    mock.queue_critique(
        "Train Sharpe 0.4 vs test 0.5; modest signal. "
        "Only 3 trades — statistically thin. "
        "Beats benchmark on drawdown by a wide margin. "
        "What if you doubled the trade window to confirm the edge?"
    )
    r = client.post(f"/api/v1/critique/{bt_id}")
    assert r.status_code == 200
    assert r.json()["backtest_id"] == bt_id
    assert "Sharpe" in r.json()["text"]

    # The critique input passed to the provider should mention the metrics.
    assert mock.critique_calls
    critique_input = mock.critique_calls[-1]
    assert "Sharpe" in critique_input
    assert "BTC" in critique_input


def test_critique_400_for_failed_backtest(monkeypatch):
    client, _ = _fresh_app_with_mock(monkeypatch)
    # Manually create a failed backtest in the store
    from stratlab_api.storage import get_store
    store = get_store()
    rec = store.create_strategy("dev-user", _example_schema())
    bt = store.create_backtest("dev-user", rec.id, rec.latest_version.id)
    store.update_backtest(bt.id, status="failed", error="some failure")

    r = client.post(f"/api/v1/critique/{bt.id}")
    assert r.status_code == 400


def test_critique_404_for_unknown_backtest(monkeypatch):
    client, _ = _fresh_app_with_mock(monkeypatch)
    r = client.post("/api/v1/critique/no-such-bt")
    assert r.status_code == 404


def test_critique_stream_emits_sse_events(monkeypatch):
    client, mock = _fresh_app_with_mock(monkeypatch)
    schema = _example_schema()
    mock.queue_parse_strategy(schema, "built it")
    turn_r = client.post("/api/v1/chat/turn", json={"message": "MA cross BTC"})
    if turn_r.json().get("backtest", {}).get("status") != "completed":
        pytest.skip("backfill missing")
    bt_id = turn_r.json()["backtest_id"]

    mock.queue_critique("Sharpe held up out-of-sample. Try widening the stop?")
    with client.stream("GET", f"/api/v1/critique/{bt_id}/stream") as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        body = b"".join(r.iter_bytes()).decode()

    # SSE wire format: each event has `event:` and `data:` lines, blank-line separated.
    assert "event: token" in body
    assert "event: done" in body
    # The streamed text reassembles back to the queued critique (modulo the
    # trailing space MockProvider adds between tokens).
    import json as _json
    chunks: list[str] = []
    for block in body.split("\n\n"):
        if "event: token" not in block:
            continue
        for line in block.split("\n"):
            if line.startswith("data: "):
                chunks.append(_json.loads(line[6:])["text"])
    reconstructed = "".join(chunks).strip()
    assert "Sharpe" in reconstructed
    assert "out-of-sample" in reconstructed


# ---- provider factory ------------------------------------------------------


def test_factory_raises_when_gemini_key_missing(monkeypatch):
    """Real provider lookup should fail loudly if no key is configured.

    Note: setenv to "" rather than delenv — `.env` would otherwise repopulate
    the value (env vars take precedence over .env, and "" is falsy).
    """
    monkeypatch.setenv("STRATLAB_DEV_MODE", "true")
    monkeypatch.setenv("STRATLAB_GEMINI_API_KEY", "")
    from stratlab_api import config
    from stratlab_api.llm.providers import get_llm_provider
    config._cached = None
    settings = config.get_settings()
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY"):
        get_llm_provider(settings)


def test_factory_returns_gemini_when_key_set(monkeypatch):
    monkeypatch.setenv("STRATLAB_DEV_MODE", "true")
    monkeypatch.setenv("STRATLAB_GEMINI_API_KEY", "fake-key")
    from stratlab_api import config
    from stratlab_api.llm.providers import get_llm_provider
    config._cached = None
    settings = config.get_settings()
    provider = get_llm_provider(settings)
    assert provider.name == "gemini"
