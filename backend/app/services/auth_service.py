from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError
from app.core.security import create_access_token, dummy_hash, verify_password
from app.models.activity import ActivityAction, ActivityLog
from app.models.user import User
from app.services import activity_service

INVALID_CREDENTIALS = "Invalid username or password."


@dataclass
class LoginResult:
    user: User
    access_token: str
    expires_in: int
    activity: ActivityLog


async def get_user_by_username(session: AsyncSession, username: str) -> User | None:
    stmt = select(User).where(func.lower(User.username) == username.strip().lower())
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_active_user(session: AsyncSession, user_id: int) -> User | None:
    """Used for every authenticated request and Socket.IO connection, so a
    deactivated or deleted user loses access immediately even with a valid token."""
    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        return None
    return user


async def authenticate(session: AsyncSession, username: str, password: str) -> User:
    user = await get_user_by_username(session, username)
    if user is None:
        verify_password(password, dummy_hash())  # equalise timing with the real path
        raise AuthenticationError(INVALID_CREDENTIALS, code="invalid_credentials")
    if not verify_password(password, user.password_hash):
        raise AuthenticationError(INVALID_CREDENTIALS, code="invalid_credentials")
    if not user.is_active:
        raise AuthenticationError(
            "This account has been disabled. Contact an administrator.",
            code="account_disabled",
        )
    return user


async def login(session: AsyncSession, username: str, password: str) -> LoginResult:
    user = await authenticate(session, username, password)
    token, expires_in = create_access_token(user.id)
    activity = await activity_service.record_activity(
        session,
        user=user,
        action=ActivityAction.USER_LOGIN,
        details=f"{user.display_name} signed in.",
    )
    await session.commit()
    return LoginResult(user=user, access_token=token, expires_in=expires_in, activity=activity)


async def logout(session: AsyncSession, user: User) -> ActivityLog:
    activity = await activity_service.record_activity(
        session,
        user=user,
        action=ActivityAction.USER_LOGOUT,
        details=f"{user.display_name} signed out.",
    )
    await session.commit()
    return activity
