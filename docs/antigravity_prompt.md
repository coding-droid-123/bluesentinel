# Antigravity prompt: finish the Blue Sentinel Cleanup Optimizer and complete the app

## Context
Blue Sentinel is a marine-debris app: ROV video -> RT-DETRv4 detector -> bathymetric depth service (NOAA ETOPO / SRTM15Plus) -> hotspot engine (GPS-tagged debris piles) -> **Cleanup Optimizer** (labor hours, crew, mode, INR budget) -> UI, copyable mission manifest, and PostgreSQL `cleanup_plans` via `POST /cleanup/optimize`. The optimizer UI has an "Edit Assumptions" panel and an "Operating Depth (m)" simulation field.

Three files are attached; put them in `docs/` of the repo:
- `cleanup_assumptions.json`: all rates, per-class times and masses, and per-mode depth, crew, and cost parameters. This is the single source of truth.
- `ref_model.py`: reference implementation of the corrected algorithm. Port its logic exactly.
- `golden_test_cases.json`: inputs and expected outputs. Your tests must reproduce them.

## Step 0: Explore and plan first (no edits yet)
Detect the stack (frontend framework, backend, ORM, migration tool) from the repo; do not assume. Produce a short plan and a gap report as artifacts: what exists, what is wrong, which files you will change. Then proceed.

## Step 1: Defects to fix (found in the current UI and spec)
1. **Pile named `unknown_instance`.** Use a stable ID (e.g. `PILE-<yyyymmdd>-<n>`) plus the dominant debris class.
2. **Classes missing from the coefficient table.** "Other debris" and "Clothing" appear in the UI but not in the spec. Add them, plus an `unknown` fallback so no class can be unpriced.
3. **Flat 100 m human/robot switch.** Replace it with the multi-mode depth model below. Keep 100 m only as `hard_max_human_depth_m` in config.
4. **Cost ignores equipment.** The old model was crew-hours x ₹3,800 + ₹15,000, so a 1000 m job showed ₹36,660-₹81,120 with no ROV, vessel, gas, or disposal cost. Use the new cost model.
5. **No depth overhead.** Descent, ascent, decompression (humans) and launch/transit (ROV) must add time.
6. **Crew paid only for work hours.** Crew are paid for the full shift. Cost is per day, not per work hour.
7. **Wrong equipment manifest.** "Collection sacks" are listed as ROV tooling at 1000 m. Use per-mode tooling (see config).
8. **No payload check.** A compact ROV must not be recommended for wreckage or containers. Enforce `max_item_kg` per mode.
9. **Depth is only a manual input.** Default depth must come from the bathymetry service for the pile's coordinates. A manual value is allowed but must be labelled **"Simulated depth"**. If bathymetry reports land or an elevation >= 0, show a warning.
10. **Broken LaTeX** in the formulas section of the docs (subscripts like `Count{i,\min}`). Fix it.

## Step 2: Algorithm (see `ref_model.py`)
1. Item hours: sum of count x per-class hours, as a min-max range. Debris kg likewise, for disposal.
2. Feasible modes: depth within the mode's `depth_m`, depth <= `hard_max_human_depth_m` for human modes, and the heaviest item <= `max_item_kg`.
3. Per mode, compute rotations (human) or transit and productive hours (ROV), then days. Labour = sum of role rates x shift hours x days; roles listed in `labour_excluded_roles` are covered by the rental rate.
4. Cost = (labour + equipment + vessel + mobilization + disposal) x (1 + contingency), as a min-max range using the low and high ends of each rate.
5. Recommend the lowest midpoint cost. Beyond `prefer_robotics_beyond_m`, restrict the pool to robotics when any robotics mode is feasible.
6. Warnings: a work-class ROV for under 12 h of work (suggest batching piles into one campaign), and any high or very-high risk human mode.

Depth modes: scuba (0-40 m) -> surface-supplied air (30-50 m) -> mixed-gas bell (50-100 m); ROV tiers: compact (to 100 m), inspection (to 300 m), light work (to 1000 m), work-class (to 3000 m). Beyond 3000 m show "out of scope".

## Step 3: Backend
- Load `cleanup_assumptions.json` into config. "Edit Assumptions" must write a versioned override (store `assumptions_version` on each plan).
- `POST /cleanup/optimize`: validate input (depth, items with min <= max, coordinates). Return the recommended mode, the comparison of all feasible modes, per-line cost breakdown, crew roles, rotations or days, warnings, `depth_source` (`bathymetry` or `simulated`), and the list of unverified assumptions used.
- DB migration for `cleanup_plans`: add `mode`, `crew` (jsonb), `depth_source`, `assumptions_version`, `cost_min`, `cost_max`, `breakdown` (jsonb), `warnings` (jsonb). Do not drop existing columns; backfill safely.

## Step 4: Frontend
- Replace the badge text with the recommended mode plus a risk chip.
- Show a **mode comparison table** (cost range, days, crew, risk) so the user sees why a mode was chosen.
- Show the line-by-line breakdown. Show the rotations or sorties row only for the relevant mode.
- Items marked `verified: false` in config must show an **"Indicative rates, validate with contractor quotes"** banner next to the total.
- Add the permanent disclaimer: *budgeting estimate only, not dive planning; decompression figures are placeholders.*
- The mission manifest must include depth source, mode, crew roster, equipment, breakdown, warnings, and assumptions version. "Dispatch & Save Plan" must show success and error states.

## Step 5: Tests (must pass)
Port `golden_test_cases.json` as automated tests. Key expectations:

| Case | Depth | Expected mode | Expected total (INR) |
|---|---|---|---|
| screenshot_1000m | 1000 m | light_work_rov | 414,900 - 726,900 |
| shallow_5m | 5 m | compact_rov | 84,900 - 168,900 |
| scuba_25m_net | 25 m | scuba_team | 167,700 - 735,492 |
| ssa_45m_wreck | 45 m | work_class_rov (+ batching warning) | 1,803,300 - 5,848,140 |
| mixed_gas_75m | 75 m | light_work_rov | 414,900 - 732,660 |
| rov_150m | 150 m | light_work_rov | 414,900 - 728,700 |

Add edge cases: depth 0, negative or land depth, depth over 3000 m, unknown class, empty items, min > max, items heavier than every mode's payload.

## Step 6: Finish the whole app
Run the full pipeline end to end (detection result -> depth -> hotspot -> optimizer -> save -> reload saved plan). Fix console and server errors, add loading and empty states, make configuration environment-driven with no secrets in the repo, run lint and type checks, and update the README with setup, the pipeline diagram, the assumptions file, and how to run the tests. Capture screenshots of the 5 m, 45 m and 1000 m cases as artifacts.

## Rules
- Do not invent or tweak rates. Any change goes through `cleanup_assumptions.json`.
- Do not touch detector or training code unless you find a bug that blocks the pipeline; report it instead.
- If a decision is ambiguous, pick the safest reading, note it in the final report, and keep going.

## Final report
List files changed, test results, any golden-case deviations (there should be none), and open items.
