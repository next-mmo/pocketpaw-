"""Build FreeCut upstream frontend for PocketPaw extension.

Usage: python build.py

This script:
1. Clones the FreeCut repo if upstream/ doesn't exist
2. Creates .env with PocketPaw proxy config
3. Installs dependencies via pnpm
4. Builds the Vite app and outputs to the extension root

Works on Windows, macOS, and Linux — no bash required.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
UPSTREAM_DIR = SCRIPT_DIR / "upstream"
EXT_DIR = SCRIPT_DIR

REPO_URL = "https://github.com/peopleinfo/freecut.git"


def run(cmd: list[str], cwd: Path | None = None, **kwargs) -> None:
    """Run a command, streaming output."""
    print(f"==> {' '.join(cmd)}")
    result = subprocess.run(
        cmd, cwd=str(cwd) if cwd else None,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        **kwargs,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Command failed (exit {result.returncode}): {' '.join(cmd)}")


def find_binary(name: str) -> str:
    """Find a binary on PATH, checking managed Node.js location too."""
    # Check PocketPaw-managed Node.js first
    managed_dir = Path.home() / ".pocketpaw" / "node"
    if sys.platform == "win32":
        managed = managed_dir / f"{name}.cmd"
        if not managed.exists():
            managed = managed_dir / f"{name}.exe"
    else:
        managed = managed_dir / "bin" / name

    if managed.exists():
        return str(managed)

    found = shutil.which(name)
    if found:
        return found

    raise FileNotFoundError(
        f"{name} not found. Install Node.js or run the PocketPaw installer first."
    )


def main() -> None:
    # 1. Clone upstream if missing
    if not UPSTREAM_DIR.exists():
        print("==> Cloning FreeCut upstream...")
        run(["git", "clone", "--depth", "1", REPO_URL, str(UPSTREAM_DIR)])
        # Remove .git so it's not a nested repo
        git_dir = UPSTREAM_DIR / ".git"
        if git_dir.exists():
            shutil.rmtree(git_dir)

    # 2. Create .env for PocketPaw API proxy (if missing)
    env_file = UPSTREAM_DIR / ".env"
    if not env_file.exists():
        print("==> Creating .env with PocketPaw proxy config...")
        env_file.write_text(
            "# FreeCut → PocketPaw overrides\n"
            "VITE_API_BASE=/api/v1/plugins/freecut/proxy/api\n",
            encoding="utf-8",
        )

    # 3. Install deps if node_modules missing
    node_modules = UPSTREAM_DIR / "node_modules"
    if not node_modules.exists():
        print("==> Installing dependencies...")
        pnpm = find_binary("pnpm")
        run([pnpm, "install"], cwd=UPSTREAM_DIR)

    # 4. Build with relative base for iframe loading
    print("==> Building FreeCut frontend...")
    npx = find_binary("npx")
    run(
        [npx, "vite", "build", "--base", "./", "--outDir", str(EXT_DIR), "--emptyOutDir", "false"],
        cwd=UPSTREAM_DIR,
    )

    print("==> Build complete!")
    print(f"    index.html + assets/ written to {EXT_DIR}")


if __name__ == "__main__":
    main()
