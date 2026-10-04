"""Export RT-DETRv4 / D-FINE PyTorch checkpoint to ONNX for CPU acceleration."""

import os
import sys
import time
from pathlib import Path

# Add RT-DETRv4 to sys.path
backend_dir = Path(__file__).parent.resolve()
repo_dir = backend_dir / "RT-DETRv4"
if str(repo_dir) not in sys.path:
    sys.path.insert(0, str(repo_dir))

import torch
import torch.nn as nn
import onnx
import onnxruntime as ort
from engine.core import YAMLConfig

CONFIG_PATH = repo_dir / "configs" / "dfine" / "dfine_hgnetv2_l_trashcan.yml"
CKPT_PATH = backend_dir / "weights" / "best.pth"
ONNX_OUTPUT_PATH = backend_dir / "weights" / "best.onnx"


class ExportWrapper(nn.Module):
    def __init__(self, model, postprocessor):
        super().__init__()
        self.model = model
        self.postprocessor = postprocessor

    def forward(self, images, orig_target_sizes):
        outputs = self.model(images)
        return self.postprocessor(outputs, orig_target_sizes)


def export():
    print(f"Loading YAML config from: {CONFIG_PATH}")
    cfg = YAMLConfig(str(CONFIG_PATH), resume=str(CKPT_PATH))

    if "HGNetv2" in cfg.yaml_cfg:
        cfg.yaml_cfg["HGNetv2"]["pretrained"] = False

    print(f"Loading PyTorch weights from: {CKPT_PATH}")
    checkpoint = torch.load(str(CKPT_PATH), map_location="cpu")
    state = checkpoint.get("ema", {}).get("module") or checkpoint["model"]
    cfg.model.load_state_dict(state)

    print("Deploying model and postprocessor...")
    deploy_model = cfg.model.deploy()
    deploy_post = cfg.postprocessor.deploy()
    wrapper = ExportWrapper(deploy_model, deploy_post)
    wrapper.eval()

    # Batch size 1, 3 channels, 640x640
    dummy_image = torch.randn(1, 3, 640, 640, dtype=torch.float32)
    dummy_size = torch.tensor([[640, 640]], dtype=torch.int64)

    print("Testing forward pass in PyTorch before export...")
    t0 = time.time()
    with torch.no_grad():
        out = wrapper(dummy_image, dummy_size)
    print(f"PyTorch forward completed in {time.time() - t0:.2f}s")

    print(f"Exporting ONNX model to: {ONNX_OUTPUT_PATH} (this may take 1-2 minutes)...")
    torch.onnx.export(
        wrapper,
        (dummy_image, dummy_size),
        str(ONNX_OUTPUT_PATH),
        input_names=["images", "orig_target_sizes"],
        output_names=["labels", "boxes", "scores"],
        dynamic_axes={
            "images": {0: "batch_size"},
            "orig_target_sizes": {0: "batch_size"},
            "labels": {0: "batch_size"},
            "boxes": {0: "batch_size"},
            "scores": {0: "batch_size"},
        },
        opset_version=16,
        do_constant_folding=True,
        dynamo=False,
    )

    print("Verifying ONNX model integrity...")
    model_proto = onnx.load(str(ONNX_OUTPUT_PATH))
    onnx.checker.check_model(model_proto)
    size_mb = ONNX_OUTPUT_PATH.stat().st_size / (1024 * 1024)
    print(f"ONNX model verified successfully! Size: {size_mb:.1f} MB")

    print("Testing inference with ONNXRuntime (CPU)...")
    sess_options = ort.SessionOptions()
    sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    import multiprocessing
    sess_options.intra_op_num_threads = multiprocessing.cpu_count()

    session = ort.InferenceSession(
        str(ONNX_OUTPUT_PATH),
        sess_options=sess_options,
        providers=["CPUExecutionProvider"],
    )

    # Warmup
    inputs = {
        "images": dummy_image.numpy(),
        "orig_target_sizes": dummy_size.numpy(),
    }
    _ = session.run(None, inputs)

    # Benchmark
    times = []
    for _ in range(3):
        t1 = time.time()
        _ = session.run(None, inputs)
        times.append((time.time() - t1) * 1000)

    avg_ms = sum(times) / len(times)
    print(f"ONNX Runtime CPU average latency: {avg_ms:.1f} ms")


if __name__ == "__main__":
    export()
