"""Build Design Builder frontend for PocketPaw extension.

Usage: python build.py

This script runs inside the PocketPaw sandbox which already provides:
- Python (via uv)
- Node.js + npm/pnpm (via nodejs.py → ~/.pocketpaw/node/)

The sandbox adds managed Node.js to PATH, so shutil.which() finds npm/npx/pnpm.
"""

import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
UI_DIR = SCRIPT_DIR / "ui"
EXT_DIR = SCRIPT_DIR


def which(name: str) -> str:
    """Find a binary on PATH. Sandbox already includes managed Node.js."""
    found = shutil.which(name)
    if found:
        return found
    raise FileNotFoundError(f"{name} not found on PATH")


def run(cmd: list[str], cwd: Path | None = None) -> None:
    """Run a command, printing output."""
    print(f"==> {' '.join(cmd)}", flush=True)
    result = subprocess.run(cmd, cwd=str(cwd) if cwd else None)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed (exit {result.returncode}): {' '.join(cmd)}")


def main() -> None:
    # Try pnpm first, fallback to npm
    try:
        pkg_mgr = which("pnpm")
    except FileNotFoundError:
        pkg_mgr = which("npm")

    # 1. Install backend deps if node_modules missing
    backend_nm = SCRIPT_DIR / "node_modules"
    if not backend_nm.exists():
        print("==> Installing backend dependencies...", flush=True)
        run([pkg_mgr, "install", "--no-frozen-lockfile"], cwd=SCRIPT_DIR)

    # 2. Install UI deps if node_modules missing
    ui_nm = UI_DIR / "node_modules"
    if not ui_nm.exists():
        print("==> Installing UI dependencies...", flush=True)
        run([pkg_mgr, "install", "--no-frozen-lockfile"], cwd=UI_DIR)

    # 3. Build with Vite — output to extension root for iframe loading
    index_html = EXT_DIR / "index.html"
    if not index_html.exists():
        print("==> Building Design Builder frontend...", flush=True)
        npx = which("npx")
        run(
            [npx, "vite", "build", "--base", "./", "--outDir", str(EXT_DIR), "--emptyOutDir", "false"],
            cwd=UI_DIR,
        )

    print("==> Build complete!", flush=True)
    print(f"    index.html + assets/ written to {EXT_DIR}")


if __name__ == "__main__":
    main()
