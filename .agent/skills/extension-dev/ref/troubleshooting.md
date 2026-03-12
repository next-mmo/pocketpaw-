# Troubleshooting

## General

- **Extension not showing**: Check `extension.json` is valid JSON and the `id` field matches the regex
- **Storage not working**: Ensure `storage.read`/`storage.write` are in scopes
- **Chat errors**: Ensure `chat.send` or `chat.stream` scope is declared
- **Cannot delete**: Only external extensions can be deleted. Built-in must be disabled
- **Upload fails**: ZIP must be ≤50MB and contain extension.json

## Plugin-Specific

- **uv not found**: Install `uv` globally with `pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **Install stuck**: Check `/api/v1/plugins/{id}/logs` for error messages
- **CUDA not detected**: Ensure `nvidia-smi` is in PATH and NVIDIA drivers are installed
- **PyTorch wrong CUDA**: Check `GET /api/v1/plugins/cuda` for the auto-detected `cuda_tag`, then set `sandbox.torch.cuda` explicitly if needed
- **Port conflict**: Use `"port": "auto"` to let PocketPaw find a free port
- **Daemon won't start**: Check `ready_pattern` matches the stdout of your server
- **CORS blocked**: Use the proxy endpoint (`/api/v1/plugins/{id}/proxy/...`) instead of direct `127.0.0.1:{port}` access
- **Venv corrupted**: Full reset with `POST /api/v1/plugins/{id}/uninstall`, then reinstall
- **Model download fails**: Check network access to `huggingface.co`, ensure `models/` directory exists
- **Node.js not found in build script**: Ensure `{ "node": true }` is in install steps BEFORE `{ "run": "python build.py" }`
- **pnpm not found**: Check `GET /api/v1/plugins/node` — if not detected, the `{ "node": true }` step auto-installs it
- **blob: CSP error**: PocketPaw adds `blob:` to `connect-src` for extension iframes — check CSP headers
- **Node engine won't start**: Ensure `package.json` exists with `node-llama-cpp` dependency and `pnpm install` ran in install steps
- **Model architecture not supported**: Switch to the Node.js engine — `node-llama-cpp` ships prebuilt binaries with the latest llama.cpp and supports newer architectures (e.g. `qwen35`) before Python wheels are available
- **`llama_get_kv_self` not found**: The llama.cpp C API changed — do NOT mix `llama-cpp-python` Python bindings with a different llama.cpp version. Rebuild from the matching release tag or switch to the Node.js engine

## Daemon Process Issues

- **Plugin stuck in "starting" forever**: The most common cause is **buffered stdout**. PocketPaw sets `PYTHONUNBUFFERED=1` automatically, but if your plugin spawns child processes, ensure they also flush output. Verify `ready_pattern` matches what the server actually prints.
- **Plugin shows "running" but iframe is blank**: Check browser console for 429 errors (rate limiting) or CSP violations. Both are fixed in PocketPaw's proxy, but if accessing the daemon directly (not via proxy), these issues will appear.
- **Gradio iframe shows "Loading..." forever**: Gradio fires many parallel asset requests. Ensure you're using the proxy URL (`/api/v1/plugins/{id}/proxy/`) — not direct port access. The proxy strips Gradio's restrictive framing headers.
- **`os.execv` kills monitoring on Windows**: Never use `os.execv` in launch scripts — it replaces the process, so PocketPaw loses PID tracking and output capture. Use `subprocess.run` or direct script execution.

## Build Issues (React + Vite)

- **Blank page**: Check `base: "./"` in `vite.config.ts` and asset paths in `index.html`
- **Assets not loading**: Ensure `assetFileNames` / `entryFileNames` include `assets/` prefix
- **outDir warning**: The `build.outDir` pointing to parent is expected (Vite warns but works)
- **Build script hangs on Windows**: Don't use `CREATE_NO_WINDOW` in build.py subprocess calls — the sandbox handles it
- **pnpm/npx not found in build.py**: Use `shutil.which("pnpm")` — sandbox PATH includes managed Node.js

## Self-Bootstrapping Issues

- **`.git` cleanup fails on Windows**: Use the retry handler pattern (see [self-bootstrap.md](self-bootstrap.md)). Git holds file locks briefly after clone; `os.chmod` + retry handles this.
- **`upstream/` directory is empty**: Check that `build.py` runs before other install steps that depend on it (e.g. `pip` with `path: "upstream"`).
- **Wrong working directory**: If using `start.path: "upstream"`, make sure the command is relative to that directory (e.g. `python wgp.py`, not `python upstream/wgp.py`).

## Platform Notes

### uv Requirement

- `uv` must be available in PATH (the only required system tool besides git)
- PocketPaw looks for `uv` in PATH via `shutil.which("uv")`
- Install: `pip install uv` or see [docs.astral.sh/uv](https://docs.astral.sh/uv/)
- **Everything else** (Python, Node.js, pnpm, PyTorch) is managed by the sandbox — NOT installed at OS level

### Model Files

- Plugin model files are stored in `<plugin_root>/models/`
- Supported extensions: `.gguf`, `.bin`
- Download from HuggingFace: streams via `httpx` with SSE progress
- Max model upload: 20 GB

### Port Allocation

- `"port": "auto"` finds a free port via `socket.bind((localhost, 0))`
- The port is injected into the command via `__PORT__` placeholder
- Each plugin gets its own port; there's no collision

### Windows-Specific

- Venv scripts are in `Scripts/` (not `bin/`)
- Python executable is `Scripts/python.exe`
- PATH separator is `;` (not `:`)
- Process termination uses `process.terminate()` then `os.kill(pid, signal.CTRL_BREAK_EVENT)`
- **`.git` directory cleanup**: On Windows, git holds file locks briefly after clone. Use `shutil.rmtree(git_dir, onerror=_force_remove)` with a retry handler that calls `os.chmod(path, 0o777)` and retries 3 times with `time.sleep(1)` between attempts
- **Never use `os.execv`** on Windows — it replaces the process, breaking PocketPaw's PID tracking and output monitoring. Use `subprocess.run` or direct script execution instead
