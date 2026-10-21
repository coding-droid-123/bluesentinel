import os
import sqlite3
from typing import Optional, Tuple
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query
import json
import time
import requests
import rasterio
from rasterio.io import MemoryFile

# Load local .env if present
load_dotenv()

CACHE_DB_PATH = os.path.join(os.path.dirname(__file__), "depth_cache.db")


# ---------------------------------------------------------------------------
# Database & Cache Initialization
# ---------------------------------------------------------------------------
def init_db() -> None:
    """Initialize persistent SQLite depth cache table."""
    with sqlite3.connect(CACHE_DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS depth_cache (
                lat_round REAL NOT NULL,
                lon_round REAL NOT NULL,
                depth_m REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (lat_round, lon_round)
            )
            """
        )
        conn.commit()


def get_cached_depth(lat_r: float, lon_r: float) -> Tuple[bool, Optional[float]]:
    """Look up cached depth for rounded coordinates.

    Returns:
        (is_cached, depth_m_or_none)
    """
    with sqlite3.connect(CACHE_DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT depth_m FROM depth_cache WHERE lat_round = ? AND lon_round = ?",
            (lat_r, lon_r),
        )
        row = cursor.fetchone()
        if row is not None:
            return True, row[0]
    return False, None


def set_cached_depth(lat_r: float, lon_r: float, depth_m: Optional[float]) -> None:
    """Store depth value (or None for land) in SQLite cache."""
    with sqlite3.connect(CACHE_DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR REPLACE INTO depth_cache (lat_round, lon_round, depth_m)
            VALUES (?, ?, ?)
            """,
            (lat_r, lon_r, depth_m),
        )
        conn.commit()


# ---------------------------------------------------------------------------
# Coordinate & Security Helpers
# ---------------------------------------------------------------------------
def normalize_longitude(lon: float) -> float:
    """Normalize longitude to the range [-180.0, 180.0]."""
    norm = ((lon + 180.0) % 360.0) - 180.0
    # Boundary handling: if original lon is positive 180, retain 180.0
    if norm == -180.0 and lon > 0:
        return 180.0
    return norm


def get_configured_api_keys() -> set[str]:
    """Return set of valid API keys parsed from APP_API_KEYS."""
    raw_keys = os.getenv("APP_API_KEYS", "")
    return {k.strip() for k in raw_keys.split(",") if k.strip()}


def verify_api_key(x_api_key: Optional[str]) -> None:
    """Validate request x-api-key header against APP_API_KEYS."""
    valid_keys = get_configured_api_keys()
    if not valid_keys or not x_api_key or x_api_key not in valid_keys:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Missing or invalid x-api-key header.",
        )


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# NOAA NCEI ETOPO Global DEM Bathymetry Fetcher (Fallback & High-Reliability)
# ---------------------------------------------------------------------------
def fetch_depth_noaa(lat: float, lon: float) -> Optional[float]:
    """Fetch ocean depth using NOAA NCEI ETOPO Global DEM Mosaic ImageServer.

    Free public service with global relief coverage and no 50-call/day rate limits.
    Returns:
        float: Ocean depth in meters (positive value).
        None: If the coordinate is on land (elevation >= 0).
    """
    url = "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer/identify"
    params = {
        "geometry": json.dumps({"x": lon, "y": lat, "spatialReference": {"wkid": 4326}}),
        "geometryType": "esriGeometryPoint",
        "returnGeometry": "false",
        "f": "json",
    }
    try:
        resp = requests.get(url, params=params, timeout=12)
        if resp.status_code == 200:
            data = resp.json()
            val_str = data.get("value")
            if val_str is not None:
                val = float(val_str)
                # In ETOPO DEM mosaic, negative values represent depth below sea level
                if val < 0:
                    return round(-val, 2)
                else:
                    return None  # On land
    except Exception as e:
        print(f"[NOAA ETOPO] Warning: {e}")
    return None


# ---------------------------------------------------------------------------
# OpenTopography & Multi-Source Ocean Depth Fetcher
# ---------------------------------------------------------------------------
_ot_rate_limited_until = 0.0


def fetch_depth(lat: float, lon: float) -> Optional[float]:
    """Fetch ocean depth using OpenTopography SRTM15Plus with NOAA ETOPO fallback.

    Returns:
        float: Ocean depth in meters (positive value).
        None: If the coordinate is on land.
    """
    global _ot_rate_limited_until
    ot_api_key = os.getenv("OT_API_KEY", "").strip()
    now = time.time()

    # Skip OpenTopography if it was recently rate-limited (avoid delay & log spam)
    if ot_api_key and now > _ot_rate_limited_until:
        try:
            pad = float(os.getenv("DEPTH_PAD", "0.02"))
        except ValueError:
            pad = 0.02

        # Construct bounded query box
        south = max(-90.0, lat - pad)
        north = min(90.0, lat + pad)
        west = max(-180.0, lon - pad)
        east = min(180.0, lon + pad)

        # Ensure valid dimensions if near boundaries
        if south >= north:
            south = max(-90.0, north - 0.01)
            north = min(90.0, south + 0.01)
        if west >= east:
            west = max(-180.0, east - 0.01)
            east = min(180.0, west + 0.01)

        url = "https://portal.opentopography.org/API/globaldem"
        params = {
            "demtype": "SRTM15Plus",
            "south": south,
            "north": north,
            "west": west,
            "east": east,
            "outputFormat": "GTiff",
            "API_Key": ot_api_key,
        }

        try:
            response = requests.get(url, params=params, timeout=12)
            # Check for success and that response is not an XML error (e.g. rate limit)
            if response.status_code == 200 and not response.text.startswith("<?xml"):
                with MemoryFile(response.content) as memfile:
                    with memfile.open() as dataset:
                        samples = list(dataset.sample([(lon, lat)]))
                        if samples and len(samples[0]) > 0:
                            value = float(samples[0][0])
                            if dataset.nodata is not None and value == dataset.nodata:
                                return None
                            if value < 0:
                                return round(-value, 2)
                            else:
                                return None
            elif response.status_code in (401, 429) or "rate limit" in response.text.lower():
                _ot_rate_limited_until = now + 3600  # Back off for 1 hour
                print(f"[OpenTopography] Rate limit reached (status {response.status_code}). Switching to NOAA ETOPO for the next hour.")
            else:
                print(f"[OpenTopography] Status {response.status_code}. Seamlessly falling back to NOAA ETOPO.")
        except Exception as e:
            print(f"[OpenTopography] Warning, falling back to NOAA ETOPO: {e}")

    # Fallback to NOAA NCEI ETOPO Global DEM Mosaic ImageServer
    return fetch_depth_noaa(lat, lon)


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Ocean Depth Service",
    description="Microservice providing ocean depth using OpenTopography SRTM15Plus Global DEM.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", tags=["Health"])
def health():
    """Unauthenticated service health check."""
    return {"status": "ok"}


@app.get("/depth", tags=["Ocean Depth"])
def get_depth(
    lat: float = Query(..., description="Latitude in decimal degrees (-90 to 90)"),
    lon: float = Query(..., description="Longitude in decimal degrees"),
    x_api_key: Optional[str] = Header(None, alias="x-api-key"),
):
    """Retrieve ocean depth in meters for a given coordinate."""
    # 1. Authenticate API Key
    verify_api_key(x_api_key)

    # 2. Validate Latitude Range
    if lat < -90.0 or lat > 90.0:
        raise HTTPException(
            status_code=400,
            detail="Invalid latitude: Latitude must be between -90 and 90 degrees.",
        )

    # 3. Normalize Longitude
    norm_lon = normalize_longitude(lon)

    # 4. Check Persistent Cache (keyed by 3-decimal rounded coordinates)
    lat_r = round(lat, 3)
    lon_r = round(norm_lon, 3)

    is_cached, cached_depth = get_cached_depth(lat_r, lon_r)
    if is_cached:
        return {"lat": lat, "lon": norm_lon, "depth_m": cached_depth}

    # 5. Fetch from OpenTopography API
    depth_m = fetch_depth(lat, norm_lon)

    # 6. Save result to Persistent SQLite Cache
    set_cached_depth(lat_r, lon_r, depth_m)

    return {"lat": lat, "lon": norm_lon, "depth_m": depth_m}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
