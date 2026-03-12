#!/usr/bin/env python3
"""
PocketPaw Desktop — Nuitka Build Script

Compiles the PocketPaw Python backend into a standalone binary using Nuitka.
The resulting binary is placed in app-wrapper/resources/backend/ for bundling
with Electron via electron-builder.

Usage:
    python scripts/build-backend.py           # Build for current platform
    python scripts/build-backend.py --onefile # Single-file binary

Prerequisites:
    pip install nuitka
    # Windows: Visual Studio Build Tools
    # macOS:   xcode-select --install
    # Linux:   sudo apt install gcc g++
"""

import platform
import subprocess
import sys
from pathlib import Path

APP_NAME = "pocketpaw-server"
ENTRY = "src/pocketpaw/__main__.py"

# Resolve paths relative to the project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent  # pocketpaw-/
APP_WRAPPER = PROJECT_ROOT / "app-wrapper"
OUTPUT_DIR = APP_WRAPPER / "resources" / "backend"

# PocketPaw version from pyproject.toml (fallback)
try:
    import tomllib
    with open(PROJECT_ROOT / "pyproject.toml", "rb") as f:
        pyproject = tomllib.load(f)
    VERSION = pyproject.get("project", {}).get("version", "0.4.9")
except Exception:
    VERSION = "0.4.9"


def build():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable, "-m", "nuitka",
        "--standalone",
        "--enable-plugin=anti-bloat",
        "--assume-yes-for-downloads",
        f"--output-filename={APP_NAME}",
        f"--product-version={VERSION}",
        "--company-name=PocketPaw",
        f"--product-name={APP_NAME}",
        "--file-description=PocketPaw AI Agent Server",
        f"--copyright=Copyright 2026 PocketPaw",
        f"--output-dir={OUTPUT_DIR}",
    ]

    # ── Include PocketPaw packages ────────────────────────────────
    # Core packages that Nuitka needs to find
    packages = [
        "pocketpaw",
        "uvicorn",
        "fastapi",
        "starlette",
        "pydantic",
        "anyio",
        "httpx",
        "jinja2",
        "aiofiles",
        "rich",
        "toml",
        "yaml",
        "dotenv",
        "multipart",
        "websockets",
    ]
    for pkg in packages:
        cmd.append(f"--include-package={pkg}")

    # ── Include data directories (templates, static, css, js) ────
    frontend_dir = PROJECT_ROOT / "src" / "pocketpaw" / "frontend"
    if frontend_dir.exists():
        for subdir in ["templates", "css", "js"]:
            src = frontend_dir / subdir
            if src.exists():
                cmd.append(f"--include-data-dir={src}=pocketpaw/frontend/{subdir}")

    # ── Exclude test/dev modules to reduce binary size ───────────
    cmd.extend([
        "--nofollow-import-to=pytest,unittest,test,setuptools,pip,tkinter",
        "--nofollow-import-to=sphinx,docutils,pygments",
    ])

    # ── Platform-specific flags ──────────────────────────────────
    if platform.system() == "Windows":
        cmd.extend([
            "--windows-disable-console",  # No console window
        ])
        icon = APP_WRAPPER / "resources" / "icon.ico"
        if icon.exists():
            cmd.append(f"--windows-icon-from-ico={icon}")

    elif platform.system() == "Darwin":
        icon = APP_WRAPPER / "resources" / "icon.icns"
        if icon.exists():
            cmd.append(f"--macos-app-icon={icon}")

    # ── Onefile option ───────────────────────────────────────────
    if "--onefile" in sys.argv:
        cmd.append("--onefile")

    # ── Speed up rebuilds ────────────────────────────────────────
    cmd.append("--ccache")

    # Entry point
    cmd.append(str(PROJECT_ROOT / ENTRY))

    print(f"\n  🔧 Building {APP_NAME} v{VERSION}...")
    print(f"  📁 Output: {OUTPUT_DIR}")
    print(f"  🖥️  Platform: {platform.system()} {platform.machine()}")
    print(f"\n  Command: {' '.join(str(c) for c in cmd)}\n")

    result = subprocess.run(cmd)
    if result.returncode == 0:
        # Find the output binary
        if platform.system() == "Windows":
            binary = OUTPUT_DIR / f"{APP_NAME}.exe"
        else:
            binary = OUTPUT_DIR / APP_NAME

        if binary.exists():
            size_mb = binary.stat().st_size / (1024 * 1024)
            print(f"\n  ✅ Build complete: {binary} ({size_mb:.1f} MB)\n")
        else:
            # Standalone mode creates a .dist directory
            dist_dir = OUTPUT_DIR / f"{APP_NAME}.dist"
            if dist_dir.exists():
                print(f"\n  ✅ Build complete: {dist_dir}\n")
            else:
                print(f"\n  ⚠️  Build completed but binary not found at expected path\n")
    else:
        print(f"\n  ❌ Build failed with exit code {result.returncode}\n")
        sys.exit(1)


if __name__ == "__main__":
    build()
