"""Pinokio → PocketPaw adapter.

Parses Pinokio-format script files (``pinokio.js``, ``install.js``,
``start.js``, ``torch.js``) and synthesizes a PocketPaw-compatible
``extension.json`` manifest.

This allows PocketPaw to natively load and manage any app from the
Pinokio Factory ecosystem (https://github.com/pinokiofactory) without
requiring manual manifest authoring.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)


# ───────────────────────────────────────────────────────────────────────
#  Lightweight JS object extractor
# ───────────────────────────────────────────────────────────────────────
#
#  Pinokio scripts use ``module.exports = { ... }`` with a mix of JS
#  syntax (unquoted keys, template literals, functions, regex literals).
#  We don't need to fully evaluate the JS — just extract the *static*
#  data we care about:
#    pinokio.js → title, description, icon, version
#    install.js → run[] steps
#    start.js   → daemon, run[] steps
#
#  Strategy: extract string literals by key, and for ``run:`` arrays
#  extract the JSON-like structure by applying lightweight coercion.


def _extract_string_field(source: str, key: str) -> str | None:
    """Extract a simple ``key: "value"`` or ``key: 'value'`` field.

    Handles escaped characters within the string (e.g. ``\\/``).
    """
    # Match both quoted and unquoted key forms: key: "val" or "key": "val"
    pattern = rf"""["']?{re.escape(key)}["']?\s*:\s*(?:"((?:[^"\\]|\\.)*?)"|'((?:[^'\\]|\\.)*?)')"""
    m = re.search(pattern, source)
    if m:
        val = m.group(1) if m.group(1) is not None else m.group(2)
        return val
    return None


def _extract_bool_field(source: str, key: str) -> bool | None:
    """Extract a ``key: true`` or ``key: false`` field."""
    # Allow key to be preceded by start of string, newline, comma, '{', or '['
    pattern = rf"""(?:^|[\n,{{\[])\s*["']?{re.escape(key)}["']?\s*:\s*(true|false)"""
    m = re.search(pattern, source)
    if m:
        return m.group(1) == "true"
    return None


def _extract_run_steps(source: str) -> list[dict]:
    """Parse the ``run: [...]`` array from an install/start script.

    This does a best-effort extraction of ``method``/``params`` objects.
    It handles the most common Pinokio patterns:
      - shell.run with message, venv, path, on
      - script.start with uri, params
      - fs.rm, fs.link
    """
    # Find the run array block — this is the main content between run: [ ... ]
    run_match = re.search(r"run\s*:\s*\[", source)
    if not run_match:
        return []

    # Extract balanced bracket content
    start = run_match.end()
    depth = 1
    pos = start
    while pos < len(source) and depth > 0:
        ch = source[pos]
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
        elif ch in ("'", '"'):
            # Skip string literals
            quote = ch
            pos += 1
            while pos < len(source) and source[pos] != quote:
                if source[pos] == "\\":
                    pos += 1  # skip escaped char
                pos += 1
        elif ch == "/" and pos + 1 < len(source):
            # Skip regex literals /pattern/
            if source[pos + 1] not in ("*", "/"):
                pos += 1
                while pos < len(source) and source[pos] != "/":
                    if source[pos] == "\\":
                        pos += 1
                    pos += 1
        pos += 1

    if depth != 0:
        return []

    raw_array = source[start : pos - 1]

    # Now parse individual step objects from the array
    steps: list[dict] = []
    step_blocks = _split_top_level_objects(raw_array)

    for block in step_blocks:
        step = _parse_step_object(block)
        if step:
            steps.append(step)

    return steps


def _split_top_level_objects(array_content: str) -> list[str]:
    """Split the content of an array into top-level ``{ ... }`` blocks."""
    blocks: list[str] = []
    depth = 0
    current_start: int | None = None

    i = 0
    while i < len(array_content):
        ch = array_content[i]
        if ch == "{":
            if depth == 0:
                current_start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and current_start is not None:
                blocks.append(array_content[current_start : i + 1])
                current_start = None
        elif ch in ("'", '"'):
            quote = ch
            i += 1
            while i < len(array_content) and array_content[i] != quote:
                if array_content[i] == "\\":
                    i += 1
                i += 1
        elif ch == "/" and i + 1 < len(array_content):
            if array_content[i + 1] not in ("*", "/"):
                i += 1
                while i < len(array_content) and array_content[i] != "/":
                    if array_content[i] == "\\":
                        i += 1
                    i += 1
        i += 1

    return blocks


def _parse_step_object(block: str) -> dict | None:
    """Parse a single step ``{method: "...", params: {...}}`` block."""
    method = _extract_string_field(block, "method")
    if not method:
        # May be a step with just 'when' conditional — still try to parse
        when = _extract_string_field(block, "when")
        if when:
            method = _extract_string_field(block, "method")
            if not method:
                return None

    step: dict = {"method": method}

    # Extract 'when' condition
    when = _extract_when_field(block)
    if when:
        step["when"] = when

    # Extract params
    params = _extract_params(block)
    if params:
        step["params"] = params

    # Extract 'daemon' field at step level
    daemon = _extract_bool_field(block, "daemon")
    if daemon is not None:
        step["daemon"] = daemon

    # Extract 'next' field (null means stop after this step)
    if '"next": null' in block or "'next': null" in block or "next: null" in block:
        step["next"] = None

    return step


def _extract_when_field(block: str) -> str | None:
    """Extract a ``when: "{{...}}"`` or ``"when": "{{...}}"`` field."""
    pattern = r"""["']?when["']?\s*:\s*["'](\{\{.+?\}\})["']"""
    m = re.search(pattern, block, re.DOTALL)
    if m:
        return m.group(1)
    return None


def _extract_params(block: str) -> dict | None:
    """Extract the params object from a step block."""
    params_match = re.search(r"params\s*:\s*\{", block)
    if not params_match:
        return None

    start = params_match.end()
    depth = 1
    pos = start
    while pos < len(block) and depth > 0:
        ch = block[pos]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif ch in ("'", '"'):
            quote = ch
            pos += 1
            while pos < len(block) and block[pos] != quote:
                if block[pos] == "\\":
                    pos += 1  # skip escaped char
                pos += 1
        elif ch == "/" and pos + 1 < len(block):
            next_ch = block[pos + 1]
            if next_ch not in ("*", "/", " ", "\n", "\t"):
                # Likely a regex literal — skip to closing /
                pos += 1
                while pos < len(block) and block[pos] != "/":
                    if block[pos] == "\\":
                        pos += 1
                    pos += 1
        pos += 1

    if depth != 0:
        return None

    raw = block[start : pos - 1]
    params: dict = {}

    # Extract known param fields
    for key in ("venv", "path", "uri"):
        val = _extract_string_field("\n" + raw, key)
        if val:
            params[key] = val

    # Extract 'message' field — can be string or array of strings
    msg = _extract_message_field(raw)
    if msg:
        params["message"] = msg

    # Extract 'on' event handlers
    on = _extract_on_handlers(raw)
    if on:
        params["on"] = on

    # Extract 'env' object (if present)
    env = _extract_env_field(raw)
    if env:
        params["env"] = env

    return params


def _extract_message_field(raw: str) -> str | list[str] | None:
    """Extract the ``message`` field which can be a string or array."""

    # Try array form: message: ["...", "..."]
    array_match = re.search(r"message\s*:\s*\[", raw)
    if array_match:
        start = array_match.end()
        depth = 1
        pos = start
        while pos < len(raw) and depth > 0:
            if raw[pos] == "[":
                depth += 1
            elif raw[pos] == "]":
                depth -= 1
            pos += 1
        arr_content = raw[start : pos - 1]
        # Extract strings from the array
        strings = re.findall(r"""["']([^"']+?)["']""", arr_content)
        if len(strings) == 1:
            return strings[0]
        return strings if strings else None

    # Try string form: message: "..."
    val = _extract_string_field("\n" + raw, "message")
    return val


def _extract_on_handlers(raw: str) -> list[dict] | None:
    """Extract 'on' event handlers from params."""
    # Use a word-boundary-aware pattern to avoid matching 'python' → 'on'
    on_match = re.search(r"(?:^|[,\n\[{])\s*on\s*:\s*\[", raw)
    if not on_match:
        return None

    # Find the opening bracket position
    bracket_pos = raw.index("[", on_match.start())
    start = bracket_pos + 1
    depth = 1
    pos = start
    while pos < len(raw) and depth > 0:
        ch = raw[pos]
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
        elif ch in ("'", '"'):
            quote = ch
            pos += 1
            while pos < len(raw) and raw[pos] != quote:
                if raw[pos] == "\\":
                    pos += 1
                pos += 1
        elif ch == "/" and pos + 1 < len(raw):
            next_ch = raw[pos + 1]
            if next_ch not in ("*", "/", " ", "\n", "\t"):
                pos += 1
                while pos < len(raw) and raw[pos] != "/":
                    if raw[pos] == "\\":
                        pos += 1
                    pos += 1
        pos += 1
    arr_content = raw[start : pos - 1]

    handlers: list[dict] = []
    handler_blocks = _split_top_level_objects(arr_content)
    for hblock in handler_blocks:
        handler: dict = {}

        # Extract event — can be a quoted string or a regex literal
        evt_str = _extract_string_field(hblock, "event")
        if evt_str:
            # If value looks like /regex/, strip the delimiters and unescape
            if evt_str.startswith("/") and evt_str.endswith("/"):
                evt_str = evt_str[1:-1]  # strip outer / /
            # Unescape JS regex escapes: \/ → /
            evt_str = evt_str.replace("\\/", "/")
            handler["event"] = evt_str
        else:
            # Try regex form: "event": /regex/
            regex_match = re.search(
                r"""["']?event["']?\s*:\s*/(.+?)/""", hblock
            )
            if regex_match:
                handler["event"] = regex_match.group(1).replace("\\/", "/")

        done = _extract_bool_field(hblock, "done")
        if done is not None:
            handler["done"] = done

        if handler:
            handlers.append(handler)

    return handlers if handlers else None


def _extract_env_field(raw: str) -> dict | None:
    """Extract an ``env: { ... }`` object."""
    env_match = re.search(r"env\s*:\s*\{", raw)
    if not env_match:
        return None

    start = env_match.end()
    depth = 1
    pos = start
    while pos < len(raw) and depth > 0:
        if raw[pos] == "{":
            depth += 1
        elif raw[pos] == "}":
            depth -= 1
        pos += 1

    content = raw[start : pos - 1].strip()
    if not content:
        return {}

    env: dict = {}
    for m in re.finditer(r"""(\w+)\s*:\s*["']([^"']*?)["']""", content):
        env[m.group(1)] = m.group(2)
    return env if env else {}


# ───────────────────────────────────────────────────────────────────────
#  High-level converter
# ───────────────────────────────────────────────────────────────────────


def _slugify(name: str) -> str:
    """Convert a human-readable name to a valid extension ID."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    slug = re.sub(r"-+", "-", slug)
    # Must start with alphanumeric, min length 2
    if not slug or not slug[0].isalnum():
        slug = "x-" + slug
    if len(slug) < 2:
        slug = slug + "-app"
    return slug[:64]


def is_pinokio_project(directory: Path) -> bool:
    """Check if a directory contains Pinokio-format scripts."""
    return (directory / "pinokio.js").exists()


def convert_pinokio_to_manifest(directory: Path) -> dict:
    """Parse Pinokio scripts in ``directory`` and return a PocketPaw manifest dict.

    Reads:
      - pinokio.js  → metadata (title, description, icon)
      - install.js  → install steps
      - start.js    → daemon start config
      - torch.js    → PyTorch handling (converted to install step)
      - requirements.txt → pip install step

    Returns:
        A dict suitable for ``ExtensionManifest.model_validate()``.
    """
    pinokio_js = directory / "pinokio.js"
    if not pinokio_js.exists():
        raise FileNotFoundError(f"pinokio.js not found in {directory}")

    source = pinokio_js.read_text(encoding="utf-8", errors="replace")

    # ── Extract metadata ──
    title = _extract_string_field(source, "title") or directory.name
    description = _extract_string_field(source, "description") or ""
    icon_file = _extract_string_field(source, "icon")
    version = _extract_string_field(source, "version") or "1.0.0"

    ext_id = _slugify(title)
    route = ext_id  # same as id for simplicity

    # ── Parse install.js ──
    install_steps: list[dict] = []
    app_subdir: str | None = None  # The subdirectory where the app lives
    venv_name = "env"

    install_js = directory / "install.js"
    if install_js.exists():
        install_source = install_js.read_text(encoding="utf-8", errors="replace")
        raw_steps = _extract_run_steps(install_source)

        for step in raw_steps:
            method = step.get("method", "")
            params = step.get("params", {})

            if method == "shell.run":
                messages = params.get("message", [])
                if isinstance(messages, str):
                    messages = [messages]

                venv = params.get("venv")
                path = params.get("path")

                if venv:
                    venv_name = venv
                if path:
                    app_subdir = path

                for msg in messages:
                    msg = msg.strip()
                    if not msg:
                        continue

                    if msg.startswith("git clone"):
                        # Git clone step — extract as a run command
                        install_steps.append({"run": msg})
                    elif "pip install" in msg and "-r" in msg:
                        # pip install from requirements file
                        req_match = re.search(r"-r\s+(\S+)", msg)
                        req_file = req_match.group(1) if req_match else "requirements.txt"
                        step_entry: dict = {"pip": req_file}
                        if path:
                            step_entry["path"] = path
                        install_steps.append(step_entry)
                    elif "pip install" in msg:
                        # Direct pip install (not from file)
                        step_entry_run: dict = {"run": msg}
                        if path:
                            step_entry_run["path"] = path
                        install_steps.append(step_entry_run)
                    else:
                        # Generic shell command
                        step_entry_generic: dict = {"run": msg}
                        if path:
                            step_entry_generic["path"] = path
                        install_steps.append(step_entry_generic)

            elif method == "script.start":
                uri = params.get("uri", "")
                if "torch" in uri.lower():
                    # torch.js reference → install PyTorch
                    install_steps.append({"torch": True})

    # ── Parse start.js ──
    start_config: dict | None = None
    start_js = directory / "start.js"
    if start_js.exists():
        start_source = start_js.read_text(encoding="utf-8", errors="replace")
        is_daemon = _extract_bool_field(start_source, "daemon")
        raw_start_steps = _extract_run_steps(start_source)

        for step in raw_start_steps:
            method = step.get("method", "")
            params = step.get("params", {})

            if method == "shell.run":
                messages = params.get("message", [])
                if isinstance(messages, str):
                    messages = [messages]

                command = messages[0] if messages else ""
                path = params.get("path") or app_subdir

                # Extract ready pattern from 'on' handlers
                ready_pattern: str | None = None
                on_handlers = params.get("on", [])
                for handler in on_handlers:
                    event = handler.get("event", "")
                    if handler.get("done") and event:
                        # Convert Pinokio event regex to Python regex
                        # Pinokio uses /pattern/ format
                        ready_pattern = event.replace("\\/", "/").replace("\\\\", "\\")
                        break

                if command:
                    # Inject port/host flags for common frameworks
                    # so they bind to PocketPaw's auto-detected port.
                    if "app.py" in command or "launch" in command:
                        # Gradio-based apps — inject --server_port and
                        # --server_name if not already present
                        if "--server_port" not in command:
                            command += " --server_port __PORT__"
                        if "--server_name" not in command:
                            command += " --server_name 0.0.0.0"

                    start_config = {
                        "command": command,
                        "daemon": is_daemon if is_daemon is not None else True,
                        "port": "auto",
                    }
                    if ready_pattern:
                        start_config["ready_pattern"] = ready_pattern
                    if path:
                        start_config["path"] = path
                    break  # Take only the first shell.run command

    # ── Determine venv path (relative to extension root) ──
    # In Pinokio, venv is often inside the app subdirectory
    sandbox_venv = venv_name
    if app_subdir and not venv_name.startswith(app_subdir):
        sandbox_venv = f"{app_subdir}/{venv_name}"

    # ── Build the manifest ──
    manifest: dict = {
        "id": ext_id,
        "name": title,
        "version": version,
        "description": description[:280],
        "route": route,
        "entry": "index.html",
        "type": "plugin",
        "autostart": False,
        "scopes": [],
        "sandbox": {
            "python": "3.11",
            "venv": sandbox_venv,
        },
    }

    if icon_file:
        # Check if the icon is a local file
        if (directory / icon_file).exists():
            manifest["icon"] = icon_file
        else:
            manifest["icon"] = "puzzle-piece"  # fallback Lucide icon

    if install_steps:
        manifest["install"] = {"steps": install_steps}

    if start_config:
        manifest["start"] = start_config
        # If the extension has a daemon but no local frontend file,
        # the UI comes from the daemon process (e.g. Gradio, Streamlit).
        entry_path = directory / manifest["entry"]
        if not entry_path.exists():
            manifest["proxy_frontend"] = True

    return manifest


def synthesize_extension_json(directory: Path, overwrite: bool = False) -> Path:
    """Parse Pinokio scripts and write ``extension.json`` to the directory.

    Returns the path to the generated file.

    Raises:
        FileNotFoundError: If ``pinokio.js`` is not found.
        FileExistsError: If ``extension.json`` already exists and ``overwrite`` is False.
    """
    target = directory / "extension.json"
    if target.exists() and not overwrite:
        raise FileExistsError(f"extension.json already exists at {target}")

    manifest = convert_pinokio_to_manifest(directory)
    target.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    logger.info(
        "Synthesized extension.json for Pinokio project '%s' at %s",
        manifest.get("name", "?"),
        target,
    )
    return target
