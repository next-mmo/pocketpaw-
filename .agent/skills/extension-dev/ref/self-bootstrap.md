# Self-Bootstrapping Pattern (External Repos)

For extensions that wrap an existing open-source project (e.g. Gradio apps, Streamlit dashboards), use the **self-bootstrapping pattern**: clone the upstream repo at install time via `build.py`, then run its entry point via `start.path`.

## When to Use

- Wrapping an external GitHub project that has its own `requirements.txt`
- The upstream project has a Gradio/Streamlit/FastAPI UI you want to embed
- You need to modify or extend the upstream code after cloning

## Architecture

```text
my-ext/
├── extension.json       ← PocketPaw manifest
├── build.py             ← Clones upstream repo during install
├── requirements.txt     ← (or upstream has its own)
├── upstream/            ← Cloned at install time (gitignored)
│   ├── wgp.py           ← Upstream entry point
│   ├── requirements.txt ← Upstream dependencies
│   └── ...
├── index.html           ← Built by Vite → PocketPaw serves this
├── assets/              ← Vite build output
└── ui/                  ← React wrapper (optional — may use upstream UI)
```

## Example: WanGP (Gradio Video Generator)

```json
{
  "id": "wan2gp",
  "name": "WanGP",
  "version": "1.0.0",
  "description": "AI video generator for the GPU Poor.",
  "icon": "video",
  "route": "wan2gp",
  "entry": "index.html",
  "type": "plugin",
  "autostart": false,
  "scopes": ["storage.read", "storage.write"],
  "sandbox": {
    "python": "3.11",
    "venv": "env",
    "torch": {
      "version": "2.7.1",
      "cuda": "cu128",
      "extras": ["torchvision==0.22.1", "torchaudio==2.7.1"]
    },
    "env": {
      "GRADIO_SERVER_NAME": "127.0.0.1"
    }
  },
  "install": {
    "steps": [
      { "node": true },
      { "run": "python build.py" },
      { "torch": true },
      { "pip": "requirements.txt", "path": "upstream" }
    ]
  },
  "start": {
    "command": "python wgp.py --server-port __PORT__ --server-name 127.0.0.1",
    "daemon": true,
    "ready_pattern": "Running on local URL",
    "port": "auto",
    "path": "upstream"
  }
}
```

**Key points:**

1. **`build.py`** clones the upstream repo into `upstream/` (shallow clone, `.git` removed)
2. **`{ "pip": "requirements.txt", "path": "upstream" }`** installs the upstream's own dependencies
3. **`start.path: "upstream"`** runs the command from the cloned directory
4. **`ready_pattern`** matches the upstream server's startup message (e.g. Gradio's `"Running on local URL"`)
5. **`sandbox.env.GRADIO_SERVER_NAME`** forces Gradio to bind to `127.0.0.1` instead of `0.0.0.0`

## Build Script Template

```python
"""Build script for self-bootstrapping extension.

Runs inside PocketPaw sandbox (Python, Node.js, git all on PATH).
"""
import os
import shutil
import subprocess
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
UPSTREAM_DIR = SCRIPT_DIR / "upstream"
UI_DIR = SCRIPT_DIR / "ui"
REPO_URL = "https://github.com/owner/repo.git"

def run(cmd, cwd=None):
    print(f"==> {' '.join(cmd)}", flush=True)
    result = subprocess.run(cmd, cwd=str(cwd) if cwd else None)
    if result.returncode != 0:
        raise RuntimeError(f"Failed: {' '.join(cmd)}")

def main():
    # 1. Clone upstream if missing
    if not (UPSTREAM_DIR / "main_script.py").exists():
        if UPSTREAM_DIR.exists():
            shutil.rmtree(UPSTREAM_DIR, ignore_errors=True)
        run(["git", "clone", "--depth", "1", REPO_URL, str(UPSTREAM_DIR)])

        # Remove .git (Windows needs special handling for file locks)
        git_dir = UPSTREAM_DIR / ".git"
        if git_dir.exists():
            def _force_remove(func, path, exc_info):
                os.chmod(path, 0o777)
                for attempt in range(3):
                    try:
                        func(path)
                        return
                    except PermissionError:
                        time.sleep(1)
                func(path)  # final attempt — let it raise
            time.sleep(1)  # let git release file handles
            shutil.rmtree(git_dir, onerror=_force_remove)

    # 2. Build React UI wrapper (if using one)
    if UI_DIR.exists():
        npm = shutil.which("npm")
        if not (UI_DIR / "node_modules").exists():
            run([npm, "install"], cwd=UI_DIR)
        npx = shutil.which("npx")
        run([npx, "vite", "build"], cwd=UI_DIR)

    print("==> Build complete!", flush=True)

if __name__ == "__main__":
    main()
```

## Embedding Third-Party UIs (Gradio, Streamlit, etc.)

When wrapping a project that provides its own web UI, the extension can rely on PocketPaw's proxy to embed the upstream UI directly:

1. **The `ready_pattern`** must match what the upstream framework prints to stdout when ready:
   - Gradio: `"Running on local URL"`
   - Streamlit: `"You can now view"`
   - Uvicorn/FastAPI: `"Uvicorn running on"`
   - Flask: `"Running on http://"`

2. **Force the server to bind to `127.0.0.1`** — not `0.0.0.0`. Set this via:
   - Command flags: `--server-name 127.0.0.1` or `--host 127.0.0.1`
   - Environment variable: `"GRADIO_SERVER_NAME": "127.0.0.1"` in `sandbox.env`

3. **PocketPaw's proxy handles all framing issues automatically:**
   - Strips `X-Frame-Options` and `Content-Security-Policy` from upstream responses
   - Sets `X-Frame-Options: SAMEORIGIN` to allow iframe embedding
   - Skips rate limiting for proxy paths (Gradio fires 100+ parallel requests)

4. **The extension's React dashboard** should show the proxy URL in an iframe when the plugin status is `"running"`:

   ```typescript
   const gradioUrl = port
     ? `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/proxy/`
     : null;
   ```
