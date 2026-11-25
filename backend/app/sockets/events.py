"""Socket.IO event handlers and the broadcast helpers used by the API layer.

Rooms
  employee_master   clients that have the Employee Master screen open
  activity_viewers  clients that have the User Activity screen open

Client -> server events: employee:subscribe, employee:unsubscribe,
                         activity:subscribe, activity:unsubscribe
Server -> client events: employee:created, employee:updated, activity:new,
                         auth:expired

Broadcasts are only ever triggered AFTER the database transaction committed.
"""

import asyncio
import logging
import time

from socketio.exceptions import ConnectionRefusedError

from app.schemas.activity import ActivityRead
from app.schemas.employee import EmployeeRead
from app.sockets.auth import SocketAuthError, SocketIdentity, authenticate_socket
from app.sockets.server import sio

logger = logging.getLogger(__name__)

EMPLOYEE_ROOM = "employee_master"
ACTIVITY_ROOM = "activity_viewers"

# Which roles may join which room. Both screens are open to every authenticated
# user in this demo; this table is the single place to tighten that later.
ROOM_ROLES: dict[str, set[str]] = {
    EMPLOYEE_ROOM: {"admin", "user"},
    ACTIVITY_ROOM: {"admin"},
}

_expiry_tasks: dict[str, asyncio.Task[None]] = {}


# --------------------------------------------------------------------------
# Connection lifecycle
# --------------------------------------------------------------------------
@sio.event
async def connect(sid: str, environ: dict, auth: object = None) -> None:
    try:
        identity = await authenticate_socket(auth)
    except SocketAuthError as exc:
        logger.info("Socket %s rejected: %s", sid, exc)
        raise ConnectionRefusedError(str(exc)) from exc

    await sio.save_session(
        sid,
        {
            "user_id": identity.user_id,
            "username": identity.username,
            "role": identity.role,
            "expires_at": identity.expires_at,
        },
    )
    _schedule_expiry(sid, identity.expires_at)
    logger.info("Socket %s connected as %s (%s)", sid, identity.username, identity.role)


@sio.event
async def disconnect(sid: str, reason: str | None = None) -> None:
    task = _expiry_tasks.pop(sid, None)
    if task:
        task.cancel()
    logger.info("Socket %s disconnected (%s)", sid, reason)


def _schedule_expiry(sid: str, expires_at: int) -> None:
    """A JWT is only checked at handshake time, so drop the connection when the
    token expires. The client reacts to auth:expired by signing the user out."""

    async def _expire() -> None:
        try:
            await asyncio.sleep(max(0.0, expires_at - time.time()))
            await sio.emit("auth:expired", {"message": "Session expired."}, to=sid)
            await sio.disconnect(sid)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Failed to expire socket %s", sid)

    _expiry_tasks[sid] = asyncio.get_running_loop().create_task(_expire())


async def _identity(sid: str) -> SocketIdentity | None:
    session = await sio.get_session(sid)
    if not session or time.time() >= session.get("expires_at", 0):
        return None
    return SocketIdentity(
        user_id=session["user_id"],
        username=session["username"],
        display_name="",
        role=session["role"],
        expires_at=session["expires_at"],
    )


async def _subscribe(sid: str, room: str) -> dict:
    identity = await _identity(sid)
    if identity is None:
        return {"ok": False, "error": "unauthorized"}
    if identity.role not in ROOM_ROLES[room]:
        return {"ok": False, "error": "forbidden"}
    await sio.enter_room(sid, room)
    return {"ok": True, "room": room}


async def _unsubscribe(sid: str, room: str) -> dict:
    await sio.leave_room(sid, room)
    return {"ok": True, "room": room}


# --------------------------------------------------------------------------
# Client -> server
# --------------------------------------------------------------------------
@sio.on("employee:subscribe")
async def employee_subscribe(sid: str, data: object = None) -> dict:
    return await _subscribe(sid, EMPLOYEE_ROOM)


@sio.on("employee:unsubscribe")
async def employee_unsubscribe(sid: str, data: object = None) -> dict:
    return await _unsubscribe(sid, EMPLOYEE_ROOM)


@sio.on("activity:subscribe")
async def activity_subscribe(sid: str, data: object = None) -> dict:
    return await _subscribe(sid, ACTIVITY_ROOM)


@sio.on("activity:unsubscribe")
async def activity_unsubscribe(sid: str, data: object = None) -> dict:
    return await _unsubscribe(sid, ACTIVITY_ROOM)


# --------------------------------------------------------------------------
# Server -> client broadcasts (called by the API layer after commit)
# --------------------------------------------------------------------------
async def _emit(event: str, payload: dict, room: str) -> None:
    # A failed broadcast must never turn an already-committed change into an
    # HTTP error. Clients that missed it recover via refetch-on-reconnect.
    try:
        await sio.emit(event, payload, room=room)
    except Exception:
        logger.exception("Failed to broadcast %s to %s", event, room)


async def broadcast_employee_created(employee: EmployeeRead) -> None:
    await _emit("employee:created", employee.model_dump(mode="json"), EMPLOYEE_ROOM)


async def broadcast_employee_updated(employee: EmployeeRead) -> None:
    await _emit("employee:updated", employee.model_dump(mode="json"), EMPLOYEE_ROOM)


async def broadcast_activity(activity: ActivityRead) -> None:
    await _emit("activity:new", activity.model_dump(mode="json"), ACTIVITY_ROOM)
