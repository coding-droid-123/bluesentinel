# BlueSentinel — System Architecture & Workflow

> ⚠️ **Updated October 2026** — reflects the current codebase. `BatchStreamPage` and `useBatchStream` have been removed. `HistoryPage`, `NavBar`, `ErrorBoundary`, `utils/drawing.js`, and `utils/alerts.js` have been added.

> Real-time marine debris detection, ecological severity triage, and autonomous cleanup logistics platform.

---

## High-Level Architecture

```mermaid
graph TB
    subgraph Client["🖥️ Frontend — React 19 + Vite 8"]
        HP["Home Page"]
        UP["Upload Page"]
        ROV["ROV Simulator"]
        SM["Schematic Hotspot Map"]
        CO["Cleanup Optimizer"]
        HIST["History Page"]
        RP["Report Panel"]
    end

    subgraph API["⚡ Backend — FastAPI 2.0"]
        DET["/detect — Single Frame Inference"]
        MISS["/missions/* — Survey Lifecycle"]
        INC["/incidents — Severity Triage"]
        CLN["/cleanup/* — Optimizer & Plans"]
        HST["/history & /stats — Aggregation"]
    end

    subgraph AI["🧠 AI Engine"]
        ONNX["ONNX Runtime<br/>(Primary — C++ Accelerated)"]
        PTH["PyTorch RT-DETRv4<br/>(Fallback — Python)"]
    end

    subgraph Store["🗄️ Persistence"]
        SQLA["SQLAlchemy ORM<br/>(Async)"]
        SQLITE["SQLite<br/>(aiosqlite)"]
        PG["PostgreSQL<br/>(asyncpg)"]
        LS["Browser localStorage /<br/>sessionStorage"]
    end

    Client -- HTTP REST --> API
    API --> AI
    API --> SQLA
    SQLA --> SQLITE
    SQLA -.-> PG
    Client --> LS
```

---

## 1. Frontend Layer

| Component | File | Technology | Purpose |
|-----------|------|-----------|---------|
| **Build System** | `vite.config.js` | **Vite 8.3** | Ultra-fast HMR dev server, ESBuild bundling, production Rollup build |
| **UI Framework** | `main.jsx`, `App.jsx` | **React 19.3** | SPA with session-persistent page rendering (`display: none/block` pattern — no unmounting) |
| **Styling** | `index.css` | **Vanilla CSS** (25 KB design system) + **Tailwind CSS 4.3** (utility layer) | Glassmorphism dark theme, gradients, animations, responsive grid |
| **Animation** | Components | **Framer Motion 13.4** | Page transitions, card hover effects, micro-animations |
| **Icons** | Components | **Lucide React 1.47** | SVG icon library (200+ marine/UI icons) |
| **Mapping** | `SchematicMap.jsx` | **Leaflet 1.9** | Interactive debris hotspot mapping with sonar rings, ROV dive markers, heatmap overlays |
| **PDF Export** | `ReportPanel.jsx` | **jsPDF 4.2** + **html2canvas 1.4** | Client-side PDF generation for assessment reports |
| **State Persistence** | `useHistory.js` | **sessionStorage** + **localStorage** | Session-scoped page navigation; localStorage for scan history with quota-safe thumbnail stripping |
| **Error Handling** | `ErrorBoundary.jsx` | **React class component** | Catches runtime errors app-wide; renders themed fallback UI with Reload / Home actions |
| **Shared Drawing** | `utils/drawing.js` | **HTML5 Canvas API** | `drawBoxes()`, `CLASS_COLORS`, `SEVERITY_COLOR`, `getColor()`, `boxIoU()` — shared across all components |
| **Alert Logic** | `utils/alerts.js` | **Pure JS** | `evaluateAlerts()`, `weightedScore()` — shared across ROV Simulator and other pages |

### Page Components

```mermaid
graph LR
    subgraph Pages
        A["🏠 HomePage<br/><small>Landing + File drop</small>"]
        B["📸 UploadPage<br/><small>Single frame scan</small>"]
        C["🤖 ROVSimulator<br/><small>Video feed + live detection</small>"]
        E["🗺️ SchematicMap<br/><small>Leaflet hotspot map</small>"]
        F["♻️ CleanupOptimizer<br/><small>Cost & logistics planner</small>"]
        G["📜 HistoryPage<br/><small>Session scan log</small>"]
        H["ℹ️ AboutPage<br/><small>Project info</small>"]
    end

    A --> B
    A --> C
    C --> E
    E --> F
    B --> G
    C --> G
```

### Key Custom Hooks

| Hook | File | Role |
|------|------|------|
| `useHistory` | [useHistory.js](file:///c:/Users/user/Desktop/blueSent-FE/frontend/src/hooks/useHistory.js) | Manages scan history records in `localStorage` with thumbnail quota protection. Exports `addHistoryRecord()` for any page to persist scan results. |

> **Removed:** `useBatchStream.js` — deleted along with `BatchStreamPage.jsx`. The WebSocket batch stream workflow has been removed from the current version.

---

## 2. Backend Layer

| Component | File | Technology | Purpose |
|-----------|------|-----------|---------|
| **Web Framework** | [main.py](file:///c:/Users/user/Desktop/blueSent-FE/backend/main.py) | **FastAPI 2.0** + **Uvicorn** (ASGI) | Async HTTP/WebSocket server with CORS, static file serving |
| **Batch Processor** | [batch_processor.py](file:///c:/Users/user/Desktop/blueSent-FE/backend/batch_processor.py) | **Python** (pure algorithmic) | Multi-object IoU tracking, zone isolation, hotspot aggregation, alert evaluation |
| **Database ORM** | [models.py](file:///c:/Users/user/Desktop/blueSent-FE/backend/models.py) | **SQLAlchemy** (async mode) | Portable UUID/JSONB type decorators, 5 ORM models |
| **Database Engine** | [database.py](file:///c:/Users/user/Desktop/blueSent-FE/backend/database.py) | **aiosqlite** (default) / **asyncpg** (PostgreSQL) | Auto-detection of PostgreSQL via TCP probe; seamless SQLite fallback |
| **Static Files** | `/uploads/` | **FastAPI StaticFiles** | Serves annotated images, incident snapshots |

### API Endpoints

```mermaid
graph TD
    subgraph REST["REST API (HTTP)"]
        D1["POST /detect<br/><small>Single image inference</small>"]
        M1["POST /missions/start<br/><small>Begin ROV survey</small>"]
        M2["POST /missions/finish<br/><small>Save mission summary</small>"]
        M3["GET /missions<br/><small>List past missions</small>"]
        M4["GET /missions/:id<br/><small>Mission detail + hotspots</small>"]
        I1["POST /incidents<br/><small>Log emergency event</small>"]
        I2["GET /incidents<br/><small>List incidents</small>"]
        C1["GET /cleanup/zones<br/><small>Debris zone inventory</small>"]
        C2["POST /cleanup/optimize<br/><small>Generate cleanup plan</small>"]
        C3["GET /cleanup/plans<br/><small>List work orders</small>"]
        C4["POST /cleanup/zones/rename<br/><small>Rename zone</small>"]
        H1["GET /history<br/><small>Paginated scan history</small>"]
        S1["GET /stats<br/><small>Global statistics</small>"]
        MS["GET /model/status<br/><small>Engine health check</small>"]
    end
```

> **Removed:** `WS /ws/batch` — the WebSocket batch stream endpoint is no longer used by the frontend.

---

## 3. AI Inference Engine

```mermaid
graph TD
    subgraph Models["Trained Model Artifacts"]
        ONNX_W["best.onnx<br/><small>118 MB — ONNX exported graph</small>"]
        PTH_W["best_stg2.pth<br/><small>158 MB — PyTorch checkpoint</small>"]
    end

    subgraph Runtime["Inference Runtimes"]
        ORT["ONNX Runtime<br/><small>C++ execution engine</small><br/><small>CUDAExecutionProvider / CPUExecutionProvider</small>"]
        PYT["PyTorch + RT-DETRv4<br/><small>RTDETRWrapper(model.deploy(), postprocessor.deploy())</small><br/><small>CUDA FP16 autocast / CPU multi-thread</small>"]
    end

    ONNX_W --> ORT
    PTH_W --> PYT
    ORT -- "Primary (2-3x faster)" --> INF["run_inference()"]
    PYT -- "Fallback" --> INF

    INF --> POST["Post-Processing<br/><small>Confidence threshold 0.4</small><br/><small>Severity mapping per class</small>"]
```

### Model Details

| Property | Value |
|----------|-------|
| **Architecture** | RT-DETRv4 / D-FINE (HGNetv2-L backbone) |
| **Training Data** | TrashCan 1.0 (underwater debris dataset) |
| **Input Resolution** | 640 × 640 px |
| **Confidence Threshold** | 0.40 |
| **Classes (22)** | `rov`, `plant`, `animal_fish`, `animal_starfish`, `animal_shells`, `animal_crab`, `animal_eel`, `animal_etc`, `trash_clothing`, `trash_pipe`, `trash_bottle`, `trash_bag`, `trash_snack_wrapper`, `trash_can`, `trash_cup`, `trash_container`, `trash_unknown_instance`, `trash_branch`, `trash_wreckage`, `trash_tarp`, `trash_rope`, `trash_net` |
| **Weights Source** | HuggingFace: `coding-droid-123/trashcan-dfine` |
| **ONNX Format** | Opset 16, dynamic axes for batch inference |

### Severity Classification

| Tier | Classes | Ecological Risk |
|------|---------|-----------------|
| 🔴 **Critical** | `trash_net`, `trash_rope`, `trash_tarp` | Ghost gear — active marine entanglement |
| 🟠 **High** | `trash_bottle`, `trash_bag`, `trash_container`, `trash_snack_wrapper`, `trash_cup`, `trash_pipe`, `trash_wreckage` | Non-biodegradable plastics, chemical leaching |
| 🟡 **Medium** | `trash_can`, `trash_clothing`, `trash_unknown_instance` | Metals, fabrics, general artificial debris |
| 🟢 **Low** | `trash_branch`, `rov`, `plant`, `animal_*` | Natural materials, organisms, equipment |

---

## 4. Batch Processing Pipeline

| Component | Class / Function | Technology | Purpose |
|-----------|-----------------|-----------|---------|
| **Filename Parser** | `parse_filename_zone_and_frame()` | Regex (`(vid_\d+)_(\d+)`) | Extracts zone ID and frame number from image filenames |
| **Zone Tracker** | `ZoneTracker` | IoU-based multi-object tracker | Per-zone isolated tracking with gap-triggered resets (`gap_threshold = 10 frames`) |
| **Alert Evaluator** | `AlertEvaluator` | Rule engine | Generates `ENTANGLEMENT`, `GHOST_GEAR`, `LARGE_PILE` alerts based on co-occurrence of animals + trash |
| **Hotspot Aggregator** | `HotspotAggregator` | Sliding window (N=30 frames) | Deduplicates tracks across frames, scores debris clusters by weighted density |

### Hazard Weight Scores

| Class | Weight | Rationale |
|-------|--------|-----------|
| `trash_net`, `trash_rope` | 3.0 | Highest entanglement risk |
| `trash_tarp` | 2.5 | Large-area smothering |
| `trash_pipe`, `trash_wreckage` | 2.0 | Structural hazard |
| `trash_bag` | 1.5 | Ingestion risk |
| `trash_bottle`, `trash_cup`, `trash_clothing` | 1.0 | Standard debris |
| `trash_branch`, `trash_snack_wrapper` | 0.8 | Minor |

---

## 5. Database Layer

```mermaid
erDiagram
    survey_missions ||--o{ mission_incidents : "has"
    survey_missions ||--o{ debris_hotspots : "has"
    cleanup_zones ||--o{ cleanup_plans : "has"

    survey_missions {
        UUID id PK
        String name
        String video_source
        Float duration_sec
        Integer total_frames
        Integer total_unique_objects
        Float fps
        String model_format
        Float avg_latency_ms
        JSONB summary_by_class
        DateTime created_at
    }

    mission_incidents {
        UUID id PK
        UUID mission_id FK
        String incident_type
        String severity
        Integer frame_number
        Float timestamp_sec
        String snapshot_url
        String animal_species
        String gear_type
        Text description
        DateTime created_at
    }

    debris_hotspots {
        UUID id PK
        UUID mission_id FK
        Integer frame_number
        Integer debris_count
        Float weighted_score
        String dominant_class
        String snapshot_url
        DateTime created_at
    }

    cleanup_zones {
        UUID id PK
        String name
        String location_coords
        Float travel_cost_usd
        JSONB debris_inventory
        DateTime created_at
    }

    cleanup_plans {
        UUID id PK
        UUID zone_id FK
        Integer priority_rank
        Float estimated_min_hours
        Float estimated_max_hours
        Integer max_crew_required
        JSONB required_equipment
        Float estimated_min_cost
        Float estimated_max_cost
        String dispatch_status
        DateTime created_at
    }
```

### Portable Type System

| Custom Type | PostgreSQL | SQLite | Implementation |
|-------------|-----------|--------|----------------|
| `UUID` | `pg.UUID(as_uuid=True)` | `CHAR(36)` | `TypeDecorator` with bidirectional `uuid.UUID` coercion |
| `JSONB` | `pg.JSONB()` | `TEXT` (JSON serialized) | `TypeDecorator` with `json.dumps/loads` for SQLite |

### Database Selection Logic

```
Startup → TCP probe localhost:5432
  ├─ ✅ PostgreSQL reachable → asyncpg driver
  └─ ❌ Unreachable → SQLite fallback (bluesentinel.db)
```

---

## 6. End-to-End Workflow

### Workflow A: Single Image Scan

```mermaid
sequenceDiagram
    actor User
    participant FE as React Frontend
    participant API as FastAPI Backend
    participant AI as ONNX/PyTorch Engine
    participant DB as SQLAlchemy → SQLite

    User->>FE: Drop/select image file
    FE->>FE: addHistoryRecord() → localStorage
    FE->>FE: Navigate to UploadPage
    User->>FE: Click "Analyze"
    FE->>API: POST /detect (FormData)
    API->>AI: run_inference(PIL image)
    AI-->>API: detections[] with class, confidence, severity, box
    API-->>FE: JSON {image_b64, detections}
    FE->>FE: Filter out ROV class
    FE->>FE: Render annotated image + detection cards
    FE->>FE: addHistoryRecord() with thumbnail + inventory
    User->>FE: Click "Open Report"
    FE->>FE: ReportPanel → html2canvas → jsPDF
```

### Workflow B: ROV Video Simulation

```mermaid
sequenceDiagram
    actor User
    participant ROV as ROVSimulator
    participant API as FastAPI
    participant AI as AI Engine
    participant MAP as SchematicMap
    participant DB as Database

    User->>ROV: Load video + Start simulation
    ROV->>API: POST /missions/start
    API->>DB: INSERT survey_missions
    API-->>ROV: mission_id

    loop Every video frame
        ROV->>ROV: Canvas capture → JPEG blob
        ROV->>API: POST /detect?stream=true (binary)
        API->>AI: run_inference()
        AI-->>API: detections[]
        API-->>ROV: {detections} (no disk write)
        ROV->>ROV: Overlay bounding boxes on canvas
        ROV->>ROV: Track objects (IoU), score hotspots
        ROV->>MAP: Update pile rankings, sonar rings
    end

    User->>ROV: Stop simulation
    ROV->>API: POST /missions/finish (summary, hotspots)
    API->>DB: INSERT survey_missions, debris_hotspots
    API->>DB: UPSERT cleanup_zones (inventory)
    ROV->>ROV: addHistoryRecord() → localStorage
```

> **Removed:** Workflow C (Batch Image Stream) — `BatchStreamPage.jsx` and `useBatchStream.js` have been deleted. The WebSocket `/ws/batch` endpoint exists in the backend but is no longer connected to any frontend page.

### Workflow C: Cleanup Optimization

```mermaid
sequenceDiagram
    actor User
    participant CO as CleanupOptimizer
    participant API as FastAPI
    participant DB as Database

    User->>CO: Navigate from SchematicMap (with target data)
    CO->>API: GET /cleanup/zones
    API->>DB: SELECT cleanup_zones
    API-->>CO: zones[] with debris_inventory
    Note over CO: If backend unreachable, silently falls back to hardcoded demo data

    User->>CO: Select zone + Click "Optimize"
    CO->>API: POST /cleanup/optimize {zone_id}
    API->>API: Parametric cost engine (per-class hours × crew × $45/hr)
    API->>DB: INSERT cleanup_plans
    API-->>CO: {plan: crew, hours, equipment, cost}
    CO->>CO: Render operational breakdown
```

---

## 7. Technology Summary

### Backend Stack

| Layer | Technology | Version | Role |
|-------|-----------|---------|------|
| **Runtime** | Python | 3.10+ | Core language |
| **Web Framework** | FastAPI | 2.0 | Async HTTP/WS endpoints |
| **ASGI Server** | Uvicorn | Latest | Production-grade ASGI server |
| **AI Primary** | ONNX Runtime | Latest | C++ accelerated inference (CUDA/CPU) |
| **AI Fallback** | PyTorch + Torchvision | Latest | Python model execution |
| **Model Hub** | HuggingFace Hub | Latest | Weight auto-download |
| **ORM** | SQLAlchemy | 2.0 (async) | Database abstraction |
| **DB Driver (default)** | aiosqlite | Latest | Async SQLite |
| **DB Driver (prod)** | asyncpg | Latest | Async PostgreSQL |
| **Image Processing** | Pillow + NumPy | Latest | Image decode, resize, annotate |
| **WebSocket** | websockets | Latest | Real-time binary frame streaming |

### Frontend Stack

| Layer | Technology | Version | Role |
|-------|-----------|---------|------|
| **Build** | Vite | 8.3 | ESBuild dev server + Rollup production |
| **UI** | React | 19.3 | Component-based SPA |
| **Styling** | Vanilla CSS + Tailwind CSS | 4.3 | Design system + utility classes |
| **Animation** | Framer Motion | 13.4 | Declarative micro-animations |
| **Icons** | Lucide React | 1.47 | SVG icon library |
| **Maps** | Leaflet | 1.9 | Interactive geospatial hotspot visualization |
| **PDF** | jsPDF + html2canvas | 4.2 / 1.4 | Client-side report generation |
| **State** | React Hooks + Storage API | Native | sessionStorage (nav) + localStorage (history) |

### Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Containerization** | Docker Compose | Optional PostgreSQL + backend orchestration |
| **Model Weights** | HuggingFace `coding-droid-123/trashcan-dfine` | Auto-downloaded on first start |
| **File Storage** | Local filesystem (`/uploads/`) | Annotated images, incident snapshots |
| **CORS** | FastAPI middleware | `allow_origins=["*"]` for dev |

---

## 8. Directory Structure

```
blueSent-FE/
├── backend/
│   ├── main.py                    # FastAPI app (1,126 lines) — all endpoints
│   ├── models.py                  # SQLAlchemy ORM (5 tables)
│   ├── database.py                # Async engine + PG/SQLite auto-select
│   ├── batch_processor.py         # ZoneTracker, AlertEvaluator, HotspotAggregator
│   ├── requirements.txt           # Python dependencies
│   ├── bluesentinel.db            # SQLite database (auto-created)
│   ├── weights/
│   │   ├── best.onnx              # ONNX model (118 MB)
│   │   └── best_stg2.pth          # PyTorch checkpoint (158 MB)
│   ├── uploads/
│   │   └── incidents/             # Saved incident snapshots
│   ├── RT-DETRv4/                 # Model architecture source (PyTorch fallback)
│   ├── init_db.py                 # Database initialization script
│   ├── convert_pth_to_onnx.py     # Model conversion utility
│   └── start.bat                  # Windows startup script
│
├── frontend/
│   ├── package.json               # React 19 + Vite 8
│   ├── src/
│   │   ├── main.jsx               # React DOM entry — wraps <App> in <ErrorBoundary>
│   │   ├── App.jsx                # Root SPA router (session-persistent pages)
│   │   ├── config.js              # API_BASE_URL + WS_BASE_URL (env-var aware)
│   │   ├── index.css              # 25 KB design system
│   │   ├── components/
│   │   │   ├── NavBar.jsx         # ✅ Shared navigation bar (all pages)
│   │   │   ├── ErrorBoundary.jsx  # ✅ App-wide crash recovery UI
│   │   │   ├── HomePage.jsx       # Landing page + file drop zone
│   │   │   ├── UploadPage.jsx     # Single image scan dashboard
│   │   │   ├── ROVSimulator.jsx   # Video feed with live detection overlay
│   │   │   ├── SchematicMap.jsx   # Leaflet hotspot map + pile rankings
│   │   │   ├── CleanupOptimizer.jsx# Cleanup cost & logistics planner
│   │   │   ├── HistoryPage.jsx    # ✅ Scan session history browser
│   │   │   ├── ReportPanel.jsx    # PDF report generator
│   │   │   ├── AboutPage.jsx      # Project information
│   │   │   ├── ImageUploader.jsx  # Drag-and-drop image input
│   │   │   └── LoadingOverlay.jsx # Loading spinner overlay
│   │   │   # ❌ Removed: BatchStreamPage.jsx, DetectionPanel.jsx, AuthModal.jsx
│   │   ├── hooks/
│   │   │   └── useHistory.js      # ✅ localStorage scan history (read + write)
│   │   │   # ❌ Removed: useBatchStream.js
│   │   └── utils/
│   │       ├── drawing.js         # ✅ drawBoxes(), CLASS_COLORS, SEVERITY_COLOR, boxIoU()
│   │       └── alerts.js          # ✅ evaluateAlerts(), weightedScore()
│   └── dist/                      # Production build output
│
└── docs/                          # Documentation
```
