"""FastAPI application factory + module-level `app` for `uvicorn` to import.

Run dev: `uv run uvicorn stratlab_api.main:app --reload --port 8000`
Open: http://localhost:8000/  (the bundled dev page)
"""

from pathlib import Path

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from stratlab_api.config import get_settings
from stratlab_api.routes import backtests, chat, critique, health, strategies, universe


def create_app() -> FastAPI:
    settings = get_settings()

    # Sentry must initialize BEFORE the FastAPI app is constructed so its
    # auto-instrumentation hooks attach to the ASGI middleware stack.
    if settings.sentry_dsn_backend:
        sentry_sdk.init(
            dsn=settings.sentry_dsn_backend,
            environment="dev" if settings.dev_mode else "prod",
            release="stratlab-api@0.1.0",
            traces_sample_rate=0.0,        # errors only — perf monitoring is paid tier
            send_default_pii=False,
        )

    app = FastAPI(
        title="StratLab API",
        version="0.1.0",
        description=(
            "Local development API for StratLab. "
            "POST /api/v1/backtests with a strategy schema → metrics in seconds."
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router, prefix=settings.api_prefix)
    app.include_router(universe.router, prefix=settings.api_prefix)
    app.include_router(strategies.router, prefix=settings.api_prefix)
    app.include_router(backtests.router, prefix=settings.api_prefix)
    app.include_router(chat.router, prefix=settings.api_prefix)
    app.include_router(critique.router, prefix=settings.api_prefix)

    if settings.serve_static:
        static_dir = Path(__file__).parent / "static"
        if static_dir.exists():
            app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

    return app


app = create_app()
