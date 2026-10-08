"""Evaluate ONNX model mAP on TrashCan-Instance validation dataset using COCO metrics."""

import json
import time
from pathlib import Path
from PIL import Image
import numpy as np
import onnxruntime as ort
from faster_coco_eval import COCO, COCOeval_faster

# Paths
ROOT_DIR = Path(__file__).parent.resolve()
ONNX_PATH = ROOT_DIR / "weights" / "best.onnx"
VAL_JSON_PATH = Path(r"C:\Users\user\Desktop\dataset\instance_version\instances_val_trashcan.json")
VAL_IMG_DIR = Path(r"C:\Users\user\Desktop\dataset\instance_version\val")

INFER_SIZE = 640
SCORE_THRESH = 0.001  # Keep low for standard COCO mAP calculation (evaluates full precision-recall curve)


def evaluate_onnx():
    print(f"Loading Ground Truth annotations from:\n  {VAL_JSON_PATH}")
    coco_gt = COCO(str(VAL_JSON_PATH))

    print(f"\nLoading ONNX model from:\n  {ONNX_PATH}")
    sess_options = ort.SessionOptions()
    sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(str(ONNX_PATH), sess_options=sess_options, providers=["CPUExecutionProvider"])

    img_ids = coco_gt.getImgIds()
    print(f"\nStarting evaluation across {len(img_ids)} validation images...")

    results = []
    t_start = time.time()

    for idx, img_id in enumerate(img_ids, 1):
        img_info = coco_gt.loadImgs(img_id)[0]
        file_name = img_info["file_name"]
        img_path = VAL_IMG_DIR / file_name

        if not img_path.exists():
            continue

        # Load image & natural dimensions
        img = Image.open(img_path).convert("RGB")
        w, h = img.size

        # Preprocessing: resize to 640x640, normalize to [0, 1] float32
        img_resized = img.resize((INFER_SIZE, INFER_SIZE), Image.Resampling.BILINEAR)
        img_arr = np.array(img_resized, dtype=np.float32) / 255.0
        img_arr = np.transpose(img_arr, (2, 0, 1))  # (3, 640, 640)
        im_data = np.expand_dims(img_arr, axis=0)   # (1, 3, 640, 640)
        orig_sizes = np.array([[h, w]], dtype=np.int64)

        # Forward pass
        outputs = session.run(None, {"images": im_data, "orig_target_sizes": orig_sizes})
        labels, boxes, scores = outputs

        # Extract predictions for this image
        lbls = labels[0]
        bxs = boxes[0]
        scrs = scores[0]

        # Filter by minimum score threshold
        mask = scrs > SCORE_THRESH
        lbls = lbls[mask]
        bxs = bxs[mask]
        scrs = scrs[mask]

        for lbl, bx, sc in zip(lbls, bxs, scrs):
            x1, y1, x2, y2 = bx
            # Convert [x1, y1, x2, y2] to COCO format [x, y, width, height]
            box_w = max(0.0, float(x2 - x1))
            box_h = max(0.0, float(y2 - y1))

            results.append({
                "image_id": img_id,
                "category_id": int(lbl) + 1,  # Model is 0-indexed (0..21); Dataset is 1-indexed (1..22)
                "bbox": [round(float(x1), 2), round(float(y1), 2), round(box_w, 2), round(box_h, 2)],
                "score": float(sc),
            })

        if idx % 50 == 0 or idx == len(img_ids):
            elapsed = time.time() - t_start
            fps = idx / elapsed
            print(f"  Processed {idx}/{len(img_ids)} images ({fps:.1f} img/s)...", flush=True)

    print(f"\nInference completed in {time.time() - t_start:.1f}s. Total predictions: {len(results)}")

    if not results:
        print("No detections produced.")
        return

    # Load predictions into COCO evaluation engine
    print("\nCalculating COCO mAP metrics...")
    coco_dt = coco_gt.loadRes(results)
    coco_eval = COCOeval_faster(coco_gt, coco_dt, iouType="bbox", print_function=print)
    coco_eval.evaluate()
    coco_eval.accumulate()
    coco_eval.summarize()


if __name__ == "__main__":
    evaluate_onnx()
