"""Build Anti-Browser frontend for PocketPaw extension.

Usage: python build.py

This script runs inside the PocketPaw sandbox which already provides:
- Python (via uv)
- Node.js + npm (via nodejs.py → ~/.pocketpaw/node/)

The sandbox adds managed Node.js to PATH, so shutil.which() finds npm/npx.
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
    # 1. Install npm deps if node_modules missing
    node_modules = UI_DIR / "node_modules"
    if not node_modules.exists():
        print("==> Installing dependencies...", flush=True)
        npm = which("npm")
        run([npm, "install"], cwd=UI_DIR)

    # 2. Build with relative base for iframe loading
    #    Use --outDir on CLI to output directly to extension root.
    #    This avoids Vite 7's restriction on outDir being parent of root
    #    (CLI --outDir takes precedence over config).
    print("==> Building Anti-Browser frontend...", flush=True)
    npx = which("npx")
    run(
        [npx, "vite", "build", "--base", "./", "--outDir", str(EXT_DIR), "--emptyOutDir", "false"],
        cwd=UI_DIR,
    )

    print("==> Build complete!", flush=True)
    print(f"    index.html + assets/ written to {EXT_DIR}")


if __name__ == "__main__":
    main()
