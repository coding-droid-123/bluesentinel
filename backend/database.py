"""BlueSentinel — Async database engine and session management."""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

# ---------------------------------------------------------------------------
# Connection string (dev — no auth complexity, matches docker-compose.yml)
# ---------------------------------------------------------------------------

DATABASE_URL = "postgresql+asyncpg://bluesentinel:bluesentinel@localhost:5432/bluesentinel"

# ---------------------------------------------------------------------------
# Engine & session factory
# ---------------------------------------------------------------------------

engine = create_async_engine(DATABASE_URL, echo=False)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    """FastAPI dependency — yields an async database session."""
    async with async_session() as session:
        yield session
