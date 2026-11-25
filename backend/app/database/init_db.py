"""Initial data seeding.

Run manually after migrations:   python -m app.database.init_db
It also runs automatically on application startup when SEED_ADMIN_ON_STARTUP=true.
"""

import asyncio
import logging

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.database.session import async_session_factory, engine
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)


async def seed_admin(session: AsyncSession) -> bool:
    """Create the default administrator, but ONLY when no users exist.

    Returns True if the admin was created.
    """
    count = (await session.execute(select(func.count()).select_from(User))).scalar_one()
    if count > 0:
        return False

    session.add(
        User(
            username=settings.seed_admin_username,
            display_name=settings.seed_admin_display_name,
            password_hash=hash_password(settings.seed_admin_password),
            role=UserRole.ADMIN.value,
        )
    )
    try:
        await session.commit()
    except IntegrityError:
        # Another worker seeded at the same moment; that is fine.
        await session.rollback()
        return False
    return True


async def seed_default_admin() -> bool:
    async with async_session_factory() as session:
        created = await seed_admin(session)
    if created:
        logger.info("Seeded default administrator '%s'.", settings.seed_admin_username)
    return created


async def _main() -> None:
    created = await seed_default_admin()
    if created:
        print(f"Created default administrator '{settings.seed_admin_username}'.")
    else:
        print("Users already exist - nothing seeded.")
    await engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main())
