from typing import Annotated

from fastapi import APIRouter, Query

from app.core.dependencies import CurrentUser, DbSession
from app.schemas.activity import ActivityRead
from app.schemas.common import Page
from app.schemas.employee import (
    DepartmentList,
    EmployeeCreate,
    EmployeeRead,
    EmployeeSortField,
    EmployeeUpdate,
    SortDirection,
)
from app.services import employee_service
from app.sockets import events as realtime
from app.utils.pagination import page_count

router = APIRouter(prefix="/employees", tags=["Employees"])


@router.get("", response_model=Page[EmployeeRead])
async def list_employees(
    _: CurrentUser,
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
    search: Annotated[str | None, Query(max_length=100)] = None,
    department: Annotated[str | None, Query(max_length=80)] = None,
    sort_by: EmployeeSortField = "updated_at",
    sort_dir: SortDirection = "desc",
) -> Page[EmployeeRead]:
    employees, total = await employee_service.list_employees(
        db,
        page=page,
        page_size=page_size,
        search=search,
        department=department,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return Page[EmployeeRead](
        items=[EmployeeRead.model_validate(e) for e in employees],
        total=total,
        page=page,
        page_size=page_size,
        pages=page_count(total, page_size),
    )


# Declared before "/{employee_id}" so "departments" is not parsed as an id.
@router.get("/departments", response_model=DepartmentList)
async def list_departments(_: CurrentUser, db: DbSession) -> DepartmentList:
    return DepartmentList(items=await employee_service.list_departments(db))


@router.get("/{employee_id}", response_model=EmployeeRead)
async def get_employee(employee_id: int, _: CurrentUser, db: DbSession) -> EmployeeRead:
    return EmployeeRead.model_validate(await employee_service.get_employee(db, employee_id))


@router.post("", response_model=EmployeeRead, status_code=201)
async def create_employee(
    payload: EmployeeCreate, user: CurrentUser, db: DbSession
) -> EmployeeRead:
    change = await employee_service.create_employee(db, user, payload)  # committed
    employee = EmployeeRead.model_validate(change.employee)
    await realtime.broadcast_employee_created(employee)
    if change.activity:
        await realtime.broadcast_activity(ActivityRead.model_validate(change.activity))
    return employee


@router.put("/{employee_id}", response_model=EmployeeRead)
async def update_employee(
    employee_id: int, payload: EmployeeUpdate, user: CurrentUser, db: DbSession
) -> EmployeeRead:
    # Raises 409 (before anything is broadcast) when payload.version is stale.
    change = await employee_service.update_employee(db, user, employee_id, payload)
    employee = EmployeeRead.model_validate(change.employee)
    if change.activity:  # nothing changed -> nothing to announce
        await realtime.broadcast_employee_updated(employee)
        await realtime.broadcast_activity(ActivityRead.model_validate(change.activity))
    return employee
