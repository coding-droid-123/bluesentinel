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
from typing import Optional, List, Dict, Any, Tuple

import asyncio
import json
import requests as http_requests
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
from sqlalchemy import select, func, desc, delete
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
CONFIG_NAME = "dfine_hgnetv2_s_trashcan.yml"
CKPT_REPO = "coding-droid-123/trashcan-dfine"
CKPT_FILE = "best_stg2.pth"
ONNX_FILE = "bs-s.onnx"
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


from convert_onnx_to_engine import check_gpu_and_tensorrt_environment, build_tensorrt_engine


@app.get("/model/status")
async def model_status():
    """Return status of the local model weights and active engine."""
    onnx_exists = LOCAL_ONNX_PATH.exists()
    pth_exists = LOCAL_CKPT_PATH.exists()
    engine_exists = (WEIGHTS_DIR / "bs-s.engine").exists() or (WEIGHTS_DIR / "best.engine").exists()
    return {
        "status": "ready" if (ONNX_SESSION is not None or TORCH_MODEL is not None) else "initializing",
        "engine_type": CURRENT_ENGINE_TYPE,
        "onnx_available": onnx_exists,
        "onnx_size_mb": round(LOCAL_ONNX_PATH.stat().st_size / (1024 * 1024), 2) if onnx_exists else 0,
        "pth_available": pth_exists,
        "pth_size_mb": round(LOCAL_CKPT_PATH.stat().st_size / (1024 * 1024), 2) if pth_exists else 0,
        "engine_available": engine_exists,
        "infer_size": INFER_SIZE,
    }


@app.get("/model/tensorrt/device-info")
async def tensorrt_device_info():
    """Query host hardware capabilities, GPU architecture, and TensorRT availability."""
    return check_gpu_and_tensorrt_environment(BACKEND_DIR)


@app.post("/model/tensorrt/convert")
async def convert_to_tensorrt(payload: Dict[str, Any] = Body(default={})):
    """Trigger compilation of ONNX model to hardware-specific TensorRT engine."""
    onnx_name = payload.get("onnx_name", "bs-s.onnx")
    fp16 = bool(payload.get("fp16", True))
    workspace_gb = int(payload.get("workspace_gb", 4))
    max_batch_size = int(payload.get("max_batch_size", 1))

    onnx_path = WEIGHTS_DIR / onnx_name
    if not onnx_path.exists():
        if (WEIGHTS_DIR / "bs-s.onnx").exists():
            onnx_path = WEIGHTS_DIR / "bs-s.onnx"
        elif (WEIGHTS_DIR / "best.onnx").exists():
            onnx_path = WEIGHTS_DIR / "best.onnx"
        else:
            raise HTTPException(status_code=404, detail=f"ONNX model '{onnx_name}' not found in {WEIGHTS_DIR}")

    engine_name = f"{onnx_path.stem}.engine"
    engine_path = WEIGHTS_DIR / engine_name

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: build_tensorrt_engine(
            onnx_file=onnx_path,
            engine_file=engine_path,
            fp16=fp16,
            max_batch_size=max_batch_size,
            workspace_gb=workspace_gb,
        ),
    )
    return result


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
                                    travel_cost_usd=15000.0,
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
                travel_cost_usd=payload.get("travel_cost", 15000.0),
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
        name = payload.get("name") or f"ROV Survey {time.strftime('%Y-%m-%d %H:%M')}"
        video_source = payload.get("video_source", "recorded_stream")
        duration_sec = float(payload.get("duration_sec", 0.0))
        zones = int(payload.get("zones", 0))
        total_unique_objects = int(payload.get("total_unique_objects", 0))
        fps = float(payload.get("fps", 0.0))
        avg_latency_ms = float(payload.get("avg_latency_ms", 0.0))
        summary_by_class = payload.get("summary_by_class", {})

        # Check if updating an existing started mission
        existing_id_str = payload.get("mission_id")
        existing_mission = None
        if existing_id_str:
            try:
                mid = uuid.UUID(str(existing_id_str))
                res = await db.execute(select(SurveyMission).where(SurveyMission.id == mid))
                existing_mission = res.scalar_one_or_none()
            except Exception:
                pass

        # Discard empty / aborted runs with 0 detections
        if total_unique_objects == 0 and duration_sec < 1.0:
            if existing_mission:
                await db.delete(existing_mission)
                await db.commit()
            return JSONResponse({
                "status": "ignored",
                "mission_id": None,
                "message": "Empty survey mission discarded (0 detections).",
            })

        if existing_mission:
            mission = existing_mission
            mission.name = name
            mission.video_source = video_source
            mission.duration_sec = duration_sec
            mission.zones = zones
            mission.total_unique_objects = total_unique_objects
            mission.fps = fps
            mission.avg_latency_ms = avg_latency_ms
            mission.summary_by_class = summary_by_class
            mission_id = mission.id
        else:
            mission_id = uuid.uuid4()
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
    """Return past ROV survey missions, newest first. Ignores empty/abandoned stub missions."""
    res = await db.execute(
        select(SurveyMission)
        .where(
            (SurveyMission.total_unique_objects > 0) | (SurveyMission.duration_sec >= 1.0)
        )
        .order_by(desc(SurveyMission.created_at))
        .limit(limit)
    )
    missions = res.scalars().all()
    return JSONResponse({"missions": [m.to_dict() for m in missions]})


@app.delete("/missions/{mission_id}")
async def delete_mission(mission_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a survey mission and its associated hotspots and incidents."""
    try:
        mid = uuid.UUID(mission_id)
        res = await db.execute(select(SurveyMission).where(SurveyMission.id == mid))
        mission = res.scalar_one_or_none()
        if not mission:
            return JSONResponse({"status": "not_found", "message": "Mission not found."}, status_code=404)

        await db.execute(delete(DebrisHotspot).where(DebrisHotspot.mission_id == mid))
        await db.execute(delete(MissionIncident).where(MissionIncident.mission_id == mid))
        await db.delete(mission)
        await db.commit()
        return JSONResponse({"status": "deleted", "mission_id": mission_id})
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.delete("/missions")
async def clear_all_missions(db: AsyncSession = Depends(get_db)):
    """Delete all past survey missions."""
    try:
        await db.execute(delete(DebrisHotspot))
        await db.execute(delete(MissionIncident))
        await db.execute(delete(SurveyMission))
        await db.commit()
        return JSONResponse({"status": "cleared", "message": "All survey missions deleted."})
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


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
# ---------------------------------------------------------------------------
# Feature 3: Cleanup Optimizer (cleanup_zones, cleanup_plans)
# ---------------------------------------------------------------------------

from cleanup_optimizer import (
    optimize_cleanup,
    GLOBAL_ASSUMPTIONS,
    get_assumptions_version,
    normalize_class_name,
    load_default_assumptions,
)
import copy

CURRENT_ASSUMPTIONS: Dict[str, Any] = copy.deepcopy(GLOBAL_ASSUMPTIONS)


def parse_coords_from_string(loc_str: str) -> Optional[Tuple[float, float]]:
    """Attempt to parse (lat, lon) from marine coordinate strings like 'Lat 2.3, Lon 108.5'."""
    import re
    if not loc_str:
        return None
    # Match patterns like: Lat 2.3N, Lon 108.5E or Lat 12.345, Lon 80.123 or 12.345, 80.123
    lat_m = re.search(r"Lat\s*([+-]?\d+(?:\.\d+)?)\s*([NS])?", loc_str, re.IGNORECASE)
    lon_m = re.search(r"Lon\s*([+-]?\d+(?:\.\d+)?)\s*([EW])?", loc_str, re.IGNORECASE)
    if lat_m and lon_m:
        lat = float(lat_m.group(1))
        if lat_m.group(2) and lat_m.group(2).upper() == "S":
            lat = -lat
        lon = float(lon_m.group(1))
        if lon_m.group(2) and lon_m.group(2).upper() == "W":
            lon = -lon
        return lat, lon
    # Generic float pair: '12.345, 80.123'
    pair_m = re.search(r"([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)", loc_str)
    if pair_m:
        return float(pair_m.group(1)), float(pair_m.group(2))
    return None


async def fetch_bathymetry_depth(lat: float, lon: float) -> Tuple[Optional[float], str]:
    """Query local Ocean Depth microservice (port 8001).

    Returns:
        (depth_m_or_none, status_string)
        depth_m is None if on land (elevation >= 0) or unreachable.
    """
    url = f"http://localhost:8001/depth?lat={lat}&lon={lon}"
    headers = {"x-api-key": "test-key-1"}
    try:
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(
            None,
            lambda: http_requests.get(url, headers=headers, timeout=5.0)
        )
        if resp.status_code == 200:
            data = resp.json()
            depth_m = data.get("depth_m")
            if depth_m is None:
                return 0.0, "land"
            return float(depth_m), "bathymetry"
    except Exception as e:
        print(f"[Optimizer] Bathymetry service lookup error: {e}")
    return None, "simulated"


@app.get("/cleanup/assumptions")
async def get_cleanup_assumptions():
    """Retrieve active assumptions config and version hash."""
    return JSONResponse({
        "status": "success",
        "version": get_assumptions_version(CURRENT_ASSUMPTIONS),
        "assumptions": CURRENT_ASSUMPTIONS,
    })


@app.post("/cleanup/assumptions")
async def update_cleanup_assumptions(payload: Dict[str, Any] = Body(...)):
    """Update active assumptions with a versioned override."""
    global CURRENT_ASSUMPTIONS
    new_cfg = payload.get("assumptions") or payload
    if not isinstance(new_cfg, dict) or "modes" not in new_cfg or "debris_classes" not in new_cfg:
        raise HTTPException(
            status_code=400,
            detail="Invalid assumptions format: must include 'modes' and 'debris_classes'.",
        )
    CURRENT_ASSUMPTIONS = copy.deepcopy(new_cfg)
    version = get_assumptions_version(CURRENT_ASSUMPTIONS)
    return JSONResponse({
        "status": "success",
        "version": version,
        "assumptions": CURRENT_ASSUMPTIONS,
    })


@app.post("/cleanup/assumptions/reset")
async def reset_cleanup_assumptions():
    """Reset assumptions to repository default (cleanup_assumptions.json)."""
    global CURRENT_ASSUMPTIONS
    CURRENT_ASSUMPTIONS = copy.deepcopy(GLOBAL_ASSUMPTIONS)
    version = get_assumptions_version(CURRENT_ASSUMPTIONS)
    return JSONResponse({
        "status": "success",
        "version": version,
        "assumptions": CURRENT_ASSUMPTIONS,
    })


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
    """Compute parametric diver/robotics hours, equipment, and cost using the multi-mode model."""
    zone_id_str = payload.get("zone_id")
    if not zone_id_str:
        raise HTTPException(status_code=400, detail="zone_id is required.")

    try:
        zid = uuid.UUID(zone_id_str)
    except ValueError:
        # Gracefully handle client string IDs like "target-1744..." by generating a deterministic UUID
        zid = uuid.uuid5(uuid.NAMESPACE_DNS, str(zone_id_str))

    res = await db.execute(select(CleanupZone).where(CleanupZone.id == zid))
    zone = res.scalar_one_or_none()

    # If zone doesn't exist yet (e.g. ad-hoc target redirected from map/scanner), auto-create it
    if not zone:
        zone_name = payload.get("zone_name") or f"Survey Target {str(zid)[:8]}"
        loc_coords = payload.get("location_coords") or payload.get("location") or "Surveyed Marine Coordinates"
        travel_cost = float(payload.get("travel_cost_usd") or 15000.0)
        debris_inv = payload.get("debris_inventory") or []
        zone = CleanupZone(
            id=zid,
            name=zone_name,
            location_coords=loc_coords,
            travel_cost_usd=travel_cost,
            debris_inventory=debris_inv,
        )
        db.add(zone)
        await db.flush()

    inventory = payload.get("debris_inventory") or zone.debris_inventory or []

    # 1. Input Validation: Check min <= max and non-negative
    items_dict: Dict[str, Dict[str, float]] = {}
    for item in inventory:
        cls = item.get("class", "unknown")
        cnt = item.get("count", {})
        if isinstance(cnt, (int, float)):
            c_min = float(cnt)
            c_max = float(cnt)
        elif isinstance(cnt, dict):
            c_min = float(cnt.get("min", 1))
            c_max = float(cnt.get("max", 1))
        else:
            c_min, c_max = 1.0, 1.0

        if c_min < 0 or c_max < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Debris count for '{cls}' cannot be negative.",
            )
        if c_min > c_max:
            raise HTTPException(
                status_code=400,
                detail=f"Min count ({c_min}) cannot exceed max count ({c_max}) for '{cls}'.",
            )
        items_dict[cls] = {"min": c_min, "max": c_max}

    # 2. Determine Depth and Depth Source
    depth_source = payload.get("depth_source")
    raw_depth = payload.get("depth_m")
    if raw_depth is None:
        raw_depth = payload.get("depth")

    lat = payload.get("lat") or payload.get("latitude")
    lon = payload.get("lon") or payload.get("longitude")
    if lat is None or lon is None:
        coords_parsed = parse_coords_from_string(zone.location_coords or payload.get("location_coords", ""))
        if coords_parsed:
            lat, lon = coords_parsed

    depth_val: float = 0.0

    if depth_source == "simulated" or payload.get("is_simulated"):
        depth_source = "simulated"
        depth_val = float(raw_depth or 0.0)
    elif raw_depth is not None and float(raw_depth) > 0 and depth_source != "bathymetry":
        # Explicit depth provided without bathymetry flag is treated as simulated
        depth_val = float(raw_depth)
        depth_source = depth_source or "simulated"
    elif lat is not None and lon is not None:
        # Query Ocean Depth Microservice
        bathy_depth, b_status = await fetch_bathymetry_depth(float(lat), float(lon))
        if bathy_depth is not None:
            depth_val = bathy_depth
            depth_source = b_status
        else:
            depth_val = float(raw_depth or 0.0)
            depth_source = "simulated"
    else:
        depth_val = float(raw_depth or 0.0)
        depth_source = "simulated"

    if depth_val < 0:
        raise HTTPException(status_code=400, detail=f"Operating depth cannot be negative: {depth_val}m")

    # 3. Execute Parametric Multi-Mode Optimization
    opt_cfg = payload.get("assumptions") or CURRENT_ASSUMPTIONS
    dist_km = float(payload.get("dist_km") or 25.0)

    try:
        opt_res = optimize_cleanup(
            depth=depth_val,
            items=items_dict,
            dist_km=dist_km,
            depth_source=depth_source,
            cfg=opt_cfg,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))

    # 4. Persist CleanupPlan
    plan_id = uuid.uuid4()
    cost_min = float(opt_res.get("cost_min") or 0.0)
    cost_max = float(opt_res.get("cost_max") or 0.0)
    item_hours = opt_res.get("item_hours", [0.0, 0.0])
    crew_count = int(opt_res.get("crew") or 1)
    crew_roles = opt_res.get("crew_roles") or []
    rec_mode = opt_res.get("recommended")

    plan = CleanupPlan(
        id=plan_id,
        zone_id=zid,
        priority_rank=payload.get("priority_rank", 1),
        estimated_min_hours=round(item_hours[0], 1),
        estimated_max_hours=round(item_hours[1], 1),
        max_crew_required=crew_count,
        required_equipment=opt_res.get("required_equipment") or [],
        estimated_min_cost=cost_min,
        estimated_max_cost=cost_max,
        cost_min=cost_min,
        cost_max=cost_max,
        mode=rec_mode or "out_of_scope",
        crew={"count": crew_count, "roles": crew_roles},
        depth_source=opt_res.get("depth_source", depth_source),
        assumptions_version=opt_res.get("assumptions_version"),
        breakdown=opt_res.get("breakdown") or {},
        warnings=opt_res.get("warnings") or [],
        dispatch_status="approved" if payload.get("auto_dispatch") else "draft",
    )
    db.add(plan)
    await db.commit()

    return JSONResponse({
        "status": opt_res.get("status", "success"),
        "plan_id": str(plan_id),
        "plan": plan.to_dict(),
        "recommended": rec_mode,
        "recommended_mode_details": opt_res.get("recommended_mode_details"),
        "depth_m": depth_val,
        "depth_source": opt_res.get("depth_source", depth_source),
        "item_hours": item_hours,
        "debris_kg": opt_res.get("debris_kg"),
        "heaviest_item_kg": opt_res.get("heaviest_item_kg"),
        "crew": crew_count,
        "crew_roles": crew_roles,
        "risk": opt_res.get("risk"),
        "cost_min": cost_min,
        "cost_max": cost_max,
        "modes": opt_res.get("modes", []),
        "breakdown": opt_res.get("breakdown", {}),
        "warnings": opt_res.get("warnings", []),
        "unverified_assumptions": opt_res.get("unverified_assumptions", []),
        "required_equipment": opt_res.get("required_equipment", []),
        "assumptions_version": opt_res.get("assumptions_version"),
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


# ---------------------------------------------------------------------------
# Ocean Depth Proxy — forwards to standalone depth microservice (port 8001)
# ---------------------------------------------------------------------------

DEPTH_SERVICE_URL = os.environ.get("DEPTH_SERVICE_URL", "http://localhost:8001")
DEPTH_SERVICE_API_KEY = os.environ.get("DEPTH_SERVICE_API_KEY", "test-key-1")


def query_noaa_etopo_depth(lat: float, lon: float) -> Optional[float]:
    """Query NOAA NCEI ETOPO Global DEM Mosaic ImageServer for seafloor depth in meters."""
    try:
        url = "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer/identify"
        params = {
            "geometry": json.dumps({"x": lon, "y": lat, "spatialReference": {"wkid": 4326}}),
            "geometryType": "esriGeometryPoint",
            "returnGeometry": "false",
            "f": "json",
        }
        r = http_requests.get(url, params=params, timeout=6)
        if r.status_code == 200:
            val_str = r.json().get("value")
            if val_str is not None:
                val = float(val_str)
                # In ETOPO DEM mosaic, negative values represent depth below sea level
                if val < 0:
                    return round(-val, 2)
    except Exception:
        pass
    return None


@app.get("/api/ocean-depth")
async def proxy_ocean_depth(
    lat: float = Query(..., description="Latitude (-90 to 90)"),
    lon: float = Query(..., description="Longitude"),
):
    """Proxy to the Ocean Depth microservice with NOAA ETOPO fallback.

    Returns {"lat", "lon", "depth_m"} where depth_m is positive metres
    below sea level, or null if the point is on land.
    """
    # 1. Try dedicated ocean depth microservice (port 8001)
    try:
        resp = http_requests.get(
            f"{DEPTH_SERVICE_URL}/depth",
            params={"lat": lat, "lon": lon},
            headers={"x-api-key": DEPTH_SERVICE_API_KEY},
            timeout=4,
        )
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data.get("depth_m"), (int, float)) and data["depth_m"] > 0:
                return JSONResponse(data)
    except Exception:
        pass

    # 2. High-reliability fallback: NOAA NCEI ETOPO Global Relief Model
    noaa_depth = query_noaa_etopo_depth(lat, lon)
    if noaa_depth is not None:
        return JSONResponse({"lat": lat, "lon": lon, "depth_m": noaa_depth, "source": "NOAA_ETOPO"})

    return JSONResponse(
        {"lat": lat, "lon": lon, "depth_m": None, "source": "land_or_unavailable"},
        status_code=200,
    )


@app.get("/api/ocean-depth/batch")
async def proxy_ocean_depth_batch(
    lats: str = Query(..., description="Comma-separated latitudes"),
    lons: str = Query(..., description="Comma-separated longitudes"),
):
    """Batch depth lookup for multiple coordinates (used by heading probes).

    Returns {"results": [{"lat", "lon", "depth_m"}, ...]}
    """
    lat_list = [float(x.strip()) for x in lats.split(",") if x.strip()]
    lon_list = [float(x.strip()) for x in lons.split(",") if x.strip()]

    if len(lat_list) != len(lon_list):
        raise HTTPException(status_code=400, detail="lats and lons must have equal length")
    if len(lat_list) > 24:
        raise HTTPException(status_code=400, detail="Maximum 24 points per batch")

    results = []
    for lat, lon in zip(lat_list, lon_list):
        # 1. Try microservice
        depth_val = None
        try:
            resp = http_requests.get(
                f"{DEPTH_SERVICE_URL}/depth",
                params={"lat": lat, "lon": lon},
                headers={"x-api-key": DEPTH_SERVICE_API_KEY},
                timeout=2,
            )
            if resp.status_code == 200:
                d = resp.json()
                if isinstance(d.get("depth_m"), (int, float)):
                    depth_val = d["depth_m"]
        except Exception:
            pass

        # 2. Fallback to NOAA ETOPO
        if depth_val is None:
            depth_val = query_noaa_etopo_depth(lat, lon)

        results.append({"lat": lat, "lon": lon, "depth_m": depth_val})

    return JSONResponse({"results": results})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
