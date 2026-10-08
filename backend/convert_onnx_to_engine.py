"""Build TensorRT engine (.engine) from best.onnx with FP16 precision.

Supports:
- Dynamic optimization profiles for 'images' and 'orig_target_sizes'
- TensorRT 8.x, 9.x, and 10.x APIs
"""

import sys
import time
from pathlib import Path

# Paths
BACKEND_DIR = Path(__file__).parent.resolve()
ONNX_PATH = BACKEND_DIR / "weights" / "best.onnx"
ENGINE_PATH = BACKEND_DIR / "weights" / "best.engine"


def build_tensorrt_engine(
    onnx_file: Path = ONNX_PATH,
    engine_file: Path = ENGINE_PATH,
    fp16: bool = True,
    max_batch_size: int = 1,
    workspace_gb: int = 4,
):
    try:
        import tensorrt as trt
    except ImportError:
        print("\n[ERROR] TensorRT Python package is not installed in your current environment.")
        print("Please install TensorRT via: pip install tensorrt")
        print("Or use NVIDIA's official trtexec CLI tool (detailed in the instructions).")
        sys.exit(1)

    if not onnx_file.exists():
        print(f"[ERROR] ONNX file not found at: {onnx_file}")
        sys.exit(1)

    print(f"==================================================")
    print(f"TensorRT Version: {trt.__version__}")
    print(f"Input ONNX:       {onnx_file} ({onnx_file.stat().st_size / (1024*1024):.1f} MB)")
    print(f"Output Engine:    {engine_file}")
    print(f"Precision:        {'FP16' if fp16 else 'FP32'}")
    print(f"Max Batch Size:   {max_batch_size}")
    print(f"==================================================")

    logger = trt.Logger(trt.Logger.INFO)
    builder = trt.Builder(logger)

    # 1. Create Network Definition with EXPLICIT_BATCH
    flag = 1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH)
    network = builder.create_network(flag)
    parser = trt.OnnxParser(network, logger)

    # 2. Parse ONNX Model
    print(f"\n[1/3] Parsing ONNX model...")
    with open(onnx_file, "rb") as f:
        if not parser.parse(f.read()):
            print("\n[ERROR] Failed to parse ONNX:")
            for error in range(parser.num_errors):
                print(f"  - {parser.get_error(error)}")
            sys.exit(1)
    print("  ONNX model parsed successfully!")

    # 3. Configure Builder
    print("\n[2/3] Configuring builder and optimization profile...")
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
            print("  FP16 Tensor Core acceleration enabled.")
        else:
            print("  [WARNING] Platform does not support native fast FP16. Falling back to FP32.")

    # 4. Optimization Profile for Dynamic Axes (images & orig_target_sizes)
    profile = builder.create_optimization_profile()

    # Input: 'images' [batch, 3, 640, 640]
    profile.set_shape(
        "images",
        min=(1, 3, 640, 640),
        opt=(1, 3, 640, 640),
        max=(max_batch_size, 3, 640, 640),
    )

    # Input: 'orig_target_sizes' [batch, 2]
    profile.set_shape(
        "orig_target_sizes",
        min=(1, 2),
        opt=(1, 2),
        max=(max_batch_size, 2),
    )
    config.add_optimization_profile(profile)

    # 5. Build and Serialize Engine
    print(f"\n[3/3] Building serialized TensorRT engine (this typically takes 2-5 minutes)...")
    t0 = time.time()

    # Supports both TensorRT 10.x / 8.6+ build_serialized_network and legacy build_engine
    if hasattr(builder, "build_serialized_network"):
        serialized_engine = builder.build_serialized_network(network, config)
    else:
        engine = builder.build_engine(network, config)
        serialized_engine = engine.serialize() if engine else None

    if serialized_engine is None:
        print("[ERROR] Failed to build TensorRT engine.")
        sys.exit(1)

    # Save to disk
    engine_file.parent.mkdir(parents=True, exist_ok=True)
    with open(engine_file, "wb") as f:
        f.write(serialized_engine)

    elapsed = time.time() - t0
    size_mb = engine_file.stat().st_size / (1024 * 1024)
    print(f"\n[SUCCESS] Engine successfully compiled in {elapsed:.1f}s!")
    print(f"Saved to: {engine_file} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    build_tensorrt_engine()
