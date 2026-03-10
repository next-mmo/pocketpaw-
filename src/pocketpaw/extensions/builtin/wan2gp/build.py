"""Build WanGP upstream for PocketPaw extension.

Usage: python build.py

This script runs inside the PocketPaw sandbox which already provides:
- Python (via uv)
- Node.js + pnpm (via nodejs.py → ~/.pocketpaw/node/)
- git

The sandbox adds managed Node.js to PATH, so shutil.which() finds pnpm/npx.
"""

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
UPSTREAM_DIR = SCRIPT_DIR / "upstream"
EXT_DIR = SCRIPT_DIR
UI_DIR = SCRIPT_DIR / "ui"

REPO_URL = "https://github.com/deepbeepmeep/Wan2GP.git"


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
    # 1. Clone upstream if missing or empty
    if not (UPSTREAM_DIR / "wgp.py").exists():
        if UPSTREAM_DIR.exists():
            shutil.rmtree(UPSTREAM_DIR, ignore_errors=True)
        print("==> Cloning WanGP upstream...", flush=True)
        run(["git", "clone", "--depth", "1", REPO_URL, str(UPSTREAM_DIR)])
        # Remove .git so it's not a nested repo.
        # On Windows, git may hold file locks briefly after clone.
        git_dir = UPSTREAM_DIR / ".git"
        if git_dir.exists():
            def _force_remove(func, path, exc_info):
                """Handle read-only + locked files on Windows."""
                os.chmod(path, 0o777)
                for attempt in range(3):
                    try:
                        func(path)
                        return
                    except PermissionError:
                        time.sleep(1)
                # Last attempt — let it raise
                func(path)
            time.sleep(1)  # Let git release file handles
            shutil.rmtree(git_dir, onerror=_force_remove)

    # 2. Build the React UI wrapper
    print("==> Building WanGP UI wrapper...", flush=True)
    npm = which("npm")

    # Install UI deps if node_modules missing
    node_modules = UI_DIR / "node_modules"
    if not node_modules.exists():
        print("==> Installing UI dependencies...", flush=True)
        run([npm, "install"], cwd=UI_DIR)

    # Build with Vite
    npx = which("npx")
    run(
        [npx, "vite", "build"],
        cwd=UI_DIR,
    )

    print("==> Build complete!", flush=True)
    print(f"    index.html + assets/ written to {EXT_DIR}")


if __name__ == "__main__":
    main()
