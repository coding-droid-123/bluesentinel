"""Convert RT-DETRv4 / D-FINE PyTorch checkpoint (.pth) to ONNX (.onnx).

Usage:
    python convert_pth_to_onnx.py
    python convert_pth_to_onnx.py --checkpoint weights/best.pth --output weights/best.onnx
"""

import argparse
import sys
import time
from pathlib import Path

# Setup paths
BACKEND_DIR = Path(__file__).parent.resolve()
REPO_DIR = BACKEND_DIR / "RT-DETRv4"
if str(REPO_DIR) not in sys.path:
    sys.path.insert(0, str(REPO_DIR))

import torch
import torch.nn as nn
try:
    import onnx
except ImportError:
    onnx = None
import onnxruntime as ort
from engine.core import YAMLConfig

DEFAULT_CONFIG = REPO_DIR / "configs" / "dfine" / "dfine_hgnetv2_l_trashcan.yml"
DEFAULT_CKPT = BACKEND_DIR / "weights" / "best.pth"
DEFAULT_OUTPUT = BACKEND_DIR / "weights" / "best.onnx"


class ExportWrapper(nn.Module):
    """Wraps deployed model and postprocessor into a single end-to-end graph."""

    def __init__(self, model, postprocessor):
        super().__init__()
        self.model = model
        self.postprocessor = postprocessor

    def forward(self, images, orig_target_sizes):
        outputs = self.model(images)
        return self.postprocessor(outputs, orig_target_sizes)


def convert_pth_to_onnx(
    config_path: Path = DEFAULT_CONFIG,
    ckpt_path: Path = DEFAULT_CKPT,
    output_path: Path = DEFAULT_OUTPUT,
    opset: int = 16,
    simplify: bool = True,
):
    print("=" * 60)
    print("RT-DETRv4 / D-FINE: PyTorch (.pth) -> ONNX (.onnx) Converter")
    print("=" * 60)

    if not config_path.exists():
        print(f"[ERROR] Config file not found: {config_path}")
        sys.exit(1)

    if not ckpt_path.exists():
        print(f"[ERROR] Checkpoint file not found: {ckpt_path}")
        sys.exit(1)

    print(f"Config:     {config_path}")
    print(f"Checkpoint: {ckpt_path} ({ckpt_path.stat().st_size / (1024*1024):.1f} MB)")
    print(f"Output:     {output_path}")
    print(f"Opset:      {opset}")
    print("-" * 60)

    # 1. Load YAML architecture config
    print("[1/5] Loading architecture configuration...")
    cfg = YAMLConfig(str(config_path), resume=str(ckpt_path))

    if "HGNetv2" in cfg.yaml_cfg:
        cfg.yaml_cfg["HGNetv2"]["pretrained"] = False

    # 2. Load PyTorch weights
    print("[2/5] Loading PyTorch weights into memory...")
    checkpoint = torch.load(str(ckpt_path), map_location="cpu")
    state = checkpoint.get("ema", {}).get("module") or checkpoint.get("model", checkpoint)
    cfg.model.load_state_dict(state)

    # 3. Deploy model & postprocessor
    print("[3/5] Deploying model and embedded postprocessor...")
    deploy_model = cfg.model.deploy()
    deploy_post = cfg.postprocessor.deploy()
    wrapper = ExportWrapper(deploy_model, deploy_post)
    wrapper.eval()

    # Create dummy inputs for tracing
    dummy_image = torch.randn(1, 3, 640, 640, dtype=torch.float32)
    dummy_size = torch.tensor([[640, 640]], dtype=torch.int64)

    # Test forward pass
    with torch.no_grad():
        _ = wrapper(dummy_image, dummy_size)
    print("  PyTorch forward pass verified successfully.")

    # 4. Export to ONNX
    print(f"[4/5] Exporting to ONNX (opset {opset})...")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    t0 = time.time()

    torch.onnx.export(
        wrapper,
        (dummy_image, dummy_size),
        str(output_path),
        input_names=["images", "orig_target_sizes"],
        output_names=["labels", "boxes", "scores"],
        dynamic_axes={
            "images": {0: "batch_size"},
            "orig_target_sizes": {0: "batch_size"},
            "labels": {0: "batch_size"},
            "boxes": {0: "batch_size"},
            "scores": {0: "batch_size"},
        },
        opset_version=opset,
        do_constant_folding=True,
    )
    export_time = time.time() - t0
    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"  Exported in {export_time:.1f}s! File size: {size_mb:.1f} MB")

    # Optional ONNX Simplifier
    if simplify:
        try:
            import onnxsim

            print("  Running onnxsim (graph optimization)...")
            model_proto = onnx.load(str(output_path))
            model_sim, check = onnxsim.simplify(model_proto)
            if check:
                onnx.save(model_sim, str(output_path))
                new_size_mb = output_path.stat().st_size / (1024 * 1024)
                print(f"  Simplified model saved ({new_size_mb:.1f} MB).")
        except ImportError:
            pass  # onnxsim not installed, keep standard export

    # 5. Verify exported model
    print("[5/5] Verifying ONNX model integrity...")
    if onnx is not None:
        model_proto = onnx.load(str(output_path))
        onnx.checker.check_model(model_proto)
        print("  ONNX model schema verified.")
    else:
        print("  (onnx package not installed; skipping schema checker)")

    # Test inference with ONNX Runtime
    session = ort.InferenceSession(str(output_path), providers=["CPUExecutionProvider"])
    inputs = {
        "images": dummy_image.numpy(),
        "orig_target_sizes": dummy_size.numpy(),
    }
    outs = session.run(None, inputs)
    print(f"  ONNX Runtime test passed! Output shapes:")
    print(f"    - labels: {outs[0].shape}")
    print(f"    - boxes:  {outs[1].shape}")
    print(f"    - scores: {outs[2].shape}")

    print("=" * 60)
    print(f"[SUCCESS] ONNX model ready at:\n  {output_path}")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert PyTorch .pth to ONNX")
    parser.add_argument("-c", "--config", type=Path, default=DEFAULT_CONFIG, help="Path to YAML config")
    parser.add_argument("-r", "--checkpoint", type=Path, default=DEFAULT_CKPT, help="Path to .pth checkpoint")
    parser.add_argument("-o", "--output", type=Path, default=DEFAULT_OUTPUT, help="Output .onnx path")
    parser.add_argument("--opset", type=int, default=16, help="ONNX opset version")
    parser.add_argument("--no-sim", action="store_true", help="Skip onnxsim simplification")
    args = parser.parse_args()

    convert_pth_to_onnx(
        config_path=args.config,
        ckpt_path=args.checkpoint,
        output_path=args.output,
        opset=args.opset,
        simplify=not args.no_sim,
    )
