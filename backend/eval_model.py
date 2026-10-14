"""Evaluate D-FINE model on TrashCan validation dataset.

Calculates mAP@0.50:0.95, mAP@0.50, mAP@0.75, AR metrics, and per-class AP breakdown.
"""

import sys
import os
import json
import time
from pathlib import Path

# Add RT-DETRv4 to sys.path
BASE_DIR = Path(__file__).parent.resolve()
REPO_DIR = BASE_DIR / "RT-DETRv4"
sys.path.insert(0, str(REPO_DIR))

import torch
import torchvision
from torch.utils.data import DataLoader
from engine.core import YAMLConfig
from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval

CLASS_NAMES = [
    "rov", "plant", "animal_fish", "animal_starfish", "animal_shells",
    "animal_crab", "animal_eel", "animal_etc", "trash_clothing", "trash_pipe",
    "trash_bottle", "trash_bag", "trash_snack_wrapper", "trash_can", "trash_cup",
    "trash_container", "trash_unknown_instance", "trash_branch", "trash_wreckage",
    "trash_tarp", "trash_rope", "trash_net",
]
def main():
    sys.stdout.reconfigure(line_buffering=True)
    config_path = str(REPO_DIR / "configs/dfine/dfine_hgnetv2_s_trashcan.yml")
    checkpoint_path = str(BASE_DIR / "weights/best_stg2.pth")
    val_img_dir = "C:/Users/user/Desktop/instance_version/images"
    val_ann_file = "C:/Users/user/Desktop/instances_val_0idx.json"

    print("=" * 70, flush=True)
    print("BlueSentinel — D-FINE Validation Evaluation", flush=True)
    print(f"Model Checkpoint : {checkpoint_path}", flush=True)
    print(f"Config           : {config_path}", flush=True)
    print(f"Validation Images: {val_img_dir}", flush=True)
    print(f"Annotations (0-idx): {val_ann_file}", flush=True)
    print("=" * 70, flush=True)

    # 1. Load config
    cfg = YAMLConfig(config_path)
    if "HGNetv2" in cfg.yaml_cfg:
        cfg.yaml_cfg["HGNetv2"]["pretrained"] = False

    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # Set threads for CPU speedup
    if device.type == "cpu":
        import multiprocessing
        n_cores = multiprocessing.cpu_count()
        torch.set_num_threads(n_cores)
        print(f"Using {n_cores} CPU threads for inference")

    # 2. Build model and postprocessor
    model = cfg.model
    postprocessor = cfg.postprocessor

    # 3. Load checkpoint weights
    print(f"Loading checkpoint weights from {checkpoint_path}...")
    ckpt = torch.load(checkpoint_path, map_location="cpu")
    state_dict = ckpt.get("ema", {}).get("module") or ckpt.get("model") or ckpt
    model.load_state_dict(state_dict, strict=False)
    model = model.deploy()
    postprocessor = postprocessor.deploy()
    model.to(device)
    model.eval()
    postprocessor.to(device)
    postprocessor.eval()

    epoch = ckpt.get("last_epoch", "unknown")
    print(f"Model successfully loaded! (Trained epoch: {epoch})")

    # 4. Build validation dataloader
    print("Initializing validation dataset and dataloader...")
    val_loader = cfg.val_dataloader
    dataset = val_loader.dataset
    total_samples = len(dataset)
    print(f"Validation dataset contains {total_samples} images.")

    # 5. Evaluate loop
    results = []
    start_time = time.time()
    processed_count = 0

    print("Running inference over validation dataset...")
    with torch.no_grad():
        for batch_idx, (samples, targets) in enumerate(val_loader):
            samples = samples.to(device)
            target_sizes = torch.stack([t["orig_size"].to(device) for t in targets], dim=0)

            outputs = model(samples)
            batch_results = postprocessor(outputs, target_sizes)

            for target, result in zip(targets, batch_results):
                img_id = int(target["image_id"].item())
                boxes = result["boxes"].cpu().numpy()
                scores = result["scores"].cpu().numpy()
                labels = result["labels"].cpu().numpy()

                for box, score, label in zip(boxes, scores, labels):
                    if score < 0.05:
                        continue
                    x1, y1, x2, y2 = box.tolist()
                    w = x2 - x1
                    h = y2 - y1
                    results.append({
                        "image_id": img_id,
                        "category_id": int(label),
                        "bbox": [round(x1, 2), round(y1, 2), round(w, 2), round(h, 2)],
                        "score": round(float(score), 4),
                    })

            processed_count += len(targets)
            if (batch_idx + 1) % 5 == 0 or processed_count >= total_samples:
                elapsed = time.time() - start_time
                fps = processed_count / elapsed if elapsed > 0 else 0
                eta_sec = (total_samples - processed_count) / fps if fps > 0 else 0
                print(f"  [{processed_count:4d}/{total_samples}] ({processed_count*100/total_samples:5.1f}%) | Speed: {fps:4.1f} img/s | ETA: {eta_sec:4.0f}s", flush=True)

    total_time = time.time() - start_time
    print(f"\nInference complete in {total_time:.1f}s ({total_samples / total_time:.1f} img/s).")
    print(f"Generated {len(results)} candidate detections.")

    # 6. Run pycocotools COCOeval
    print("\nEvaluating against ground truth annotations with COCOeval...")
    coco_gt = COCO(val_ann_file)
    coco_dt = coco_gt.loadRes(results)

    coco_eval = COCOeval(coco_gt, coco_dt, "bbox")
    coco_eval.evaluate()
    coco_eval.accumulate()
    coco_eval.summarize()

    # Per-class AP
    print("\n" + "=" * 55)
    print("PER-CLASS AP BREAKDOWN (mAP@0.50:0.95)")
    print("=" * 55)
    per_class_summary = {}
    precisions = coco_eval.eval["precision"]  # [TxRxKxAxM]

    for cat_id, cat_name in enumerate(CLASS_NAMES):
        # T=10 iou thrs, R=101 recall thrs, K=category, A=0 all area, M=2 maxDets=100
        pr = precisions[:, :, cat_id, 0, 2]
        pr = pr[pr > -1]
        ap = float(pr.mean()) if len(pr) > 0 else 0.0
        per_class_summary[cat_name] = round(ap * 100, 2)
        print(f"  {cat_name:<26} : {ap * 100:5.2f}%")

    stats = coco_eval.stats
    summary = {
        "checkpoint": checkpoint_path,
        "epoch": epoch,
        "total_val_images": total_samples,
        "total_detections": len(results),
        "inference_time_sec": round(total_time, 1),
        "fps": round(total_samples / total_time, 2),
        "mAP_50_95": round(stats[0] * 100, 2),
        "mAP_50": round(stats[1] * 100, 2),
        "mAP_75": round(stats[2] * 100, 2),
        "mAP_small": round(stats[3] * 100, 2),
        "mAP_medium": round(stats[4] * 100, 2),
        "mAP_large": round(stats[5] * 100, 2),
        "AR_1": round(stats[6] * 100, 2),
        "AR_10": round(stats[7] * 100, 2),
        "AR_100": round(stats[8] * 100, 2),
        "per_class_AP": per_class_summary,
    }

    out_file = BASE_DIR / "eval_results.json"
    with open(out_file, "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nEvaluation summary saved to: {out_file}")
    print("=" * 70)

if __name__ == "__main__":
    main()
