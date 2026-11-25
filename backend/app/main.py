"""PeopleDesk ASGI entry point:  uvicorn app.main:app

`app` is a Socket.IO ASGI app that wraps the FastAPI app:
  /socket.io/*   -> python-socketio (HTTP long-polling + WebSocket)
  everything else -> FastAPI (REST under /api, Swagger at /docs)
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.types import Receive, Scope, Send

from app.api.router import api_router
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.database.init_db import seed_default_admin
from app.database.session import engine
from app.sockets import events as _socket_events  # noqa: F401  (registers handlers)
from app.sockets.server import sio

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s"
)
logger = logging.getLogger("peopledesk")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    if settings.seed_admin_on_startup:
        await seed_default_admin()
    logger.info("PeopleDesk started (env=%s)", settings.app_env)
    yield
    await engine.dispose()


fastapi_app = FastAPI(
    title="PeopleDesk API",
    version="1.0.0",
    description=(
        "Real-time employee management API. Authenticate via **POST /api/auth/login**, "
        "then use *Authorize* and paste the access token. Real-time updates are "
        "delivered over Socket.IO at `/socket.io`."
    ),
    lifespan=lifespan,
)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_exception_handlers(fastapi_app)
fastapi_app.include_router(api_router)


@fastapi_app.get("/health", tags=["Health"])
async def health() -> dict[str, str]:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ok"}


class _SocketIOWithLifespan:
    """socketio.ASGIApp answers ASGI 'lifespan' itself and never forwards it to
    the wrapped app, so FastAPI's startup/shutdown (seeding, engine disposal)
    would not run. Route lifespan to FastAPI and everything else to Socket.IO."""

    def __init__(self, sio_app: socketio.ASGIApp, lifespan_app: FastAPI) -> None:
        self._sio_app = sio_app
        self._lifespan_app = lifespan_app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "lifespan":
            await self._lifespan_app(scope, receive, send)
        else:
            await self._sio_app(scope, receive, send)


app = _SocketIOWithLifespan(
    socketio.ASGIApp(sio, other_asgi_app=fastapi_app, socketio_path="socket.io"),
    fastapi_app,
)
