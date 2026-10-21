# 🌊 Ocean Depth Service

A high-performance FastAPI microservice that queries ocean depth (bathymetry) for any latitude/longitude coordinate using the **OpenTopography Global DEM API (SRTM15Plus dataset)**.

Includes **in-memory GeoTIFF raster processing (`rasterio`)**, **persistent SQLite caching**, **API key authentication**, and **free-tier cloud deployment readiness**.

---

## 📌 Features

* **SRTM15Plus Bathymetry:** High-resolution global digital elevation model providing ocean floor topography.
* **Positive Depth Values:** Subsea elevations are converted into intuitive positive depth values in meters; terrestrial points return `null`.
* **Longitude Normalization:** Automatically maps any longitude into standard `[-180.0, 180.0]` space.
* **Persistent SQLite Caching:** Caches results keyed by `(round(lat, 3), round(lon, 3))` in `depth_cache.db` so repeated queries are served instantly with zero OpenTopography API usage.
* **Strict API Key Security:** Protected by `x-api-key` header checked against a comma-separated list of keys in `APP_API_KEYS`.
* **Zero-Auth Health Check:** Exposes unauthenticated `GET /health` for cloud platform health probes.

---

## 🛠️ API Specification

### 1. `GET /health`
* **Auth:** None (Public)
* **Response:**
  ```json
  {"status": "ok"}
  ```

### 2. `GET /depth?lat=<float>&lon=<float>`
* **Headers:** `x-api-key: <string>` (Required)
* **Query Parameters:**
  * `lat` (float): Latitude between `-90.0` and `90.0`. Returns `400` if invalid.
  * `lon` (float): Longitude in decimal degrees (automatically normalized).
* **Responses:**
  * `200 OK` (Ocean):
    ```json
    {"lat": 17.0, "lon": 83.3, "depth_m": 88.0}
    ```
  * `200 OK` (Land):
    ```json
    {"lat": 20.0, "lon": 78.0, "depth_m": null}
    ```
  * `400 Bad Request`: Latitude out of bounds.
  * `401 Unauthorized`: Missing or invalid `x-api-key`.
  * `502 Bad Gateway`: OpenTopography upstream failure.

---

## 🚀 Local Setup & Installation

### 1. Clone & Navigate
```bash
cd ocean_depth_service
```

### 2. Create Virtual Environment
```bash
# Windows
python -m venv .venv
.venv\Scripts\activate

# Linux / macOS
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Copy the template and fill in your keys:
```bash
cp .env.example .env
```
Edit `.env`:
```ini
OT_API_KEY=your_opentopography_api_key_here
APP_API_KEYS=client_secret_key_1,client_secret_key_2
DEPTH_PAD=0.02
PORT=8000
```

### 5. Start Local Server
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation is available at: `http://localhost:8000/docs`

---

## 🧪 Testing

Execute requests using `curl`:

#### a) Ocean Depth Test (Expect positive `depth_m`):
```bash
curl -H "x-api-key: client_secret_key_1" "http://localhost:8000/depth?lat=17.0&lon=83.3"
```

#### b) Land Point Test (Expect `depth_m: null`):
```bash
curl -H "x-api-key: client_secret_key_1" "http://localhost:8000/depth?lat=20.0&lon=78.0"
```

#### c) Cache Verification (Repeat test 'a'):
```bash
# Should respond in ~1-5ms directly from SQLite cache:
curl -H "x-api-key: client_secret_key_1" "http://localhost:8000/depth?lat=17.0&lon=83.3"
```

#### d) Unauthorized Test (Expect `401 Unauthorized`):
```bash
curl "http://localhost:8000/depth?lat=17.0&lon=83.3"
```

#### e) Out of Bounds Latitude (Expect `400 Bad Request`):
```bash
curl -H "x-api-key: client_secret_key_1" "http://localhost:8000/depth?lat=95.0&lon=83.3"
```

---

## ☁️ Deployment (Free Tier Hosts: Render / Railway / Fly.io / Koyeb)

### Start Command
Configure your hosting provider's build & run settings:
* **Build Command:** `pip install -r requirements.txt`
* **Start Command:**
  ```bash
  uvicorn main:app --host 0.0.0.0 --port $PORT
  ```

### Environment Variables on Cloud Provider
Set the following environment variables in your cloud dashboard:
* `OT_API_KEY`: Your OpenTopography API Key.
* `APP_API_KEYS`: Comma-separated list of accepted client keys.
* `DEPTH_PAD`: `0.02`
* `PYTHONUNBUFFERED`: `1`

### Health Check Endpoint
* Path: `/health`
* Interval: 30s
