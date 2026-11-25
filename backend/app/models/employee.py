from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    department: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    # Optimistic-locking counter, incremented on every successful update.
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    updated_by_user: Mapped["User | None"] = relationship(lazy="joined")

    __table_args__ = (
        CheckConstraint("version >= 1", name="version_positive"),
        Index("ix_employees_department", "department"),
        Index("ix_employees_updated_at", "updated_at"),
        Index("ix_employees_updated_by", "updated_by"),
        Index("ix_employees_name_lower", func.lower(name)),
    )

    # Read-only helpers used by the Pydantic response schema.
    @property
    def employee_code(self) -> str:
        return f"EMP-{self.id:06d}"

    @property
    def updated_by_username(self) -> str | None:
        return self.updated_by_user.username if self.updated_by_user else None

    @property
    def updated_by_display_name(self) -> str | None:
        return self.updated_by_user.display_name if self.updated_by_user else None
