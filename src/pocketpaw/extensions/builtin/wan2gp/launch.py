"""WanGP launcher for PocketPaw.

This thin wrapper changes into the upstream/ directory and runs wgp.py.
It uses os.chdir + os.execv so the process IS wgp.py (no subprocess),
keeping stdout/stderr on the same pipe PocketPaw monitors.

On Windows os.execv is emulated via _execv which replaces the process
image, so PocketPaw's Popen still tracks the correct PID and pipe.
"""

import argparse
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
UPSTREAM_DIR = SCRIPT_DIR / "upstream"


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch WanGP from PocketPaw")
    parser.add_argument("--port", type=int, required=True, help="Gradio server port")
    args = parser.parse_args()

    wgp_script = UPSTREAM_DIR / "wgp.py"
    if not wgp_script.exists():
        print(f"ERROR: wgp.py not found at {wgp_script}", file=sys.stderr)
        print("Please run the install step first.", file=sys.stderr)
        sys.exit(1)

    print(f"==> Launching WanGP on port {args.port}...", flush=True)
    print(f"    cwd: {UPSTREAM_DIR}", flush=True)

    # Change working directory to upstream/ so WanGP finds its assets
    os.chdir(str(UPSTREAM_DIR))

    # Build the command to exec
    python = sys.executable
    cmd = [
        python,
        str(wgp_script),
        "--server-port", str(args.port),
        "--server-name", "127.0.0.1",
    ]

    # Flush before exec so the launch messages are sent
    sys.stdout.flush()
    sys.stderr.flush()

    # Replace this process with wgp.py — this keeps the same PID and
    # the same stdout/stderr pipe that PocketPaw is reading from.
    # On Windows, os.execv still works but spawns a new process.
    # To handle Windows properly, we use os.execv which will make
    # the child inherit our file descriptors (pipes).
    os.execv(python, cmd)


if __name__ == "__main__":
    main()
