from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import AdminUser, DbSession
from app.schemas.activity import ActivityList, ActivityRead
from app.services import activity_service

router = APIRouter(prefix="/activities", tags=["Activities"])


@router.get("", response_model=ActivityList)
async def list_activities(
    _: AdminUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=activity_service.MAX_ACTIVITIES)] = activity_service.MAX_ACTIVITIES,
) -> ActivityList:
    """Latest activities, newest first (max 100)."""
    rows = await activity_service.list_latest(db, limit)
    return ActivityList(items=[ActivityRead.model_validate(r) for r in rows])
