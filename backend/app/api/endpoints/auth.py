from fastapi import APIRouter, Request

from app.core.dependencies import CurrentUser, DbSession
from app.core.exceptions import AuthenticationError
from app.core.rate_limit import login_ip_limiter, login_user_limiter
from app.schemas.activity import ActivityRead
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.common import MessageResponse
from app.schemas.user import UserRead
from app.services import auth_service
from app.sockets import events as realtime

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request, db: DbSession) -> TokenResponse:
    ip_key = request.client.host if request.client else "unknown"
    user_key = payload.username.strip().lower()

    # Reject early (before any password hashing work) when a key is locked out.
    login_ip_limiter.check(ip_key)
    login_user_limiter.check(user_key)

    try:
        result = await auth_service.login(db, payload.username, payload.password)
    except AuthenticationError:
        login_ip_limiter.register_failure(ip_key)
        login_user_limiter.register_failure(user_key)
        raise

    # Only the per-username counter is cleared: otherwise one valid login would
    # wipe the IP's failures and let an attacker interleave their own account.
    login_user_limiter.reset(user_key)

    await realtime.broadcast_activity(ActivityRead.model_validate(result.activity))
    return TokenResponse(
        access_token=result.access_token,
        expires_in=result.expires_in,
        user=UserRead.model_validate(result.user),
    )


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.post("/logout", response_model=MessageResponse)
async def logout(user: CurrentUser, db: DbSession) -> MessageResponse:
    """Records the logout. JWTs are stateless, so the client must discard its
    token; see README "Security considerations" for server-side revocation."""
    activity = await auth_service.logout(db, user)
    await realtime.broadcast_activity(ActivityRead.model_validate(activity))
    return MessageResponse(message="Logged out successfully.")
