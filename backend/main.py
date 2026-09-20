"""BlueSentinel Backend — FastAPI server for marine debris detection."""

import base64
import io
import os
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Optional

import torch
import torch.nn as nn
import torchvision.transforms as T
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from huggingface_hub import hf_hub_download
from PIL import Image, ImageDraw
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, engine
from models import Base, ScanBatch, Detection

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="BlueSentinel API", version="1.0.0")

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

REPO_DIR = Path("RT-DETRv4").resolve()
CONFIG_NAME = "dfine_hgnetv2_l_trashcan.yml"
CKPT_REPO = "coding-droid-123/trashcan-dfine"
CKPT_FILE = "best.pth"
HF_CONFIG_BASE = "https://huggingface.co/spaces/coding-droid-123/BlueSentinel/raw/main"

UPLOADS_DIR = Path("uploads").resolve()
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

CLASS_NAMES = [
    "rov", "plant", "animal_fish", "animal_starfish", "animal_shells",
    "animal_crab", "animal_eel", "animal_etc", "trash_clothing", "trash_pipe",
    "trash_bottle", "trash_bag", "trash_snack_wrapper", "trash_can", "trash_cup",
    "trash_container", "trash_unknown_instance", "trash_branch", "trash_wreckage",
    "trash_tarp", "trash_rope", "trash_net",
]

CONFIDENCE_THRESHOLD = 0.4
IMAGE_TRANSFORMS = T.Compose([T.Resize((640, 640)), T.ToTensor()])

# Global in-memory model instances
MODEL: nn.Module | None = None
DEVICE: torch.device | None = None
CKPT_PATH: str | None = None


class RTDETRWrapper(nn.Module):
    """In-memory wrapper for deployed RT-DETRv4 model + postprocessor."""

    def __init__(self, model: nn.Module, postprocessor: nn.Module):
        super().__init__()
        self.model = model
        self.postprocessor = postprocessor

    def forward(self, images, orig_target_sizes):
        outputs = self.model(images)
        return self.postprocessor(outputs, orig_target_sizes)


# ---------------------------------------------------------------------------
# Startup — clone repo, download weights & configs, load into memory
# ---------------------------------------------------------------------------


def _clone_repo():
    """Clone the RT-DETRv4 repo and install its dependencies (once)."""
    if (REPO_DIR / "requirements.txt").exists():
        return

    import shutil
    if REPO_DIR.exists():
        shutil.rmtree(REPO_DIR)

    subprocess.run(
        ["git", "clone", "https://github.com/RT-DETRs/RT-DETRv4.git", str(REPO_DIR)],
        check=True,
    )
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", str(REPO_DIR / "requirements.txt")],
        check=True,
    )
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", str(REPO_DIR / "tools/inference/requirements.txt")],
        check=True,
    )


def _patch_hybrid_encoder():
    """Fix the device mismatch bug in HybridEncoder (upstream issue)."""
    path = REPO_DIR / "engine/rtv4/hybrid_encoder.py"
    if not path.exists():
        return

    text = path.read_text()
    marker = "pos_embed.to(src_flatten.device)"
    if marker in text:
        return

    target = "                    pos_embed = getattr(self, f'pos_embed{enc_ind}', None)"
    patch = (
        "                    pos_embed = getattr(self, f'pos_embed{enc_ind}', None)\n"
        "                    if pos_embed is not None:\n"
        "                        pos_embed = pos_embed.to(src_flatten.device)"
    )
    if target in text:
        path.write_text(text.replace(target, patch))


def _download_configs():
    """Download model config and dataset YAML from HuggingFace if missing."""
    import urllib.request

    config_dir = REPO_DIR / "configs" / "dfine"
    config_dir.mkdir(parents=True, exist_ok=True)
    if not (config_dir / CONFIG_NAME).exists():
        urllib.request.urlretrieve(f"{HF_CONFIG_BASE}/{CONFIG_NAME}", config_dir / CONFIG_NAME)

    dataset_dir = REPO_DIR / "configs" / "dataset"
    dataset_dir.mkdir(parents=True, exist_ok=True)
    if not (dataset_dir / "trashcan_detection.yml").exists():
        urllib.request.urlretrieve(
            f"{HF_CONFIG_BASE}/trashcan_detection.yml",
            dataset_dir / "trashcan_detection.yml",
        )


def _load_model_to_memory():
    """Load RT-DETRv4 architecture and weights directly into RAM/VRAM."""
    global MODEL, DEVICE

    # Add RT-DETRv4 root to sys.path
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
    MODEL = wrapped
    print(f"Model successfully loaded in memory on {DEVICE}!")


@app.on_event("startup")
async def startup_event():
    global CKPT_PATH

    # Create uploads directory
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    print("Setting up repository and downloading models...")
    _clone_repo()
    _patch_hybrid_encoder()
    _download_configs()
    CKPT_PATH = hf_hub_download(repo_id=CKPT_REPO, filename=CKPT_FILE)
    _load_model_to_memory()
    print("Setup complete. Server is ready for instant inference.")


# Serve saved annotated images
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


# ---------------------------------------------------------------------------
# Helpers for inference & visualization
# ---------------------------------------------------------------------------


def _draw_detections(image: Image.Image, labels, boxes, scores, threshold=CONFIDENCE_THRESHOLD):
    """Draw bounding boxes on image and return structured detection list."""
    canvas = ImageDraw.Draw(image)
    detections = []

    scr = scores[0]
    mask = scr > threshold
    lab = labels[0][mask]
    box = boxes[0][mask]
    scrs = scr[mask]

    for j, b in enumerate(box):
        cls_id = int(lab[j].item())
        cls_name = CLASS_NAMES[cls_id] if 0 <= cls_id < len(CLASS_NAMES) else str(cls_id)
        conf = round(float(scrs[j].item()), 2)
        label_text = f"{cls_name} {conf}"

        coords = [float(x) for x in b]
        canvas.rectangle(coords, outline="red", width=2)

        text_bbox = canvas.textbbox((coords[0], coords[1]), label_text)
        canvas.rectangle(text_bbox, fill="red")
        canvas.text((coords[0], coords[1]), text=label_text, fill="white")

        detections.append({
            "class": cls_name,
            "confidence": conf,
            "box": [round(x, 2) for x in coords],
        })

    return detections


# ---------------------------------------------------------------------------
# Detection endpoint (with database persistence)
# ---------------------------------------------------------------------------


@app.post("/detect")
async def detect(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Run RT-DETRv4 in-memory inference and persist results to database."""
    if MODEL is None or DEVICE is None:
        raise HTTPException(status_code=503, detail="Model is still initializing.")

    try:
        content = await file.read()
        im_pil = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    w, h = im_pil.size
    orig_size = torch.tensor([[w, h]]).to(DEVICE)
    im_data = IMAGE_TRANSFORMS(im_pil).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        if "cuda" in str(DEVICE):
            with torch.autocast(device_type="cuda", dtype=torch.float16):
                output = MODEL(im_data, orig_size)
        else:
            output = MODEL(im_data, orig_size)

    labels, boxes, scores = output
    detections = _draw_detections(im_pil, labels, boxes, scores)

    # --- Persist to database ---
    batch_id = uuid.uuid4()

    # Save annotated image to uploads/
    image_filename = f"{batch_id}.jpg"
    image_path = UPLOADS_DIR / image_filename
    im_pil.save(str(image_path), format="JPEG", quality=90)

    # Create scan batch record
    scan_batch = ScanBatch(
        id=batch_id,
        filename=file.filename or "unknown",
        image_path=f"/uploads/{image_filename}",
        total_detections=len(detections),
    )
    db.add(scan_batch)

    # Create detection records
    for det in detections:
        detection_record = Detection(
            batch_id=batch_id,
            class_name=det["class"],
            confidence=det["confidence"],
            bbox_x1=det["box"][0],
            bbox_y1=det["box"][1],
            bbox_x2=det["box"][2],
            bbox_y2=det["box"][3],
        )
        db.add(detection_record)

    await db.commit()

    # Encode annotated image to base64 for immediate response
    buf = io.BytesIO()
    im_pil.save(buf, format="JPEG", quality=90)
    image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return JSONResponse({
        "batch_id": str(batch_id),
        "image": image_b64,
        "detections": detections,
    })


# ---------------------------------------------------------------------------
# History endpoints
# ---------------------------------------------------------------------------


@app.get("/history")
async def get_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated list of past scans, newest first."""
    offset = (page - 1) * limit

    # Total count
    count_result = await db.execute(select(func.count(ScanBatch.id)))
    total = count_result.scalar() or 0

    # Fetch page
    result = await db.execute(
        select(ScanBatch)
        .order_by(desc(ScanBatch.created_at))
        .offset(offset)
        .limit(limit)
    )
    batches = result.scalars().all()

    return JSONResponse({
        "total": total,
        "page": page,
        "limit": limit,
        "scans": [b.to_dict() for b in batches],
    })


@app.get("/history/{batch_id}")
async def get_scan_detail(batch_id: str, db: AsyncSession = Depends(get_db)):
    """Return a specific scan with all its detections."""
    try:
        bid = uuid.UUID(batch_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid batch_id format.")

    result = await db.execute(select(ScanBatch).where(ScanBatch.id == bid))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Scan not found.")

    det_result = await db.execute(
        select(Detection).where(Detection.batch_id == bid)
    )
    dets = det_result.scalars().all()

    return JSONResponse({
        **batch.to_dict(),
        "detections": [d.to_dict() for d in dets],
    })


# ---------------------------------------------------------------------------
# Stats endpoint
# ---------------------------------------------------------------------------


@app.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Return aggregate statistics across all scans."""

    # Total scans
    scan_count_result = await db.execute(select(func.count(ScanBatch.id)))
    total_scans = scan_count_result.scalar() or 0

    # Total detections
    det_count_result = await db.execute(select(func.count(Detection.id)))
    total_detections = det_count_result.scalar() or 0

    # Average confidence
    avg_conf_result = await db.execute(select(func.avg(Detection.confidence)))
    avg_confidence = round(float(avg_conf_result.scalar() or 0), 3)

    # Detections by class
    class_result = await db.execute(
        select(Detection.class_name, func.count(Detection.id))
        .group_by(Detection.class_name)
        .order_by(func.count(Detection.id).desc())
    )
    by_class = {row[0]: row[1] for row in class_result.all()}

    return JSONResponse({
        "total_scans": total_scans,
        "total_detections": total_detections,
        "avg_confidence": avg_confidence,
        "detections_by_class": by_class,
    })


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
