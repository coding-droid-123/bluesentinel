"""
Copyright (c) 2024 The D-FINE Authors. All Rights Reserved.
"""

import json
import os
import sys

import cv2
import numpy as np
import torch
import torch.nn as nn
import torchvision.transforms as T
from PIL import Image, ImageDraw

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))
from engine.core import YAMLConfig

CLASS_NAMES = [
    "rov", "plant", "animal_fish", "animal_starfish", "animal_shells",
    "animal_crab", "animal_eel", "animal_etc", "trash_clothing", "trash_pipe",
    "trash_bottle", "trash_bag", "trash_snack_wrapper", "trash_can", "trash_cup",
    "trash_container", "trash_unknown_instance", "trash_branch", "trash_wreckage",
    "trash_tarp", "trash_rope", "trash_net",
]

CONFIDENCE_THRESHOLD = 0.4


def draw_detections(images, labels, boxes, scores, threshold=CONFIDENCE_THRESHOLD):
    """Draw bounding boxes on images and return structured detection results.

    Returns:
        list[dict]: Detection results with class, confidence, and bounding box.
    """
    all_detections = []

    for i, im in enumerate(images):
        canvas = ImageDraw.Draw(im)

        scr = scores[i]
        mask = scr > threshold
        lab = labels[i][mask]
        box = boxes[i][mask]
        scrs = scr[mask]

        for j, b in enumerate(box):
            cls_id = int(lab[j].item())
            cls_name = CLASS_NAMES[cls_id] if 0 <= cls_id < len(CLASS_NAMES) else str(cls_id)
            conf = round(float(scrs[j].item()), 2)
            label_text = f"{cls_name} {conf}"

            # Draw bounding box
            canvas.rectangle(list(b), outline="red", width=2)

            # Draw label background and text
            text_bbox = canvas.textbbox((b[0], b[1]), label_text)
            canvas.rectangle(text_bbox, fill="red")
            canvas.text((b[0], b[1]), text=label_text, fill="white")

            all_detections.append({
                "class": cls_name,
                "confidence": conf,
                "box": [round(float(x), 2) for x in b],
            })

    return all_detections


def process_image(model, device, file_path):
    """Run inference on a single image, save annotated result and JSON."""
    im_pil = Image.open(file_path).convert("RGB")
    w, h = im_pil.size
    orig_size = torch.tensor([[w, h]]).to(device)

    transforms = T.Compose([T.Resize((640, 640)), T.ToTensor()])
    im_data = transforms(im_pil).unsqueeze(0).to(device)

    with torch.no_grad():
        if "cuda" in str(device):
            with torch.autocast(device_type="cuda", dtype=torch.float16):
                output = model(im_data, orig_size)
        else:
            output = model(im_data, orig_size)

    labels, boxes, scores = output
    detections = draw_detections([im_pil], labels, boxes, scores)

    # Save outputs
    im_pil.save("torch_results.jpg")
    with open("results.json", "w") as f:
        json.dump(detections, f)

    return detections


def process_video(model, device, file_path):
    """Run inference on each frame of a video, save annotated result."""
    cap = cv2.VideoCapture(file_path)

    fps = cap.get(cv2.CAP_PROP_FPS)
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter("torch_results.mp4", fourcc, fps, (orig_w, orig_h))

    transforms = T.Compose([T.Resize((640, 640)), T.ToTensor()])

    frame_count = 0
    all_detections = []

    print("Processing video frames...")
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        w, h = frame_pil.size
        orig_size = torch.tensor([[w, h]]).to(device)
        im_data = transforms(frame_pil).unsqueeze(0).to(device)

        with torch.no_grad():
            if "cuda" in str(device):
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    output = model(im_data, orig_size)
            else:
                output = model(im_data, orig_size)

        labels, boxes, scores = output
        detections = draw_detections([frame_pil], labels, boxes, scores)
        all_detections.extend(detections)

        frame = cv2.cvtColor(np.array(frame_pil), cv2.COLOR_RGB2BGR)
        out.write(frame)
        frame_count += 1

        if frame_count % 10 == 0:
            print(f"Processed {frame_count} frames...")

    cap.release()
    out.release()

    with open("results.json", "w") as f:
        json.dump(all_detections, f)

    print(f"Video processing complete. {frame_count} frames processed.")
    return all_detections


def main(args):
    """Load model and run inference on input file."""
    cfg = YAMLConfig(args.config, resume=args.resume)

    if "HGNetv2" in cfg.yaml_cfg:
        cfg.yaml_cfg["HGNetv2"]["pretrained"] = False

    if not args.resume:
        raise AttributeError("Only support resume to load model.state_dict by now.")

    checkpoint = torch.load(args.resume, map_location="cpu")
    state = checkpoint.get("ema", {}).get("module") or checkpoint["model"]
    cfg.model.load_state_dict(state)

    class Model(nn.Module):
        def __init__(self):
            super().__init__()
            self.model = cfg.model.deploy()
            self.postprocessor = cfg.postprocessor.deploy()

        def forward(self, images, orig_target_sizes):
            outputs = self.model(images)
            return self.postprocessor(outputs, orig_target_sizes)

    device = args.device
    model = Model().to(device)

    file_ext = os.path.splitext(args.input)[-1].lower()
    if file_ext in (".jpg", ".jpeg", ".png", ".bmp"):
        process_image(model, device, args.input)
        print("Image processing complete.")
    else:
        process_video(model, device, args.input)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="RT-DETRv4 Inference")
    parser.add_argument("-c", "--config", type=str, required=True)
    parser.add_argument("-r", "--resume", type=str, required=True)
    parser.add_argument("-i", "--input", type=str, required=True)
    parser.add_argument("-d", "--device", type=str, default="cpu")
    args = parser.parse_args()
    main(args)
