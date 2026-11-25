from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Username = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=3,
        max_length=50,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]*$",
    ),
]


class UserCreate(BaseModel):
    display_name: DisplayName
    username: Username
    password: str = Field(min_length=8, max_length=72)
    role: Literal["admin", "user"] = "user"

    @field_validator("password")
    @classmethod
    def _password_rules(cls, v: str) -> str:
        # bcrypt only uses the first 72 *bytes*, so reject longer input outright.
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 bytes.")
        if not (
            any(c.islower() for c in v)
            and any(c.isupper() for c in v)
            and any(c.isdigit() for c in v)
        ):
            raise ValueError(
                "Password must contain an uppercase letter, a lowercase letter and a digit."
            )
        return v


class UserRead(BaseModel):
    """Public view of a user. Deliberately has no password_hash field."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    role: Literal["admin", "user"]
    is_active: bool
    created_at: datetime
    updated_at: datetime
