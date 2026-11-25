from sqlalchemy import select

from app.database.init_db import seed_admin
from app.database.session import async_session_factory
from app.models import ActivityLog, User
from tests.conftest import create_user_row

NEW_USER = {
    "display_name": "Test User",
    "username": "testuser",
    "password": "TestUser@123",
    "role": "user",
}


async def test_admin_can_create_and_list_users(client, admin_headers):
    r = await client.post("/api/users", json=NEW_USER, headers=admin_headers)
    assert r.status_code == 201
    created = r.json()
    assert created["username"] == "testuser" and created["role"] == "user"
    assert "password" not in r.text and "hash" not in r.text

    r = await client.get("/api/users", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    assert {u["username"] for u in body["items"]} == {"admin", "testuser"}
    assert all("password_hash" not in u for u in body["items"])


async def test_new_user_password_is_hashed_and_can_login(client, admin_headers):
    await client.post("/api/users", json=NEW_USER, headers=admin_headers)
    async with async_session_factory() as s:
        row = (await s.execute(select(User).where(User.username == "testuser"))).scalar_one()
    assert row.password_hash.startswith("$2") and row.password_hash != NEW_USER["password"]
    r = await client.post(
        "/api/auth/login", json={"username": "testuser", "password": NEW_USER["password"]}
    )
    assert r.status_code == 200


async def test_normal_user_gets_403_on_every_users_endpoint(client, user_headers):
    assert (await client.get("/api/users", headers=user_headers)).status_code == 403
    r = await client.post("/api/users", json={**NEW_USER, "username": "sneaky"}, headers=user_headers)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden"
    async with async_session_factory() as s:
        names = (await s.execute(select(User.username))).scalars().all()
    assert "sneaky" not in names


async def test_user_cannot_escalate_by_creating_an_admin(client, user_headers):
    r = await client.post(
        "/api/users", json={**NEW_USER, "username": "evil", "role": "admin"}, headers=user_headers
    )
    assert r.status_code == 403


async def test_duplicate_username_rejected_case_insensitively(client, admin_headers):
    assert (await client.post("/api/users", json=NEW_USER, headers=admin_headers)).status_code == 201
    r = await client.post("/api/users", json={**NEW_USER, "username": "TESTUSER"}, headers=admin_headers)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "username_taken"


async def test_database_enforces_case_insensitive_uniqueness(client):
    import pytest
    from sqlalchemy.exc import IntegrityError

    await create_user_row("Alice", "Alice@1234")
    with pytest.raises(IntegrityError):
        await create_user_row("aLICE", "Alice@1234")


async def test_user_validation_rules(client, admin_headers):
    bad_payloads = [
        {**NEW_USER, "username": ""},
        {**NEW_USER, "username": "ab"},
        {**NEW_USER, "username": "has space"},
        {**NEW_USER, "display_name": "   "},
        {**NEW_USER, "password": "short1A"},
        {**NEW_USER, "password": "alllowercase1"},
        {**NEW_USER, "password": "A" * 40 + "a1" + "x" * 40},  # > 72 bytes
        {**NEW_USER, "role": "superuser"},
    ]
    for payload in bad_payloads:
        r = await client.post("/api/users", json=payload, headers=admin_headers)
        assert r.status_code == 422, payload
        assert r.json()["error"]["code"] == "validation_error"


async def test_user_creation_is_logged(client, admin_headers):
    await client.post("/api/users", json=NEW_USER, headers=admin_headers)
    async with async_session_factory() as s:
        row = (
            await s.execute(select(ActivityLog).where(ActivityLog.action == "user_created"))
        ).scalar_one()
    assert row.username == "admin" and "testuser" in row.details


async def test_seed_creates_admin_only_when_no_users_exist():
    async with async_session_factory() as s:
        assert await seed_admin(s) is True
    async with async_session_factory() as s:
        assert await seed_admin(s) is False  # already one user
        count = len((await s.execute(select(User))).scalars().all())
    assert count == 1


async def test_seed_does_nothing_when_users_already_exist():
    await create_user_row("someone", "Someone@123")
    async with async_session_factory() as s:
        assert await seed_admin(s) is False
        names = (await s.execute(select(User.username))).scalars().all()
    assert names == ["someone"]
