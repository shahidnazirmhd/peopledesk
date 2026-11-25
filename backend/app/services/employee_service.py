import re
from dataclasses import dataclass

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager

from app.core.exceptions import NotFoundError, VersionConflictError
from app.models.activity import ActivityAction, ActivityLog
from app.models.employee import Employee
from app.models.user import User
from app.schemas.employee import EmployeeCreate, EmployeeRead, EmployeeUpdate
from app.services import activity_service
from app.utils.pagination import offset_for

# Whitelist: the client chooses a *key*, never a column or SQL fragment.
SORT_COLUMNS = {
    "id": Employee.id,
    "name": func.lower(Employee.name),
    "department": func.lower(Employee.department),
    "title": func.lower(Employee.title),
    "created_at": Employee.created_at,
    "updated_at": Employee.updated_at,
    "updated_by": func.lower(User.username),
}


@dataclass
class EmployeeChange:
    employee: Employee
    activity: ActivityLog | None  # None when an update changed nothing


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")


def _filters(search: str | None, department: str | None) -> list:
    conditions = []
    if department and department.strip():
        conditions.append(func.lower(Employee.department) == department.strip().lower())
    if search and search.strip():
        term = search.strip()
        pattern = f"%{_escape_like(term)}%"
        ors = [
            Employee.name.ilike(pattern, escape="\\"),
            Employee.department.ilike(pattern, escape="\\"),
            Employee.title.ilike(pattern, escape="\\"),
        ]
        # "EMP-000012", "emp12" or "12" also match by employee id.
        m = re.fullmatch(r"(?i)(?:emp-?)?0*(\d{1,9})", term)
        if m:
            ors.append(Employee.id == int(m.group(1)))
        conditions.append(or_(*ors))
    return conditions


async def list_employees(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
    department: str | None,
    sort_by: str,
    sort_dir: str,
) -> tuple[list[Employee], int]:
    conditions = _filters(search, department)

    total = (
        await session.execute(select(func.count()).select_from(Employee).where(*conditions))
    ).scalar_one()

    sort_col = SORT_COLUMNS.get(sort_by, SORT_COLUMNS["updated_at"])
    ordering = sort_col.desc() if sort_dir == "desc" else sort_col.asc()
    tiebreak = Employee.id.desc() if sort_dir == "desc" else Employee.id.asc()

    stmt = (
        select(Employee)
        .outerjoin(Employee.updated_by_user)
        .options(contains_eager(Employee.updated_by_user))
        .where(*conditions)
        .order_by(ordering, tiebreak)
        .offset(offset_for(page, page_size))
        .limit(page_size)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return list(rows), total


async def list_departments(session: AsyncSession) -> list[str]:
    stmt = select(Employee.department).distinct().order_by(Employee.department)
    names = (await session.execute(stmt)).scalars().all()
    # DISTINCT is case-sensitive in SQL; collapse "sales"/"Sales" for the UI.
    seen: dict[str, str] = {}
    for name in names:
        seen.setdefault(name.lower(), name)
    return sorted(seen.values(), key=str.lower)


async def get_employee(session: AsyncSession, employee_id: int) -> Employee:
    employee = await _load(session, employee_id)
    if employee is None:
        raise NotFoundError("Employee not found.", code="employee_not_found")
    return employee


async def _load(session: AsyncSession, employee_id: int) -> Employee | None:
    stmt = select(Employee).where(Employee.id == employee_id).execution_options(populate_existing=True)
    return (await session.execute(stmt)).scalar_one_or_none()


async def create_employee(
    session: AsyncSession, actor: User, data: EmployeeCreate
) -> EmployeeChange:
    employee = Employee(
        name=data.name,
        department=data.department,
        title=data.title,
        updated_by=actor.id,
    )
    session.add(employee)
    await session.flush()

    activity = await activity_service.record_activity(
        session,
        user=actor,
        action=ActivityAction.EMPLOYEE_CREATED,
        details=(
            f"Created employee EMP-{employee.id:06d} '{employee.name}' "
            f"({employee.department} / {employee.title})."
        ),
    )
    await session.commit()  # employee + activity are durable from here on

    employee = await get_employee(session, employee.id)  # hydrate timestamps + updater
    return EmployeeChange(employee=employee, activity=activity)


async def update_employee(
    session: AsyncSession, actor: User, employee_id: int, data: EmployeeUpdate
) -> EmployeeChange:
    # Row lock: concurrent updates to the same employee are serialised, so the
    # version comparison below cannot race with another writer.
    stmt = (
        select(Employee)
        .where(Employee.id == employee_id)
        .with_for_update(of=Employee)
        .execution_options(populate_existing=True)
    )
    employee = (await session.execute(stmt)).scalar_one_or_none()
    if employee is None:
        raise NotFoundError("Employee not found.", code="employee_not_found")

    if employee.version != data.version:
        await session.rollback()  # release the row lock
        current = await get_employee(session, employee_id)
        who = current.updated_by_display_name or "another user"
        raise VersionConflictError(
            f"{who} modified this employee while you were editing "
            f"(you had version {data.version}, the latest is version {current.version}). "
            "The latest data has been loaded; review it and try again.",
            details={
                "your_version": data.version,
                "current_version": current.version,
                "current": EmployeeRead.model_validate(current).model_dump(mode="json"),
            },
        )

    changes: list[str] = []
    for field in ("name", "department", "title"):
        old, new = getattr(employee, field), getattr(data, field)
        if old != new:
            changes.append(f"{field} '{old}' -> '{new}'")
            setattr(employee, field, new)

    if not changes:
        await session.rollback()
        return EmployeeChange(employee=await get_employee(session, employee_id), activity=None)

    employee.version = employee.version + 1
    employee.updated_at = func.now()
    employee.updated_by = actor.id
    await session.flush()

    activity = await activity_service.record_activity(
        session,
        user=actor,
        action=ActivityAction.EMPLOYEE_UPDATED,
        details=f"Updated employee EMP-{employee_id:06d}: {'; '.join(changes)}.",
    )
    await session.commit()

    return EmployeeChange(employee=await get_employee(session, employee_id), activity=activity)
