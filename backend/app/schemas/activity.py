from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None
    username: str
    action: str
    details: str
    created_at: datetime


class ActivityList(BaseModel):
    items: list[ActivityRead]
