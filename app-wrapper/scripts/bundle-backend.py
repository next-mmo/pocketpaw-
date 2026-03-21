#!/usr/bin/env python3
"""
PocketPaw Desktop — Backend Bundle Script

Bundles the PocketPaw Python backend into resources/backend/ for distribution
with the Electron app. Uses the wheel+uv bootstrap strategy:

  1. Build a wheel (.whl) from the project's pyproject.toml
  2. Download the standalone uv binary for the target platform
  3. Stage both into app-wrapper/resources/backend/

On first launch, the Electron app will use these to create a venv and install
PocketPaw automatically — no Python required on the end-user's machine.

Usage:
    python scripts/bundle-backend.py                # Current platform
    python scripts/bundle-backend.py --platform win  # Cross-bundle for Windows
    python scripts/bundle-backend.py --platform mac
    python scripts/bundle-backend.py --platform linux
"""

import io
import platform
import shutil
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path
from urllib.request import urlopen

# ─── Paths ───────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent  # pocketpaw-/
APP_WRAPPER = PROJECT_ROOT / "app-wrapper"
BACKEND_DIR = APP_WRAPPER / "resources" / "backend"
UV_DIR = BACKEND_DIR / "uv"

# ─── UV Release Config ──────────────────────────────────────────
# Using standalone uv releases from GitHub
UV_VERSION = "0.6.12"
UV_BASE_URL = f"https://github.com/astral-sh/uv/releases/download/{UV_VERSION}"

# Platform → (archive filename, binary path inside archive)
UV_ARCHIVES = {
    "win": (
        f"uv-x86_64-pc-windows-msvc.zip",
        "uv-x86_64-pc-windows-msvc/uv.exe",
    ),
    "mac": (
        f"uv-aarch64-apple-darwin.tar.gz",
        "uv-aarch64-apple-darwin/uv",
    ),
    "mac-x86": (
        f"uv-x86_64-apple-darwin.tar.gz",
        "uv-x86_64-apple-darwin/uv",
    ),
    "linux": (
        f"uv-x86_64-unknown-linux-musl.tar.gz",
        "uv-x86_64-unknown-linux-musl/uv",
    ),
}


def detect_platform():
    """Auto-detect the current platform key."""
    system = platform.system().lower()
    machine = platform.machine().lower()
    if system == "windows" or system.startswith("win"):
        return "win"
    elif system == "darwin":
        if machine == "arm64" or machine == "aarch64":
            return "mac"
        return "mac-x86"
    else:
        return "linux"


def clean_backend_dir():
    """Remove old artifacts from resources/backend/ (preserve .gitignore)."""
    if BACKEND_DIR.exists():
        for item in BACKEND_DIR.iterdir():
            if item.name == ".gitignore":
                continue
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
    BACKEND_DIR.mkdir(parents=True, exist_ok=True)


def build_wheel():
    """Build a wheel from the project root using uv build."""
    print("  📦 Building wheel...")

    wheel_dir = BACKEND_DIR

    # Strategy 1: uv build (preferred — already available in this project)
    try:
        subprocess.run(
            ["uv", "build", "--wheel", "--out-dir", str(wheel_dir)],
            cwd=str(PROJECT_ROOT),
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        # Strategy 2: python -m build
        try:
            subprocess.run(
                [sys.executable, "-m", "build", "--wheel", "--outdir", str(wheel_dir)],
                cwd=str(PROJECT_ROOT),
                check=True,
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("  ❌ Neither 'uv' nor 'python -m build' could build the wheel.")
            print("     Install uv: pip install uv")
            print("     Or install build: pip install build")
            sys.exit(1)

    # Verify wheel was created
    wheels = list(wheel_dir.glob("pocketpaw-*.whl"))
    if not wheels:
        print("  ❌ No wheel file produced!")
        sys.exit(1)

    # Keep only the latest wheel if multiple exist
    if len(wheels) > 1:
        wheels.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        for old in wheels[1:]:
            old.unlink()
        wheels = [wheels[0]]

    whl = wheels[0]
    size_mb = whl.stat().st_size / (1024 * 1024)
    print(f"  ✅ Wheel: {whl.name} ({size_mb:.1f} MB)")
    return whl


def download_uv(plat):
    """Download the standalone uv binary for the target platform."""
    if plat not in UV_ARCHIVES:
        print(f"  ❌ Unknown platform: {plat}")
        sys.exit(1)

    archive_name, binary_path = UV_ARCHIVES[plat]
    url = f"{UV_BASE_URL}/{archive_name}"

    print(f"  📥 Downloading uv {UV_VERSION} for {plat}...")
    print(f"     {url}")

    UV_DIR.mkdir(parents=True, exist_ok=True)

    with urlopen(url) as resp:
        data = resp.read()

    # Extract the uv binary from the archive
    if archive_name.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            # Extract just the uv binary
            uv_data = zf.read(binary_path)
            dest = UV_DIR / Path(binary_path).name
            dest.write_bytes(uv_data)
    elif archive_name.endswith(".tar.gz"):
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
            member = tf.getmember(binary_path)
            extracted = tf.extractfile(member)
            if extracted is None:
                print(f"  ❌ Could not extract {binary_path} from archive")
                sys.exit(1)
            dest = UV_DIR / Path(binary_path).name
            dest.write_bytes(extracted.read())
    else:
        print(f"  ❌ Unknown archive format: {archive_name}")
        sys.exit(1)

    # Make executable on Linux/Mac
    if plat != "win":
        dest.chmod(0o755)

    size_mb = dest.stat().st_size / (1024 * 1024)
    print(f"  ✅ uv binary: {dest} ({size_mb:.1f} MB)")
    return dest


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Bundle PocketPaw backend for Electron")
    parser.add_argument(
        "--platform",
        choices=["win", "mac", "mac-x86", "linux"],
        default=None,
        help="Target platform (default: auto-detect)",
    )
    args = parser.parse_args()

    plat = args.platform or detect_platform()

    print(f"\n  🔧 Bundling PocketPaw backend for: {plat}")
    print(f"  📁 Output: {BACKEND_DIR}\n")

    # Step 1: Clean old artifacts
    clean_backend_dir()

    # Step 2: Build wheel
    whl = build_wheel()

    # Step 3: Download uv binary
    uv_bin = download_uv(plat)

    # Summary
    print(f"\n  ✅ Backend bundle ready!")
    print(f"     Wheel: {whl.name}")
    print(f"     UV:    {uv_bin}")
    print(f"     Dir:   {BACKEND_DIR}\n")
    print(f"  Next: npm run release:win (or :mac / :linux)\n")


if __name__ == "__main__":
    main()
