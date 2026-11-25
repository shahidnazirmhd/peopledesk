"""Test fixtures. Tests run against a REAL PostgreSQL database (never SQLite).

By default the database `employee_db_test` on the same server as the dev
database is used; override with TEST_DATABASE_URL. It is created if missing and
its schema is built by running the real Alembic migrations.

The environment must be configured BEFORE any `app` module is imported.
"""

import asyncio
import os
import socket
import subprocess
import sys
from pathlib import Path

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://appuser:apppassword@localhost:5432/employee_db_test",
)
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["JWT_SECRET"] = "test-secret-test-secret-test-secret-0123456789"
os.environ["SEED_ADMIN_ON_STARTUP"] = "false"
os.environ["BCRYPT_ROUNDS"] = "4"  # fast hashing in tests
os.environ["LOGIN_RATE_LIMIT_ATTEMPTS"] = "5"

import asyncpg  # noqa: E402
import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
import socketio  # noqa: E402
import uvicorn  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.core.rate_limit import reset_login_limiters  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.database.session import async_session_factory, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------
async def _ensure_database() -> None:
    url = make_url(TEST_DATABASE_URL)
    conn = await asyncpg.connect(
        user=url.username,
        password=url.password,
        host=url.host,
        port=url.port or 5432,
        database="postgres",
    )
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", url.database)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{url.database}"')
    finally:
        await conn.close()


@pytest.fixture(scope="session", autouse=True)
def _database_schema() -> None:
    asyncio.run(_ensure_database())
    env = {**os.environ, "DATABASE_URL": TEST_DATABASE_URL}
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
        capture_output=True,
    )


@pytest_asyncio.fixture(autouse=True)
async def _clean_state():
    async with engine.begin() as conn:
        await conn.execute(
            text("TRUNCATE activity_logs, employees, users RESTART IDENTITY CASCADE")
        )
    reset_login_limiters()
    yield


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _dispose_engine():
    yield
    await engine.dispose()


# --------------------------------------------------------------------------
# HTTP client + users
# --------------------------------------------------------------------------
@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def create_user_row(username: str, password: str, role: str = "user", *, active: bool = True) -> User:
    async with async_session_factory() as session:
        user = User(
            username=username,
            display_name=username.title(),
            password_hash=hash_password(password),
            role=role,
            is_active=active,
        )
        session.add(user)
        await session.commit()
        return user


async def login_token(client: httpx.AsyncClient, username: str, password: str) -> str:
    r = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def admin_token(client) -> str:
    await create_user_row("admin", "Admin@123", "admin")
    return await login_token(client, "admin", "Admin@123")


@pytest_asyncio.fixture
async def user_token(client) -> str:
    await create_user_row("testuser", "TestUser@123", "user")
    return await login_token(client, "testuser", "TestUser@123")


@pytest_asyncio.fixture
async def admin_headers(admin_token) -> dict[str, str]:
    return bearer(admin_token)


@pytest_asyncio.fixture
async def user_headers(user_token) -> dict[str, str]:
    return bearer(user_token)


# --------------------------------------------------------------------------
# Real server for Socket.IO tests (uvicorn on a free port, same event loop)
# --------------------------------------------------------------------------
def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def server_url():
    port = _free_port()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", lifespan="on")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    for _ in range(100):
        if server.started:
            break
        await asyncio.sleep(0.05)
    assert server.started, "uvicorn did not start"
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    await task


@pytest_asyncio.fixture
async def make_socket(server_url):
    """Factory for connected Socket.IO clients; all are closed after the test."""
    clients: list[socketio.AsyncClient] = []

    async def _make(token: str | None, transports: list[str] | None = None, *, connect: bool = True):
        sio_client = socketio.AsyncClient(reconnection=False)
        sio_client.received = []  # type: ignore[attr-defined]
        for event in ("employee:created", "employee:updated", "activity:new", "auth:expired"):

            def _handler(data, _event=event):
                sio_client.received.append((_event, data))  # type: ignore[attr-defined]

            sio_client.on(event, _handler)
        clients.append(sio_client)
        if connect:
            await sio_client.connect(
                server_url,
                auth={"token": token} if token is not None else None,
                transports=transports or ["websocket"],
                wait_timeout=5,
            )
        return sio_client

    yield _make
    for c in clients:
        if c.connected:
            await c.disconnect()


async def wait_for(predicate, timeout: float = 3.0) -> bool:
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        if predicate():
            return True
        await asyncio.sleep(0.02)
    return predicate()
