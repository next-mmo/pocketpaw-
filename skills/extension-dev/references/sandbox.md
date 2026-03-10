# Sandbox System — Managed Runtimes

> **Core principle: NEVER rely on OS-level installations.** All runtimes (Python, Node.js, CUDA/PyTorch) are managed by PocketPaw within the sandbox. End users should not need to pre-install Python, Node.js, or any other runtime. PocketPaw handles everything.

The sandbox is configured via the `sandbox` field in [extension.json](manifest.md). For daemon processes that run inside the sandbox, see [daemon.md](daemon.md).

## Managed Runtime Architecture

PocketPaw manages three runtime categories, each with its own installer:

| Runtime     | Manager     | Managed Location        | Version Config           | Install Step        |
| ----------- | ----------- | ----------------------- | ------------------------ | ------------------- |
| **Python**  | `uv`        | `<plugin>/env/`         | `sandbox.python: "3.11"` | (automatic)         |
| **Node.js** | `nodejs.py` | `~/.pocketpaw/node/`    | LTS (auto-selected)      | `{ "node": true }`  |
| **PyTorch** | `uv pip`    | inside venv             | `sandbox.torch.version`  | `{ "torch": true }` |
| **CUDA**    | `cuda.py`   | system (detection only) | auto-detect via nvidia   | (detection only)    |

**Key rules:**

- `sandbox.python` specifies the **exact** Python version — `uv` downloads and manages it (never uses system Python)
- `{ "node": true }` install step auto-installs Node.js LTS + pnpm to `~/.pocketpaw/node/`
- `{ "torch": true }` installs PyTorch with the correct CUDA wheel tag (pinned version)
- CUDA drivers are the **only** OS-level dependency (detected via `nvidia-smi`)
- All managed runtimes are added to the sandbox PATH automatically
- Build scripts (`build.py`) should use `shutil.which()` — the sandbox PATH already includes everything

## How It Works

1. **`uv venv`** creates an isolated venv with the pinned Python version (e.g. `3.11`)
2. **`uv pip install`** installs packages from requirements.txt
3. **`{ "node": true }`** downloads Node.js LTS binary → `~/.pocketpaw/node/`, enables pnpm via corepack
4. **`{ "torch": true }`** installs PyTorch from the correct CUDA wheel index
5. **`{ "run": "python build.py" }`** runs custom commands inside the sandbox (PATH includes venv + managed Node.js)
6. All plugins share caches: `~/.pocketpaw/uv-cache/` (Python) and `~/.pocketpaw/node/` (Node.js)

## Sandbox Config (`sandbox` field)

Declared in [extension.json](manifest.md#field-reference) under the `sandbox` key:

```json
{
  "sandbox": {
    "python": "3.11",
    "venv": "env",
    "cuda": "12.4",
    "torch": {
      "version": "2.7.1",
      "cuda": "cu128",
      "extras": ["torchvision==0.22.1", "torchaudio==2.7.1"]
    },
    "env": {
      "CUSTOM_VAR": "value",
      "DATA_PATH": "./data"
    }
  }
}
```

| Sandbox Field  | Type             | Default  | Description                                                                           |
| -------------- | ---------------- | -------- | ------------------------------------------------------------------------------------- |
| `python`       | `string`         | `"3.11"` | Exact Python version — `uv` downloads and manages it (never uses system Python)       |
| `venv`         | `string`         | `"env"`  | Venv directory name relative to plugin root                                           |
| `cuda`         | `string \| null` | `null`   | Required CUDA version (informational — actual detection via `nvidia-smi`)             |
| `requirements` | `string \| null` | `null`   | Path to requirements.txt (alternative to install steps)                               |
| `torch`        | `object \| null` | `null`   | PyTorch installation config with specific version + CUDA tag                          |
| `env`          | `object`         | `{}`     | Environment variables (paths starting with `./` are resolved relative to plugin root) |

## PyTorch Config (`sandbox.torch` field)

```json
{
  "torch": {
    "version": "2.7.1",
    "cuda": "cu128",
    "extras": ["torchvision==0.22.1"]
  }
}
```

| Torch Field | Type       | Default   | Description                                    |
| ----------- | ---------- | --------- | ---------------------------------------------- |
| `version`   | `string`   | `"2.7.1"` | Exact PyTorch version (pinned, not floating)   |
| `cuda`      | `string`   | `"cu128"` | CUDA wheel tag for `download.pytorch.org/whl/` |
| `extras`    | `string[]` | `[]`      | Extra torch packages with pinned versions      |

### Supported CUDA Tags

PocketPaw auto-detects CUDA via `nvidia-smi` and maps to the closest tag:

| Driver CUDA Version | Wheel Tag | Notes            |
| ------------------- | --------- | ---------------- |
| ≥ 12.8              | `cu128`   | Latest (default) |
| ≥ 12.6              | `cu126`   |                  |
| ≥ 12.4              | `cu124`   |                  |
| ≥ 12.1              | `cu121`   |                  |
| ≥ 11.8              | `cu118`   | Oldest supported |

## Install Steps (`install.steps` field)

Install steps run **inside the sandbox** where all managed runtimes are on PATH. Triggered by `POST /api/v1/plugins/{id}/install` — see [api.md](api.md#plugin-lifecycle). For self-bootstrapping extensions that clone external repos, see [self-bootstrap.md](self-bootstrap.md).

```json
{
  "install": {
    "steps": [
      { "node": true },
      { "torch": true },
      { "pip": "requirements.txt" },
      { "run": "python build.py" }
    ]
  }
}
```

| Step Field | Type     | Description                                                                      |
| ---------- | -------- | -------------------------------------------------------------------------------- |
| `node`     | `bool`   | Ensure Node.js LTS + pnpm — auto-installs to `~/.pocketpaw/node/` if not present |
| `torch`    | `bool`   | Install PyTorch with pinned version + CUDA tag from `sandbox.torch`              |
| `pip`      | `string` | Install requirements via `uv pip install -r` inside the managed venv             |
| `run`      | `string` | Command to run inside the sandbox (use `python script.py`, not shell scripts)    |
| `path`     | `string` | Working directory relative to plugin root (for `pip` and `run`)                  |

> **Important:** The `run` step executes inside the sandbox where `python` → managed venv Python, `pnpm`/`npx`/`node` → managed Node.js, and `git` + system tools are on PATH. Use `shutil.which()` in build scripts — never hardcode paths or rely on OS-level installs. See [daemon.md](daemon.md#command-resolution) for how commands are resolved at startup.

## Install Progress

The install sequence reports progress:

- `0.1` — Creating venv (downloading Python if needed)
- `0.3` — Venv created, installing requirements
- `0.6` — Requirements installed, installing PyTorch
- `0.9` — PyTorch installed, running custom steps
- `1.0` — Complete

## CUDA Extra Index URL (requirements.txt)

See [api.md](api.md#cuda--gpu--nodejs) for CUDA detection endpoints and [troubleshooting.md](troubleshooting.md#plugin-specific) for common CUDA issues.

For CUDA-enabled pip packages (like `llama-cpp-python`), add the extra index URL in `requirements.txt`:

```txt
--extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124
llama-cpp-python[server]>=0.3.0
huggingface-hub>=0.20.0
```

## Environment Isolation

Each sandbox gets a fully isolated environment — **nothing from the host OS leaks in.** See [troubleshooting.md](troubleshooting.md#platform-notes) for platform-specific notes:

- `VIRTUAL_ENV` — Path to the managed venv
- `PATH` — Managed Python + managed Node.js + system tools (in that order)
- `PYTHONNOUSERSITE=1` — Isolates from user site-packages
- `UV_PYTHON_PREFERENCE=only-managed` — Only use uv-managed Python (never system Python)
- `UV_CACHE_DIR` — Shared cache at `~/.pocketpaw/uv-cache/`
- `PYTHONUNBUFFERED=1` — **Critical for daemon plugins.** Forces unbuffered stdout/stderr so `ready_pattern` detection works. Without this, Python buffers output when piped and the daemon stays stuck in "starting" forever.
- `PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1` (Windows) — Prevents cp1252 encoding crashes
- Managed Node.js path (if installed): `~/.pocketpaw/node/` added to PATH
- Any custom vars from `sandbox.env`

## Shared Managed Locations

| Location                 | Contents                                 | Shared across |
| ------------------------ | ---------------------------------------- | ------------- |
| `~/.pocketpaw/uv-cache/` | Python interpreters + pip wheel cache    | All plugins   |
| `~/.pocketpaw/node/`     | Node.js LTS binary + pnpm (via corepack) | All plugins   |
| `<plugin>/env/`          | Plugin-specific Python venv              | Single plugin |
