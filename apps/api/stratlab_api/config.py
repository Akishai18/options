"""Process settings via pydantic-settings.

Environment variables are prefixed with `STRATLAB_`. A `.env` file at the repo
root is also picked up.
"""


from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="STRATLAB_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    dev_mode: bool = True
    """Bypass auth and use a fixed user_id when True. Production must set False."""

    supabase_jwt_secret: str = "dev-secret-not-for-production"
    """HS256 secret for verifying Supabase-issued JWTs.

    In Supabase: Settings → API → JWT Secret.
    Sets via env var `STRATLAB_SUPABASE_JWT_SECRET`.
    """

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8000"]
    """Allowed CORS origins. Default covers Next.js dev (3000) + this API (8000)."""

    serve_static: bool = True
    """Mount the bundled static dev page at /."""

    api_prefix: str = "/api/v1"

    sentry_dsn_backend: str | None = None
    """Sentry DSN for backend error capture. If unset, Sentry init is skipped."""

    gemini_api_key: str | None = None
    """Google AI Studio API key (free tier). Required for chat / critique routes."""

    llm_provider: str = "gemini"
    """Which LLM backend to use. Currently 'gemini'; 'anthropic' planned later."""

    llm_model_parse: str = "gemini-2.5-flash"
    """Model for natural-language → strategy schema parsing (cheap + fast)."""

    llm_model_critique: str = "gemini-2.5-flash"
    """Model for grounded critique generation.

    Note: gemini-2.5-pro would give deeper reasoning but its free-tier quota
    is currently 0 (Pro is paid-only). Override via STRATLAB_LLM_MODEL_CRITIQUE
    if you upgrade to paid AI Studio billing.
    """


_cached: Settings | None = None


def get_settings() -> Settings:
    """Lazy + reset-friendly singleton.

    Tests can clear it by setting `_cached = None` after monkeypatching env vars.
    """
    global _cached
    if _cached is None:
        _cached = Settings()
    return _cached


def reset_settings() -> None:
    """Test helper: drop the cached settings so the next call re-reads env."""
    global _cached
    _cached = None
    get_settings.cache_clear() if hasattr(get_settings, "cache_clear") else None
