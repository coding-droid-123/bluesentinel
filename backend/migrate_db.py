"""Safe database migration script for BlueSentinel.
Adds new audit columns to cleanup_plans without dropping existing data,
and safely backfills existing records.
"""

import asyncio
import os
import sqlite3
from pathlib import Path
from sqlalchemy import text
from database import engine, IS_POSTGRES, SQLITE_PATH
from models import Base


async def migrate_cleanup_plans():
    """Safely add new columns to cleanup_plans and backfill existing rows."""
    print("[MIGRATION] Checking cleanup_plans schema...")

    # Ensure table exists first
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    new_columns = [
        ("cost_min", "REAL", "FLOAT"),
        ("cost_max", "REAL", "FLOAT"),
        ("mode", "TEXT", "VARCHAR"),
        ("crew", "TEXT", "JSONB"),
        ("depth_source", "TEXT", "VARCHAR"),
        ("assumptions_version", "TEXT", "VARCHAR"),
        ("breakdown", "TEXT", "JSONB"),
        ("warnings", "TEXT", "JSONB"),
    ]

    if IS_POSTGRES:
        print("[MIGRATION] Applying PostgreSQL column migrations...")
        async with engine.begin() as conn:
            for col_name, _, pg_type in new_columns:
                await conn.execute(
                    text(f"ALTER TABLE cleanup_plans ADD COLUMN IF NOT EXISTS {col_name} {pg_type};")
                )
            # Safe backfill
            await conn.execute(
                text("""
                    UPDATE cleanup_plans
                    SET cost_min = COALESCE(cost_min, estimated_min_cost),
                        cost_max = COALESCE(cost_max, estimated_max_cost),
                        mode = COALESCE(mode, 'compact_rov'),
                        depth_source = COALESCE(depth_source, 'simulated'),
                        assumptions_version = COALESCE(assumptions_version, 'v-legacy'),
                        crew = COALESCE(crew, '{}'::jsonb),
                        breakdown = COALESCE(breakdown, '{}'::jsonb),
                        warnings = COALESCE(warnings, '[]'::jsonb)
                    WHERE cost_min IS NULL OR mode IS NULL;
                """)
            )
        print("[MIGRATION] PostgreSQL migration complete.")
    else:
        print(f"[MIGRATION] Applying SQLite column migrations to {SQLITE_PATH}...")
        con = sqlite3.connect(SQLITE_PATH)
        cursor = con.cursor()
        cursor.execute("PRAGMA table_info(cleanup_plans);")
        existing_cols = {row[1] for row in cursor.fetchall()}

        for col_name, sqlite_type, _ in new_columns:
            if col_name not in existing_cols:
                cursor.execute(f"ALTER TABLE cleanup_plans ADD COLUMN {col_name} {sqlite_type};")
                print(f"[MIGRATION] Added column {col_name} ({sqlite_type}) to cleanup_plans.")

        # Safe backfill
        cursor.execute("""
            UPDATE cleanup_plans
            SET cost_min = COALESCE(cost_min, estimated_min_cost),
                cost_max = COALESCE(cost_max, estimated_max_cost),
                mode = COALESCE(mode, 'compact_rov'),
                depth_source = COALESCE(depth_source, 'simulated'),
                assumptions_version = COALESCE(assumptions_version, 'v-legacy'),
                crew = COALESCE(crew, '{}'),
                breakdown = COALESCE(breakdown, '{}'),
                warnings = COALESCE(warnings, '[]')
            WHERE cost_min IS NULL OR mode IS NULL;
        """)
        con.commit()
        con.close()
        print("[MIGRATION] SQLite migration and backfill complete.")


if __name__ == "__main__":
    asyncio.run(migrate_cleanup_plans())
