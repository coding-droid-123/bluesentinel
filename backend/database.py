"""BlueSentinel — Async database engine and session management.

Tries PostgreSQL first (via docker-compose); falls back to a local SQLite
database if PostgreSQL is unreachable. This ensures the app always starts.
"""

import os
import asyncio
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

# ---------------------------------------------------------------------------
# Connection strings
# ---------------------------------------------------------------------------

POSTGRES_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://bluesentinel:bluesentinel@localhost:5432/bluesentinel",
)

BACKEND_DIR = Path(__file__).parent.resolve()
SQLITE_PATH = BACKEND_DIR / "bluesentinel.db"
SQLITE_URL = f"sqlite+aiosqlite:///{SQLITE_PATH}"

# ---------------------------------------------------------------------------
# Probe PostgreSQL availability (fast TCP check)
# ---------------------------------------------------------------------------

_use_postgres = False

def _check_pg_sync() -> bool:
    """Quick TCP connect test to PostgreSQL port."""
    import socket
    try:
        s = socket.create_connection(("127.0.0.1", 5432), timeout=0.5)
        s.close()
        return True
    except (OSError, ConnectionRefusedError):
        return False

_use_postgres = _check_pg_sync()

if _use_postgres:
    DATABASE_URL = POSTGRES_URL
    print(f"[DB] PostgreSQL detected on localhost:5432 — using asyncpg")
else:
    DATABASE_URL = SQLITE_URL
    print(f"[DB] PostgreSQL unreachable — falling back to SQLite: {SQLITE_PATH}")

# ---------------------------------------------------------------------------
# Engine & session factory
# ---------------------------------------------------------------------------

_engine_kwargs = {"echo": False}

if not _use_postgres:
    # aiosqlite needs check_same_thread=False
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_async_engine(DATABASE_URL, **_engine_kwargs)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    """FastAPI dependency — yields an async database session."""
    async with async_session() as session:
        yield session


# Expose for import convenience
IS_POSTGRES = _use_postgres
