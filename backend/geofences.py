"""BlueSentinel — Geofencing: ocean/land validation and marine zone classification."""

import json
import urllib.request
from pathlib import Path
from shapely.geometry import Point, shape
from shapely.ops import unary_union

# ---------------------------------------------------------------------------
# Ocean / Land validation
# Downloads Natural Earth 110m land polygons once, caches locally.
# ---------------------------------------------------------------------------

_LAND_GEOJSON_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector"
    "/master/geojson/ne_110m_land.geojson"
)
_LAND_CACHE = Path(__file__).parent / "ne_110m_land.geojson"

_land_geom = None
_GEO_AVAILABLE = False

try:
    # Download once, then use the cached file on every subsequent startup
    if not _LAND_CACHE.exists():
        print("[geofences] Downloading Natural Earth land polygons...")
        urllib.request.urlretrieve(_LAND_GEOJSON_URL, _LAND_CACHE)
        print("[geofences] Land polygons cached successfully.")

    with open(_LAND_CACHE, encoding="utf-8") as _f:
        _geojson = json.load(_f)

    _land_geom = unary_union(
        [shape(feat["geometry"]) for feat in _geojson["features"]]
    )
    _GEO_AVAILABLE = True
    print("[geofences] Ocean/land check ready [OK]")

except Exception as _geo_err:
    _GEO_AVAILABLE = False
    _land_geom = None
    print(f"[geofences] Ocean/land check unavailable (permissive mode): {_geo_err}")


def is_ocean(lat: float, lon: float) -> bool:
    """
    Return True if the point (lat, lon) is over ocean (not on land).
    Falls back to True (permissive) if land data is unavailable.
    """
    if not _GEO_AVAILABLE or _land_geom is None:
        return True  # permissive fallback
    point = Point(lon, lat)   # shapely convention: (lon, lat)
    # Use intersects for edge-of-polygon robustness
    return not _land_geom.intersects(point)



# ---------------------------------------------------------------------------
# Marine Geofence Zones
# Add / adjust polygons to match your regions of interest.
# Each zone has:
#   name      — human-readable display name
#   type      — "protected" | "eez" | "open_ocean"
#   geometry  — GeoJSON Polygon dict (lon, lat coordinate pairs)
# ---------------------------------------------------------------------------

_RAW_ZONES = [
    {
        "name": "Lakshadweep Marine Sanctuary",
        "type": "protected",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [72.0, 10.0], [74.0, 10.0],
                [74.0, 12.5], [72.0, 12.5],
                [72.0, 10.0],
            ]],
        },
    },
    {
        "name": "Gulf of Mannar Biosphere Reserve",
        "type": "protected",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [78.0, 8.5], [80.5, 8.5],
                [80.5, 10.0], [78.0, 10.0],
                [78.0, 8.5],
            ]],
        },
    },
    {
        "name": "Bay of Bengal",
        "type": "eez",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [80.0, 5.0],  [100.0, 5.0],
                [100.0, 23.0], [80.0, 23.0],
                [80.0, 5.0],
            ]],
        },
    },
    {
        "name": "Arabian Sea",
        "type": "eez",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [50.0, 5.0],  [78.0, 5.0],
                [78.0, 26.0], [50.0, 26.0],
                [50.0, 5.0],
            ]],
        },
    },
    {
        "name": "Indian Ocean",
        "type": "open_ocean",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [20.0, -60.0], [147.0, -60.0],
                [147.0, 30.0], [20.0, 30.0],
                [20.0, -60.0],
            ]],
        },
    },
]

# Pre-compile geometries once at import time for fast lookups
GEOFENCE_ZONES = [
    {**z, "_shape": shape(z["geometry"])}
    for z in _RAW_ZONES
]


def get_zone(lat: float, lon: float) -> dict:
    """
    Return the first matching geofence zone dict for a given (lat, lon).
    More specific zones should be listed before broader ones in _RAW_ZONES.
    Falls back to 'International Waters' if no zone matches.
    """
    point = Point(lon, lat)
    for zone in GEOFENCE_ZONES:
        if zone["_shape"].contains(point):
            return {"name": zone["name"], "type": zone["type"]}
    return {"name": "International Waters", "type": "open_ocean"}
