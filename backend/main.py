"""BlueSentinel Backend — High-performance FastAPI server for marine debris detection.

Supports:
- ONNX Runtime accelerated inference (with PyTorch fallback)
- ROV Survey Mission lifecycle management (survey_missions)
- Ecological Severity Assessment & Emergency Incident Triage (mission_incidents)
- Debris Hotspot Leaderboard (debris_hotspots)
- Cleanup Cost & Logistics Optimizer (cleanup_zones, cleanup_plans)
"""

import base64
import io
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Optional, List, Dict, Any

import asyncio
import json
import numpy as np
from PIL import Image, ImageDraw
import torch
import torch.nn as nn
import torchvision.transforms as T
from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException,
    Depends,
    Query,
    Body,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from huggingface_hub import hf_hub_download
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, engine, async_session
from models import (
    Base,
    SurveyMission,
    MissionIncident,
    DebrisHotspot,
    CleanupZone,
    CleanupPlan,
)
from batch_processor import (
    CLASS_WEIGHT,
    DEFAULT_WEIGHT,
    GHOST_GEAR,
    ANIMALS,
    ALERT_PILE_THRESHOLD,
    DEFAULT_WINDOW_SIZE,
    DEFAULT_GAP_THRESHOLD,
    SCORE_THRESHOLDS,
    parse_filename_zone_and_frame,
    ZoneTracker,
    AlertEvaluator,
    HotspotAggregator,
)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="BlueSentinel API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Configuration & Constants
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).parent.resolve()
REPO_DIR = BACKEND_DIR / "RT-DETRv4"
CONFIG_NAME = "dfine_hgnetv2_l_trashcan.yml"
CKPT_REPO = "coding-droid-123/trashcan-dfine"
CKPT_FILE = "best.pth"
ONNX_FILE = "best.onnx"
HF_CONFIG_BASE = "https://huggingface.co/spaces/coding-droid-123/BlueSentinel/raw/main"

UPLOADS_DIR = (BACKEND_DIR / "uploads").resolve()
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
INCIDENTS_DIR = UPLOADS_DIR / "incidents"
INCIDENTS_DIR.mkdir(parents=True, exist_ok=True)

WEIGHTS_DIR = (BACKEND_DIR / "weights").resolve()
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
LOCAL_CKPT_PATH = WEIGHTS_DIR / CKPT_FILE
LOCAL_ONNX_PATH = WEIGHTS_DIR / ONNX_FILE

CLASS_NAMES = [
    "rov", "plant", "animal_fish", "animal_starfish", "animal_shells",
    "animal_crab", "animal_eel", "animal_etc", "trash_clothing", "trash_pipe",
    "trash_bottle", "trash_bag", "trash_snack_wrapper", "trash_can", "trash_cup",
    "trash_container", "trash_unknown_instance", "trash_branch", "trash_wreckage",
    "trash_tarp", "trash_rope", "trash_net",
]

SEVERITY_MAPPING = {
    # Critical (severe marine entanglement & ghost gear)
    "trash_net": "critical",
    "trash_rope": "critical",
    "trash_tarp": "critical",

    # High (non-biodegradable plastics & chemical leaching)
    "trash_bottle": "high",
    "trash_bag": "high",
    "trash_container": "high",
    "trash_snack_wrapper": "high",
    "trash_cup": "high",
    "trash_pipe": "high",
    "trash_wreckage": "high",

    # Medium (metals, fabrics, general artificial debris)
    "trash_can": "medium",
    "trash_clothing": "medium",
    "trash_unknown_instance": "medium",

    # Low (natural biodegradable materials, organisms & equipment)
    "trash_branch": "low",
    "rov": "low",
    "plant": "low",
    "animal_fish": "low",
    "animal_starfish": "low",
    "animal_shells": "low",
    "animal_crab": "low",
    "animal_eel": "low",
    "animal_etc": "low",
}


def _get_severity(cls_name: str) -> str:
    """Return ecological severity category for a given class."""
    return SEVERITY_MAPPING.get(cls_name, "medium")


CONFIDENCE_THRESHOLD = 0.4
INFER_SIZE = 640
IMAGE_TRANSFORMS = T.Compose([T.Resize((INFER_SIZE, INFER_SIZE)), T.ToTensor()])

# Global in-memory model instances
ONNX_SESSION: Any = None
TORCH_MODEL: nn.Module | None = None
DEVICE: torch.device | None = None
CURRENT_ENGINE_TYPE = "None"
CKPT_PATH: str | None = None


class RTDETRWrapper(nn.Module):
    """In-memory wrapper for deployed PyTorch RT-DETRv4 model + postprocessor."""

    def __init__(self, model: nn.Module, postprocessor: nn.Module):
        super().__init__()
        self.model = model
        self.postprocessor = postprocessor

    def forward(self, images, orig_target_sizes):
        outputs = self.model(images)
        return self.postprocessor(outputs, orig_target_sizes)


# ---------------------------------------------------------------------------
# Startup & Model Initialization
# ---------------------------------------------------------------------------

def _load_onnx_session():
    """Load ONNX Runtime InferenceSession for ultra-fast C++ inference."""
    global ONNX_SESSION, CURRENT_ENGINE_TYPE
    if not LOCAL_ONNX_PATH.exists():
        return False

    try:
        import onnxruntime as ort
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        
        # Check available execution providers (prefer CUDA, fallback to CPU)
        providers = ["CPUExecutionProvider"]
        if "CUDAExecutionProvider" in ort.get_available_providers():
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]

        print(f"Loading ONNX Runtime engine from: {LOCAL_ONNX_PATH}")
        ONNX_SESSION = ort.InferenceSession(str(LOCAL_ONNX_PATH), sess_options=sess_options, providers=providers)
        CURRENT_ENGINE_TYPE = f"ONNX Runtime ({providers[0]})"
        print(f"ONNX Runtime engine loaded successfully! Provider: {providers[0]}")
        return True
    except Exception as e:
        print(f"Notice: ONNX Runtime initialization failed: {e}. Falling back to PyTorch.")
        return False


def _load_pytorch_model():
    """Fallback: Load PyTorch architecture and weights directly into RAM/VRAM."""
    global TORCH_MODEL, DEVICE, CURRENT_ENGINE_TYPE

    if str(REPO_DIR) not in sys.path:
        sys.path.insert(0, str(REPO_DIR))

    from engine.core import YAMLConfig

    cfg_path = str(REPO_DIR / "configs/dfine" / CONFIG_NAME)
    cfg = YAMLConfig(cfg_path, resume=CKPT_PATH)

    if "HGNetv2" in cfg.yaml_cfg:
        cfg.yaml_cfg["HGNetv2"]["pretrained"] = False

    checkpoint = torch.load(CKPT_PATH, map_location="cpu")
    state = checkpoint.get("ema", {}).get("module") or checkpoint["model"]
    cfg.model.load_state_dict(state)

    wrapped = RTDETRWrapper(cfg.model.deploy(), cfg.postprocessor.deploy())
    wrapped.eval()

    DEVICE = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    wrapped.to(DEVICE)

    if DEVICE.type == "cpu":
        import multiprocessing
        n_cores = multiprocessing.cpu_count()
        torch.set_num_threads(n_cores)
        torch.set_num_interop_threads(max(1, n_cores // 2))

    TORCH_MODEL = wrapped
    CURRENT_ENGINE_TYPE = f"PyTorch ({DEVICE})"
    print(f"PyTorch model successfully loaded in memory on {DEVICE}!")


def _resolve_checkpoint(force: bool = False) -> str:
    """Ensure the model weights exist locally in backend/weights/."""
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    force_download = force or (os.environ.get("FORCE_MODEL_DOWNLOAD", "0").lower() in ("1", "true", "yes"))

    if LOCAL_CKPT_PATH.exists() and LOCAL_CKPT_PATH.stat().st_size > 10 * 1024 * 1024 and not force_download:
        size_mb = LOCAL_CKPT_PATH.stat().st_size / (1024 * 1024)
        print(f"Using local cached model: {LOCAL_CKPT_PATH} ({size_mb:.1f} MB).")
        return str(LOCAL_CKPT_PATH)

    print(f"Local checkpoint not found at {LOCAL_CKPT_PATH}. Downloading from Hugging Face...")
    try:
        downloaded = hf_hub_download(repo_id=CKPT_REPO, filename=CKPT_FILE, local_dir=str(WEIGHTS_DIR))
        return str(downloaded)
    except Exception as e:
        print(f"Download warning: {e}")
        return str(LOCAL_CKPT_PATH)


@app.on_event("startup")
async def startup_event():
    global CKPT_PATH

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    INCIDENTS_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Initialize database tables
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("[DB] Database tables initialized/verified.")
    except Exception as db_e:
        print(f"[DB] Warning during table init: {db_e}")

    # 2. Prefer ONNX Runtime for 2x-3x faster inference
    if not _load_onnx_session():
        # Fallback to PyTorch
        CKPT_PATH = _resolve_checkpoint()
        _load_pytorch_model()

    print(f"BlueSentinel ready. Active AI Engine: {CURRENT_ENGINE_TYPE}")


@app.get("/model/status")
async def model_status():
    """Return status of the local model weights and active engine."""
    onnx_exists = LOCAL_ONNX_PATH.exists()
    pth_exists = LOCAL_CKPT_PATH.exists()
    return {
        "status": "ready" if (ONNX_SESSION is not None or TORCH_MODEL is not None) else "initializing",
        "engine_type": CURRENT_ENGINE_TYPE,
        "onnx_available": onnx_exists,
        "onnx_size_mb": round(LOCAL_ONNX_PATH.stat().st_size / (1024 * 1024), 2) if onnx_exists else 0,
        "pth_available": pth_exists,
        "pth_size_mb": round(LOCAL_CKPT_PATH.stat().st_size / (1024 * 1024), 2) if pth_exists else 0,
        "infer_size": INFER_SIZE,
    }


# Serve saved annotated images & incident snapshots
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


# ---------------------------------------------------------------------------
# Detection Pipeline (ONNX Accelerated with PyTorch Fallback)
# ---------------------------------------------------------------------------

def run_inference(im_pil: Image.Image, conf_threshold: float = CONFIDENCE_THRESHOLD) -> List[Dict[str, Any]]:
    """Synchronously run detection inference on a PIL image using active ONNX session or PyTorch model."""
    if ONNX_SESSION is None and TORCH_MODEL is None:
        raise RuntimeError("Model engine is still initializing.")

    w, h = im_pil.size
    orig_size_np = np.array([[w, h]], dtype=np.int64)
    detections = []

    # Path A: Fast ONNX Runtime Inference
    if ONNX_SESSION is not None:
        img_resized = im_pil.resize((INFER_SIZE, INFER_SIZE), Image.Resampling.BILINEAR)
        img_arr = np.array(img_resized, dtype=np.float32) / 255.0
        img_arr = np.transpose(img_arr, (2, 0, 1))  # (3, 640, 640)
        im_data_np = np.expand_dims(img_arr, axis=0)  # (1, 3, 640, 640)

        outputs = ONNX_SESSION.run(
            None,
            {"images": im_data_np, "orig_target_sizes": orig_size_np}
        )
        labels, boxes, scores = outputs

        scr = scores[0]
        mask = scr > conf_threshold
        lab = labels[0][mask]
        box = boxes[0][mask]
        scrs = scr[mask]

        for j, b in enumerate(box):
            cls_id = int(lab[j])
            cls_name = CLASS_NAMES[cls_id] if 0 <= cls_id < len(CLASS_NAMES) else str(cls_id)
            conf = round(float(scrs[j]), 2)
            coords = [round(float(x), 2) for x in b]

            detections.append({
                "class": cls_name,
                "confidence": conf,
                "severity": _get_severity(cls_name),
                "box": coords,
            })

    # Path B: PyTorch Fallback
    else:
        orig_size = torch.tensor([[w, h]]).to(DEVICE)
        im_data = IMAGE_TRANSFORMS(im_pil).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            if "cuda" in str(DEVICE):
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    output = TORCH_MODEL(im_data, orig_size)
            else:
                output = TORCH_MODEL(im_data, orig_size)

        labels, boxes, scores = output
        scr = scores[0]
        mask = scr > conf_threshold
        lab = labels[0][mask]
        box = boxes[0][mask]
        scrs = scr[mask]

        for j, b in enumerate(box):
            cls_id = int(lab[j].item())
            cls_name = CLASS_NAMES[cls_id] if 0 <= cls_id < len(CLASS_NAMES) else str(cls_id)
            conf = round(float(scrs[j].item()), 2)
            coords = [round(float(x), 2) for x in b]

            detections.append({
                "class": cls_name,
                "confidence": conf,
                "severity": _get_severity(cls_name),
                "box": coords,
            })

    return detections


@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    stream: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Run real-time inference across uploaded frame or video stream."""
    if ONNX_SESSION is None and TORCH_MODEL is None:
        raise HTTPException(status_code=503, detail="Model engine is still initializing.")

    try:
        content = await file.read()
        im_pil = Image.open(io.BytesIO(content)).convert("RGB")
        detections = run_inference(im_pil, CONFIDENCE_THRESHOLD)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

    # In stream mode (e.g. ROV Simulator), skip disk and DB writes for zero-latency streaming
    if stream:
        return JSONResponse({
            "batch_id": None,
            "engine": CURRENT_ENGINE_TYPE,
            "detections": detections,
        })

    # Legacy static image upload persistence (backward compatibility)
    batch_id = uuid.uuid4()
    buf = io.BytesIO()
    im_pil.save(buf, format="JPEG", quality=90)
    image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return JSONResponse({
        "batch_id": str(batch_id),
        "engine": CURRENT_ENGINE_TYPE,
        "image": image_b64,
        "detections": detections,
    })


# ---------------------------------------------------------------------------
# Feature 1 & 2: Real-time Batch Processing WebSocket (/ws/batch)
# ---------------------------------------------------------------------------

@app.websocket("/ws/batch")
async def ws_batch(websocket: WebSocket):
    """High-performance WebSocket endpoint for batch image streaming and live schematic map updates.

    Protocol per image:
    1. Client sends JSON text message: `{"filename": str, "conf": float, "gap_threshold": int}`
       or finish message: `{"type": "finish"}`.
    2. Client sends binary image bytes.
    3. Server responds with JSON:
       `{"type": "frame", "filename": str, "zone": str, "frame": int, "tracks": [...], "alerts": [...], "hotspots": {...}}`
    """
    await websocket.accept()
    loop = asyncio.get_running_loop()

    # Session-isolated multi-zone state
    zone_trackers: Dict[str, ZoneTracker] = {}
    alert_evaluator = AlertEvaluator()
    aggregator = HotspotAggregator(window_size=DEFAULT_WINDOW_SIZE)
    processed_count = 0
    start_time = time.time()

    try:
        while True:
            # 1. Receive JSON control/header message
            msg_text = await websocket.receive_text()
            try:
                msg_json = json.loads(msg_text)
            except Exception:
                await websocket.send_json({
                    "type": "error",
                    "filename": "unknown",
                    "message": "Invalid JSON header format.",
                })
                continue

            msg_type = msg_json.get("type") or msg_json.get("action")

            # Finish / Done signal
            if msg_type in ("finish", "done"):
                elapsed = max(0.1, time.time() - start_time)
                all_snapshots = aggregator.get_all_snapshots()

                # Calculate total unique objects across all zones
                total_unique_objects = sum(
                    sum(h["object_count"] for h in z_info.get("hotspots", []))
                    for z_info in all_snapshots.values()
                )
                summary_by_class: Dict[str, int] = {}
                for z_info in all_snapshots.values():
                    for h in z_info.get("hotspots", []):
                        for cls_name, cnt in h.get("classes", {}).items():
                            summary_by_class[cls_name] = summary_by_class.get(cls_name, 0) + cnt

                # Persist to database if available
                mission_id = uuid.uuid4()
                try:
                    async with async_session() as session:
                        # 1. Survey mission
                        mission = SurveyMission(
                            id=mission_id,
                            name=f"Batch Survey {time.strftime('%Y-%m-%d %H:%M')}",
                            video_source="batch_stream",
                            duration_sec=round(elapsed, 1),
                            zones=len(all_snapshots),
                            total_unique_objects=total_unique_objects,
                            fps=round(processed_count / elapsed, 1) if elapsed > 0 else 0.0,
                            summary_by_class=summary_by_class,
                        )
                        session.add(mission)

                        # 2. Persist hotspots
                        for zone_name, z_info in all_snapshots.items():
                            for h_idx, h in enumerate(z_info.get("hotspots", [])):
                                session.add(DebrisHotspot(
                                    id=uuid.uuid4(),
                                    mission_id=mission_id,
                                    zone=f"{zone_name}_w{h_idx}",
                                    debris_count=h["object_count"],
                                    weighted_score=h["score"],
                                    dominant_class=h.get("dominant_class"),
                                    snapshot_url=None,
                                ))

                            # 3. Upsert CleanupZone so it is visible in CleanupOptimizer
                            zone_res = await session.execute(
                                select(CleanupZone).where(CleanupZone.name == zone_name)
                            )
                            existing_zone = zone_res.scalar_one_or_none()
                            zone_inventory = [
                                {"class": cls_name, "count": {"min": cnt, "max": int(cnt * 1.5)}}
                                for cls_name, cnt in summary_by_class.items()
                                if cls_name.startswith("trash_")
                            ]
                            if existing_zone:
                                existing_zone.debris_inventory = zone_inventory
                            else:
                                new_zone = CleanupZone(
                                    id=uuid.uuid4(),
                                    name=zone_name,
                                    location_coords=f"Transect frames {z_info['min_frame']}–{z_info['max_frame']}",
                                    travel_cost_usd=250.0,
                                    debris_inventory=zone_inventory,
                                )
                                session.add(new_zone)

                        await session.commit()
                except Exception as db_err:
                    print(f"Notice: /ws/batch DB persistence skipped (DB offline?): {db_err}")

                await websocket.send_json({
                    "type": "done",
                    "summary": {
                        "mission_id": str(mission_id),
                        "total_frames": processed_count,
                        "total_unique_objects": total_unique_objects,
                        "zones_count": len(all_snapshots),
                        "duration_sec": round(elapsed, 1),
                        "fps": round(processed_count / elapsed, 1),
                        "summary_by_class": summary_by_class,
                        "hotspots": all_snapshots,
                    }
                })
                break

            # Dynamic window size adjustment
            if msg_type == "set_window_size":
                new_w = int(msg_json.get("window_size", DEFAULT_WINDOW_SIZE))
                aggregator.set_window_size(new_w)
                await websocket.send_json({
                    "type": "window_size_updated",
                    "window_size": aggregator.window_size,
                    "hotspots": aggregator.get_all_snapshots(),
                })
                continue

            # 2. Extract image metadata
            filename = msg_json.get("filename", f"frame_{processed_count}.jpg")
            conf_val = float(msg_json.get("conf", CONFIDENCE_THRESHOLD))
            gap_threshold = int(msg_json.get("gap_threshold", DEFAULT_GAP_THRESHOLD))

            # 3. Receive binary image bytes
            try:
                image_bytes = await websocket.receive_bytes()
            except Exception as bin_err:
                await websocket.send_json({
                    "type": "error",
                    "filename": filename,
                    "message": f"Expected binary image payload: {str(bin_err)}",
                })
                continue

            # 4. Offload inference to thread pool
            try:
                def _process_image_bytes():
                    pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                    # Sensible safety limit for oversized images
                    max_dim = 1920
                    if max(pil_img.size) > max_dim:
                        pil_img.thumbnail((max_dim, max_dim), Image.Resampling.BILINEAR)
                    return run_inference(pil_img, conf_val)

                raw_detections = await loop.run_in_executor(None, _process_image_bytes)

                # Parse zone & frame
                zone, frame_num, parse_warning = parse_filename_zone_and_frame(filename)

                # Isolate tracker per zone
                if zone not in zone_trackers:
                    zone_trackers[zone] = ZoneTracker(zone=zone)
                tracker = zone_trackers[zone]

                # Update tracks (handles gap > gap_threshold)
                tracks = tracker.update(raw_detections, frame_num, gap_threshold=gap_threshold)

                # Evaluate alerts
                frame_alerts = alert_evaluator.evaluate(tracks, zone, frame_num)

                # Add to aggregator
                aggregator.add_frame_tracks(zone, frame_num, tracks)

                processed_count += 1

                # Send live frame result
                await websocket.send_json({
                    "type": "frame",
                    "filename": filename,
                    "zone": zone,
                    "frame": frame_num,
                    "tracks": tracks,
                    "alerts": frame_alerts,
                    "hotspots": aggregator.get_all_snapshots(),
                    "warning": parse_warning,
                })

            except Exception as frame_err:
                await websocket.send_json({
                    "type": "error",
                    "filename": filename,
                    "message": str(frame_err),
                })

    except WebSocketDisconnect:
        pass
    except Exception as ws_err:
        print(f"Notice: /ws/batch exception: {ws_err}")


# ---------------------------------------------------------------------------
# Zone Renaming Endpoint (feeds CleanupOptimizer)
# ---------------------------------------------------------------------------

@app.post("/cleanup/zones/rename")
async def rename_cleanup_zone(
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Rename a cleanup zone (e.g. from vid_00001 to 'Harbor Shelf B') in cleanup_zones."""
    old_name = payload.get("old_name")
    new_name = payload.get("new_name")
    zone_id = payload.get("zone_id")

    if not new_name:
        raise HTTPException(status_code=400, detail="new_name is required.")

    try:
        zone = None
        if zone_id:
            try:
                zid = uuid.UUID(str(zone_id))
                res = await db.execute(select(CleanupZone).where(CleanupZone.id == zid))
                zone = res.scalar_one_or_none()
            except ValueError:
                pass

        if not zone and old_name:
            res = await db.execute(select(CleanupZone).where(CleanupZone.name == old_name))
            zone = res.scalar_one_or_none()

        if zone:
            zone.name = new_name
        else:
            zone = CleanupZone(
                id=uuid.uuid4(),
                name=new_name,
                location_coords=payload.get("location", "Surveyed coordinates"),
                travel_cost_usd=payload.get("travel_cost", 250.0),
                debris_inventory=payload.get("inventory", []),
            )
            db.add(zone)

        await db.commit()
        return JSONResponse({"status": "success", "zone": zone.to_dict()})
    except Exception as e:
        print(f"Warning: /cleanup/zones/rename DB error: {e}")
        return JSONResponse({"status": "degraded", "message": f"DB error: {e}"}, status_code=503)


# ---------------------------------------------------------------------------
# Feature 1: ROV Survey Missions (survey_missions)
# ---------------------------------------------------------------------------

@app.post("/missions/start")
async def start_mission(
    payload: Dict[str, Any] = Body(default={}),
    db: AsyncSession = Depends(get_db),
):
    """Register a new ROV survey mission at session start; returns a mission_id for live incident tagging."""
    try:
        mission_id = uuid.uuid4()
        name = payload.get("name") or f"ROV Survey {time.strftime('%Y-%m-%d %H:%M')}"
        video_source = payload.get("video_source", "recorded_stream")

        mission = SurveyMission(
            id=mission_id,
            name=name,
            video_source=video_source,
        )
        db.add(mission)
        await db.commit()

        return JSONResponse({
            "status": "started",
            "mission_id": str(mission_id),
            "message": "Survey mission started.",
        })
    except Exception as e:
        # DB may be offline — return 503 so the frontend silently degrades
        print(f"Warning: /missions/start DB error (DB offline?): {e}")
        return JSONResponse(
            {"status": "degraded", "mission_id": None, "message": "Database unavailable."},
            status_code=503,
        )


@app.post("/missions/finish")
async def finish_mission(
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Save completed ROV survey mission summary, hotspots, and update zone inventory."""
    try:
        mission_id = uuid.uuid4()
        name = payload.get("name") or f"ROV Survey {time.strftime('%Y-%m-%d %H:%M')}"
        video_source = payload.get("video_source", "recorded_stream")
        duration_sec = float(payload.get("duration_sec", 0.0))
        zones = int(payload.get("zones", 0))
        total_unique_objects = int(payload.get("total_unique_objects", 0))
        fps = float(payload.get("fps", 0.0))
        avg_latency_ms = float(payload.get("avg_latency_ms", 0.0))
        summary_by_class = payload.get("summary_by_class", {})

        mission = SurveyMission(
            id=mission_id,
            name=name,
            video_source=video_source,
            duration_sec=duration_sec,
            zones=zones,
            total_unique_objects=total_unique_objects,
            fps=fps,
            avg_latency_ms=avg_latency_ms,
            summary_by_class=summary_by_class,
        )
        db.add(mission)

        # Save Top Debris Hotspots
        hotspots_data = payload.get("hotspots", [])
        for idx, hs in enumerate(hotspots_data):
            hotspot_id = uuid.uuid4()
            snapshot_url = None

            # Optional snapshot base64
            if hs.get("snapshot_b64"):
                try:
                    img_data = base64.b64decode(hs["snapshot_b64"])
                    hs_filename = f"hotspot_{hotspot_id}.jpg"
                    (INCIDENTS_DIR / hs_filename).write_bytes(img_data)
                    snapshot_url = f"/uploads/incidents/{hs_filename}"
                except Exception:
                    pass

            db.add(DebrisHotspot(
                id=hotspot_id,
                mission_id=mission_id,
                zone=str(hs.get("zone", f"zone_{idx}")),
                debris_count=int(hs.get("debris_count", 0)),
                weighted_score=float(hs.get("weighted_score", 0.0)),
                dominant_class=hs.get("dominant_class"),
                snapshot_url=snapshot_url,
            ))

        # Optional: Update target cleanup zone inventory with mission findings
        zone_id_str = payload.get("zone_id")
        if zone_id_str:
            try:
                zone_uuid = uuid.UUID(zone_id_str)
                zone_res = await db.execute(select(CleanupZone).where(CleanupZone.id == zone_uuid))
                zone = zone_res.scalar_one_or_none()
                if zone:
                    inv = zone.debris_inventory or []
                    # Merge class counts
                    inv_map = {item["class"]: item for item in inv if "class" in item}
                    for cls, count in summary_by_class.items():
                        if cls.startswith("trash_"):
                            if cls in inv_map:
                                curr_min = inv_map[cls]["count"].get("min", 0)
                                curr_max = inv_map[cls]["count"].get("max", 0)
                                inv_map[cls]["count"] = {"min": curr_min + count, "max": curr_max + int(count * 1.5)}
                            else:
                                inv_map[cls] = {"class": cls, "count": {"min": count, "max": int(count * 1.5)}}
                    zone.debris_inventory = list(inv_map.values())
            except Exception as e:
                print(f"Warning: failed to update zone inventory: {e}")

        await db.commit()
        return JSONResponse({
            "status": "success",
            "mission_id": str(mission_id),
            "message": "Survey mission logged successfully.",
        })
    except Exception as e:
        print(f"Warning: /missions/finish DB error (DB offline?): {type(e).__name__}: {e}")
        return JSONResponse(
            {"status": "degraded", "mission_id": None, "message": "Database unavailable — mission not persisted."},
            status_code=503,
        )


@app.get("/missions")
async def list_missions(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Return past ROV survey missions, newest first."""
    res = await db.execute(
        select(SurveyMission).order_by(desc(SurveyMission.created_at)).limit(limit)
    )
    missions = res.scalars().all()
    return JSONResponse({"missions": [m.to_dict() for m in missions]})


@app.get("/missions/{mission_id}")
async def get_mission_detail(mission_id: str, db: AsyncSession = Depends(get_db)):
    """Return detailed mission record with critical incidents and hotspots."""
    try:
        mid = uuid.UUID(mission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid mission_id format.")

    res = await db.execute(select(SurveyMission).where(SurveyMission.id == mid))
    mission = res.scalar_one_or_none()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found.")

    inc_res = await db.execute(select(MissionIncident).where(MissionIncident.mission_id == mid))
    incidents = inc_res.scalars().all()

    hs_res = await db.execute(select(DebrisHotspot).where(DebrisHotspot.mission_id == mid))
    hotspots = hs_res.scalars().all()

    return JSONResponse({
        **mission.to_dict(),
        "incidents": [inc.to_dict() for inc in incidents],
        "hotspots": [hs.to_dict() for hs in hotspots],
    })


# ---------------------------------------------------------------------------
# Feature 2: Severity Incidents & Emergency Triage (mission_incidents)
# ---------------------------------------------------------------------------

@app.post("/incidents")
async def log_incident(
    mission_id: Optional[str] = Form(None),
    incident_type: str = Form(...),  # ENTANGLEMENT, GHOST_GEAR, LARGE_PILE
    severity: str = Form("critical"),
    zone: str = Form(...),
    timestamp_sec: float = Form(0.0),
    description: str = Form(...),
    snapshot: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
):
    """Log an urgent ecological emergency event with snapshot thumbnail."""
    try:
        incident_id = uuid.uuid4()
        snapshot_url = None

        if snapshot:
            filename = f"incident_{incident_id}.jpg"
            save_path = INCIDENTS_DIR / filename
            content = await snapshot.read()
            save_path.write_bytes(content)
            snapshot_url = f"/uploads/incidents/{filename}"

        # Associate with existing mission or fallback
        m_uuid = None
        if mission_id:
            try:
                m_uuid = uuid.UUID(mission_id)
            except ValueError:
                pass

        # If no mission ID provided, assign or create an active mission
        if not m_uuid:
            latest_res = await db.execute(
                select(SurveyMission).order_by(desc(SurveyMission.created_at)).limit(1)
            )
            latest_mission = latest_res.scalar_one_or_none()
            if latest_mission:
                m_uuid = latest_mission.id
            else:
                m_uuid = uuid.uuid4()
                db.add(SurveyMission(
                    id=m_uuid,
                    name=f"Survey {time.strftime('%Y-%m-%d')}",
                    video_source="live_feed",
                ))

        incident = MissionIncident(
            id=incident_id,
            mission_id=m_uuid,
            incident_type=incident_type,
            severity=severity,
            zone=zone,
            timestamp_sec=timestamp_sec,
            snapshot_url=snapshot_url,
            description=description,
        )
        db.add(incident)
        await db.commit()

        return JSONResponse({
            "status": "success",
            "incident_id": str(incident_id),
            "snapshot_url": snapshot_url,
        })
    except Exception as e:
        # DB offline — log to console and return 503 so frontend catch() handles it silently
        print(f"Warning: /incidents DB error (DB offline?): {type(e).__name__}: {e}")
        return JSONResponse(
            {"status": "degraded", "message": "Database unavailable — incident not persisted."},
            status_code=503,
        )


@app.get("/incidents")
async def list_incidents(
    severity: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List recent high-priority incidents, newest first."""
    query = select(MissionIncident).order_by(desc(MissionIncident.created_at))
    if severity:
        query = query.where(MissionIncident.severity == severity)
    query = query.limit(limit)

    res = await db.execute(query)
    incidents = res.scalars().all()
    return JSONResponse({"incidents": [inc.to_dict() for inc in incidents]})


# ---------------------------------------------------------------------------
# Feature 3: Cleanup Optimizer (cleanup_zones, cleanup_plans)
# ---------------------------------------------------------------------------

COST_PER_CREW_HOUR = 45.0  # USD assumption

DEFAULT_ASSUMPTIONS = {
    "trash_net": {"minH": 0.8, "maxH": 1.5, "crew": 2, "equipment": ["cutters", "lift bags"]},
    "trash_rope": {"minH": 0.3, "maxH": 0.6, "crew": 1, "equipment": ["cutters"]},
    "trash_tarp": {"minH": 0.4, "maxH": 0.8, "crew": 2, "equipment": ["lift bags"]},
    "trash_pipe": {"minH": 0.5, "maxH": 1.0, "crew": 2, "equipment": ["lift bags"]},
    "trash_wreckage": {"minH": 1.5, "maxH": 3.0, "crew": 3, "equipment": ["lift bags", "cutting tools"]},
    "trash_bag": {"minH": 0.1, "maxH": 0.2, "crew": 1, "equipment": ["collection sacks"]},
    "trash_bottle": {"minH": 0.05, "maxH": 0.1, "crew": 1, "equipment": ["collection sacks"]},
    "trash_cup": {"minH": 0.05, "maxH": 0.1, "crew": 1, "equipment": ["collection sacks"]},
    "trash_can": {"minH": 0.1, "maxH": 0.2, "crew": 1, "equipment": ["collection sacks"]},
    "trash_container": {"minH": 0.3, "maxH": 0.6, "crew": 1, "equipment": ["collection sacks"]},
    "trash_clothing": {"minH": 0.1, "maxH": 0.2, "crew": 1, "equipment": ["collection sacks"]},
    "trash_snack_wrapper": {"minH": 0.05, "maxH": 0.1, "crew": 1, "equipment": ["collection sacks"]},
    "default": {"minH": 0.2, "maxH": 0.4, "crew": 1, "equipment": ["collection sacks"]},
}


@app.get("/cleanup/zones")
async def get_cleanup_zones(db: AsyncSession = Depends(get_db)):
    """Fetch surveyed marine zones and their active debris inventory."""
    res = await db.execute(select(CleanupZone).order_by(CleanupZone.name))
    zones = res.scalars().all()

    def zone_with_alias(z):
        """Add a 'location' alias for frontend compatibility."""
        d = z.to_dict()
        d["location"] = z.location_coords  # frontend uses z.location
        return d

    return JSONResponse({"zones": [zone_with_alias(z) for z in zones]})


@app.post("/cleanup/optimize")
async def generate_cleanup_plan(
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Compute parametric diver hours, equipment, and cost, and save cleanup plan."""
    zone_id_str = payload.get("zone_id")
    if not zone_id_str:
        raise HTTPException(status_code=400, detail="zone_id is required.")

    try:
        zid = uuid.UUID(zone_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid zone_id format.")

    res = await db.execute(select(CleanupZone).where(CleanupZone.id == zid))
    zone = res.scalar_one_or_none()
    if not zone:
        raise HTTPException(status_code=404, detail="Cleanup zone not found.")

    assumptions = payload.get("assumptions", DEFAULT_ASSUMPTIONS)
    inventory = zone.debris_inventory or []

    min_hours = 0.0
    max_hours = 0.0
    max_crew = 1
    equipment_set = set()

    for item in inventory:
        cls = item.get("class", "default")
        cnt = item.get("count", {})
        min_c = float(cnt.get("min", 1))
        max_c = float(cnt.get("max", 1))

        p = assumptions.get(cls, assumptions.get("default", DEFAULT_ASSUMPTIONS["default"]))
        min_hours += p["minH"] * min_c
        max_hours += p["maxH"] * max_c
        if p["crew"] > max_crew:
            max_crew = p["crew"]
        for eq in p.get("equipment", []):
            equipment_set.add(eq)

    travel_cost = zone.travel_cost_usd or 0.0
    min_cost = round(min_hours * max_crew * COST_PER_CREW_HOUR + travel_cost)
    max_cost = round(max_hours * max_crew * COST_PER_CREW_HOUR + travel_cost)

    plan_id = uuid.uuid4()
    plan = CleanupPlan(
        id=plan_id,
        zone_id=zid,
        priority_rank=payload.get("priority_rank", 1),
        estimated_min_hours=round(min_hours, 1),
        estimated_max_hours=round(max_hours, 1),
        max_crew_required=max_crew,
        required_equipment=sorted(list(equipment_set)),
        estimated_min_cost=float(min_cost),
        estimated_max_cost=float(max_cost),
        dispatch_status="approved" if payload.get("auto_dispatch") else "draft",
    )
    db.add(plan)
    await db.commit()

    return JSONResponse({
        "status": "success",
        "plan_id": str(plan_id),
        "plan": plan.to_dict(),
    })


@app.get("/cleanup/plans")
async def list_cleanup_plans(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List generated cleanup work orders."""
    res = await db.execute(
        select(CleanupPlan).order_by(desc(CleanupPlan.created_at)).limit(limit)
    )
    plans = res.scalars().all()
    return JSONResponse({"plans": [p.to_dict() for p in plans]})


# ---------------------------------------------------------------------------
# Legacy endpoints (retained for backward compatibility)
# ---------------------------------------------------------------------------

@app.get("/history")
async def get_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * limit
    count_result = await db.execute(select(func.count(SurveyMission.id)))
    total = count_result.scalar() or 0
    result = await db.execute(
        select(SurveyMission).order_by(desc(SurveyMission.created_at)).offset(offset).limit(limit)
    )
    missions = result.scalars().all()
    return JSONResponse({
        "total": total,
        "page": page,
        "limit": limit,
        "scans": [m.to_dict() for m in missions],
    })


@app.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    mission_count_res = await db.execute(select(func.count(SurveyMission.id)))
    total_missions = mission_count_res.scalar() or 0
    inc_count_res = await db.execute(select(func.count(MissionIncident.id)))
    total_incidents = inc_count_res.scalar() or 0

    return JSONResponse({
        "total_scans": total_missions,
        "total_missions": total_missions,
        "total_incidents": total_incidents,
        "active_engine": CURRENT_ENGINE_TYPE,
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
