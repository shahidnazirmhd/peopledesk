from datetime import timedelta

from sqlalchemy import select

from app.core.security import create_access_token
from app.database.session import async_session_factory
from app.models import ActivityLog, User
from tests.conftest import bearer, create_user_row, login_token


async def test_login_success_returns_token_and_user_without_hash(client):
    await create_user_row("admin", "Admin@123", "admin")
    r = await client.post("/api/auth/login", json={"username": "admin", "password": "Admin@123"})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer" and body["access_token"]
    assert body["user"]["username"] == "admin" and body["user"]["role"] == "admin"
    assert "password" not in r.text and "password_hash" not in r.text


async def test_login_username_is_case_insensitive(client):
    await create_user_row("Admin", "Admin@123", "admin")
    r = await client.post("/api/auth/login", json={"username": "aDmIn", "password": "Admin@123"})
    assert r.status_code == 200


async def test_login_invalid_credentials_message(client):
    await create_user_row("admin", "Admin@123", "admin")
    wrong_pw = await client.post("/api/auth/login", json={"username": "admin", "password": "bad"})
    unknown = await client.post("/api/auth/login", json={"username": "ghost", "password": "bad"})
    for r in (wrong_pw, unknown):
        assert r.status_code == 401
        assert r.json()["error"]["message"] == "Invalid username or password."
        assert r.json()["error"]["code"] == "invalid_credentials"


async def test_password_is_stored_as_bcrypt_hash(client):
    await create_user_row("admin", "Admin@123", "admin")
    async with async_session_factory() as s:
        stored = (await s.execute(select(User.password_hash))).scalar_one()
    assert stored.startswith("$2") and "Admin@123" not in stored


async def test_inactive_user_cannot_login(client):
    await create_user_row("gone", "Gone@12345", "user", active=False)
    r = await client.post("/api/auth/login", json={"username": "gone", "password": "Gone@12345"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "account_disabled"


async def test_inactive_user_with_valid_token_is_rejected(client):
    user = await create_user_row("temp", "Temp@12345", "user")
    token = await login_token(client, "temp", "Temp@12345")
    async with async_session_factory() as s:
        db_user = await s.get(User, user.id)
        db_user.is_active = False
        await s.commit()
    r = await client.get("/api/auth/me", headers=bearer(token))
    assert r.status_code == 401


async def test_protected_endpoints_require_token(client):
    for method, path in [
        ("get", "/api/auth/me"),
        ("get", "/api/employees"),
        ("get", "/api/employees/1"),
        ("get", "/api/employees/departments"),
        ("get", "/api/activities"),
        ("get", "/api/users"),
        ("post", "/api/users"),
        ("post", "/api/employees"),
        ("put", "/api/employees/1"),
        ("post", "/api/auth/logout"),
    ]:
        r = await getattr(client, method)(path)
        assert r.status_code == 401, f"{method.upper()} {path} -> {r.status_code}"


async def test_invalid_and_tampered_token_rejected(client, admin_token):
    assert (await client.get("/api/auth/me", headers=bearer("garbage"))).status_code == 401
    tampered = admin_token[:-3] + ("AAA" if not admin_token.endswith("AAA") else "BBB")
    assert (await client.get("/api/auth/me", headers=bearer(tampered))).status_code == 401


async def test_expired_token_rejected_with_specific_code(client):
    user = await create_user_row("admin", "Admin@123", "admin")
    token, _ = create_access_token(user.id, expires_delta=timedelta(seconds=-5))
    r = await client.get("/api/auth/me", headers=bearer(token))
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "token_expired"


async def test_me_returns_current_user(client, admin_headers):
    r = await client.get("/api/auth/me", headers=admin_headers)
    assert r.status_code == 200 and r.json()["username"] == "admin"


async def test_login_and_logout_are_recorded_as_activities(client, admin_headers):
    assert (await client.post("/api/auth/logout", headers=admin_headers)).status_code == 200
    async with async_session_factory() as s:
        actions = (await s.execute(select(ActivityLog.action).order_by(ActivityLog.id))).scalars().all()
    assert actions == ["user_login", "user_logout"]


async def test_login_rate_limit_locks_out_after_repeated_failures(client):
    await create_user_row("admin", "Admin@123", "admin")
    for _ in range(5):
        r = await client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
        assert r.status_code == 401
    blocked = await client.post("/api/auth/login", json={"username": "admin", "password": "Admin@123"})
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "too_many_attempts"
    assert int(blocked.headers["Retry-After"]) > 0


async def test_successful_login_resets_failed_counter(client):
    await create_user_row("admin", "Admin@123", "admin")
    for _ in range(4):
        await client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert (await client.post("/api/auth/login", json={"username": "admin", "password": "Admin@123"})).status_code == 200
    for _ in range(4):
        r = await client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
        assert r.status_code == 401
