"""Blue Sentinel Cleanup Optimizer & Logistics Dispatch Model.

Single source of truth algorithm ported from docs/ref_model.py with full support
for multi-mode depth boundaries, payload filtering, equipment manifolds, and
contractor quote verification indicators.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

ROOT_DIR = Path(__file__).resolve().parent.parent
ASSUMPTIONS_PATH = ROOT_DIR / "docs" / "cleanup_assumptions.json"

CLASS_ALIASES: Dict[str, str] = {
    "trash_net": "trash_net",
    "trash_rope": "trash_rope",
    "trash_tarp": "trash_tarp",
    "trash_pipe": "trash_pipe",
    "trash_wreckage": "trash_wreckage",
    "trash_bag": "trash_bag",
    "trash_bottle": "trash_bottle",
    "trash_container": "trash_container",
    "other_debris": "other_debris",
    "clothing": "clothing",
    "trash_clothing": "clothing",
    "trash_cup": "other_debris",
    "trash_can": "other_debris",
    "trash_snack_wrapper": "other_debris",
    "trash_branch": "other_debris",
    "trash_unknown_instance": "unknown",
    "unknown": "unknown",
    "default": "unknown",
}

MODE_EQUIPMENT: Dict[str, List[str]] = {
    "scuba_team": [
        "Commercial Scuba System (Twin 12L Cylinders)",
        "Diver Underwater Acoustic Comms",
        "Heavy-Duty Debris Retrieval Sacks",
        "Diver Safety Harness & Depth Gauge",
    ],
    "surface_supplied_air": [
        "Surface-Supplied Air Control Spread",
        "Commercial Diving Helmet with Video & Comms",
        "Emergency Bailout Cylinder Rig",
        "Stage Decompression Basket",
    ],
    "mixed_gas_bell": [
        "Closed Wet/Dry Diving Bell Spread",
        "Surface Decompression Chamber (Deck Recompression)",
        "Heliox/Trimix Gas Reclaim System",
        "Subsea Rigging Winch & Umbilical",
    ],
    "compact_rov": [
        "Compact Subsea ROV (100m Depth Rated)",
        "Ultra-Flexible Surface Umbilical & Console",
        "1080p High-Resolution Inspection Camera",
        "Integrated Micro-Grabber Arm",
    ],
    "inspection_rov": [
        "Inspection-Class ROV (300m Depth Rated)",
        "Tether Management System (TMS)",
        "Forward-Looking Obstacle Sonar",
        "Dual-Function Grabber & Cutter Arm",
    ],
    "light_work_rov": [
        "Light Work-Class ROV (1000m Depth Rated)",
        "5-Function Heavy Hydraulic Manipulator Arm",
        "High-Intensity Subsea LED Floodlights",
        "Subsea Collection Rigging Tray",
    ],
    "work_class_rov": [
        "Heavy Work-Class ROV Spread (3000m Depth Rated)",
        "Dual 7-Function Heavy Hydraulic Manipulators",
        "Subsea Hydraulic Shears & Cutters",
        "Heavy Debris Subsea Collection Basket",
        "Deepwater Launch and Recovery System (LARS)",
    ],
}


def load_default_assumptions() -> Dict[str, Any]:
    """Load default cleanup assumptions from the single source of truth."""
    if ASSUMPTIONS_PATH.exists():
        with open(ASSUMPTIONS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    raise FileNotFoundError(f"cleanup_assumptions.json not found at {ASSUMPTIONS_PATH}")


GLOBAL_ASSUMPTIONS: Dict[str, Any] = load_default_assumptions()


def get_assumptions_version(cfg: Optional[Dict[str, Any]] = None) -> str:
    """Compute deterministic short hash representing the assumptions version."""
    target = cfg or GLOBAL_ASSUMPTIONS
    serialized = json.dumps(target, sort_keys=True)
    return "v-" + hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:8]


def normalize_class_name(cls_name: str, cfg: Optional[Dict[str, Any]] = None) -> str:
    """Map any input class label to a valid assumption key."""
    config = cfg or GLOBAL_ASSUMPTIONS
    debris_classes = config.get("debris_classes", {})
    raw = (cls_name or "").strip()
    if raw in debris_classes:
        return raw
    lower = raw.lower()
    if lower in debris_classes:
        return lower
    if lower in CLASS_ALIASES:
        aliased = CLASS_ALIASES[lower]
        if aliased in debris_classes:
            return aliased
    if "unknown" in debris_classes:
        return "unknown"
    # Fallback to the first class in debris_classes if unknown not present
    return next(iter(debris_classes.keys())) if debris_classes else "unknown"


def interp(table: List[List[float]], x: float) -> float:
    """Piecewise linear interpolation through table [[x, y], ...]."""
    if x <= table[0][0]:
        return float(table[0][1])
    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if x0 <= x <= x1:
            return float(y0 + (y1 - y0) * (x - x0) / (x1 - x0))
    return float(table[-1][1])


def step_lookup(table: List[List[float]], x: float) -> float:
    """Find first row in table where x <= row[0], else return last row's value."""
    for dmax, v in table:
        if x <= dmax:
            return float(v)
    return float(table[-1][1])


def get_unverified_fields_for_mode(name: str, m: Dict[str, Any]) -> List[str]:
    """Identify which rate parameters and operational assumptions in the mode rely on unverified data."""
    verified_map = m.get("verified", {})
    rate_keys = [
        "equipment_inr_per_rotation",
        "spread_inr_per_day",
        "vessel_inr_per_day",
        "gas_inr_per_rotation",
    ]
    unverified = []
    for k in rate_keys:
        val = m.get(k)
        if val is not None and any(v > 0 for v in val):
            if not verified_map.get(k, False):
                unverified.append(f"{name}.{k}")
    # Also include any operational limits marked verified: false (e.g. no_deco_table_min)
    for k, is_v in verified_map.items():
        if is_v is False and f"{name}.{k}" not in unverified:
            unverified.append(f"{name}.{k}")
    return unverified


def estimate_mode(
    name: str,
    m: Dict[str, Any],
    depth: float,
    hrs: Tuple[float, float],
    kg: Tuple[float, float],
    dist_km: float,
    cfg: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Calculate min & max operational parameters and total cost for a single mode."""
    config = cfg or GLOBAL_ASSUMPTIONS
    g = config["global"]
    rates = config["role_rates_inr_per_hr"]
    crew = len(m["roles"])

    labour_day = (
        sum(rates[r] for r in m["roles"] if r not in m.get("labour_excluded_roles", []))
        * g["shift_hours"]
    )
    unverified_rates = get_unverified_fields_for_mode(name, m)

    out: Dict[str, Any] = {
        "mode": name,
        "kind": m["kind"],
        "crew": crew,
        "risk": m["risk"],
        "roles": m["roles"],
        "labour_excluded_roles": m.get("labour_excluded_roles", []),
        "max_item_kg": m.get("max_item_kg", 0),
        "unverified_rates": unverified_rates,
        "has_unverified": len(unverified_rates) > 0,
    }

    res: List[Dict[str, Any]] = []
    for i, h in enumerate(hrs):  # i=0: min, i=1: max
        if m["kind"] == "human":
            if isinstance(m["bottom_time_h"], str):
                no_deco_val = (
                    interp(config["no_deco_table_min"], depth)
                    if depth > 10
                    else 219.0
                )
                bt = min(no_deco_val, 45.0) / 60.0
            else:
                bt = float(m["bottom_time_h"])

            overhead = (
                depth / m["descent_m_per_min"] / 60.0
                + depth / m["ascent_m_per_min"] / 60.0
                + (m["safety_stop_min"] / 60.0 if depth > 10 else 0.0)
                + step_lookup(m["deco_h_per_rotation"], depth)
            )

            rot = math.ceil(h / bt) if bt > 0 else 1
            days = max(
                1,
                math.ceil(rot / (m["working_divers"] * m["max_rot_per_diver_day"])),
            )

            equip = (
                rot * m["equipment_inr_per_rotation"][i]
                + days * m["spread_inr_per_day"][i]
                + rot * m["gas_inr_per_rotation"][i]
            )
            extra = {
                "rotations": rot,
                "bottom_time_h": round(bt, 2),
                "overhead_h_per_rotation": round(overhead, 2),
            }
        else:
            transit = 2.0 * depth / m["descent_m_per_min"] / 60.0
            eff = max(1.0, m["productive_h_per_day"] - transit)
            days = max(1, math.ceil(h / eff))
            equip = days * m["spread_inr_per_day"][i]
            extra = {
                "transit_h_per_day": round(transit, 2),
                "productive_h_per_day": m["productive_h_per_day"],
                "effective_work_h_per_day": round(eff, 2),
            }

        vessel = days * m["vessel_inr_per_day"][i]
        labour = days * labour_day
        mob = g["mobilization_base_inr"] + dist_km * g["transit_cost_per_km_inr"]
        disp = max(g["disposal_min_inr"], kg[i] * g["disposal_inr_per_kg"][i])
        sub = labour + equip + vessel + mob + disp
        total = round(sub * (1.0 + g["contingency_pct"]))

        res.append(
            dict(
                days=days,
                labour=labour,
                equipment=equip,
                vessel=vessel,
                mobilization=mob,
                disposal=round(disp),
                subtotal=round(sub),
                contingency=round(sub * g["contingency_pct"]),
                total=total,
                **extra,
            )
        )

    out["min"], out["max"] = res[0], res[1]
    return out


def optimize_cleanup(
    depth: float,
    items: Dict[str, Dict[str, float]],
    dist_km: Optional[float] = None,
    depth_source: str = "simulated",
    cfg: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Evaluate cleanup logistics and compute optimal mode comparison and plan.

    Args:
        depth: Operating depth in meters.
        items: Dict mapping debris class to {'min': count, 'max': count}.
        dist_km: Vessel transit distance in kilometers (default 25 km).
        depth_source: 'bathymetry' or 'simulated'.
        cfg: Optional configuration override dictionary.

    Returns:
        Structured response with recommended mode, comparison of feasible modes,
        detailed line breakdown, warnings, and unverified assumptions.
    """
    config = cfg or GLOBAL_ASSUMPTIONS
    g = config["global"]
    cls_defs = config["debris_classes"]
    dist_km = dist_km if dist_km is not None else g["default_distance_km"]

    # 1. Validation checks
    if depth < 0:
        raise ValueError(f"Depth cannot be negative: {depth}m")

    clean_items: Dict[str, Dict[str, float]] = {}
    for raw_cls, counts in items.items():
        c_min = float(counts.get("min", 0))
        c_max = float(counts.get("max", 0))
        if c_min < 0 or c_max < 0:
            raise ValueError(f"Counts for '{raw_cls}' cannot be negative")
        if c_min > c_max:
            raise ValueError(
                f"Min count ({c_min}) cannot exceed max count ({c_max}) for '{raw_cls}'"
            )
        norm_cls = normalize_class_name(raw_cls, cfg=config)
        if norm_cls not in clean_items:
            clean_items[norm_cls] = {"min": 0.0, "max": 0.0}
        clean_items[norm_cls]["min"] += c_min
        clean_items[norm_cls]["max"] += c_max

    warnings: List[str] = []

    # Land warning
    if depth == 0 or depth_source == "land":
        warnings.append(
            "Bathymetry reports land or elevation >= 0m: operating depth treated as shallow (0m); verify coordinates."
        )

    # Empty items check
    if not clean_items or all(
        c["max"] == 0 for c in clean_items.values()
    ):
        fallback_cls = "unknown" if "unknown" in cls_defs else next(iter(cls_defs.keys()))
        clean_items = {fallback_cls: {"min": 0.0, "max": 0.0}}

    hmin = sum(c["min"] * cls_defs[k]["h"][0] for k, c in clean_items.items())
    hmax = sum(c["max"] * cls_defs[k]["h"][1] for k, c in clean_items.items())
    kmin = sum(c["min"] * cls_defs[k]["kg"][0] for k, c in clean_items.items())
    kmax = sum(c["max"] * cls_defs[k]["kg"][1] for k, c in clean_items.items())

    heaviest = (
        max((cls_defs[k]["kg"][1] for k in clean_items if clean_items[k]["max"] > 0), default=0.0)
    )

    # Debris tooling aggregation
    required_debris_tools: set[str] = set()
    for k, c in clean_items.items():
        if c["max"] > 0:
            for tool in cls_defs[k].get("tools", []):
                required_debris_tools.add(tool)

    # Depth beyond 3000 m check: out of scope
    if depth > 3000:
        return {
            "status": "out_of_scope",
            "recommended": None,
            "depth_m": depth,
            "depth_source": depth_source,
            "item_hours": [round(hmin, 2), round(hmax, 2)],
            "debris_kg": [round(kmin, 2), round(kmax, 2)],
            "heaviest_item_kg": round(heaviest, 2),
            "modes": [],
            "warnings": [
                f"Operating depth of {depth}m exceeds maximum subsea capability (3000m): out of scope."
            ],
            "unverified_assumptions": [],
            "required_equipment": sorted(list(required_debris_tools)),
            "assumptions_version": get_assumptions_version(config),
        }

    # 2. Feasible mode filtering
    feasible_modes: List[Dict[str, Any]] = []
    for name, m in config["modes"].items():
        if m["depth_m"][0] <= depth <= m["depth_m"][1] and heaviest <= m["max_item_kg"]:
            # Commercial human diving cutoff: application scope limit (hard_max_human_depth_m, default 100m).
            # Saturation diving operates deeper, but 100m is chosen as the operational scope boundary for this app.
            if m["kind"] == "human" and depth > g["hard_max_human_depth_m"]:
                continue
            feasible_modes.append(
                estimate_mode(name, m, depth, (hmin, hmax), (kmin, kmax), dist_km, config)
            )

    if not feasible_modes:
        payload_exceeded = any(
            m["depth_m"][0] <= depth <= m["depth_m"][1]
            and not (m["kind"] == "human" and depth > g["hard_max_human_depth_m"])
            for m in config["modes"].values()
        )
        msg = (
            f"Debris item mass ({heaviest} kg) exceeds payload capacity of all depth-feasible modes."
            if payload_exceeded
            else f"No recovery modes feasible for depth {depth}m and payload {heaviest} kg."
        )
        return {
            "status": "no_feasible_modes",
            "recommended": None,
            "depth_m": depth,
            "depth_source": depth_source,
            "item_hours": [round(hmin, 2), round(hmax, 2)],
            "debris_kg": [round(kmin, 2), round(kmax, 2)],
            "heaviest_item_kg": round(heaviest, 2),
            "modes": [],
            "warnings": [msg],
            "unverified_assumptions": [],
            "required_equipment": sorted(list(required_debris_tools)),
            "assumptions_version": get_assumptions_version(config),
        }

    # 3. Recommendation selection:
    # Beyond prefer_robotics_beyond_m choose cheapest robotics; else cheapest overall
    pool = (
        [x for x in feasible_modes if x["kind"] == "robotics"]
        if depth > g["prefer_robotics_beyond_m"]
        and any(x["kind"] == "robotics" for x in feasible_modes)
        else feasible_modes
    )

    rec = min(pool, key=lambda x: (x["min"]["total"] + x["max"]["total"]) / 2.0)

    # 4. Warnings evaluation
    if rec["mode"] == "work_class_rov" and hmax < 12:
        warnings.append(
            "Work-class spread is disproportionate for <12 h of work: batch with other piles or defer."
        )
    if rec["risk"] in ("high", "very_high"):
        warnings.append(
            "Human diving at this depth is high risk: confirm with a diving contractor; robotics preferred if feasible."
        )

    # Aggregate unverified assumptions for the chosen mode
    unverified_list = rec.get("unverified_rates", [])

    # Assemble recommended mode equipment manifest
    mode_tools = MODE_EQUIPMENT.get(rec["mode"], [])
    combined_equipment = sorted(list(set(mode_tools).union(required_debris_tools)))

    return {
        "status": "success",
        "recommended": rec["mode"],
        "recommended_mode_details": rec,
        "depth_m": depth,
        "depth_source": depth_source,
        "item_hours": [round(hmin, 2), round(hmax, 2)],
        "debris_kg": [round(kmin, 2), round(kmax, 2)],
        "heaviest_item_kg": round(heaviest, 2),
        "crew": rec["crew"],
        "crew_roles": rec["roles"],
        "risk": rec["risk"],
        "cost_min": rec["min"]["total"],
        "cost_max": rec["max"]["total"],
        "breakdown": {
            "min": rec["min"],
            "max": rec["max"],
        },
        "modes": feasible_modes,
        "warnings": warnings,
        "unverified_assumptions": unverified_list,
        "required_equipment": combined_equipment,
        "assumptions_version": get_assumptions_version(config),
    }
