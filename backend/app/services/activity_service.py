from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import ActivityLog
from app.models.user import User

MAX_ACTIVITIES = 100


async def record_activity(
    session: AsyncSession, *, user: User, action: str, details: str
) -> ActivityLog:
    """Add an activity row to the *caller's* transaction (flush only, no commit),
    so the business change and its audit record commit - or roll back - together."""
    log = ActivityLog(user_id=user.id, username=user.username, action=action, details=details)
    session.add(log)
    await session.flush()
    await session.refresh(log)  # loads the server-generated created_at
    return log


async def list_latest(session: AsyncSession, limit: int = MAX_ACTIVITIES) -> Sequence[ActivityLog]:
    limit = max(1, min(limit, MAX_ACTIVITIES))
    stmt = (
        select(ActivityLog)
        .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .limit(limit)
    )
    return (await session.execute(stmt)).scalars().all()
