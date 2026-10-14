import sqlite3

conn = sqlite3.connect('bluesentinel.db')
cur = conn.cursor()
cur.execute("DROP TABLE IF EXISTS detections")
cur.execute("DROP TABLE IF EXISTS scan_batches")
conn.commit()
print("Dropped 'detections' and 'scan_batches' tables.")

cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
print("Active database tables:", [row[0] for row in cur.fetchall()])
conn.close()
