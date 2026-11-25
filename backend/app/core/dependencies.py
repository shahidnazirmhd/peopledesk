from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.security import TokenError, decode_access_token
from app.database.session import get_session
from app.models.user import User
from app.services import auth_service

DbSession = Annotated[AsyncSession, Depends(get_session)]

# In Swagger UI: call POST /api/auth/login, then click "Authorize" and paste the token.
bearer_scheme = HTTPBearer(auto_error=False, description="JWT from POST /api/auth/login")

_BEARER = {"WWW-Authenticate": "Bearer"}


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: DbSession,
) -> User:
    if credentials is None:
        raise AuthenticationError("Authentication required.", headers=_BEARER)
    try:
        payload = decode_access_token(credentials.credentials)
    except TokenError as exc:
        raise AuthenticationError(
            str(exc),
            code="token_expired" if exc.expired else "invalid_token",
            headers=_BEARER,
        ) from exc

    user = await auth_service.get_active_user(db, payload.user_id)
    if user is None:
        raise AuthenticationError(
            "This account no longer exists or has been disabled.",
            code="invalid_token",
            headers=_BEARER,
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_admin(user: CurrentUser) -> User:
    """Server-side RBAC. Hiding a menu item is not security; this is."""
    if not user.is_admin:
        raise PermissionDeniedError("Administrator access is required.")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
