"""BlueSentinel — One-time script to create all database tables.

Usage:
    python init_db.py
"""

import asyncio

from sqlalchemy import text
from database import engine
from models import Base


async def init():
    async with engine.begin() as conn:
        # Enable pgvector extension (for future embedding support)
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        # Create all tables from ORM models
        await conn.run_sync(Base.metadata.create_all)

    await engine.dispose()
    print("Database tables created successfully.")


if __name__ == "__main__":
    asyncio.run(init())
