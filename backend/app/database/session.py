from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=settings.db_echo,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_pre_ping=True,  # transparently replaces connections dropped by a DB restart
)

# expire_on_commit=False: objects stay readable after commit (we serialize them
# right after committing and before broadcasting).
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request. Services commit explicitly;
    anything uncommitted is rolled back when the session closes."""
    async with async_session_factory() as session:
        yield session
