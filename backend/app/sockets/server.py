"""The shared python-socketio AsyncServer instance.

Handlers live in app/sockets/events.py; this module only builds the server so
it can be imported without side effects.
"""

import socketio

from app.core.config import settings


def _client_manager() -> socketio.AsyncManager | None:
    # Several backend processes/instances must share rooms and broadcasts.
    # Setting SOCKETIO_REDIS_URL switches Socket.IO to a Redis message queue.
    if settings.socketio_redis_url:
        return socketio.AsyncRedisManager(settings.socketio_redis_url)
    return None


sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.cors_origins_list,
    client_manager=_client_manager(),
    ping_interval=25,
    ping_timeout=20,
    logger=False,
    engineio_logger=False,
    # Default transports are polling + websocket: clients start on HTTP
    # long-polling and upgrade to WebSocket when the network allows it.
)
