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
│   │   │   ├── DetectionPanel.jsx   # Interactive canvas, filters, debris list & threat meter
│   │   │   ├── ImageUploader.jsx    # Drag-and-drop dropzone, metadata & 1-click samples
│   │   │   ├── LoadingOverlay.jsx   # Dual-ring inference spinner
│   │   │   └── ReportPanel.jsx      # Official printable / downloadable PDF audit modal
│   │   ├── App.jsx                  # Main dashboard layout (60-30-10 color scheme)
│   │   ├── index.css                # Marine light design system tokens
│   │   └── main.jsx                 # Application entrypoint
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── backend/                      # FastAPI Server + Deep Learning + PostgreSQL Pipeline
│   ├── docker-compose.yml        # PostgreSQL 18 + pgvector container definition
│   ├── requirements.txt          # Python dependencies
│   ├── database.py               # Async SQLAlchemy engine & session factory
│   ├── models.py                 # ORM models (scan_batches, detections)
│   ├── init_db.py                # Schema migration & pgvector activation script
│   ├── main.py                   # FastAPI app, model loader, inference & history APIs
│   ├── start.bat                 # One-click startup script (Windows)
│   └── uploads/                  # Decoupled storage for model-annotated JPGs
│
├── .gitignore                    # Production Git ignore rules
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

### Step 3: Start the Backend Server
Run the startup script:

```bash
start.bat
```
* Or manually via Python:
  ```bash
  venv\Scripts\activate
  python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
  ```
The FastAPI server will be live at **`http://localhost:8000`**.  
Interactive Swagger API documentation: **`http://localhost:8000/docs`**.

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
| `GET` | `/history` | Paginated list of past scans with metadata and total detection counts. |
| `GET` | `/history/{batch_id}` | Detailed scan record with bounding boxes, confidence scores, and classes. |
| `GET` | `/stats` | Aggregate metrics (total scans, total detections, class distribution). |
| `GET` | `/uploads/{filename}` | Direct static file access to saved annotated images. |
| `GET` | `/docs` | Interactive Swagger UI documentation. |

---

## 🗄️ Database Schema

### `scan_batches`
Represents an image ingestion and inference session.
* `id` (`UUID`, PK)
* `filename` (`VARCHAR(255)`) — Original uploaded file name
* `image_path` (`VARCHAR(512)`) — Storage path to annotated output
* `total_detections` (`INTEGER`) — Cached count of detected items
* `gps_lat` / `gps_lon` (`FLOAT`, nullable) — Geofence coordinates
* `geofence_zone` (`VARCHAR(100)`, nullable) — Coastal sector
* `embedding` (`vector(512)`, nullable) — Feature embedding for visual similarity
* `created_at` (`TIMESTAMPTZ`)

### `detections`
Represents an individual classified debris or marine life target.
* `id` (`UUID`, PK)
* `batch_id` (`UUID`, FK ➔ `scan_batches.id` ON DELETE CASCADE)
* `class_name` (`VARCHAR(100)`) — TrashCan ontology label (e.g. `trash_bottle`, `trash_net`)
* `confidence` (`REAL`) — Model score (0.0 to 1.0)
* `bbox_x1`, `bbox_y1`, `bbox_x2`, `bbox_y2` (`REAL`) — Bounding box coordinates
* `created_at` (`TIMESTAMPTZ`)

---

## 🎯 Supported Classes (TrashCan Dataset)
`rov`, `plant`, `animal_fish`, `animal_starfish`, `animal_shells`, `animal_crab`, `animal_eel`, `animal_etc`, `trash_clothing`, `trash_pipe`, `trash_bottle`, `trash_bag`, `trash_snack_wrapper`, `trash_can`, `trash_cup`, `trash_container`, `trash_unknown_instance`, `trash_branch`, `trash_wreckage`, `trash_tarp`, `trash_rope`, `trash_net`.

---

## 📄 License
This project is licensed under the MIT License.
