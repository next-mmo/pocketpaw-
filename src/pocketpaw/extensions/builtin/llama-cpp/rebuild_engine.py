"""Rebuild llama-cpp-python from source with CUDA or CPU support.

This script clones the llama-cpp-python repo at the matching release
tag (with its compatible llama.cpp submodule), then builds and installs
into the extension's virtual environment.

Usage:
    python rebuild_engine.py [--cuda]

Why rebuild?
  - The default prebuilt wheel may be CPU-only or use a different CUDA version.
  - Building from source with --cuda enables GPU acceleration if you have
    the CUDA Toolkit (nvcc) installed.
  - Building CPU-only from source can also pick up newer architecture support
    if the matching llama.cpp submodule includes it.

Environment:
    This script should be run with the extension's venv Python.
    The --cuda flag sets CMAKE_ARGS to enable CUDA support (requires
    CUDA Toolkit with nvcc to be installed on the system).
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Build from the same version's source to avoid API mismatches.
LLAMA_CPP_PYTHON_TAG = "v0.3.16"


def log(msg: str) -> None:
    """Print with flush so PocketPaw's log reader sees output immediately."""
    print(msg, flush=True)


def run(cmd: list[str], cwd: str | None = None, env: dict | None = None) -> int:
    """Run a command, streaming output."""
    log(f"  $ {' '.join(cmd)}")
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=cwd,
        env=env,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )
    assert proc.stdout is not None
    for line in iter(proc.stdout.readline, b""):
        decoded = line.decode("utf-8", errors="replace").rstrip()
        if decoded:
            log(f"  | {decoded}")
    proc.wait()
    return proc.returncode


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cuda", action="store_true", help="Build with CUDA support")
    args = parser.parse_args()

    ext_root = Path(__file__).parent.resolve()
    venv_python = ext_root / "env" / ("Scripts" if sys.platform == "win32" else "bin") / (
        "python.exe" if sys.platform == "win32" else "python"
    )

    if not venv_python.exists():
        log(f"❌ Venv python not found: {venv_python}")
        sys.exit(1)

    uv = shutil.which("uv")
    if uv is None:
        log("❌ uv is not installed")
        sys.exit(1)

    with tempfile.TemporaryDirectory(prefix="llama_rebuild_") as tmpdir:
        repo_dir = os.path.join(tmpdir, "llama-cpp-python")

        # 1. Clone the repo at the matching tag, with submodules
        log(f"📦 Cloning llama-cpp-python {LLAMA_CPP_PYTHON_TAG}...")
        rc = run([
            "git", "clone",
            "--depth", "1",
            "--branch", LLAMA_CPP_PYTHON_TAG,
            "--recurse-submodules", "--shallow-submodules",
            "https://github.com/abetlen/llama-cpp-python.git",
            repo_dir,
        ])
        if rc != 0:
            log("❌ Failed to clone repository")
            sys.exit(1)

        log(f"✓ Using llama-cpp-python {LLAMA_CPP_PYTHON_TAG} with matching llama.cpp")

        # 2. Build environment
        build_env = os.environ.copy()
        cmake_args = []
        if args.cuda:
            log("🎮 Building with CUDA support...")
            cmake_args.append("-DGGML_CUDA=on")
        else:
            log("💻 Building CPU-only...")

        if cmake_args:
            build_env["CMAKE_ARGS"] = " ".join(cmake_args)

        build_env["PYTHONUNBUFFERED"] = "1"

        # 3. Build & install from source
        log("🔨 Building llama-cpp-python from source (this may take several minutes)...")
        rc = run(
            [
                uv, "pip", "install",
                "--python", str(venv_python),
                f"{repo_dir}[server]",
                "--force-reinstall", "--no-deps",
            ],
            env=build_env,
        )

        if rc != 0:
            log("❌ Build failed!")
            if args.cuda:
                log("💡 CUDA build requires CUDA Toolkit (nvcc) to be installed.")
                log("   Install from: https://developer.nvidia.com/cuda-toolkit")
                log("   Or try rebuilding without --cuda for CPU-only support.")
            else:
                log("💡 CPU build requires a C++ compiler.")
                log("   On Windows: Install 'Visual Studio Build Tools' (C++ workload).")
            sys.exit(1)

    # 4. Verify
    log("✅ Verifying installation...")
    rc = run([
        str(venv_python), "-c",
        "import llama_cpp; print(f'llama-cpp-python version: {llama_cpp.__version__}')"
    ])
    if rc != 0:
        log("❌ Verification failed")
        sys.exit(1)

    log("✅ Engine rebuilt successfully!")
    if not args.cuda:
        log("ℹ️  Built without GPU acceleration. Use --cuda for GPU support.")


if __name__ == "__main__":
    main()
