from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.core.security import hash_password
from app.models.activity import ActivityAction, ActivityLog
from app.models.user import User
from app.schemas.user import UserCreate
from app.services import activity_service, auth_service
from app.utils.pagination import offset_for


@dataclass
class CreateUserResult:
    user: User
    activity: ActivityLog


async def list_users(session: AsyncSession, page: int, page_size: int) -> tuple[list[User], int]:
    total = (await session.execute(select(func.count()).select_from(User))).scalar_one()
    stmt = (
        select(User)
        .order_by(User.created_at.asc(), User.id.asc())
        .offset(offset_for(page, page_size))
        .limit(page_size)
    )
    return list((await session.execute(stmt)).scalars().all()), total


def _username_taken() -> ConflictError:
    return ConflictError("That username is already taken.", code="username_taken")


async def create_user(session: AsyncSession, actor: User, data: UserCreate) -> CreateUserResult:
    if await auth_service.get_user_by_username(session, data.username):
        raise _username_taken()

    user = User(
        username=data.username,
        display_name=data.display_name,
        password_hash=hash_password(data.password),
        role=data.role,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        # Lost a race with a concurrent request; the unique index on lower(username) caught it.
        await session.rollback()
        raise _username_taken() from exc

    await session.refresh(user)
    activity = await activity_service.record_activity(
        session,
        user=actor,
        action=ActivityAction.USER_CREATED,
        details=f"Created user '{user.username}' ({user.display_name}) with role {user.role}.",
    )
    await session.commit()
    return CreateUserResult(user=user, activity=activity)
