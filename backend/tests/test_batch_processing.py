"""Unit tests for BlueSentinel Batch Processing and Hotspot Aggregation.

Uses standard library unittest for zero-dependency execution.
Tests cover:
1. Filename regex parsing and fallback handling
2. HotspotAggregator unique-object deduplication per window
3. Multi-zone tracker isolation (no ID leakage across zones)
4. Gap-triggered tracker resets on frame discontinuity
5. Single-frame zone transect X-normalization
"""

import sys
import unittest
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from batch_processor import (
    parse_filename_zone_and_frame,
    ZoneTracker,
    HotspotAggregator,
    CLASS_WEIGHT,
    DEFAULT_WEIGHT,
    DEFAULT_GAP_THRESHOLD,
    DEFAULT_WINDOW_SIZE,
)


class TestBatchProcessing(unittest.TestCase):

    def test_filename_parsing(self):
        """Verify regex (vid_\\d+)_(\\d+) extraction and fallback."""
        # Standard format
        zone, frame, warning = parse_filename_zone_and_frame("vid_00001_000123.jpg")
        self.assertEqual(zone, "vid_00001")
        self.assertEqual(frame, 123)
        self.assertIsNone(warning)

        # Case insensitive with path prefix
        zone, frame, warning = parse_filename_zone_and_frame("c:/data/VID_00042_005678.PNG")
        self.assertEqual(zone, "vid_00042")
        self.assertEqual(frame, 5678)
        self.assertIsNone(warning)

        # Non-matching fallback
        zone, frame, warning = parse_filename_zone_and_frame("underwater_sample_01.jpg")
        self.assertEqual(zone, "vid_unknown")
        self.assertEqual(frame, 0)
        self.assertIsNotNone(warning)

    def test_aggregator_unique_count_deduplication(self):
        """Verify that an object tracked across multiple frames counts strictly once in an aggregation window."""
        aggregator = HotspotAggregator(window_size=30)
        zone = "vid_00001"

        # Simulate track #1 (trash_net) observed across frames 5, 6, 7, 8, 9, 10
        for f in range(5, 11):
            aggregator.add_frame_tracks(
                zone=zone,
                frame_num=f,
                tracks=[
                    {"trackId": 1, "class": "trash_net", "box": [10, 10, 50, 50]},
                ],
            )

        # In window 0 (frames 0-29), track #1 should count exactly ONCE
        snapshots = aggregator.get_zone_snapshot(zone)
        self.assertEqual(len(snapshots), 1)
        window_0 = snapshots[0]
        self.assertEqual(window_0["object_count"], 1)
        self.assertEqual(window_0["classes"]["trash_net"], 1)
        # trash_net weight is 3.0
        self.assertAlmostEqual(window_0["score"], CLASS_WEIGHT["trash_net"], places=2)

        # Now add a second object (track #2, trash_bottle) in frame 12
        aggregator.add_frame_tracks(
            zone=zone,
            frame_num=12,
            tracks=[
                {"trackId": 1, "class": "trash_net", "box": [10, 10, 50, 50]},
                {"trackId": 2, "class": "trash_bottle", "box": [100, 100, 120, 150]},
            ],
        )

        snapshots = aggregator.get_zone_snapshot(zone)
        window_0 = snapshots[0]
        self.assertEqual(window_0["object_count"], 2)
        expected_score = CLASS_WEIGHT["trash_net"] + CLASS_WEIGHT["trash_bottle"]
        self.assertAlmostEqual(window_0["score"], expected_score, places=2)

    def test_zone_tracker_isolation(self):
        """Verify that track IDs and state are completely isolated per zone."""
        tracker_a = ZoneTracker(zone="vid_00001")
        tracker_b = ZoneTracker(zone="vid_00002")

        dets_a = [{"class": "trash_bottle", "box": [10, 10, 50, 50]}]
        dets_b = [{"class": "trash_bottle", "box": [10, 10, 50, 50]}]

        tracks_a = tracker_a.update(dets_a, frame_num=1)
        tracks_b = tracker_b.update(dets_b, frame_num=1)

        # Both start their own sequence at trackId = 1
        self.assertEqual(tracks_a[0]["trackId"], 1)
        self.assertEqual(tracks_a[0]["zone"], "vid_00001")
        self.assertEqual(tracks_b[0]["trackId"], 1)
        self.assertEqual(tracks_b[0]["zone"], "vid_00002")

        # Update only tracker A
        dets_a_2 = [{"class": "trash_bottle", "box": [12, 12, 52, 52]}]
        tracks_a_2 = tracker_a.update(dets_a_2, frame_num=2)
        self.assertEqual(tracks_a_2[0]["trackId"], 1)

        # Tracker B remains untouched
        self.assertEqual(tracker_b.last_frame, 1)

    def test_gap_triggered_tracker_reset(self):
        """Verify that a frame gap exceeding gap_threshold resets the tracker."""
        tracker = ZoneTracker(zone="vid_00001")
        gap_threshold = 10

        # Frame 1: track #1 initialized
        dets_1 = [{"class": "trash_net", "box": [100, 100, 200, 200]}]
        t1 = tracker.update(dets_1, frame_num=1, gap_threshold=gap_threshold)
        self.assertEqual(t1[0]["trackId"], 1)
        self.assertEqual(tracker.resets_count, 0)

        # Frame 5: continuous (gap = 4 <= 10) -> retains track #1
        dets_5 = [{"class": "trash_net", "box": [105, 105, 205, 205]}]
        t5 = tracker.update(dets_5, frame_num=5, gap_threshold=gap_threshold)
        self.assertEqual(t5[0]["trackId"], 1)
        self.assertEqual(tracker.resets_count, 0)

        # Frame 25: discontinuous (gap = 20 > 10) -> triggers reset, starts new track
        dets_25 = [{"class": "trash_net", "box": [105, 105, 205, 205]}]
        t25 = tracker.update(dets_25, frame_num=25, gap_threshold=gap_threshold)
        self.assertEqual(tracker.resets_count, 1)
        # Because tracker was reset, trackId increments to 2
        self.assertEqual(t25[0]["trackId"], 2)

    def test_single_frame_zone_transect_normalization(self):
        """Verify that single-frame zones do not divide by zero during X-normalization."""
        aggregator = HotspotAggregator(window_size=30)
        aggregator.add_frame_tracks(
            zone="vid_single",
            frame_num=42,
            tracks=[{"trackId": 1, "class": "trash_can", "box": [10, 10, 20, 20]}],
        )
        snapshots = aggregator.get_zone_snapshot("vid_single")
        self.assertEqual(len(snapshots), 1)
        self.assertEqual(snapshots[0]["normalized_x"], 0.5)


if __name__ == "__main__":
    unittest.main()
