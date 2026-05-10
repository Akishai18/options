"""HTTP-level tests for the FastAPI service.

Covers: healthz, universe metadata, strategy CRUD, backtest run via inline
schema and via existing version_id, request validation (the "exactly one"
rule), and the auth boundary (dev_mode bypass + prod-mode JWT enforcement +
per-user isolation).
"""

from datetime import date

import jwt
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


def _example_strategy_dict() -> dict:
    s = StrategySchema(
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
        sizing=Sizing(mode="fixed_fraction", fraction=0.95),
    )
    return s.model_dump(mode="json")


def _fresh_app(
    monkeypatch,
    *,
    dev_mode: bool = True,
    jwt_secret: str = "test-secret-min-32-chars-for-hs256",
):
    """Create a TestClient against a freshly-constructed app with reset state."""
    monkeypatch.setenv("STRATLAB_DEV_MODE", "true" if dev_mode else "false")
    monkeypatch.setenv("STRATLAB_JWT_SECRET", jwt_secret)
    from stratlab_api import config, storage
    from stratlab_api.main import create_app
    config._cached = None
    storage._store = None
    return TestClient(create_app())


# ---- basic surface ---------------------------------------------------------


def test_healthz(monkeypatch):
    client = _fresh_app(monkeypatch)
    r = client.get("/api/v1/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_universe_lists_assets_and_timeframes(monkeypatch):
    client = _fresh_app(monkeypatch)
    r = client.get("/api/v1/universe")
    assert r.status_code == 200
    body = r.json()
    assert set(body["assets"]) == {"BTC", "ETH", "SOL"}
    assert set(body["timeframes"]) == {"1h", "4h", "1d"}


def test_indicator_list_includes_core_set(monkeypatch):
    client = _fresh_app(monkeypatch)
    r = client.get("/api/v1/indicators")
    assert r.status_code == 200
    names = r.json()["indicators"]
    for required in ("sma", "ema", "rsi", "bbands_lower", "atr", "rolling_max"):
        assert required in names, f"missing indicator {required}"


# ---- strategies -----------------------------------------------------------


def test_create_then_list_strategy(monkeypatch):
    client = _fresh_app(monkeypatch)
    r = client.post("/api/v1/strategies", json={"strategy": _example_strategy_dict()})
    assert r.status_code == 200, r.text
    sid = r.json()["strategy_id"]
    vid = r.json()["version_id"]
    assert sid and vid

    r2 = client.get("/api/v1/strategies")
    assert r2.status_code == 200
    items = r2.json()
    assert any(s["id"] == sid and s["latest_version_id"] == vid for s in items)


def test_get_strategy_404_for_unknown(monkeypatch):
    client = _fresh_app(monkeypatch)
    r = client.get("/api/v1/strategies/does-not-exist")
    assert r.status_code == 404


def test_get_strategy_returns_versions(monkeypatch):
    client = _fresh_app(monkeypatch)
    sid = client.post(
        "/api/v1/strategies", json={"strategy": _example_strategy_dict()}
    ).json()["strategy_id"]
    r = client.get(f"/api/v1/strategies/{sid}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == sid
    assert len(body["versions"]) == 1
    assert body["versions"][0]["strategy"]["name"] == "test ma cross"


# ---- backtests ------------------------------------------------------------


def test_backtest_with_inline_schema_runs_to_completion(monkeypatch):
    client = _fresh_app(monkeypatch)
    r = client.post("/api/v1/backtests", json={"strategy": _example_strategy_dict()})
    if r.status_code == 400 and "not backfilled" in r.text:
        pytest.skip("backfill missing")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "completed"
    assert body["result"]["bars"] > 100
    assert "metrics_full" in body["result"]


def test_backtest_via_existing_version_id(monkeypatch):
    client = _fresh_app(monkeypatch)
    create = client.post(
        "/api/v1/strategies", json={"strategy": _example_strategy_dict()}
    ).json()
    vid = create["version_id"]
    r = client.post("/api/v1/backtests", json={"version_id": vid})
    if r.status_code == 400 and "not backfilled" in r.text:
        pytest.skip("backfill missing")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"
    assert r.json()["version_id"] == vid


def test_get_backtest_status_after_run(monkeypatch):
    client = _fresh_app(monkeypatch)
    r = client.post("/api/v1/backtests", json={"strategy": _example_strategy_dict()})
    if r.status_code != 200:
        pytest.skip("backfill missing")
    bt_id = r.json()["backtest_id"]
    r2 = client.get(f"/api/v1/backtests/{bt_id}")
    assert r2.status_code == 200
    assert r2.json()["backtest_id"] == bt_id


def test_backtest_request_requires_exactly_one_of_version_or_strategy(monkeypatch):
    client = _fresh_app(monkeypatch)
    # Neither
    r = client.post("/api/v1/backtests", json={})
    assert r.status_code == 422
    # Both
    r = client.post(
        "/api/v1/backtests",
        json={"version_id": "x", "strategy": _example_strategy_dict()},
    )
    assert r.status_code == 422


def test_backtest_unknown_version_id_404(monkeypatch):
    client = _fresh_app(monkeypatch)
    r = client.post("/api/v1/backtests", json={"version_id": "no-such-version"})
    assert r.status_code == 404


# ---- auth -----------------------------------------------------------------


def test_dev_mode_bypass_works_without_token(monkeypatch):
    client = _fresh_app(monkeypatch, dev_mode=True)
    r = client.get("/api/v1/strategies")
    assert r.status_code == 200


def test_prod_mode_requires_token(monkeypatch):
    client = _fresh_app(monkeypatch, dev_mode=False)
    r = client.get("/api/v1/strategies")
    assert r.status_code == 401


def test_prod_mode_accepts_valid_token_and_isolates_users(monkeypatch):
    secret = "iso-secret-min-32-chars-for-hs256-padding"
    client = _fresh_app(monkeypatch, dev_mode=False, jwt_secret=secret)
    token_a = jwt.encode({"sub": "user-a"}, secret, algorithm="HS256")
    token_b = jwt.encode({"sub": "user-b"}, secret, algorithm="HS256")

    create_a = client.post(
        "/api/v1/strategies",
        json={"strategy": _example_strategy_dict()},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert create_a.status_code == 200
    sid = create_a.json()["strategy_id"]

    # User B can't see user A's strategy.
    r_b = client.get(
        f"/api/v1/strategies/{sid}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r_b.status_code == 404

    # User B's list is empty.
    list_b = client.get(
        "/api/v1/strategies",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert list_b.status_code == 200
    assert list_b.json() == []


def test_prod_mode_rejects_bad_token(monkeypatch):
    real = "real-secret-min-32-chars-for-hs256-padding"
    wrong = "wrong-secret-min-32-chars-for-hs256-padding"
    client = _fresh_app(monkeypatch, dev_mode=False, jwt_secret=real)
    bogus = jwt.encode({"sub": "user-a"}, wrong, algorithm="HS256")
    r = client.get(
        "/api/v1/strategies",
        headers={"Authorization": f"Bearer {bogus}"},
    )
    assert r.status_code == 401
