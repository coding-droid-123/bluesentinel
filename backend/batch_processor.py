"""BlueSentinel Batch Processing & Real-Time Schematic Aggregation Module.

Contains:
- Reused hazard weight mappings and severity configurations
- Regex filename-to-zone parser
- Multi-Object Tracking (IoU) with zone isolation and gap-triggered resets
- HotspotAggregator for N-frame window deduplication and transect scoring
- Real-time incident triage evaluation
"""

from __future__ import annotations

import re
import math
import logging
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger("bluesentinel.batch")

# ---------------------------------------------------------------------------
# Reused Configurable Constants (matching ROVSimulator.jsx & models.py)
# ---------------------------------------------------------------------------

CLASS_WEIGHT: Dict[str, float] = {
    "trash_net": 3.0,
    "trash_rope": 3.0,
    "trash_tarp": 2.5,
    "trash_pipe": 2.0,
    "trash_wreckage": 2.0,
    "trash_bag": 1.5,
    "trash_bottle": 1.0,
    "trash_cup": 1.0,
    "trash_can": 1.5,
    "trash_container": 1.5,
    "trash_clothing": 1.0,
    "trash_branch": 0.8,
    "trash_snack_wrapper": 0.8,
    "trash_unknown_instance": 0.8,
}
DEFAULT_WEIGHT: float = 1.0

GHOST_GEAR: Set[str] = {"trash_net", "trash_rope", "trash_tarp"}
ANIMALS: Set[str] = {
    "animal_fish",
    "animal_eel",
    "animal_crab",
    "animal_starfish",
    "animal_etc",
    "animal_shells",
}

ALERT_PILE_THRESHOLD: int = 5
DEFAULT_IOU_THRESHOLD: float = 0.20
DEFAULT_WINDOW_SIZE: int = 30
DEFAULT_GAP_THRESHOLD: int = 10

# Score color thresholds: Blue < Amber < Red
SCORE_THRESHOLDS = {
    "low": 0.0,       # Blue (< 5.0)
    "medium": 5.0,    # Amber (5.0 - 12.0)
    "high": 12.0,     # Red (>= 12.0)
}

# Regex to parse zone and frame number from filename: (vid_\d+)_(\d+)
FILENAME_REGEX = re.compile(r"(vid_\d+)_(\d+)", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Filename Parser
# ---------------------------------------------------------------------------

def parse_filename_zone_and_frame(filename: str) -> Tuple[str, int, Optional[str]]:
    """Parse filename using regex `(vid_\\d+)_(\\d+)`.

    Returns:
        (zone, frame_number, warning_message_if_any)
        Non-matching files return ("vid_unknown", 0, warning).
    """
    match = FILENAME_REGEX.search(filename)
    if match:
        zone = match.group(1).lower()
        frame = int(match.group(2))
        return zone, frame, None

    warning = f"Filename '{filename}' does not match pattern (vid_\\d+)_(\\d+). Assigned to vid_unknown, frame 0."
    logger.warning(warning)
    return "vid_unknown", 0, warning


# ---------------------------------------------------------------------------
# IoU Tracking
# ---------------------------------------------------------------------------

def box_iou(b1: List[float], b2: List[float]) -> float:
    """Compute Intersection over Union between two bounding boxes [x1, y1, x2, y2]."""
    if not b1 or not b2 or len(b1) < 4 or len(b2) < 4:
        return 0.0

    x1_a, y1_a, x2_a, y2_a = b1
    x1_b, y1_b, x2_b, y2_b = b2

    x_a = max(x1_a, x1_b)
    y_a = max(y1_a, y1_b)
    x_b = min(x2_a, x2_b)
    y_b = min(y2_a, y2_b)

    inter_w = max(0.0, x_b - x_a)
    inter_h = max(0.0, y_b - y_a)
    inter_area = inter_w * inter_h

    if inter_area <= 0:
        return 0.0

    area_a = max(0.0, x2_a - x1_a) * max(0.0, y2_a - y1_a)
    area_b = max(0.0, x2_b - x1_b) * max(0.0, y2_b - y1_b)
    union = area_a + area_b - inter_area

    return inter_area / union if union > 0 else 0.0


class ZoneTracker:
    """Multi-Object Tracker instance isolated to a single zone."""

    def __init__(self, zone: str, iou_threshold: float = DEFAULT_IOU_THRESHOLD, max_lost_frames: int = 8):
        self.zone: str = zone
        self.iou_threshold: float = iou_threshold
        self.max_lost_frames: int = max_lost_frames
        self.active_tracks: List[Dict[str, Any]] = []
        self.next_track_id: int = 1
        self.last_frame: Optional[int] = None
        self.resets_count: int = 0

    def reset(self, frame_num: int) -> None:
        """Reset active tracks upon detecting a discontinuity gap."""
        logger.info(
            "Zone '%s': Discontinuity detected (last_frame=%s, current=%s). Resetting active tracker.",
            self.zone,
            self.last_frame,
            frame_num,
        )
        self.active_tracks = []
        self.resets_count += 1
        self.last_frame = frame_num

    def update(self, detections: List[Dict[str, Any]], frame_num: int, gap_threshold: int = DEFAULT_GAP_THRESHOLD) -> List[Dict[str, Any]]:
        """Track detections in frame_num. Detects gaps > gap_threshold and resets if necessary."""
        # Check for gap threshold if we have seen prior frames
        if self.last_frame is not None:
            gap = frame_num - self.last_frame
            if gap > gap_threshold:
                self.reset(frame_num)

        matched_track_indices: Set[int] = set()
        tracked_results: List[Dict[str, Any]] = []

        for det in detections:
            cls_name = det.get("class", "unknown")
            box = det.get("box", [0, 0, 0, 0])
            best_iou = 0.0
            best_idx = -1

            for idx, track in enumerate(self.active_tracks):
                if idx in matched_track_indices:
                    continue
                if track["class"] == cls_name:
                    iou = box_iou(track["box"], box)
                    if iou > best_iou and iou >= self.iou_threshold:
                        best_iou = iou
                        best_idx = idx

            if best_idx >= 0:
                matched_track_indices.add(best_idx)
                track_id = self.active_tracks[best_idx]["id"]
                self.active_tracks[best_idx]["box"] = box
                self.active_tracks[best_idx]["last_frame"] = frame_num
                self.active_tracks[best_idx]["lost_frames"] = 0
            else:
                track_id = self.next_track_id
                self.next_track_id += 1
                self.active_tracks.append({
                    "id": track_id,
                    "box": box,
                    "class": cls_name,
                    "last_frame": frame_num,
                    "lost_frames": 0,
                })

            tracked_results.append({
                **det,
                "trackId": track_id,
                "zone": self.zone,
                "frame": frame_num,
            })

        # Evict tracks that haven't been seen in max_lost_frames
        surviving_tracks = []
        for idx, track in enumerate(self.active_tracks):
            if idx not in matched_track_indices and track["last_frame"] != frame_num:
                track["lost_frames"] += 1
                if track["lost_frames"] <= self.max_lost_frames:
                    surviving_tracks.append(track)
            else:
                surviving_tracks.append(track)
        self.active_tracks = surviving_tracks

        self.last_frame = frame_num
        return tracked_results


# ---------------------------------------------------------------------------
# Alert Evaluator (reusing ROVSimulator.jsx logic)
# ---------------------------------------------------------------------------

class AlertEvaluator:
    """Evaluates entanglement, ghost gear, and debris density alerts per zone."""

    def __init__(self):
        # Persistence tracker keyed by `zone:animal+gear` -> {"count": int, "last_frame": int}
        self.persistence: Dict[str, Dict[str, int]] = {}

    def evaluate(self, detections: List[Dict[str, Any]], zone: str, frame_num: int) -> List[Dict[str, Any]]:
        alerts: List[Dict[str, Any]] = []
        classes = [d.get("class", "") for d in detections]
        has_animal = any(c in ANIMALS for c in classes)
        gear_found = [c for c in classes if c in GHOST_GEAR]

        # 1. Wildlife Entanglement Alert with 3-frame persistence gate
        if has_animal and gear_found:
            animal = next(c for c in classes if c in ANIMALS)
            gear = gear_found[0]
            key = f"{zone}:{animal}+{gear}"

            prev = self.persistence.get(key, {"count": 0, "last_frame": -99})
            if frame_num - prev["last_frame"] <= 2:
                new_count = prev["count"] + 1
            else:
                new_count = 1
            self.persistence[key] = {"count": new_count, "last_frame": frame_num}

            if new_count >= 3:
                alerts.append({
                    "id": f"entangle-{zone}-{frame_num}",
                    "type": "ENTANGLEMENT",
                    "severity": "critical",
                    "zone": zone,
                    "frame": frame_num,
                    "animal": animal,
                    "gear": gear,
                    "message": f"Confirmed {animal.replace('animal_', '')} entanglement with {gear.replace('trash_', '')} ({new_count} consecutive frames).",
                })
        elif gear_found:
            # 2. Ghost Gear Alert
            for g in gear_found:
                alerts.append({
                    "id": f"gear-{zone}-{frame_num}-{g}",
                    "type": "GHOST GEAR",
                    "severity": "critical",
                    "zone": zone,
                    "frame": frame_num,
                    "gear": g,
                    "message": f"{g.replace('trash_', '').upper()} detected — possible abandoned ghost gear.",
                })

        # 3. High Density Pile Alert
        hazardous_debris = [d for d in detections if d.get("severity") and d.get("severity") != "low"]
        if len(hazardous_debris) >= ALERT_PILE_THRESHOLD:
            alerts.append({
                "id": f"pile-{zone}-{frame_num}",
                "type": "LARGE PILE",
                "severity": "high",
                "zone": zone,
                "frame": frame_num,
                "debris_count": len(hazardous_debris),
                "message": f"High debris density: {len(hazardous_debris)} hazardous objects in {zone} frame {frame_num}.",
            })

        return alerts


# ---------------------------------------------------------------------------
# Hotspot Aggregator (Schematic Transect Windows)
# ---------------------------------------------------------------------------

class HotspotAggregator:
    """Aggregates tracked objects into N-frame windows along a zone's schematic transect.

    Features:
    - Unique object counting per window: keyed strictly by (track_id, class).
    - Weighted hazard score using CLASS_WEIGHT.
    - Normalized x position [0.0, 1.0] along the zone transect.
    - Safe for single-frame zones (no divide-by-zero).
    """

    def __init__(self, window_size: int = DEFAULT_WINDOW_SIZE):
        self.window_size: int = window_size
        # zone -> { "min_frame": int, "max_frame": int, "windows": { window_idx: { "unique_objects": set(), "classes": dict } } }
        self.zones_data: Dict[str, Dict[str, Any]] = {}

    def set_window_size(self, new_size: int) -> None:
        """Update window size."""
        if new_size > 0:
            self.window_size = new_size

    def add_frame_tracks(self, zone: str, frame_num: int, tracks: List[Dict[str, Any]]) -> None:
        """Incorporate tracked objects from a frame into the aggregator."""
        if zone not in self.zones_data:
            self.zones_data[zone] = {
                "min_frame": frame_num,
                "max_frame": frame_num,
                "windows": {},
                "frames_seen": set(),
            }

        z_data = self.zones_data[zone]
        z_data["min_frame"] = min(z_data["min_frame"], frame_num)
        z_data["max_frame"] = max(z_data["max_frame"], frame_num)
        z_data["frames_seen"].add(frame_num)

        window_idx = frame_num // self.window_size
        if window_idx not in z_data["windows"]:
            z_data["windows"][window_idx] = {
                "unique_objects": set(),  # Set of (trackId, class)
                "classes_count": {},      # class -> count of unique objects
                "frame_start": window_idx * self.window_size,
                "frame_end": (window_idx + 1) * self.window_size - 1,
            }

        win = z_data["windows"][window_idx]
        for trk in tracks:
            track_id = trk.get("trackId")
            cls_name = trk.get("class", "unknown")
            # Strictly do NOT count ROV vehicle, plants, or animals as cleanup debris
            if cls_name == "rov" or cls_name == "plant" or cls_name.startswith("animal_"):
                continue

            obj_key = (track_id, cls_name)

            if obj_key not in win["unique_objects"]:
                win["unique_objects"].add(obj_key)
                win["classes_count"][cls_name] = win["classes_count"].get(cls_name, 0) + 1

    def get_zone_snapshot(self, zone: str) -> List[Dict[str, Any]]:
        """Return all calculated hotspot windows for a given zone with normalized transect positions."""
        if zone not in self.zones_data:
            return []

        z_data = self.zones_data[zone]
        min_f = z_data["min_frame"]
        max_f = z_data["max_frame"]
        total_span = max_f - min_f

        hotspots = []
        for win_idx, win in sorted(z_data["windows"].items()):
            # Calculate weighted hazard score from unique objects
            score = 0.0
            dominant_class = None
            max_class_count = 0

            for cls_name, count in win["classes_count"].items():
                w = CLASS_WEIGHT.get(cls_name, DEFAULT_WEIGHT)
                score += w * count
                if count > max_class_count:
                    max_class_count = count
                    dominant_class = cls_name

            # Transect normalized X position [0.0, 1.0]
            window_center = (win["frame_start"] + win["frame_end"]) / 2.0
            if total_span <= 0:
                normalized_x = 0.5  # Single frame or zero span safeguard
            else:
                normalized_x = max(0.0, min(1.0, (window_center - min_f) / total_span))

            score = round(score, 2)
            tier = "low"
            if score >= SCORE_THRESHOLDS["high"]:
                tier = "critical"
            elif score >= SCORE_THRESHOLDS["medium"]:
                tier = "high"

            hotspots.append({
                "zone": zone,
                "window_index": win_idx,
                "frame_start": win["frame_start"],
                "frame_end": win["frame_end"],
                "normalized_x": round(normalized_x, 3),
                "score": score,
                "object_count": len(win["unique_objects"]),
                "dominant_class": dominant_class,
                "classes": dict(win["classes_count"]),
                "tier": tier,
            })

        return hotspots

    def get_all_snapshots(self) -> Dict[str, Dict[str, Any]]:
        """Return a dictionary of all zones with their summary and hotspot transect windows."""
        result = {}
        for zone, z_data in self.zones_data.items():
            result[zone] = {
                "min_frame": z_data["min_frame"],
                "max_frame": z_data["max_frame"],
                "total_frames_processed": len(z_data["frames_seen"]),
                "hotspots": self.get_zone_snapshot(zone),
            }
        return result
