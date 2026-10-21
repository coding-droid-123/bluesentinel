"""Automated tests for Blue Sentinel Cleanup Optimizer.

Verifies:
1. Exact reproduction of all cases in golden_test_cases.json (0 deviations).
2. Edge cases: depth 0, negative depth, land elevation, depth > 3000m,
   unknown debris class, empty items, min > max validation, items heavier than
   every mode's payload.
Compatible with standard library `unittest` and `pytest`.
"""

import json
from pathlib import Path
import unittest

from cleanup_optimizer import (
    optimize_cleanup,
    normalize_class_name,
    get_assumptions_version,
)

DOCS_DIR = Path(__file__).resolve().parent.parent.parent / "docs"
GOLDEN_PATH = DOCS_DIR / "golden_test_cases.json"


class TestCleanupOptimizer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(GOLDEN_PATH, "r", encoding="utf-8") as f:
            cls.golden_data = json.load(f)

    def test_golden_cases(self):
        """Test all 6 golden cases match expected output down to the single rupee."""
        inputs = self.golden_data["inputs"]
        expected = self.golden_data["expected"]

        for case_name, inp in inputs.items():
            res = optimize_cleanup(inp["depth_m"], inp["items"])
            exp = expected[case_name]

            # Mode recommendation
            self.assertEqual(
                res["recommended"],
                exp["recommended"],
                f"Case '{case_name}' failed recommendation: {res['recommended']} != {exp['recommended']}",
            )

            # Item hours
            self.assertEqual(
                res["item_hours"],
                exp["item_hours"],
                f"Case '{case_name}' failed item_hours: {res['item_hours']} != {exp['item_hours']}",
            )

            # Debris kg
            self.assertEqual(
                res["debris_kg"],
                exp["debris_kg"],
                f"Case '{case_name}' failed debris_kg: {res['debris_kg']} != {exp['debris_kg']}",
            )

            # Warnings check (for ssa_45m_wreck batching warning)
            if exp.get("warnings"):
                for w in exp["warnings"]:
                    self.assertTrue(
                        any(w in rw for rw in res["warnings"]),
                        f"Case '{case_name}' missing expected warning '{w}'",
                    )

            # Exact cost match for the recommended mode
            rec_m = next(m for m in res["modes"] if m["mode"] == res["recommended"])
            exp_m = next(m for m in exp["modes"] if m["mode"] == exp["recommended"])
            self.assertEqual(
                rec_m["min"]["total"],
                exp_m["min"]["total"],
                f"Case '{case_name}' min total mismatch: {rec_m['min']['total']} != {exp_m['min']['total']}",
            )
            self.assertEqual(
                rec_m["max"]["total"],
                exp_m["max"]["total"],
                f"Case '{case_name}' max total mismatch: {rec_m['max']['total']} != {exp_m['max']['total']}",
            )

            # Verify all feasible modes match
            exp_modes_dict = {m["mode"]: m for m in exp["modes"]}
            for res_m in res["modes"]:
                m_name = res_m["mode"]
                self.assertIn(m_name, exp_modes_dict, f"Unexpected mode {m_name} in {case_name}")
                exp_mode_obj = exp_modes_dict[m_name]
                self.assertEqual(res_m["min"]["total"], exp_mode_obj["min"]["total"])
                self.assertEqual(res_m["max"]["total"], exp_mode_obj["max"]["total"])
                self.assertEqual(res_m["min"]["days"], exp_mode_obj["min"]["days"])
                self.assertEqual(res_m["max"]["days"], exp_mode_obj["max"]["days"])

    def test_edge_case_depth_zero(self):
        """Depth 0m: Shallow operating depth with warning."""
        res = optimize_cleanup(0, {"trash_bottle": {"min": 2, "max": 4}})
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["depth_m"], 0)
        self.assertTrue(any("elevation >= 0m" in w or "0m" in w for w in res["warnings"]))
        self.assertIn(res["recommended"], ("compact_rov", "scuba_team"))

    def test_edge_case_negative_depth(self):
        """Negative depth must raise a ValueError."""
        with self.assertRaises(ValueError):
            optimize_cleanup(-15, {"trash_bottle": {"min": 2, "max": 4}})

    def test_edge_case_depth_over_3000m(self):
        """Depth > 3000m: Out of scope."""
        res = optimize_cleanup(3500, {"trash_bottle": {"min": 2, "max": 4}})
        self.assertEqual(res["status"], "out_of_scope")
        self.assertIsNone(res["recommended"])
        self.assertTrue(any("out of scope" in w for w in res["warnings"]))

    def test_edge_case_unknown_class(self):
        """Unknown classes must fall back gracefully without failing."""
        res = optimize_cleanup(20, {"unknown_plastic_artifact": {"min": 2, "max": 5}})
        self.assertEqual(res["status"], "success")
        self.assertIsNotNone(res["recommended"])
        self.assertGreater(res["item_hours"][0], 0)
        self.assertGreater(res["debris_kg"][0], 0)

    def test_edge_case_empty_items(self):
        """Empty items dict should not crash."""
        res = optimize_cleanup(20, {})
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["item_hours"], [0.0, 0.0])
        self.assertEqual(res["debris_kg"], [0.0, 0.0])

    def test_edge_case_min_greater_than_max(self):
        """Min count > Max count must raise a ValueError."""
        with self.assertRaises(ValueError):
            optimize_cleanup(20, {"trash_net": {"min": 10, "max": 2}})

    def test_edge_case_items_heavier_than_every_mode(self):
        """Debris heavier than mode payload limits."""
        res = optimize_cleanup(50, {"trash_wreckage": {"min": 1, "max": 1}})
        self.assertEqual(res["status"], "success")

        cfg_heavy = {
            "global": {
                "shift_hours": 10,
                "contingency_pct": 0.20,
                "mobilization_base_inr": 15000,
                "transit_cost_per_km_inr": 250,
                "default_distance_km": 25,
                "prefer_robotics_beyond_m": 40,
                "hard_max_human_depth_m": 100,
                "disposal_inr_per_kg": [8, 30],
                "disposal_min_inr": 1500,
            },
            "role_rates_inr_per_hr": {"rov_pilot": 4500},
            "debris_classes": {
                "trash_giant": {"h": [10.0, 20.0], "kg": [2500, 5000], "tools": ["heavy salvage crane"]}
            },
            "no_deco_table_min": [[10, 219]],
            "modes": {
                "compact_rov": {
                    "kind": "robotics",
                    "depth_m": [0, 100],
                    "roles": ["rov_pilot"],
                    "max_item_kg": 5,
                    "productive_h_per_day": 6,
                    "descent_m_per_min": 30,
                    "spread_inr_per_day": [25000, 75000],
                    "vessel_inr_per_day": [5000, 25000],
                    "risk": "low",
                }
            },
        }
        res_heavy = optimize_cleanup(30, {"trash_giant": {"min": 1, "max": 1}}, cfg=cfg_heavy)
        self.assertEqual(res_heavy["status"], "no_feasible_modes")
        self.assertIsNone(res_heavy["recommended"])
        self.assertTrue(any("exceeds payload capacity" in w for w in res_heavy["warnings"]))

    def test_assumptions_version_hash(self):
        """Assumptions version string should be reproducible."""
        v1 = get_assumptions_version()
        v2 = get_assumptions_version()
        self.assertEqual(v1, v2)
        self.assertTrue(v1.startswith("v-"))

    def test_worked_example_docs_consistency(self):
        """Recompute the 1000m worked example from config and verify docs do not drift."""
        items = {
            "other_debris": {"min": 8, "max": 12},
            "trash_bag": {"min": 2, "max": 3},
            "clothing": {"min": 1, "max": 2},
        }
        res = optimize_cleanup(1000, items)

        # 1. Assert recomputed values
        self.assertEqual(res["recommended"], "light_work_rov")
        self.assertEqual(res["item_hours"], [1.9, 5.8])
        self.assertEqual(res["debris_kg"], [1.84, 26.3])

        min_mass = round(res["debris_kg"][0], 1)
        max_mass = round(res["debris_kg"][1], 1)
        self.assertEqual(min_mass, 1.8)
        self.assertEqual(max_mass, 26.3)

        rec_mode = next(m for m in res["modes"] if m["mode"] == "light_work_rov")
        wc_mode = next(m for m in res["modes"] if m["mode"] == "work_class_rov")

        l_cost_min, l_cost_max = rec_mode["min"]["total"], rec_mode["max"]["total"]
        w_cost_min, w_cost_max = wc_mode["min"]["total"], wc_mode["max"]["total"]

        self.assertEqual(l_cost_min, 414900)
        self.assertEqual(l_cost_max, 726900)
        self.assertEqual(w_cost_min, 1803300)
        self.assertEqual(w_cost_max, 5823300)

        savings_min = w_cost_min - l_cost_min
        savings_max = w_cost_max - l_cost_max
        self.assertEqual(savings_min, 1388400)
        self.assertEqual(savings_max, 5096400)

        savings_lakh_min = round(savings_min / 100000)
        savings_lakh_max = round(savings_max / 100000)
        self.assertEqual(savings_lakh_min, 14)
        self.assertEqual(savings_lakh_max, 51)

        # 2. Check documentation files for consistency
        repo_root = Path(__file__).resolve().parent.parent.parent
        doc_files = [
            repo_root / "README.md",
            repo_root / "docs" / "SYSTEM_TECHNICAL_REFERENCE.md",
            repo_root / "docs" / "IEEE_Research_Paper.md",
            repo_root / "docs" / "IEEE_Research_Paper.tex",
        ]

        for doc_path in doc_files:
            self.assertTrue(doc_path.exists(), f"Doc file missing: {doc_path}")
            text = doc_path.read_text(encoding="utf-8")

            # Must contain the recomputed mass range (1.8-26.3 or 1.8–26.3)
            self.assertTrue(
                "1.8–26.3" in text or "1.8-26.3" in text or "1.8--26.3" in text,
                f"Debris mass range 1.8-26.3 kg missing from {doc_path.name}",
            )

            # Must NOT contain the old erroneous mass range 2.0-29.0
            self.assertNotIn(
                "2.0–29.0",
                text,
                f"Obsolete debris mass 2.0-29.0 found in {doc_path.name}",
            )
            self.assertNotIn(
                "2.0-29.0",
                text,
                f"Obsolete debris mass 2.0-29.0 found in {doc_path.name}",
            )

            # Must contain the cost numbers
            self.assertTrue(
                "414,900" in text or "414900" in text,
                f"Light work ROV min cost missing from {doc_path.name}",
            )
            self.assertTrue(
                "726,900" in text or "726900" in text,
                f"Light work ROV max cost missing from {doc_path.name}",
            )

            # Must contain the savings range (14-51 lakh)
            self.assertTrue(
                "14–51 lakh" in text or "14-51 lakh" in text or "14--51 lakh" in text,
                f"Savings range 14-51 lakh missing from {doc_path.name}",
            )


if __name__ == "__main__":
    unittest.main()

