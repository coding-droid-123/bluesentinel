"""BlueSentinel Multi-Service Runner
Runs both the Main Backend (port 8000) and Ocean Depth Microservice (port 8001) concurrently.
Automatically manages subprocess lifecycles and provides clean Ctrl+C shutdown.
"""

import os
import sys
import subprocess
import threading
import signal
from pathlib import Path

# Enable ANSI colors on Windows console
os.system("")

ROOT_DIR = Path(__file__).resolve().parent

BACKEND_DIR = ROOT_DIR / "backend"
BACKEND_PYTHON = BACKEND_DIR / "venv" / "Scripts" / "python.exe"
if not BACKEND_PYTHON.exists():
    BACKEND_PYTHON = Path(sys.executable)

DEPTH_DIR = ROOT_DIR / "ocean_depth_service"
DEPTH_PYTHON = DEPTH_DIR / ".venv" / "Scripts" / "python.exe"
if not DEPTH_PYTHON.exists():
    DEPTH_PYTHON = Path(sys.executable)


def stream_logs(pipe, prefix: str, color_code: str):
    RESET = "\033[0m"
    COLOR = f"\033[{color_code}m"
    try:
        for line in iter(pipe.readline, ""):
            if not line:
                break
            print(f"{COLOR}[{prefix}]{RESET} {line.rstrip()}", flush=True)
    except Exception:
        pass


def main():
    print("=" * 64)
    print("  \033[1;34mBlueSentinel Multi-Service Runner\033[0m")
    print("  \033[32m[BACKEND]\033[0m      http://localhost:8000")
    print("  \033[36m[OCEAN-DEPTH]\033[0m  http://localhost:8001")
    print("  Press \033[1;31mCtrl+C\033[0m to stop all services simultaneously.")
    print("=" * 64)

    # 1. Start Ocean Depth Service on port 8001
    depth_proc = subprocess.Popen(
        [
            str(DEPTH_PYTHON),
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "0.0.0.0",
            "--port",
            "8001",
            "--reload",
        ],
        cwd=str(DEPTH_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    # 2. Start Main Backend on port 8000
    backend_proc = subprocess.Popen(
        [
            str(BACKEND_PYTHON),
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
            "--reload",
        ],
        cwd=str(BACKEND_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    t_depth = threading.Thread(
        target=stream_logs,
        args=(depth_proc.stdout, "DEPTH:8001", "36"),
        daemon=True,
    )
    t_backend = threading.Thread(
        target=stream_logs,
        args=(backend_proc.stdout, "BACKEND:8000", "32"),
        daemon=True,
    )

    t_depth.start()
    t_backend.start()

    def shutdown(signum=None, frame=None):
        print("\n\033[1;33m[SHUTDOWN] Stopping all background services...\033[0m")
        for name, proc in [("Ocean Depth (8001)", depth_proc), ("Backend (8000)", backend_proc)]:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=4)
                except subprocess.TimeoutExpired:
                    proc.kill()
        print("\033[1;32m[SHUTDOWN] Both services stopped successfully.\033[0m")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        while True:
            if backend_proc.poll() is not None:
                print(f"[BACKEND:8000] Process exited with code {backend_proc.poll()}.")
                shutdown()
            if depth_proc.poll() is not None:
                print(f"[DEPTH:8001] Process exited with code {depth_proc.poll()}.")
                shutdown()
            threading.Event().wait(1)
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    main()
