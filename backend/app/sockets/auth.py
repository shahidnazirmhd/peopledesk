"""Socket.IO connection authentication - same JWT and user checks as REST."""

from dataclasses import dataclass

from app.core.security import TokenError, decode_access_token
from app.database.session import async_session_factory
from app.services import auth_service


class SocketAuthError(Exception):
    """Message is sent to the client as the connect_error message."""


@dataclass(frozen=True)
class SocketIdentity:
    user_id: int
    username: str
    display_name: str
    role: str
    expires_at: int  # unix timestamp of the JWT's exp


async def authenticate_socket(auth: object) -> SocketIdentity:
    """Verify the JWT from the client's `auth` payload and load the user.

    Nothing about identity or role is taken from the client: both come from the
    verified token and the database row.
    """
    token = auth.get("token") if isinstance(auth, dict) else None
    if not token or not isinstance(token, str):
        raise SocketAuthError("unauthorized")

    try:
        payload = decode_access_token(token)
    except TokenError as exc:
        raise SocketAuthError("token_expired" if exc.expired else "unauthorized") from exc

    async with async_session_factory() as session:
        user = await auth_service.get_active_user(session, payload.user_id)
    if user is None:
        raise SocketAuthError("unauthorized")

    return SocketIdentity(
        user_id=user.id,
        username=user.username,
        display_name=user.display_name,
        role=user.role,
        expires_at=payload.expires_at,
    )
