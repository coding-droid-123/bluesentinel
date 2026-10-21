# 📝 Blue Sentinel — Changelog & Component Evolution Log

> This document tracks all architectural additions, removals, refactors, and deprecations across the frontend, backend, AI engine, database, and documentation layers. Maintain and update this log whenever new features or refactors are merged.

---

## 📌 Summary Matrix of Major Component Changes

| Component / File | Layer | Action | Release / Milestone | Rationale & Context |
|---|---|:---:|:---:|---|
| `ocean_depth_service/` | Microservice | ✨ **Added** | v2.2 (Oct 2026) | Standalone FastAPI microservice querying OpenTopography SRTM15Plus Global DEM for bathymetric ocean depth with SQLite cache. |
| `GET /api/ocean-depth` | Backend | ✨ **Added** | v2.2 (Oct 2026) | Backend proxy endpoints (`/api/ocean-depth`, `/api/ocean-depth/batch`) forwarding requests to depth service with graceful fallback. |
| `SchematicMap.jsx` | Frontend | 🔄 **Refactored** | v2.2 (Oct 2026) | Integrated Ocean Depth service as primary bathymetric tier for open-water verification and 12-azimuth seaward pile steering. |
| `BatchStreamPage.jsx` | Frontend | ❌ **Removed** | v2.1 (Oct 2026) | Replaced by edge-in-the-loop video transect simulation in `ROVSimulator.jsx` and rich scan logs in `HistoryPage.jsx`. |
| `useBatchStream.js` | Frontend | ❌ **Removed** | v2.1 (Oct 2026) | Hook for WebSocket batch image streaming removed alongside `BatchStreamPage`. |
| `WS /ws/batch` | Backend | ⚠️ **Detached** | v2.1 (Oct 2026) | Retained in backend for testing, but decoupled from the active frontend UI. |
| `AuthModal.jsx` | Frontend | ❌ **Removed** | v2.0 (Oct 2026) | Removed mock authentication modal in favor of frictionless offshore / local deployment. |
| `DetectionPanel.jsx` | Frontend | ❌ **Removed** | v2.0 (Oct 2026) | Monolithic panel refactored into modular `UploadPage.jsx`, `ImageUploader.jsx`, and shared canvas utils. |
| `ROVSimulator.jsx` | Frontend | ✨ **Added** | v2.0 (Oct 2026) | In-memory frame extraction, live bbox canvas overlay, IoU tracking, alert notifications, and pile scoring. |
| `SchematicMap.jsx` | Frontend | ✨ **Added** | v2.0 (Oct 2026) | Leaflet-based spatial visualization with sonar sweep animation, coordinate-free transect windows, and hotspot clustering. |
| `HistoryPage.jsx` | Frontend | ✨ **Added** | v2.0 (Oct 2026) | Filterable scan log with search, class frequency charts, thumbnail preview modal, and localStorage quota safety. |
| `useHistory.js` | Frontend | ✨ **Added** | v2.0 (Oct 2026) | Centralized hook managing scan records in `localStorage` with automatic thumbnail truncation on quota exhaustion. |
| `NavBar.jsx` | Frontend | ✨ **Added** | v2.0 (Oct 2026) | Unified header navigation bar across all pages with active page indicators and quick links. |
| `ErrorBoundary.jsx` | Frontend | ✨ **Added** | v2.0 (Oct 2026) | Class component mounted in `main.jsx` to intercept unhandled rendering exceptions with fallback recovery UI. |
| `utils/drawing.js` | Frontend | ✨ **Added** | v2.0 (Oct 2026) | Centralized HTML5 Canvas drawing routines (`drawBoxes()`, `boxIoU()`, `CLASS_COLORS`, `SEVERITY_COLOR`). |
| `utils/alerts.js` | Frontend | ✨ **Added** | v2.0 (Oct 2026) | Shared ecological threat assessment (`evaluateAlerts()`, `weightedScore()`). |
| `CleanupOptimizer.jsx` | Frontend | 🔄 **Refactored** | v2.0 (Oct 2026) | Overhauled with parametric budget modeling, crew hour calculations, salvage equipment assignments, and API sync. |
| `batch_processor.py` | Backend | ✨ **Added** | v2.0 (Oct 2026) | IoU-based multi-object tracking (`ZoneTracker`), hotspot aggregation (`HotspotAggregator`), and alert logic. |
| `database.py` (Dual Mode) | Backend | 🔄 **Refactored** | v2.0 (Oct 2026) | TCP probe auto-detects PostgreSQL on startup; automatically falls back to SQLite (`aiosqlite`) if offline. |
| `models.py` (Portable Types) | Backend | 🔄 **Refactored** | v2.0 (Oct 2026) | Added portable `UUID` and `JSONB` decorators to support both SQLite and PostgreSQL 18 seamlessly. |
| `RT-DETRv4` / `D-FINE` | AI Engine | ✨ **Added** | v2.0 (Oct 2026) | End-to-end transformer model (HGNetv2-L backbone) trained on TrashCan 1.0; ONNX Runtime primary + PyTorch fallback. |
| `convert_pth_to_onnx.py` | AI Engine | ✨ **Added** | v2.0 (Oct 2026) | Export pipeline compiling PyTorch weights into dynamic-batch ONNX graphs (Opset 16). |
| `convert_onnx_to_engine.py`| AI Engine | ✨ **Added** | v2.0 (Oct 2026) | TensorRT FP16 engine builder for NVIDIA edge GPUs. |

---

## 🔍 Detailed Change Log by Milestone

### [v2.2.1] — October 19, 2026: History Log De-duplication & Empty Mission Discard Engine

- **`frontend/src/hooks/useHistory.js`**:
  - Automatically purges existing 0-detection ROV stub entries from browser `localStorage` on load.
  - Prevents recording empty ROV survey runs with 0 detections (`summary.totalObjects === 0 && summary.debrisCount === 0`) to history.
  - Skips empty/stub missions during backend database auto-sync (`total_unique_objects === 0 && duration_sec < 1.0`).
  - Added cascade delete: Removing or clearing history entries automatically deletes them from the backend PostgreSQL database so they never resurrect.
- **`frontend/src/components/ROVSimulator.jsx`**:
  - `handleStopInternal` now checks `hasDetections = uniqueCountRef.current > 0`. If 0 debris items were found or if the run was immediately stopped, it discards the placeholder mission rather than logging an empty entry.
  - Passes active `missionIdRef.current` to `/missions/finish` to update the existing record rather than creating duplicate entries.
- **`backend/main.py`**:
  - Added `DELETE /missions/{mission_id}` and `DELETE /missions` endpoints.
  - Updated `POST /missions/finish` to update existing started missions and automatically discard 0-object placeholder stubs.
  - Filtered `GET /missions` to strictly return missions with real detections (`total_unique_objects > 0` or `duration_sec >= 1.0`).
  - Cleaned up orphaned empty records from the PostgreSQL `survey_missions` table.

### [v2.2.0] — October 18, 2026: OpenTopography SRTM15Plus Ocean Depth Service & Seafloor Pile Placement

- **`ocean_depth_service/` (New Microservice)**:
  - Built high-performance FastAPI service running on port 8001 utilizing the OpenTopography Global DEM API with the `SRTM15Plus` dataset (global bathymetry & topography at 15 arc-second resolution).
  - Implemented `GET /depth?lat=<float>&lon=<float>` with `x-api-key` header authentication (`APP_API_KEYS`).
  - Added coordinate validation (latitude $-90 \dots 90$, longitude normalized to $-180 \dots 180$) and GeoTIFF raster sampling via `rasterio` MemoryFile.
  - Returns `{"lat": ..., "lon": ..., "depth_m": <positive float>}` for ocean seafloor, and `{"lat": ..., "lon": ..., "depth_m": null}` for land.
  - Integrated SQLite persistent caching (`depth_cache.db`) with coordinate rounding to avoid redundant OpenTopography API quota consumption.
  - Implemented test suite `test_local.py` validating authentication, parameter boundaries, and bathymetry lookups.

- **`backend/main.py`**:
  - Added proxy endpoints `GET /api/ocean-depth` (single coordinate) and `GET /api/ocean-depth/batch` (up to 24 coordinates) forwarding to the depth microservice.
  - Configured non-blocking graceful fallback with `DEPTH_SERVICE_URL` and `DEPTH_SERVICE_API_KEY` environment variables.

- **`frontend/src/components/SchematicMap.jsx`**:
  - Integrated Ocean Depth Service into `discoverMarineWaterHeadings()`: Probes 12 radial azimuths around the dive center and uses batch ocean depth lookups to find seafloor points (`depth_m > 0`), ensuring debris piles are strictly distributed seaward.
  - Integrated Ocean Depth Service as Tier 1 physical ground truth in `checkMarineWaterNearby()`, definitively classifying points as underwater when `depth_m > 0`.

### [v2.1.2] — October 18, 2026: Strict Marine Water & Desert Rejection Engine

- **`frontend/src/components/SchematicMap.jsx`**:
  - Replaced ambiguous "lack of settlements" heuristic with a multi-tier physical validation engine (`checkMarineWaterNearby`).
  - **Tier 1 (Marine Wave Model):** Queries Open-Meteo ECMWF WAM marine model. Deserts, mountains, and inland areas return `null` wave heights and are immediately caught.
  - **Tier 2 (Elevation Ground Truth):** Rejects any coordinate with digital elevation $> 5.0\text{ m}$ (deserts like Sahara at ~500m, Mojave at ~1300m, Gobi at ~1100m are strictly rejected).
  - **Tier 3 (OSM Territorial Guard):** Rejects any terrestrial administrative entity (country, state, county, province) lacking explicit marine tags (`sea`, `ocean`, `bay`, `reef`, `coastline`).
  - **Seaward Pile Steering (`discoverMarineWaterHeadings` & `getPileGeoLocation`):** Probes 12 radial azimuths around the dive center and strictly constrains debris pile projection to verified open water headings ($\text{elevation} \le 1.0\text{m}$), preventing coastal dive piles from ever landing on shorelines, beaches, or cliffs.

### [v2.1.1] — October 18, 2026: Multi-Object Tracking (MOT) IoU Threshold Calibration

#### 🔄 Modified / Refactored
- **`frontend/src/utils/drawing.js`**:
  - Exported `TRACKING_IOU_THRESHOLD = 0.20` as the centralized frontend tracking parameter.
  - Adjusted `CLASS_WEIGHT['trash_unknown_instance']` from `1.0` to `0.8`.
- **`frontend/src/components/ROVSimulator.jsx`**:
  - Updated spatial track association logic to use `TRACKING_IOU_THRESHOLD` (`0.20` instead of `0.35`). This increases tracking robustness during rapid ROV camera movement, turbulent currents, and larger inter-frame perspective shifts.
- **`backend/batch_processor.py`**:
  - Defined `DEFAULT_IOU_THRESHOLD: float = 0.20` and updated `ZoneTracker` default parameter to match the frontend tracking behavior.
  - Updated `CLASS_WEIGHT['trash_unknown_instance']` from `1.0` to `0.8` for server-side scoring consistency.

### [v2.1.0] — October 16, 2026: Batch Stream Retirement & History Modernization

#### ❌ Removed
- **`frontend/src/components/BatchStreamPage.jsx`**:
  - Removed obsolete multi-image directory streaming UI.
  - Removed synthetic ZIP/folder upload logic that previously bypassed video ingestion.
- **`frontend/src/hooks/useBatchStream.js`**:
  - Removed WebSocket client hook and raw image byte stream handler.
- **`frontend/src/config.js`**:
  - Cleaned up obsolete `WS_BATCH_URL` reference from frontend client configuration.

#### ✨ Added
- **Expanded `HistoryPage.jsx`**:
  - Added multi-format session browsing (ROV transects, static image scans).
  - Added full-size image thumbnail preview modal with keyboard escape listeners.
  - Added live debris frequency metrics and severity badge indicators.
- **`backend/migrate_db.py`**:
  - Standalone migration utility for applying schema additions safely to SQLite/PostgreSQL.

#### 🔄 Modified / Refactored
- **`frontend/src/App.jsx`**:
  - Removed `batch` route and `BatchStreamPage` component mount.
  - Retained session-persistent page-state machine with `display: none/block` pattern.
- **`frontend/src/components/NavBar.jsx`**:
  - Removed "Batch Stream" navigation tab.
- **`backend/main.py`**:
  - Detached `/ws/batch` from client navigation; documented as legacy algorithmic benchmark.
  - Enhanced error handling on image and frame decoding.

---

### [v2.0.0] — October 14, 2026: ROV Edge Simulation, Decision Support & Dual DB

#### ✨ Added
- **Edge-in-the-Loop Video Simulator (`ROVSimulator.jsx`)**:
  - Real-time video frame extraction via browser `HTML5 Canvas API` (`createObjectURL`).
  - Dual modes: **Synchronized Step-Through** (with configurable dwell time) and **Continuous Slow-Motion**.
  - Multi-Object Tracking (MOT) using spatial IoU bounding box association to eliminate duplicate debris counts.
  - Temporal persistence gating for ecological hazard alerts (ghost gear, animal entanglement, dense piles).
- **Interactive Spatial Mapping (`SchematicMap.jsx`)**:
  - Leaflet-based radar/sonar styling with animated range rings.
  - Automatic grouping of detected objects into hot zones with weighted hazard scoring.
- **Operational Logistics (`CleanupOptimizer.jsx`)**:
  - Parametric cost modeling: vessel fuel, crew day rates, diver insurance, retrieval gear requirements.
  - Dynamic sensitivity and scenario planning for marine remediation campaigns.
- **Persistence Layer Overhaul (`models.py`, `database.py`)**:
  - Tables: `survey_missions`, `mission_incidents`, `debris_hotspots`, `cleanup_zones`, `cleanup_plans`.
  - SQLite (`aiosqlite`) + PostgreSQL 18 (`asyncpg`) compatibility with transparent `UUID` and `JSONB` translation.
- **Shared Utilities (`frontend/src/utils/`)**:
  - `drawing.js`: Single source of truth for bounding box rendering, severity colors, and IoU computation.
  - `alerts.js`: Unified threat classification and score aggregation.
- **System Documentation**:
  - `architecture.md`: Comprehensive system architecture and workflow documentation.
  - `docs/IEEE_Research_Paper.tex` & `docs/IEEE_Research_Paper.md`: Academic research paper benchmarking RT-DETRv4 against YOLOv11.
  - `docs/SYSTEM_TECHNICAL_REFERENCE.md`: Deep technical reference on mathematical formulations and hardware sizing.

#### ❌ Removed
- **`frontend/src/components/AuthModal.jsx`**: Removed unnecessary modal to streamline standalone ROV fieldwork.
- **`frontend/src/components/DetectionPanel.jsx`**: Replaced by dedicated `UploadPage.jsx`.
- **Legacy flat SQLite schemas**: Deprecated old unindexed table definitions.

---

### [v1.0.0] — Initial Release

#### ✨ Core Capabilities
- Initial single-image inference dashboard with RT-DETRv4 model integration.
- Image drag-and-drop dropzone with sample images.
- Basic PDF audit report generator using `jsPDF` and `html2canvas`.
- FastAPI server hosting `/detect` endpoint.

---

## 🛠️ Guidelines for Future Updates

Whenever modifying or refactoring this project:
1. **Adding a feature/file**:
   - Register the file path, purpose, and layer in the **Summary Matrix** above.
   - Record the commit or date under the latest milestone section.
2. **Removing/Deprecating a file**:
   - Do not delete silently; log the file in the **❌ Removed** or **⚠️ Deprecated** section with the rationale.
   - Ensure imports are cleanly stripped from `App.jsx`, `NavBar.jsx`, and backend route definitions.
3. **Changing Database Schema**:
   - Update `models.py` with custom types that preserve dual SQLite/PostgreSQL compatibility.
   - Add migration notes in `backend/migrate_db.py` and document here.
