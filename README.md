# 🌊 Blue Sentinel — Marine Debris Detection & Ecological Audit System

![Blue Sentinel](https://img.shields.io/badge/Blue%20Sentinel-v2.0-blue?style=for-the-badge&logo=target)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18%20%2B%20pgvector-336791?style=for-the-badge&logo=postgresql)
![FastAPI](https://img.shields.io/badge/FastAPI-0.141-009688?style=for-the-badge&logo=fastapi)
![PyTorch](https://img.shields.io/badge/PyTorch-D--FINE%20(HGNetV2--L)-EE4C2C?style=for-the-badge&logo=pytorch)
![React](https://img.shields.io/badge/React-19%20%2B%20Vite-61DAFB?style=for-the-badge&logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-38B2AC?style=for-the-badge&logo=tailwind-css)

**Blue Sentinel** is an AI-powered marine defense system engineered to autonomously detect, localize, and classify underwater debris and marine biodiversity using real-time deep learning.

Trained on the **TrashCan v2** underwater dataset using the **D-FINE (HGNetV2-L)** architecture, the system quantifies ecological threats, generates audit reports, and maintains a persistent spatial-relational data history in **PostgreSQL 18** with **pgvector**.

---

## 🏗️ Project Architecture

```
blueSent-FE/
├── frontend/                     # Modern React 19 + Vite + Tailwind CSS Application
│   ├── src/
│   │   ├── components/
│   │   │   ├── HomePage.jsx         # Landing page & quick drag-drop entry
│   │   │   ├── UploadPage.jsx       # Single-image detection & interactive review
│   │   │   ├── ROVSimulator.jsx     # Video transect simulation & edge-in-the-loop inference
│   │   │   ├── SchematicMap.jsx     # Leaflet-based debris hotspot radar map
│   │   │   ├── CleanupOptimizer.jsx # Operational salvage budgeting & logistics planner
│   │   │   ├── HistoryPage.jsx      # Paginated scan history & session logs
│   │   │   ├── NavBar.jsx           # Global sticky navigation bar
│   │   │   ├── ErrorBoundary.jsx    # Application-wide runtime error fallback
│   │   │   ├── ImageUploader.jsx    # Drag-and-drop dropzone, metadata & 1-click samples
│   │   │   ├── LoadingOverlay.jsx   # Dual-ring inference spinner
│   │   │   └── ReportPanel.jsx      # Printable / downloadable PDF audit modal
│   │   ├── hooks/                   # useHistory (localStorage with quota protection)
│   │   ├── utils/                   # drawing.js (canvas rendering), alerts.js (threat rules)
│   │   ├── App.jsx                  # Main dashboard router & page-state machine
│   │   ├── index.css                # Marine design system tokens
│   │   └── main.jsx                 # Application entrypoint
│   ├── vite.config.js
│   └── package.json
│
├── backend/                      # FastAPI Server + Deep Learning + Dual DB Engine
│   ├── RT-DETRv4/                # Real-time transformer model architecture
│   ├── database.py               # Dynamic async database engine (PostgreSQL/SQLite)
│   ├── models.py                 # Portable SQLAlchemy ORM models
│   ├── batch_processor.py        # Multi-object tracking (IoU) & hotspot aggregator
│   ├── main.py                   # FastAPI app, model loader, inference & history APIs
│   └── convert_pth_to_onnx.py    # PyTorch to ONNX dynamic graph compiler
│
├── architecture.md               # Detailed system architecture, workflows & sequence diagrams
├── CHANGELOG.md                  # Comprehensive log of added, removed, & modified components
└── README.md                     # System documentation & setup guide
```

---

## 🎨 UI/UX Design System (60-30-10 Rule)

The dashboard adheres to the **60-30-10 color balance rule**:
* **60% Dominant (Clean White Surfaces)**: Pure white card containers (`#ffffff`), soft slate canvas (`#f8fafc`), and high-contrast charcoal typography (`#0f172a`).
* **30% Secondary (Marine Ocean Blues)**: Deep ocean header gradient (`#0c2340` to `#0f2e5a`), metric values, bounding box outlines, structural borders, and navigation badges.
* **10% Accent (Eco Emerald Greens)**: High-impact **Run Detection** primary CTA (`#10b981`), live system pulse indicator, and high-confidence metrics.

---

## ⚙️ Prerequisites

Ensure you have the following installed on your machine:
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running with Linux containers)
* [Python 3.10+](https://www.python.org/downloads/)
* [Node.js 18+](https://nodejs.org/) & `npm`
* [Git](https://git-scm.com/)

---

## 🚀 Quick Start Guide

### Step 1: Start PostgreSQL 18 Database
Open a terminal in the `backend/` directory and launch the database container:

```bash
cd backend
docker compose up -d
```
> **Note**: This starts `pgvector/pgvector:pg18` on `localhost:5432` with automatic volume persistence.

---

### Step 2: Initialize Database Tables
*(Only required once on initial setup)*

```bash
# In backend/ directory:
venv\Scripts\python init_db.py
# (Or: python init_db.py)
```
This enables the `vector` extension and creates the `scan_batches` and `detections` tables.

---

### Step 3: Start the Backend & Ocean Depth Services
Run the unified multi-service startup script from the project root:

```bash
# Windows Batch (Unified or Split-window modes):
start_services.bat

# Or PowerShell:
.\start_services.ps1

# Or Python directly:
python start_services.py
```

* **Main Backend**: Live at **`http://localhost:8000`** (Swagger docs at `/docs`)
* **Ocean Depth Service**: Live at **`http://localhost:8001`** (Health check at `/health`)

Press `Ctrl+C` at any time to gracefully terminate both services together.

---

### Step 4: Start the Frontend Interface
Open a new terminal window in the `frontend/` directory:

```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|:---|:---|:---|
| `POST` | `/detect` | Upload an underwater image (`multipart/form-data`); runs D-FINE inference, saves annotated JPG to `/uploads/`, records to PostgreSQL, and returns detections JSON + base64 image. |
| `WS` | `/ws/batch` | High-performance WebSocket stream for real-time batch frame processing and live schematic hotspot aggregation. Protocol: JSON metadata header followed by binary image bytes. |
| `POST` | `/cleanup/zones/rename` | Rename a survey transect zone (e.g. `vid_00001` to custom alias) and persist in `cleanup_zones` for the Cleanup Optimizer. |
| `GET` | `/cleanup/zones` | Fetch surveyed marine zones and their active debris inventory. |
| `POST` | `/cleanup/optimize` | Generate parametric diver hours, equipment, and cost estimates for a cleanup zone. |
| `GET` | `/missions` | List past ROV survey missions and batch runs. |
| `GET` | `/history` | Paginated list of past scans with metadata and total detection counts. |
| `GET` | `/history/{batch_id}` | Detailed scan record with bounding boxes, confidence scores, and classes. |
| `GET` | `/stats` | Aggregate metrics (total scans, total detections, class distribution). |
| `GET` | `/uploads/{filename}` | Direct static file access to saved annotated images. |
| `GET` | `/docs` | Interactive Swagger UI documentation. |

---

## ⚡ Real-Time Batch Processing & Schematic Hotspot Map

### WebSocket Protocol (`/ws/batch`)
1. **Client Header (Text/JSON)**:
   ```json
   {
     "filename": "vid_00001_000123.jpg",
     "conf": 0.4,
     "gap_threshold": 10,
     "window_size": 30
   }
   ```
2. **Client Binary Payload**:
   Raw image bytes (`ArrayBuffer`).
3. **Server Response (JSON per frame)**:
   ```json
   {
     "type": "frame",
     "filename": "vid_00001_000123.jpg",
     "zone": "vid_00001",
     "frame": 123,
     "tracks": [
       {"trackId": 1, "class": "trash_net", "confidence": 0.88, "severity": "critical", "box": [120, 80, 310, 240]}
     ],
     "alerts": [
       {"type": "GHOST GEAR", "severity": "critical", "message": "NET detected"}
     ],
     "hotspots": {
       "vid_00001": {
         "min_frame": 10,
         "max_frame": 123,
         "total_frames_processed": 45,
         "hotspots": [
           {
             "window_index": 0,
             "frame_start": 0,
             "frame_end": 29,
             "normalized_x": 0.15,
             "score": 6.5,
             "object_count": 3,
             "dominant_class": "trash_net",
             "classes": {"trash_net": 1, "trash_bottle": 2}
           }
         ]
       }
     }
   }
   ```
4. **Client Finish Signal (Text/JSON)**:
   ```json
   { "type": "finish" }
   ```
   Server records survey mission, persists hotspots in `debris_hotspots`, updates `cleanup_zones` inventory, and replies with `{ "type": "done", "summary": {...} }`.

### Schematic Map
* **Transect Position**: Extracted using regex `(vid_\d+)_(\d+)`. No GPS/telemetry required.
* **Unique Object Counting**: Multi-Object Tracking (IoU) deduplicates physical debris so an item seen across 40 frames counts exactly once per window.
* **Hazard Scores**: Weighted sum using `CLASS_WEIGHT` (fishing nets $\times 3$, pipes $\times 2$, bottles $\times 1$).
* **Bubble Colors**:
  * Blue: Low threat ($< 5.0$)
  * Amber: Moderate/High threat ($5.0 - 12.0$)
  * Red: Critical hazard ($\ge 12.0$)


---

## 🤿 Multi-Mode Cleanup Optimizer & Logistics Dispatch

### End-to-End Pipeline Diagram
```
ROV Video Stream / Frame Input
      │
      ▼
RT-DETRv4 Detector (D-FINE HGNetV2-L @ 640x640)
      │
      ▼
Bathymetric Depth Microservice (NOAA ETOPO / SRTM15Plus Global DEM @ Port 8001)
      │
      ▼
Hotspot Aggregator & MOT Tracker (Spatial IoU Deduplication & Windowed Hazard Scoring)
      │
      ▼
GPS-Tagged Debris Piles (Stable ID: PILE-<yyyymmdd>-<n> + Dominant Class)
      │
      ▼
Cleanup Optimizer (Multi-Mode Feasibility, Duty Cycles & Full INR Costing)
      │
      ├──> Interactive UI Matrix & Mode Comparison Table (Frontend Port 5173)
      ├──> Certified Copyable Mission Manifest (Clipboard Export)
      └──> PostgreSQL / SQLite cleanup_plans Record (POST /cleanup/optimize)
```

### Operational Depth Tiers & Modes
1. **Commercial Diver Tiers (0–100m, Application Scope Limit — saturation diving operates deeper, but 100m is chosen as the operational scope boundary for this application):**
   - **Scuba Team (0–40m):** 3 Crew (Lead Diver, Safety Standby, Tender), indicative no-decompression limits (recreational-table style, unverified) where $\text{bottom time} = \min(\text{table limit}, 45\text{ min})$ with a 45-min working-window cap applied on top (at 10 m the table gives 219 min), dual working divers.
   - **Surface-Supplied Air (30–50m):** 4 Crew (Supervisor, Lead, Standby, Tender), continuous air umbilical spread, stage decompression.
   - **Mixed-Gas Bell (50–100m):** 6 Crew, closed wet/dry diving bell, Trimix/Heliox reclaim spread, deck decompression chamber.
2. **Subsea Robotics Tiers (0–3000m):**
   - **Compact ROV (0–100m):** 2 Crew (Pilot, Tender), payload $\le 5$ kg.
   - **Inspection-Class ROV (0–300m):** 3 Crew (Pilot, Co-Pilot, Engineer), Tether Management System (TMS), payload $\le 25$ kg.
   - **Light Work-Class ROV (0–1000m):** 4 Crew, 5-function hydraulic manipulator, payload $\le 100$ kg.
   - **Heavy Work-Class ROV (0–3000m):** 6 Crew (dual pilot/engineer shifts), dual 7-function manipulators, LARS, payload $\le 1000$ kg.
   - **Beyond 3000m:** Categorized as **Out of Scope** for recovery operations.

### Mathematical Formulation
$$\text{Hours} = \left[ \sum_{i} h_{i,\min} \cdot \text{Count}_{i,\min}, \quad \sum_{i} h_{i,\max} \cdot \text{Count}_{i,\max} \right]$$
$$\text{Mass} = \left[ \sum_{i} m_{i,\min} \cdot \text{Count}_{i,\min}, \quad \sum_{i} m_{i,\max} \cdot \text{Count}_{i,\max} \right]$$
$$\text{Rotations} = \left\lceil \frac{\text{Hours}}{t_{\text{bt}}(z)} \right\rceil, \quad \text{Days} = \max\left(1, \left\lceil \frac{\text{Rotations}}{N_{\text{divers}} \cdot \text{Rot}_{\text{day}}^{\max}} \right\rceil\right)$$
$$\text{Days}_{\text{ROV}} = \max\left(1, \left\lceil \frac{\text{Hours}}{t_{\text{eff}}} \right\rceil\right)$$
$$\text{Cost}_{\text{total}} = (\text{Labour} + \text{Equipment} + \text{Vessel} + \text{Mobilization} + \text{Disposal}) \times (1 + \alpha_{\text{contingency}})$$

### Worked Example (1000m Depth — `screenshot_1000m`)
For an inventory of 8–12 other debris items (`other_debris`), 2–3 plastic bags (`trash_bag`), and 1–2 clothing items (`clothing`) at 1000 m:
1. **Debris Inventory & Mass:** Total labor demand is 1.9–5.8 h, total debris mass is 1.8–26.3 kg (recomputed directly from `cleanup_assumptions.json`: $\min = 8(0.2) + 2(0.02) + 1(0.2) = 1.84\text{ kg} \approx 1.8\text{ kg}$; $\max = 12(2.0) + 3(0.1) + 2(1.0) = 26.3\text{ kg}$), with a peak item mass of 2.0 kg.
2. **Feasibility:**
   - Commercial Human Divers: Disqualified (depth 1000 m exceeds 100 m application scope limit; saturation diving operates deeper, but 100 m is the application boundary).
   - Compact ROV & Inspection ROV: Disqualified (depth 1000 m exceeds 100 m and 300 m ratings).
   - Light Work-Class ROV (0–1000 m, payload $\le 100\text{ kg}$) & Heavy Work-Class ROV (0–3000 m, payload $\le 1000\text{ kg}$): Feasible.
3. **Cost Breakdown:**
   - `light_work_rov`: 4 crew personnel, 1 day operation $\to$ **₹414,900 – ₹726,900**.
   - `work_class_rov`: 6 crew personnel, DP2 support vessel spread $\to$ **₹1,803,300 – ₹5,823,300**.
4. **Optimal Recommendation & Cost Savings:** `light_work_rov` is selected as the optimal recommendation, realizing operational savings of about **₹14–51 lakh** (specifically ₹1,388,400 to ₹5,096,400 savings; light work-class vs work-class).

### Configuration & Assumptions File
All operational parameters, day rates, shift lengths (10h/day), decompression figures, per-class recovery hours, item weights, and payload caps are strictly defined in:
* `docs/cleanup_assumptions.json` — **Single Source of Truth**

### Running Automated Test Suite
To verify all 6 golden test cases and edge cases with 0 deviations:

```bash
cd backend
python -m unittest tests/test_cleanup_optimizer.py
```

### Database Schema: `cleanup_plans`
* `id` (`UUID`, PK)
* `zone_id` (`UUID`, FK ➔ `cleanup_zones.id`)
* `mode` (`VARCHAR`) — Recommended operational tier (e.g. `light_work_rov`)
* `crew` (`JSONB`) — Technical crew count and certified role assignments
* `depth_source` (`VARCHAR`) — `bathymetry` or `simulated`
* `assumptions_version` (`VARCHAR`) — Version hash (e.g. `v-2e40a4f0`)
* `cost_min` / `cost_max` (`FLOAT`) — Comprehensive budgetary bounds (INR)
* `breakdown` (`JSONB`) — Labour, equipment, vessel, mobilization, disposal, and duty cycles
* `warnings` (`JSONB`) — Safety advisories, batching notifications, and contractor quote notices
* `dispatch_status` (`VARCHAR`) — `draft`, `approved`, `dispatched`
* `created_at` (`TIMESTAMPTZ`)

---

## 🎯 Supported Classes (TrashCan Dataset)
`rov`, `plant`, `animal_fish`, `animal_starfish`, `animal_shells`, `animal_crab`, `animal_eel`, `animal_etc`, `trash_clothing`, `trash_pipe`, `trash_bottle`, `trash_bag`, `trash_snack_wrapper`, `trash_can`, `trash_cup`, `trash_container`, `trash_unknown_instance`, `trash_branch`, `trash_wreckage`, `trash_tarp`, `trash_rope`, `trash_net`.

---

## 📄 License
This project is licensed under the MIT License.

