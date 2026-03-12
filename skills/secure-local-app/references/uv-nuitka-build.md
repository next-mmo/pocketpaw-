# UV + Nuitka Build Guide

Using `uv` as your Python package manager with Nuitka compilation.

## Why UV Matters for Builds

UV changes how you manage dependencies, which affects Nuitka compilation:
- UV uses `pyproject.toml` and `uv.lock` instead of `requirements.txt`
- UV creates `.venv` automatically — Nuitka needs to find packages there
- UV is 10-100x faster than pip for installs (great for CI/CD)

## Project Structure

```
your-app/
├── pyproject.toml          # UV project config
├── uv.lock                 # UV lockfile
├── .venv/                  # UV virtual environment
├── src/
│   └── backend/
│       ├── __init__.py
│       ├── main.py         # FastAPI entry point
│       ├── api/
│       │   ├── __init__.py
│       │   ├── routes.py
│       │   └── auth.py     # Casdoor JWT validation
│       ├── core/
│       │   ├── __init__.py
│       │   ├── license.py
│       │   ├── fingerprint.py
│       │   └── integrity.py
│       └── services/
│           ├── __init__.py
│           └── processing.py  # Business logic (server-gated)
├── electron/                  # Electron-Vite frontend
├── scripts/
│   └── build.py               # Build script
└── assets/
```

## pyproject.toml Setup

```toml
[project]
name = "your-app-backend"
version = "1.0.0"
description = "Your App Backend"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "pyjwt[crypto]>=2.9.0",
    "httpx>=0.27.0",
    "cryptography>=43.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "ruff>=0.6.0",
]
build = [
    "nuitka>=2.4",
    "ordered-set>=4.1.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.uv]
dev-dependencies = [
    "pytest>=8.0",
    "ruff>=0.6.0",
]
```

## UV Commands for Build Workflow

```bash
# Initialize project (if starting fresh)
uv init your-app-backend
cd your-app-backend

# Add dependencies
uv add fastapi uvicorn pyjwt[crypto] httpx cryptography

# Add Nuitka as build dependency
uv add --group build nuitka ordered-set

# Add dev dependencies
uv add --dev pytest ruff

# Sync environment (install everything from lockfile)
uv sync

# Sync with build dependencies included
uv sync --group build

# Run your app in development
uv run uvicorn src.backend.main:app --reload --port 8080

# Run Nuitka via uv (ensures correct venv)
uv run python -m nuitka --help
```

## Building with Nuitka via UV

### Option 1: Direct UV + Nuitka Command

```bash
# Make sure build deps are installed
uv sync --group build

# Compile with Nuitka using uv run
uv run python -m nuitka \
  --standalone \
  --onefile \
  --enable-plugin=anti-bloat \
  --include-package=uvicorn \
  --include-package=fastapi \
  --include-package=starlette \
  --include-package=pydantic \
  --include-package=anyio \
  --include-package=httpx \
  --include-package=jwt \
  --include-package=cryptography \
  --include-data-dir=./assets=assets \
  --nofollow-import-to=pytest,unittest,test,setuptools,pip,ruff \
  --output-filename=backend \
  --assume-yes-for-downloads \
  src/backend/main.py
```

### Option 2: Build Script (recommended)

```python
#!/usr/bin/env python3
"""scripts/build.py — Build backend with Nuitka via UV."""
import platform
import subprocess
import sys
from pathlib import Path

# Config
APP_NAME = "backend"
VERSION = "1.0.0"
ENTRY_POINT = "src/backend/main.py"
COMPANY = "Your Company"

# Packages to include (your FastAPI dependencies)
INCLUDE_PACKAGES = [
    "uvicorn",
    "fastapi",
    "starlette",
    "pydantic",
    "pydantic_core",
    "anyio",
    "httpx",
    "jwt",
    "cryptography",
    "cffi",
]

# Packages to exclude (dev-only, reduces binary size)
EXCLUDE_PACKAGES = [
    "pytest", "unittest", "test", "setuptools",
    "pip", "ruff", "nuitka", "tkinter",
]

# Data directories to include
DATA_DIRS = {
    "./assets": "assets",
}


def build():
    cmd = [
        sys.executable, "-m", "nuitka",
        "--standalone",
        "--onefile",
        "--enable-plugin=anti-bloat",
        "--assume-yes-for-downloads",
        "--remove-output",
        f"--output-filename={APP_NAME}",
        f"--product-name={APP_NAME}",
        f"--product-version={VERSION}",
        f"--company-name={COMPANY}",
    ]

    # Include packages
    for pkg in INCLUDE_PACKAGES:
        cmd.append(f"--include-package={pkg}")

    # Exclude packages
    for pkg in EXCLUDE_PACKAGES:
        cmd.append(f"--nofollow-import-to={pkg}")

    # Data directories
    for src, dest in DATA_DIRS.items():
        if Path(src).exists():
            cmd.append(f"--include-data-dir={src}={dest}")

    # Platform-specific
    system = platform.system()
    if system == "Windows":
        cmd.extend([
            "--windows-disable-console",
        ])
        icon = Path("assets/icon.ico")
        if icon.exists():
            cmd.append(f"--windows-icon-from-ico={icon}")
    elif system == "Darwin":
        icon = Path("assets/icon.icns")
        if icon.exists():
            cmd.append(f"--macos-app-icon={icon}")

    cmd.append(ENTRY_POINT)

    print(f"Building {APP_NAME} v{VERSION}...")
    print(f"Platform: {system}")
    print(f"Python: {sys.version}")
    print(f"Command: {' '.join(cmd)}\n")

    result = subprocess.run(cmd)

    if result.returncode == 0:
        print(f"\nBuild successful! Binary: ./{APP_NAME}")
    else:
        print(f"\nBuild failed with code {result.returncode}")
        sys.exit(1)


if __name__ == "__main__":
    build()
```

Run it:

```bash
# Build via uv
uv run python scripts/build.py

# Or add it as a script in pyproject.toml:
# [project.scripts]
# build = "scripts.build:build"
# Then: uv run build
```

### Option 3: UV Script Entry

```toml
# pyproject.toml
[project.scripts]
serve = "backend.main:start_server"
build-binary = "scripts.build:build"
```

```bash
# Run in dev
uv run serve

# Build binary
uv run build-binary
```

## CI/CD with UV + Nuitka

```yaml
# .github/workflows/build.yml
name: Build Desktop App

on:
  push:
    tags: ['v*']

jobs:
  build-backend:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v3
        with:
          version: "latest"

      - name: Set up Python
        run: uv python install 3.12

      - name: Install dependencies
        run: uv sync --group build

      - name: Build with Nuitka
        run: uv run python scripts/build.py

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: backend-${{ matrix.os }}
          path: |
            backend
            backend.exe
```

## UV Workspace (Monorepo)

If your backend and shared libs are in a UV workspace:

```toml
# Root pyproject.toml
[tool.uv.workspace]
members = [
    "packages/backend",
    "packages/shared",
]

# packages/backend/pyproject.toml
[project]
name = "backend"
dependencies = [
    "shared",       # workspace dependency
    "fastapi>=0.115.0",
]

# packages/shared/pyproject.toml
[project]
name = "shared"
# shared models, utils, etc.
```

```bash
# Nuitka needs to find workspace packages
uv run python -m nuitka \
  --include-package=shared \
  --include-package=backend \
  packages/backend/main.py
```

## Common UV + Nuitka Issues

### Issue: Nuitka can't find packages

```bash
# Make sure you're running through uv (uses correct .venv)
uv run python -m nuitka ...

# NOT:
python -m nuitka ...  # might use wrong Python/venv
```

### Issue: Lock file out of sync

```bash
# Regenerate lock file
uv lock

# Then sync
uv sync --group build
```

### Issue: Platform-specific dependencies

```toml
# pyproject.toml — platform markers
dependencies = [
    "pywin32>=306; sys_platform == 'win32'",
    "pyobjc>=10.0; sys_platform == 'darwin'",
]
```

### Issue: Nuitka binary can't find data files at runtime

```python
# In your code, use this pattern:
import sys
import os

def get_data_path(relative_path: str) -> str:
    """Get path to data file, works in both dev and compiled mode."""
    if getattr(sys, 'frozen', False):
        # Compiled with Nuitka --onefile
        base = os.path.dirname(sys.executable)
    elif hasattr(sys, '_MEIPASS'):
        # PyInstaller fallback
        base = sys._MEIPASS
    else:
        # Development mode
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, relative_path)
```
