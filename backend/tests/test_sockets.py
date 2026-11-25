"""Real-time tests: a real uvicorn server + real python-socketio clients."""

from datetime import timedelta

import pytest
import socketio

from app.core.security import create_access_token
from app.sockets.auth import SocketAuthError, authenticate_socket
from tests.conftest import bearer, create_user_row, login_token, wait_for

EMP = {"name": "Grace Hopper", "department": "Engineering", "title": "Rear Admiral"}


def events(sio_client, name):
    return [d for (e, d) in sio_client.received if e == name]


async def subscribe(sio_client, *rooms):
    for room in rooms:
        ack = await sio_client.call(f"{room}:subscribe", timeout=5)
        assert ack["ok"] is True


# ------------------------------------------------------------------ auth
async def test_connection_without_token_is_rejected(make_socket):
    with pytest.raises(socketio.exceptions.ConnectionError):
        await make_socket(None)


async def test_connection_with_bad_token_is_rejected(make_socket):
    with pytest.raises(socketio.exceptions.ConnectionError):
        await make_socket("not-a-jwt")


async def test_connection_with_expired_token_is_rejected(make_socket):
    user = await create_user_row("old", "Old@123456")
    token, _ = create_access_token(user.id, expires_delta=timedelta(seconds=-1))
    with pytest.raises(socketio.exceptions.ConnectionError):
        await make_socket(token)


async def test_rejection_reasons_sent_to_clients():
    """The reason becomes the browser client's connect_error message."""
    user = await create_user_row("old", "Old@123456")
    expired, _ = create_access_token(user.id, expires_delta=timedelta(seconds=-1))
    for auth, reason in [
        (None, "unauthorized"),
        ({}, "unauthorized"),
        ({"token": ""}, "unauthorized"),
        ({"token": 12345}, "unauthorized"),
        ({"token": "garbage"}, "unauthorized"),
        ({"token": expired}, "token_expired"),
    ]:
        with pytest.raises(SocketAuthError) as exc:
            await authenticate_socket(auth)
        assert str(exc.value) == reason, auth


async def test_valid_token_connects(make_socket, user_token):
    sock = await make_socket(user_token)
    assert sock.connected


async def test_identity_comes_from_token_not_from_client_claims(user_token):
    """A client may *claim* to be the admin in its auth payload; the server
    derives identity and role only from the verified token + database row."""
    from app.sockets.auth import authenticate_socket

    identity = await authenticate_socket(
        {"token": user_token, "role": "admin", "user_id": 999, "username": "admin"}
    )
    assert identity.username == "testuser"
    assert identity.role == "user"
    assert identity.user_id != 999


async def test_disabled_user_cannot_connect(client, make_socket):
    from app.database.session import async_session_factory
    from app.models import User

    user = await create_user_row("temp", "Temp@12345")
    token = await login_token(client, "temp", "Temp@12345")
    async with async_session_factory() as s:
        (await s.get(User, user.id)).is_active = False
        await s.commit()
    with pytest.raises(socketio.exceptions.ConnectionError):
        await make_socket(token)


# ------------------------------------------------------------ broadcasts
async def test_employee_created_and_updated_reach_other_user(client, make_socket, admin_headers, user_token):
    watcher = await make_socket(user_token)
    await subscribe(watcher, "employee")

    r = await client.post("/api/employees", json=EMP, headers=admin_headers)
    assert r.status_code == 201
    emp = r.json()
    assert await wait_for(lambda: len(events(watcher, "employee:created")) == 1)
    assert events(watcher, "employee:created")[0]["name"] == "Grace Hopper"
    assert events(watcher, "employee:created")[0]["id"] == emp["id"]

    r = await client.put(
        f"/api/employees/{emp['id']}", json={**EMP, "title": "Admiral", "version": 1}, headers=admin_headers
    )
    assert r.status_code == 200
    assert await wait_for(lambda: len(events(watcher, "employee:updated")) == 1)
    got = events(watcher, "employee:updated")[0]
    assert got["title"] == "Admiral" and got["version"] == 2 and got["updated_by_username"] == "admin"


async def test_activity_new_is_broadcast_to_viewers(client, make_socket, admin_headers, user_token):
    watcher = await make_socket(user_token)
    await subscribe(watcher, "activity")
    await client.post("/api/employees", json=EMP, headers=admin_headers)
    assert await wait_for(lambda: len(events(watcher, "activity:new")) == 1)
    a = events(watcher, "activity:new")[0]
    assert a["action"] == "employee_created" and a["username"] == "admin" and "Grace Hopper" in a["details"]


async def test_login_and_logout_activities_are_broadcast(client, make_socket, admin_token, user_token):
    watcher = await make_socket(user_token)
    await subscribe(watcher, "activity")
    await client.post("/api/auth/logout", headers=bearer(admin_token))
    assert await wait_for(lambda: any(a["action"] == "user_logout" for a in events(watcher, "activity:new")))
    await create_user_row("someone", "Someone@123")
    await client.post("/api/auth/login", json={"username": "someone", "password": "Someone@123"})
    assert await wait_for(lambda: any(a["action"] == "user_login" and a["username"] == "someone" for a in events(watcher, "activity:new")))


async def test_events_only_go_to_subscribed_rooms(client, make_socket, admin_headers, user_token):
    employee_only = await make_socket(user_token)
    activity_only = await make_socket(user_token)
    unsubscribed = await make_socket(user_token)
    await subscribe(employee_only, "employee")
    await subscribe(activity_only, "activity")

    await client.post("/api/employees", json=EMP, headers=admin_headers)
    assert await wait_for(lambda: len(events(employee_only, "employee:created")) == 1)
    assert await wait_for(lambda: len(events(activity_only, "activity:new")) == 1)

    assert events(employee_only, "activity:new") == []
    assert events(activity_only, "employee:created") == []
    assert unsubscribed.received == []


async def test_unsubscribe_stops_events(client, make_socket, admin_headers, user_token):
    watcher = await make_socket(user_token)
    await subscribe(watcher, "employee")
    ack = await watcher.call("employee:unsubscribe", timeout=5)
    assert ack["ok"] is True
    await client.post("/api/employees", json=EMP, headers=admin_headers)
    await wait_for(lambda: False, timeout=0.5)
    assert events(watcher, "employee:created") == []


async def test_failed_update_is_not_broadcast(client, make_socket, admin_headers, user_token):
    r = await client.post("/api/employees", json=EMP, headers=admin_headers)
    emp = r.json()
    watcher = await make_socket(user_token)
    await subscribe(watcher, "employee", "activity")

    stale = await client.put(
        f"/api/employees/{emp['id']}", json={**EMP, "title": "Nope", "version": 42}, headers=admin_headers
    )
    assert stale.status_code == 409
    invalid = await client.post("/api/employees", json={"name": "", "department": "x", "title": "y"}, headers=admin_headers)
    assert invalid.status_code == 422
    await wait_for(lambda: False, timeout=0.5)
    assert watcher.received == []


async def test_event_payload_matches_database_state(client, make_socket, admin_headers, user_token):
    """Broadcasts happen after commit: whatever a client is told must be readable via REST."""
    watcher = await make_socket(user_token)
    await subscribe(watcher, "employee")
    await client.post("/api/employees", json=EMP, headers=admin_headers)
    assert await wait_for(lambda: len(events(watcher, "employee:created")) == 1)
    pushed = events(watcher, "employee:created")[0]
    fetched = (await client.get(f"/api/employees/{pushed['id']}", headers=admin_headers)).json()
    assert fetched == pushed


# ------------------------------------------------------------- transports
async def test_polling_only_transport_receives_events(client, make_socket, admin_headers, user_token):
    watcher = await make_socket(user_token, transports=["polling"])
    assert watcher.transport() == "polling"
    await subscribe(watcher, "employee")
    await client.post("/api/employees", json=EMP, headers=admin_headers)
    assert await wait_for(lambda: len(events(watcher, "employee:created")) == 1, timeout=5)


async def test_polling_upgrades_to_websocket(make_socket, user_token):
    watcher = await make_socket(user_token, transports=["polling", "websocket"])
    assert await wait_for(lambda: watcher.transport() == "websocket", timeout=5)


async def test_websocket_only_transport_works(client, make_socket, admin_headers, user_token):
    watcher = await make_socket(user_token, transports=["websocket"])
    assert watcher.transport() == "websocket"
    await subscribe(watcher, "employee")
    await client.post("/api/employees", json=EMP, headers=admin_headers)
    assert await wait_for(lambda: len(events(watcher, "employee:created")) == 1)
