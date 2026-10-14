from pathlib import Path
import numpy as np
from PIL import Image
import onnxruntime as ort

ONNX_PATH = Path(r"c:\Users\user\Desktop\blueSent-FE\backend\weights\best.onnx")
IMG_PATH = next(Path(r"C:\Users\user\Desktop\dataset\instance_version\val").glob("*.jpg"))

session = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
print("Input names:", [inp.name for inp in session.get_inputs()])
print("Output names:", [out.name for out in session.get_outputs()])

img = Image.open(IMG_PATH).convert("RGB")
w, h = img.size
print(f"Image: {IMG_PATH.name}, size: ({w}, {h})")

img_resized = img.resize((640, 640), Image.Resampling.BILINEAR)
arr = np.array(img_resized, dtype=np.float32) / 255.0
arr = np.transpose(arr, (2, 0, 1))  # (3, 640, 640)
im_data = np.expand_dims(arr, axis=0)  # (1, 3, 640, 640)
orig_target_sizes = np.array([[w, h]], dtype=np.int64)

outputs = session.run(None, {"images": im_data, "orig_target_sizes": orig_target_sizes})
labels, boxes, scores = outputs

print(f"Labels shape: {labels.shape}")
print(f"Boxes shape: {boxes.shape}")
print(f"Scores shape: {scores.shape}")

# Filter score > 0.4
mask = scores[0] > 0.4
print(f"Detections > 0.4: {np.sum(mask)}")
if np.sum(mask) > 0:
    for lbl, box, sc in zip(labels[0][mask], boxes[0][mask], scores[0][mask]):
        print(f"  Class: {lbl}, Score: {sc:.3f}, Box: {box}")
