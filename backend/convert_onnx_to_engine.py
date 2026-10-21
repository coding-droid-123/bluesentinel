"""Build TensorRT engine (.engine) from ONNX with FP16 precision.

Supports:
- Dynamic optimization profiles for 'images' and 'orig_target_sizes'
- TensorRT 8.x, 9.x, and 10.x APIs
- Hardware and environment diagnostic inspection
- Programmatic execution from FastAPI endpoints and CLI
"""

import os
import sys
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

# Paths
BACKEND_DIR = Path(__file__).parent.resolve()
WEIGHTS_DIR = BACKEND_DIR / "weights"
DEFAULT_ONNX_PATH = WEIGHTS_DIR / "bs-s.onnx"
DEFAULT_ENGINE_PATH = WEIGHTS_DIR / "bs-s.engine"


def check_gpu_and_tensorrt_environment(backend_dir: Optional[Path] = None) -> Dict[str, Any]:
    """Inspect the host environment for CUDA GPUs, TensorRT, and model weights."""
    b_dir = backend_dir or BACKEND_DIR
    w_dir = b_dir / "weights"

    # 1. Check PyTorch CUDA & GPU architecture
    cuda_available = False
    device_count = 0
    device_name = "CPU Only (No NVIDIA GPU detected)"
    device_vram_gb = 0.0
    compute_capability = None

    try:
        import torch
        cuda_available = torch.cuda.is_available()
        device_count = torch.cuda.device_count()
        if cuda_available and device_count > 0:
            device_name = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            device_vram_gb = round(props.total_memory / (1024 ** 3), 2)
            compute_capability = f"{props.major}.{props.minor}"
    except Exception as e:
        device_name = f"PyTorch check failed: {e}"

    # 2. Check TensorRT library
    trt_installed = False
    trt_version = None
    try:
        import tensorrt as trt
        trt_installed = True
        trt_version = trt.__version__
    except ImportError:
        trt_installed = False
    except Exception as e:
        trt_installed = False
        trt_version = f"Error: {e}"

    # 3. Available ONNX files in weights/
    available_onnx = []
    existing_engines = []
    if w_dir.exists():
        for p in w_dir.glob("*.onnx"):
            # Compute total size including .data if present
            data_file = p.with_name(f"{p.name}.data")
            total_bytes = p.stat().st_size
            if data_file.exists():
                total_bytes += data_file.stat().st_size
            available_onnx.append({
                "name": p.name,
                "size_mb": round(total_bytes / (1024 * 1024), 2),
                "path": str(p),
            })
        for p in w_dir.glob("*.engine"):
            existing_engines.append({
                "name": p.name,
                "size_mb": round(p.stat().st_size / (1024 * 1024), 2),
                "path": str(p),
                "modified": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(p.stat().st_mtime)),
            })

    # Recommended CLI command if conversion needs to be executed on a dedicated GPU
    onnx_target = available_onnx[0]["name"] if available_onnx else "bs-s.onnx"
    cli_command = f"python convert_onnx_to_engine.py --onnx weights/{onnx_target} --fp16"
    trtexec_command = (
        f"trtexec --onnx=weights/{onnx_target} --saveEngine=weights/{Path(onnx_target).stem}.engine "
        f"--fp16 --minShapes=images:1x3x640x640,orig_target_sizes:1x2 "
        f"--optShapes=images:1x3x640x640,orig_target_sizes:1x2 "
        f"--maxShapes=images:1x3x640x640,orig_target_sizes:1x2"
    )

    return {
        "cuda_available": cuda_available,
        "device_count": device_count,
        "device_name": device_name,
        "device_vram_gb": device_vram_gb,
        "compute_capability": compute_capability,
        "tensorrt_installed": trt_installed,
        "tensorrt_version": trt_version,
        "can_compile": bool(cuda_available and trt_installed),
        "available_onnx": available_onnx,
        "existing_engines": existing_engines,
        "cli_command": cli_command,
        "trtexec_command": trtexec_command,
    }


def build_tensorrt_engine(
    onnx_file: Optional[Path] = None,
    engine_file: Optional[Path] = None,
    fp16: bool = True,
    max_batch_size: int = 1,
    workspace_gb: int = 4,
    log_fn: Optional[Callable[[str], None]] = None,
) -> Dict[str, Any]:
    """Compile ONNX model to hardware-specific TensorRT engine.

    Returns structured dict with outcome and logs.
    """
    logs: List[str] = []

    def log(msg: str):
        logs.append(msg)
        if log_fn:
            log_fn(msg)
        print(msg)

    # Determine paths
    if onnx_file is None:
        # Check bs-s.onnx first, then best.onnx
        if (WEIGHTS_DIR / "bs-s.onnx").exists():
            onnx_file = WEIGHTS_DIR / "bs-s.onnx"
        elif (WEIGHTS_DIR / "best.onnx").exists():
            onnx_file = WEIGHTS_DIR / "best.onnx"
        else:
            onnx_file = DEFAULT_ONNX_PATH

    if engine_file is None:
        engine_file = onnx_file.with_suffix(".engine")

    log("=" * 60)
    log("BlueSentinel — TensorRT Engine Hardware Compiler")
    log("=" * 60)

    # 1. Verify CUDA / GPU
    try:
        import torch
        if not torch.cuda.is_available():
            err = (
                "NVIDIA CUDA GPU is not detected in the current Python environment. "
                "TensorRT compiles binary instruction kernels directly targeted to the "
                "hardware Streaming Multiprocessors (SM) of an NVIDIA GPU."
            )
            log(f"[ERROR] {err}")
            return {
                "success": False,
                "error": err,
                "error_code": "NO_CUDA_GPU",
                "logs": logs,
            }
        gpu_name = torch.cuda.get_device_name(0)
        log(f"Target GPU Architecture : {gpu_name}")
    except Exception as e:
        log(f"[WARNING] Could not query PyTorch CUDA properties: {e}")
        gpu_name = "Unknown NVIDIA GPU"

    # 2. Verify TensorRT
    try:
        import tensorrt as trt
        log(f"TensorRT Version        : {trt.__version__}")
    except ImportError:
        err = (
            "TensorRT Python package is not installed in the current environment. "
            "Install via: pip install tensorrt or use the trtexec CLI tool."
        )
        log(f"[ERROR] {err}")
        return {
            "success": False,
            "error": err,
            "error_code": "NO_TENSORRT_PACKAGE",
            "logs": logs,
        }

    # 3. Verify ONNX file
    if not onnx_file.exists():
        err = f"ONNX file not found at: {onnx_file}"
        log(f"[ERROR] {err}")
        return {
            "success": False,
            "error": err,
            "error_code": "ONNX_NOT_FOUND",
            "logs": logs,
        }

    file_size_mb = onnx_file.stat().st_size / (1024 * 1024)
    log(f"Input ONNX              : {onnx_file.name} ({file_size_mb:.1f} MB)")
    log(f"Output Engine Path      : {engine_file}")
    log(f"Target Precision        : {'FP16 (Half)' if fp16 else 'FP32'}")
    log(f"Max Batch Size          : {max_batch_size}")
    log(f"Workspace Memory Pool   : {workspace_gb} GB")

    try:
        logger = trt.Logger(trt.Logger.INFO)
        builder = trt.Builder(logger)

        # 1. Create Network Definition with EXPLICIT_BATCH
        flag = 1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH)
        network = builder.create_network(flag)
        parser = trt.OnnxParser(network, logger)

        # 2. Parse ONNX Model
        log("\n[1/3] Parsing ONNX computational graph...")
        with open(onnx_file, "rb") as f:
            if not parser.parse(f.read()):
                parse_errors = []
                for error in range(parser.num_errors):
                    err_msg = str(parser.get_error(error))
                    parse_errors.append(err_msg)
                    log(f"  - {err_msg}")
                return {
                    "success": False,
                    "error": f"Failed to parse ONNX: {'; '.join(parse_errors[:3])}",
                    "error_code": "ONNX_PARSE_ERROR",
                    "logs": logs,
                }
        log("  ONNX model parsed successfully!")

        # 3. Configure Builder
        log("\n[2/3] Configuring builder and dynamic optimization profiles...")
        config = builder.create_builder_config()

        # Workspace Memory Limit
        if hasattr(config, "set_memory_pool_limit"):
            config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, workspace_gb * (1 << 30))
        else:
            config.max_workspace_size = workspace_gb * (1 << 30)

        # FP16 Precision
        if fp16:
            if builder.platform_has_fast_fp16:
                config.set_flag(trt.BuilderFlag.FP16)
                log("  FP16 Tensor Core acceleration flag enabled.")
            else:
                log("  [WARNING] Platform does not indicate native fast FP16. Building in FP32.")

        # 4. Optimization Profile for Dynamic Axes (images & orig_target_sizes)
        profile = builder.create_optimization_profile()
        profile.set_shape(
            "images",
            min=(1, 3, 640, 640),
            opt=(1, 3, 640, 640),
            max=(max_batch_size, 3, 640, 640),
        )
        profile.set_shape(
            "orig_target_sizes",
            min=(1, 2),
            opt=(1, 2),
            max=(max_batch_size, 2),
        )
        config.add_optimization_profile(profile)

        # 5. Build and Serialize Engine
        log("\n[3/3] Compiling serialized TensorRT engine (calibrating CUDA kernels)...")
        t0 = time.time()

        if hasattr(builder, "build_serialized_network"):
            serialized_engine = builder.build_serialized_network(network, config)
        else:
            engine = builder.build_engine(network, config)
            serialized_engine = engine.serialize() if engine else None

        if serialized_engine is None:
            err = "TensorRT engine compilation failed during kernel profiling."
            log(f"[ERROR] {err}")
            return {
                "success": False,
                "error": err,
                "error_code": "BUILD_FAILED",
                "logs": logs,
            }

        # Save to disk
        engine_file.parent.mkdir(parents=True, exist_ok=True)
        with open(engine_file, "wb") as f:
            f.write(serialized_engine)

        elapsed = time.time() - t0
        size_mb = round(engine_file.stat().st_size / (1024 * 1024), 2)
        log(f"\n[SUCCESS] Engine successfully compiled in {elapsed:.1f}s!")
        log(f"Saved to: {engine_file} ({size_mb} MB)")

        return {
            "success": True,
            "engine_file": str(engine_file),
            "engine_name": engine_file.name,
            "size_mb": size_mb,
            "elapsed_sec": round(elapsed, 1),
            "precision": "FP16" if fp16 else "FP32",
            "gpu_name": gpu_name,
            "logs": logs,
        }
    except Exception as exc:
        err = f"Unexpected build error: {exc}"
        log(f"[ERROR] {err}")
        return {
            "success": False,
            "error": err,
            "error_code": "EXCEPTION",
            "logs": logs,
        }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Compile ONNX model to TensorRT engine")
    parser.add_argument("--onnx", type=str, default=str(DEFAULT_ONNX_PATH), help="Path to input .onnx")
    parser.add_argument("--output", type=str, default=None, help="Path to output .engine")
    parser.add_argument("--no-fp16", action="store_true", help="Disable FP16 precision")
    parser.add_argument("--workspace", type=int, default=4, help="Workspace memory in GB")
    parser.add_argument("--batch", type=int, default=1, help="Max batch size")
    args = parser.parse_args()

    res = build_tensorrt_engine(
        onnx_file=Path(args.onnx),
        engine_file=Path(args.output) if args.output else None,
        fp16=not args.no_fp16,
        max_batch_size=args.batch,
        workspace_gb=args.workspace,
    )
    if not res.get("success"):
        sys.exit(1)
