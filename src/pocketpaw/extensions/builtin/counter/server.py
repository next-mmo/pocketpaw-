"""
Counter Extension — Official Demo

Full-stack PocketPaw plugin demonstrating:
  - FastAPI REST API at /api/*
  - Gradio UI mounted at / (dark-themed, matches PocketPaw design)
  - In-memory state with persistent JSON storage
  - PocketPaw Python SDK integration

For a simpler starting point, see templates/starter/ (pure HTML/JS, no backend).

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

import gradio as gr
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ── Shared PocketPaw Python SDK (optional — available for storage/chat/etc.)
# Add the extensions root to sys.path so the shared SDK is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
try:
    from python_sdk import PocketPawSDK  # noqa: F401 — available for future use
except ImportError:
    PocketPawSDK = None  # Standalone mode (outside PocketPaw)

# ── State ─────────────────────────────────────────────
counter_state: dict = {"count": 0, "step": 1, "history": []}

STATE_FILE = Path(__file__).parent / "counter_state.json"

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("counter")


# ── Persistence ───────────────────────────────────────
def _load_state() -> None:
    """Load state from local JSON file (fallback when SDK is unavailable)."""
    global counter_state
    if STATE_FILE.exists():
        try:
            data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            counter_state.update(data)
            log.info("Loaded state from %s: count=%s", STATE_FILE, counter_state["count"])
        except Exception as exc:
            log.warning("Failed to load state: %s", exc)


def _save_state() -> None:
    """Persist state to local JSON file."""
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


api = FastAPI(title="Counter API", lifespan=lifespan)
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@api.get("/api/state")
async def get_state():
    """Return current counter state."""
    return {
        "count": counter_state["count"],
        "step": counter_state["step"],
        "history_length": len(counter_state["history"]),
    }


@api.post("/api/increment")
async def increment():
    step = counter_state["step"]
    counter_state["count"] += step
    counter_state["history"].append(f"+{step}")
    _save_state()
    return {"count": counter_state["count"]}


@api.post("/api/decrement")
async def decrement():
    step = counter_state["step"]
    counter_state["count"] -= step
    counter_state["history"].append(f"-{step}")
    _save_state()
    return {"count": counter_state["count"]}


@api.post("/api/reset")
async def reset():
    counter_state["count"] = 0
    counter_state["history"].append("reset")
    _save_state()
    return {"count": 0}


@api.post("/api/set-step")
async def set_step(step: int = 1):
    counter_state["step"] = max(1, min(step, 1000))
    return {"step": counter_state["step"]}


# ── Gradio UI ─────────────────────────────────────────
CUSTOM_CSS = """
/* PocketPaw dark theme overrides for Gradio */
.gradio-container {
    max-width: 560px !important;
    margin: 0 auto !important;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
}

.counter-display {
    font-size: 96px !important;
    font-weight: 800 !important;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
    text-align: center;
    background: linear-gradient(135deg, #007aff, #5ac8fa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    padding: 24px 0;
    transition: transform 0.15s ease;
    line-height: 1.1;
}

.counter-display:hover {
    transform: scale(1.05);
}

.status-badge {
    text-align: center;
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 20px;
    background: rgba(40, 167, 69, 0.15);
    color: #28a745;
    display: inline-block;
    margin: 0 auto;
}

.history-box {
    font-family: "SF Mono", "Fira Code", monospace !important;
    font-size: 12px !important;
}

/* Button styling */
button.primary {
    background: linear-gradient(135deg, #007aff, #0056d6) !important;
    border: none !important;
    font-weight: 600 !important;
}

button.secondary {
    background: rgba(255, 255, 255, 0.08) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    font-weight: 600 !important;
}

button.stop {
    background: linear-gradient(135deg, #ff3b30, #cc2d25) !important;
    border: none !important;
    font-weight: 600 !important;
}
"""


def create_gradio_ui() -> gr.Blocks:
    """Build the Gradio Blocks interface."""

    with gr.Blocks(
        title="PocketPaw Counter",
        css=CUSTOM_CSS,
        theme=gr.themes.Base(
            primary_hue=gr.themes.colors.blue,
            secondary_hue=gr.themes.colors.slate,
            neutral_hue=gr.themes.colors.slate,
            font=[
                gr.themes.GoogleFont("Inter"),
                "system-ui",
                "sans-serif",
            ],
        ).set(
            body_background_fill="#0a0a0a",
            body_background_fill_dark="#0a0a0a",
            body_text_color="#e0e0e0",
            body_text_color_dark="#e0e0e0",
            block_background_fill="#111111",
            block_background_fill_dark="#111111",
            block_border_color="rgba(255,255,255,0.08)",
            block_border_color_dark="rgba(255,255,255,0.08)",
            block_label_text_color="rgba(255,255,255,0.5)",
            block_label_text_color_dark="rgba(255,255,255,0.5)",
            block_title_text_color="#ffffff",
            block_title_text_color_dark="#ffffff",
            button_primary_background_fill="#007aff",
            button_primary_background_fill_dark="#007aff",
            button_primary_text_color="#ffffff",
            button_primary_text_color_dark="#ffffff",
            button_secondary_background_fill="rgba(255,255,255,0.06)",
            button_secondary_background_fill_dark="rgba(255,255,255,0.06)",
            button_secondary_text_color="rgba(255,255,255,0.7)",
            button_secondary_text_color_dark="rgba(255,255,255,0.7)",
            input_background_fill="#1a1a1a",
            input_background_fill_dark="#1a1a1a",
            input_border_color="rgba(255,255,255,0.1)",
            input_border_color_dark="rgba(255,255,255,0.1)",
            shadow_drop="none",
            shadow_drop_lg="none",
        ),
    ) as demo:
        # ── Header ──
        gr.Markdown(
            """
            <div style="text-align:center; padding: 12px 0 4px;">
                <span style="font-size:10px; text-transform:uppercase; letter-spacing:0.18em; color:rgba(255,255,255,0.35); font-weight:600;">
                    PocketPaw Plugin
                </span>
                <h1 style="font-size:28px; font-weight:700; letter-spacing:-0.02em; margin:4px 0 0; color:#fff;">
                    ⚡ Counter
                </h1>
                <p style="font-size:13px; color:rgba(255,255,255,0.5); margin-top:6px;">
                    Full Python backend • FastAPI + Gradio • Persistent state
                </p>
            </div>
            """
        )

        # ── Counter Display ──
        count_display = gr.Markdown(
            value=f'<div class="counter-display">{counter_state["count"]}</div>',
            elem_classes=["counter-value"],
        )

        # ── Main Controls ──
        with gr.Row():
            btn_dec = gr.Button("−", variant="secondary", scale=1, min_width=80)
            btn_reset = gr.Button("Reset", variant="stop", scale=1, min_width=100)
            btn_inc = gr.Button("+", variant="primary", scale=1, min_width=80)

        # ── Step Size ──
        step_slider = gr.Slider(
            minimum=1,
            maximum=100,
            value=counter_state["step"],
            step=1,
            label="Step Size",
            info="How much to increment/decrement per click",
        )

        # ── Quick Buttons ──
        gr.Markdown(
            '<p style="text-align:center; font-size:11px; color:rgba(255,255,255,0.3); margin:8px 0 4px;">Quick Changes</p>'
        )
        with gr.Row():
            btn_m10 = gr.Button("-10", variant="secondary", size="sm", min_width=60)
            btn_m5 = gr.Button("-5", variant="secondary", size="sm", min_width=60)
            btn_p5 = gr.Button("+5", variant="primary", size="sm", min_width=60)
            btn_p10 = gr.Button("+10", variant="primary", size="sm", min_width=60)

        # ── History ──
        with gr.Accordion("📜 History", open=False):
            history_display = gr.Textbox(
                value=_format_history(),
                label="Recent operations",
                lines=5,
                interactive=False,
                elem_classes=["history-box"],
            )

        # ── Status ──
        status_md = gr.Markdown(
            '<div class="status-badge">🟢 Python backend running</div>',
        )

        # ── Event Handlers ──
        def _update_display(count: int) -> str:
            return f'<div class="counter-display">{count}</div>'

        def do_increment():
            counter_state["count"] += counter_state["step"]
            counter_state["history"].append(f'+{counter_state["step"]}')
            _save_state()
            return (
                _update_display(counter_state["count"]),
                _format_history(),
            )

        def do_decrement():
            counter_state["count"] -= counter_state["step"]
            counter_state["history"].append(f'-{counter_state["step"]}')
            _save_state()
            return (
                _update_display(counter_state["count"]),
                _format_history(),
            )

        def do_reset():
            counter_state["count"] = 0
            counter_state["history"].append("reset → 0")
            _save_state()
            return (
                _update_display(0),
                _format_history(),
            )

        def do_quick(delta: int):
            counter_state["count"] += delta
            sign = "+" if delta > 0 else ""
            counter_state["history"].append(f"{sign}{delta}")
            _save_state()
            return (
                _update_display(counter_state["count"]),
                _format_history(),
            )

        def do_set_step(val: int):
            counter_state["step"] = int(val)
            return val

        # Wire buttons
        outputs = [count_display, history_display]

        btn_inc.click(do_increment, outputs=outputs)
        btn_dec.click(do_decrement, outputs=outputs)
        btn_reset.click(do_reset, outputs=outputs)

        btn_m10.click(lambda: do_quick(-10), outputs=outputs)
        btn_m5.click(lambda: do_quick(-5), outputs=outputs)
        btn_p5.click(lambda: do_quick(5), outputs=outputs)
        btn_p10.click(lambda: do_quick(10), outputs=outputs)

        step_slider.release(do_set_step, inputs=[step_slider])

    return demo


def _format_history() -> str:
    """Format the last 20 history entries."""
    if not counter_state["history"]:
        return "(no operations yet)"
    recent = counter_state["history"][-20:]
    return " → ".join(recent)


# ── Mount Gradio onto FastAPI ─────────────────────────
gradio_app = create_gradio_ui()
app = gr.mount_gradio_app(api, gradio_app, path="/")


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
