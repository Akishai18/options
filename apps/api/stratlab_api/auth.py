"""JWT verification + the `current_user` FastAPI dependency.

In dev_mode (default for local development), missing/invalid auth gets mapped
to a fixed `dev-user`. In prod, HS256 verification against `jwt_secret` is
strictly enforced and the JWT's `sub` claim becomes the user id — this matches
what Supabase Auth produces.
"""

from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status

from stratlab_api.config import Settings, get_settings

DEV_USER_ID = "dev-user"


async def current_user(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    settings: Annotated[Settings, Depends(get_settings)] = None,  # type: ignore[assignment]
) -> str:
    """Return the user_id for the request. Raises 401 in prod with bad auth."""
    if settings.dev_mode:
        # Soft path: accept anything; if a valid token is provided, honor its sub.
        if authorization and authorization.startswith("Bearer "):
            token = authorization.removeprefix("Bearer ")
            try:
                payload = jwt.decode(
                    token, settings.jwt_secret, algorithms=["HS256"],
                    options={"verify_aud": False},
                )
                return str(payload.get("sub", DEV_USER_ID))
            except jwt.PyJWTError:
                pass
        return DEV_USER_ID

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "missing Authorization: Bearer <jwt>",
        )
    token = authorization.removeprefix("Bearer ")
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"invalid token: {e}") from e
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token missing 'sub' claim")
    return str(sub)
