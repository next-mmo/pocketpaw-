"""
Counter Extension — Official Demo

Full-stack PocketPaw plugin demonstrating:
  - FastAPI REST API at /api/*
  - Static HTML + Ant Design frontend (served by PocketPaw)
  - In-memory state with persistent JSON storage
  - PocketPaw Python SDK integration

Run standalone:
    python server.py --host 127.0.0.1 --port 7860
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ── Shared PocketPaw Python SDK (optional)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
try:
    from python_sdk import PocketPawSDK  # noqa: F401
except ImportError:
    PocketPawSDK = None

# ── State ─────────────────────────────────────────────
counter_state: dict = {"count": 0, "step": 1, "history": []}

STATE_FILE = Path(__file__).parent / "counter_state.json"

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("counter")


# ── Persistence ───────────────────────────────────────
def _load_state() -> None:
    global counter_state
    if STATE_FILE.exists():
        try:
            data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            counter_state.update(data)
            log.info("Loaded state from %s: count=%s", STATE_FILE, counter_state["count"])
        except Exception as exc:
            log.warning("Failed to load state: %s", exc)


def _save_state() -> None:
    try:
        STATE_FILE.write_text(json.dumps(counter_state), encoding="utf-8")
    except Exception as exc:
        log.warning("Failed to save state: %s", exc)


# ── FastAPI ───────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_state()
    log.info("Counter server starting — count=%s", counter_state["count"])
    yield
    _save_state()
    log.info("Counter server shutting down.")


app = FastAPI(title="Counter API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/state")
async def get_state():
    """Return current counter state including history."""
    return {
        "count": counter_state["count"],
        "step": counter_state["step"],
        "history": counter_state["history"][-30:],
        "history_length": len(counter_state["history"]),
    }


@app.post("/api/increment")
async def increment():
    step = counter_state["step"]
    counter_state["count"] += step
    counter_state["history"].append(f"+{step}")
    _save_state()
    return {"count": counter_state["count"]}


@app.post("/api/decrement")
async def decrement():
    step = counter_state["step"]
    counter_state["count"] -= step
    counter_state["history"].append(f"-{step}")
    _save_state()
    return {"count": counter_state["count"]}


@app.post("/api/reset")
async def reset():
    counter_state["count"] = 0
    counter_state["history"].append("reset")
    _save_state()
    return {"count": 0}


@app.post("/api/set-step")
async def set_step(step: int = 1):
    counter_state["step"] = max(1, min(step, 1000))
    return {"step": counter_state["step"]}


@app.post("/api/quick")
async def quick_change(delta: int = 0):
    counter_state["count"] += delta
    sign = "+" if delta > 0 else ""
    counter_state["history"].append(f"{sign}{delta}")
    _save_state()
    return {"count": counter_state["count"]}


# ── Swagger docs at /docs ─────────────────────────────
# FastAPI auto-generates /docs and /openapi.json


# ── CLI ───────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Counter Extension Server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7860)
    args = parser.parse_args()

    log.info("Starting Counter server on %s:%s", args.host, args.port)
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
