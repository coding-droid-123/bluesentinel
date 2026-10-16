import asyncio
import sqlite3
from database import engine
from models import Base

def clean_legacy():
    con = sqlite3.connect('bluesentinel.db')
    cursor = con.cursor()
    # Drop legacy tables and tables whose schemas changed
    tables_to_drop = [
        'scan_batches',
        'detections',
        'debris_hotspots',
        'mission_incidents',
        'survey_missions',
    ]
    for tbl in tables_to_drop:
        cursor.execute(f"DROP TABLE IF EXISTS {tbl};")
        print(f"Dropped {tbl}")
    con.commit()
    con.close()

async def reinit():
    clean_legacy()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Re-initialized all tables from models.py successfully.")

if __name__ == "__main__":
    asyncio.run(reinit())
