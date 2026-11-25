import asyncio

from sqlalchemy import select

from app.database.session import async_session_factory
from app.models import ActivityLog


async def create_emp(client, headers, name="Ada Lovelace", department="Engineering", title="Engineer"):
    r = await client.post(
        "/api/employees",
        json={"name": name, "department": department, "title": title},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_create_employee_sets_defaults_and_updater(client, admin_headers):
    emp = await create_emp(client, admin_headers)
    assert emp["employee_code"] == "EMP-000001"
    assert emp["version"] == 1
    assert emp["updated_by_username"] == "admin"
    assert emp["created_at"] and emp["updated_at"]


async def test_normal_user_can_create_view_and_edit(client, user_headers):
    emp = await create_emp(client, user_headers)
    r = await client.get(f"/api/employees/{emp['id']}", headers=user_headers)
    assert r.status_code == 200
    r = await client.put(
        f"/api/employees/{emp['id']}",
        json={"name": "Ada L.", "department": "Engineering", "title": "Engineer", "version": 1},
        headers=user_headers,
    )
    assert r.status_code == 200 and r.json()["updated_by_username"] == "testuser"


async def test_employee_validation(client, admin_headers):
    for payload in [
        {"name": "", "department": "X", "title": "Y"},
        {"name": "A", "department": "  ", "title": "Y"},
        {"name": "A", "department": "X"},
        {"name": "A" * 121, "department": "X", "title": "Y"},
    ]:
        r = await client.post("/api/employees", json=payload, headers=admin_headers)
        assert r.status_code == 422, payload


async def test_get_missing_employee_is_404(client, admin_headers):
    r = await client.get("/api/employees/999", headers=admin_headers)
    assert r.status_code == 404 and r.json()["error"]["code"] == "employee_not_found"
    r = await client.put(
        "/api/employees/999",
        json={"name": "A", "department": "B", "title": "C", "version": 1},
        headers=admin_headers,
    )
    assert r.status_code == 404


async def test_update_increments_version_and_records_updater(client, admin_headers, user_headers):
    emp = await create_emp(client, admin_headers)
    r = await client.put(
        f"/api/employees/{emp['id']}",
        json={"name": "Ada", "department": "R&D", "title": "Fellow", "version": 1},
        headers=user_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["version"] == 2 and body["department"] == "R&D"
    assert body["updated_by_username"] == "testuser"
    assert body["updated_at"] >= emp["updated_at"] and body["created_at"] == emp["created_at"]


async def test_stale_update_returns_409_with_latest_record(client, admin_headers, user_headers):
    emp = await create_emp(client, admin_headers)
    base = {"department": "Engineering", "title": "Engineer"}
    ok = await client.put(
        f"/api/employees/{emp['id']}", json={**base, "name": "From A", "version": 1}, headers=admin_headers
    )
    assert ok.status_code == 200

    stale = await client.put(
        f"/api/employees/{emp['id']}", json={**base, "name": "From B", "version": 1}, headers=user_headers
    )
    assert stale.status_code == 409
    err = stale.json()["error"]
    assert err["code"] == "version_conflict"
    assert "modified this employee" in err["message"]
    assert err["details"]["current"]["name"] == "From A"
    assert err["details"]["current"]["version"] == 2

    # The loser's data was NOT written.
    after = (await client.get(f"/api/employees/{emp['id']}", headers=admin_headers)).json()
    assert after["name"] == "From A" and after["version"] == 2


async def test_concurrent_updates_only_one_wins(client, admin_headers):
    emp = await create_emp(client, admin_headers)

    async def attempt(i: int):
        return await client.put(
            f"/api/employees/{emp['id']}",
            json={"name": f"Writer {i}", "department": "D", "title": "T", "version": 1},
            headers=admin_headers,
        )

    results = await asyncio.gather(*(attempt(i) for i in range(6)))
    codes = sorted(r.status_code for r in results)
    assert codes == [200, 409, 409, 409, 409, 409]
    final = (await client.get(f"/api/employees/{emp['id']}", headers=admin_headers)).json()
    assert final["version"] == 2


async def test_noop_update_does_not_bump_version_or_log(client, admin_headers):
    emp = await create_emp(client, admin_headers)
    r = await client.put(
        f"/api/employees/{emp['id']}",
        json={"name": emp["name"], "department": emp["department"], "title": emp["title"], "version": 1},
        headers=admin_headers,
    )
    assert r.status_code == 200 and r.json()["version"] == 1
    async with async_session_factory() as s:
        actions = (await s.execute(select(ActivityLog.action))).scalars().all()
    assert "employee_updated" not in actions


async def test_create_and_update_write_activity_in_same_transaction(client, admin_headers):
    emp = await create_emp(client, admin_headers)
    await client.put(
        f"/api/employees/{emp['id']}",
        json={"name": "New Name", "department": "Engineering", "title": "Engineer", "version": 1},
        headers=admin_headers,
    )
    async with async_session_factory() as s:
        rows = (await s.execute(select(ActivityLog).order_by(ActivityLog.id))).scalars().all()
    assert [r.action for r in rows] == ["user_login", "employee_created", "employee_updated"]
    assert "EMP-000001" in rows[1].details and "New Name" in rows[2].details


async def test_failed_update_writes_no_activity(client, admin_headers):
    emp = await create_emp(client, admin_headers)
    await client.put(
        f"/api/employees/{emp['id']}",
        json={"name": "X", "department": "Engineering", "title": "Engineer", "version": 7},
        headers=admin_headers,
    )
    async with async_session_factory() as s:
        actions = (await s.execute(select(ActivityLog.action))).scalars().all()
    assert "employee_updated" not in actions


async def test_list_pagination_search_filter_sort(client, admin_headers):
    data = [
        ("Alice Smith", "Engineering", "Developer"),
        ("Bob Jones", "Sales", "Account Executive"),
        ("Carol White", "Engineering", "Architect"),
        ("dave brown", "Marketing", "Designer"),
        ("Eve Black", "sales", "Manager"),
    ]
    for n, d, t in data:
        await create_emp(client, admin_headers, n, d, t)

    r = (await client.get("/api/employees?page=1&page_size=2&sort_by=id&sort_dir=asc", headers=admin_headers)).json()
    assert r["total"] == 5 and r["pages"] == 3 and [e["name"] for e in r["items"]] == ["Alice Smith", "Bob Jones"]

    r = (await client.get("/api/employees?page=3&page_size=2&sort_by=id&sort_dir=asc", headers=admin_headers)).json()
    assert [e["name"] for e in r["items"]] == ["Eve Black"]

    r = (await client.get("/api/employees?search=smith", headers=admin_headers)).json()
    assert [e["name"] for e in r["items"]] == ["Alice Smith"]
    r = (await client.get("/api/employees?search=architect", headers=admin_headers)).json()
    assert [e["name"] for e in r["items"]] == ["Carol White"]
    r = (await client.get("/api/employees?search=EMP-000002", headers=admin_headers)).json()
    assert [e["name"] for e in r["items"]] == ["Bob Jones"]

    r = (await client.get("/api/employees?department=SALES&sort_by=name&sort_dir=asc", headers=admin_headers)).json()
    assert [e["name"] for e in r["items"]] == ["Bob Jones", "Eve Black"]

    r = (await client.get("/api/employees?sort_by=name&sort_dir=desc&page_size=50", headers=admin_headers)).json()
    assert [e["name"] for e in r["items"]][:2] == ["Eve Black", "dave brown"]  # case-insensitive sort

    r = (await client.get("/api/employees?sort_by=updated_by&sort_dir=asc", headers=admin_headers)).json()
    assert r["total"] == 5


async def test_search_treats_wildcards_literally(client, admin_headers):
    await create_emp(client, admin_headers, "100% Effort", "Ops", "Lead")
    await create_emp(client, admin_headers, "Plain Name", "Ops", "Lead")
    r = (await client.get("/api/employees?search=%25", headers=admin_headers)).json()
    assert [e["name"] for e in r["items"]] == ["100% Effort"]


async def test_sql_injection_attempts_are_inert(client, admin_headers):
    await create_emp(client, admin_headers)
    for evil in ["'; DROP TABLE employees; --", "' OR '1'='1", "\" OR 1=1 --"]:
        r = await client.get("/api/employees", params={"search": evil, "department": evil}, headers=admin_headers)
        assert r.status_code == 200 and r.json()["total"] == 0
    assert (await client.get("/api/employees", headers=admin_headers)).json()["total"] == 1
    bad_sort = await client.get("/api/employees?sort_by=password_hash", headers=admin_headers)
    assert bad_sort.status_code == 422


async def test_departments_endpoint_distinct_and_case_collapsed(client, admin_headers):
    await create_emp(client, admin_headers, "A", "Sales", "x")
    await create_emp(client, admin_headers, "B", "sales", "x")
    await create_emp(client, admin_headers, "C", "Engineering", "x")
    r = await client.get("/api/employees/departments", headers=admin_headers)
    assert r.status_code == 200 and r.json()["items"] == ["Engineering", "Sales"]


async def test_invalid_pagination_params_rejected(client, admin_headers):
    assert (await client.get("/api/employees?page=0", headers=admin_headers)).status_code == 422
    assert (await client.get("/api/employees?page_size=1000", headers=admin_headers)).status_code == 422


async def test_activities_latest_100_newest_first(client, admin_headers):
    for i in range(105):
        await create_emp(client, admin_headers, f"Emp {i}")
    r = await client.get("/api/activities", headers=admin_headers)
    items = r.json()["items"]
    assert len(items) == 100
    ids = [a["id"] for a in items]
    assert ids == sorted(ids, reverse=True)
    assert "Emp 104" in items[0]["details"]
    assert (await client.get("/api/activities?limit=101", headers=admin_headers)).status_code == 422
