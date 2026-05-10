from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from stratlab_api.config import Settings, get_settings
from stratlab_api.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/_sentry-test", include_in_schema=False)
async def sentry_test(
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """Smoke test for the Sentry integration. Dev-mode only.

    Hit this endpoint once after adding your DSN; the unhandled error
    should appear in your Sentry dashboard within ~10 seconds.
    """
    if not settings.dev_mode:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    raise RuntimeError("Sentry smoke test from /api/v1/_sentry-test")
