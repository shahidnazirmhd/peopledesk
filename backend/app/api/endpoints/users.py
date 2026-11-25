from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import AdminUser, DbSession
from app.schemas.activity import ActivityRead
from app.schemas.common import Page
from app.schemas.user import UserCreate, UserRead
from app.services import user_service
from app.sockets import events as realtime
from app.utils.pagination import page_count

# Every route here depends on AdminUser -> non-admins get HTTP 403.
router = APIRouter(prefix="/users", tags=["Users (admin only)"])


@router.get("", response_model=Page[UserRead])
async def list_users(
    admin: AdminUser,
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 100,
) -> Page[UserRead]:
    users, total = await user_service.list_users(db, page, page_size)
    return Page[UserRead](
        items=[UserRead.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
        pages=page_count(total, page_size),
    )


@router.post("", response_model=UserRead, status_code=201)
async def create_user(payload: UserCreate, admin: AdminUser, db: DbSession) -> UserRead:
    result = await user_service.create_user(db, admin, payload)
    await realtime.broadcast_activity(ActivityRead.model_validate(result.activity))
    return UserRead.model_validate(result.user)
