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

    jwt_secret: str = "dev-secret-not-for-production"
    """HS256 secret for verifying Supabase-issued JWTs (M2 external half)."""

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8000"]
    """Allowed CORS origins. Default covers Next.js dev (3000) + this API (8000)."""

    serve_static: bool = True
    """Mount the bundled static dev page at /."""

    api_prefix: str = "/api/v1"


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
