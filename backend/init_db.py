"""BlueSentinel — Database initialization and seed script.

Creates all tables for the 3-Pillar Architecture:
- survey_missions
- mission_incidents
- debris_hotspots
- cleanup_zones
- cleanup_plans

Usage:
    python init_db.py
"""

import asyncio
import uuid
from sqlalchemy import text, select
from database import engine, async_session
from models import Base, CleanupZone

DEFAULT_ZONES = []



async def init():
    print("Connecting to database...")
    async with engine.begin() as conn:
        try:
            # Enable pgvector if available
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception as e:
            print(f"Notice: vector extension skipped ({e})")

        # Create all tables defined in models.py
        print("Creating/verifying database tables...")
        await conn.run_sync(Base.metadata.create_all)

    # Seed default cleanup zones if empty
    async with async_session() as session:
        result = await session.execute(select(CleanupZone))
        existing_zones = result.scalars().all()
        if not existing_zones:
            print("Seeding initial marine survey zones for Cleanup Optimizer...")
            for z_data in DEFAULT_ZONES:
                zone = CleanupZone(
                    id=z_data["id"],
                    name=z_data["name"],
                    location_coords=z_data["location_coords"],
                    travel_cost_usd=z_data["travel_cost_usd"],
                    debris_inventory=z_data["debris_inventory"],
                )
                session.add(zone)
            await session.commit()
            print(f"Seeded {len(DEFAULT_ZONES)} zones successfully.")
        else:
            print(f"Found {len(existing_zones)} existing cleanup zones in database.")

    await engine.dispose()
    print("Database initialization complete.")


if __name__ == "__main__":
    asyncio.run(init())
