from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Department = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class EmployeeCreate(BaseModel):
    name: Name
    department: Department
    title: Title


class EmployeeUpdate(EmployeeCreate):
    # The version the client last read. A mismatch means someone else saved first.
    version: int = Field(ge=1)


class EmployeeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_code: str
    name: str
    department: str
    title: str
    version: int
    created_at: datetime
    updated_at: datetime
    updated_by: int | None
    updated_by_username: str | None
    updated_by_display_name: str | None


EmployeeSortField = Literal[
    "id", "name", "department", "title", "created_at", "updated_at", "updated_by"
]
SortDirection = Literal["asc", "desc"]


class DepartmentList(BaseModel):
    items: list[str]
