#!/usr/bin/env python
"""
Marlin-2B local analysis server (FastAPI).

Loads NemoStation/Marlin-2B once via the documented transformers trust_remote_code
path (~4.4GB VRAM) and exposes a tiny HTTP API the frameGrep app calls through the
`/api/marlin` Vite proxy:

  GET  /health   -> readiness / connection test
  POST /analyze  -> raw video bytes in, {"clips": [...]} out          (Mode 1: auto-caption)
  POST /find     -> raw video bytes + ?event=... in, {"span": ...} out (Mode 2: manual search)

Mode 1 (/analyze) uses Marlin's CAPTION mode (its canonical prompt). It watches the
whole clip unprompted and returns a Scene paragraph + dense timestamped Events; we adapt
those Events into the app's ClipSegment shape here, server-side, next to the model.

Mode 2 (/find) uses Marlin's FIND mode to resolve a natural-language query to a single
(start, end) span. NOTE: find fabricates a span on every call (it never reports "not
present"), so it is unsafe for *unattended* discovery — but Mode 2 is *interactive*: the
user typed the query and previews the returned span to confirm it, so the human is the
verifier and the fabrication risk is sidestepped.

Run via scripts/marlin-server.sh (sets GPU + port + uses the vllm conda env).
"""
import asyncio
import os
import tempfile
import time
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from transformers import AutoModelForCausalLM

MODEL_ID = os.environ.get("MARLIN_MODEL", "NemoStation/Marlin-2B")
DEFAULT_MAX_NEW_TOKENS = int(os.environ.get("MARLIN_MAX_NEW_TOKENS", "2048"))

STATE: dict = {"model": None, "device": None, "loaded_s": None}
_gpu_lock = asyncio.Lock()  # serialize GPU access (single device, one caption at a time)

# --- excitement_score heuristic (v1) -------------------------------------------
# Marlin produces no score, so we infer a rough 1-10 from the event description so
# exciting clips float to the top of the app's excitement-sorted list. This is a
# transparent keyword pass; a smarter scoring pass (via a text model) could
# replace it later.
_HIGH = [
    "flip", "backflip", "roll", "barrel", "dive", "plunge", "power loop", "loop",
    "split-s", "split s", "gap", "proximity", "skim", "graze", "fast", "rapid",
    "aggressive", "high speed", "high-speed", "spin", "rotat", "invert", "rush",
    "dart", "weave", "banks hard", "sharp turn", "swoop", "whip", "punch out",
]
_MED = [
    "turn", "bank", "climb", "ascend", "descend", "accelerat", "maneuver",
    "circle", "around", "past", "under", "tilt", "pan", "approach", "track",
]
_LOW = [
    "hover", "cruis", "slowly", "gentle", "calm", "idle", "sits", "sitting",
    "stationary", "distant", "steady", "straight", "forward over", "flies over",
    "flies forward", "flies toward",
]


def excitement(desc: str) -> int:
    d = desc.lower()
    high_hits = sum(1 for k in _HIGH if k in d)
    if high_hits:
        return min(10, 7 + high_hits)  # 8, 9, 10 as more action words stack
    med = any(k in d for k in _MED)
    low = any(k in d for k in _LOW)
    if med and not low:
        return 6
    if low and not med:
        return 3
    if med and low:
        return 5
    return 4


def mmss(seconds: float) -> str:
    s = max(0, int(round(seconds)))
    return f"{s // 60:02d}:{s % 60:02d}"


def adapt_events(res: dict) -> list[dict]:
    """Map Marlin caption events -> app ClipSegment dicts."""
    clips: list[dict] = []
    for ev in res.get("events") or []:
        try:
            start = float(ev.get("start", 0))
            end = float(ev.get("end", 0))
        except (TypeError, ValueError):
            continue
        desc = (ev.get("description") or "").strip()
        if end <= start or not desc:
            continue
        clips.append(
            {
                "start_time": mmss(start),
                "end_time": mmss(end),
                "description": desc,
                "excitement_score": excitement(desc),
            }
        )
    return clips


@asynccontextmanager
async def lifespan(_app: FastAPI):
    print(f"Loading {MODEL_ID} (reusing ~/.cache/huggingface)...", flush=True)
    t0 = time.time()
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, trust_remote_code=True, dtype=torch.bfloat16, device_map={"": "cuda"}
    ).eval()
    STATE["model"] = model
    STATE["device"] = str(next(model.parameters()).device)
    STATE["loaded_s"] = round(time.time() - t0, 1)
    vram = torch.cuda.memory_allocated() / 1e9
    print(
        f"Loaded in {STATE['loaded_s']}s on {STATE['device']} ({vram:.2f}GB VRAM)",
        flush=True,
    )
    yield
    STATE["model"] = None


app = FastAPI(title="Marlin-2B FPV analysis server", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok" if STATE["model"] is not None else "loading",
        "model": MODEL_ID,
        "device": STATE["device"],
        "load_seconds": STATE["loaded_s"],
    }


def _run_caption(path: str, max_new_tokens: int) -> dict:
    return STATE["model"].caption(path, max_new_tokens=max_new_tokens)


def _run_find(
    path: str,
    event: str,
    prompt_template: str | None,
    do_sample: bool,
    temperature: float,
    max_new_tokens: int,
) -> dict:
    return STATE["model"].find(
        path,
        event=event,
        prompt_template=prompt_template,
        do_sample=do_sample,
        temperature=temperature,
        max_new_tokens=max_new_tokens,
    )


@app.post("/analyze")
async def analyze(request: Request):
    if STATE["model"] is None:
        raise HTTPException(status_code=503, detail="Model still loading")

    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Empty body — send raw video bytes")

    try:
        max_new_tokens = int(request.query_params.get("max_new_tokens", DEFAULT_MAX_NEW_TOKENS))
    except ValueError:
        max_new_tokens = DEFAULT_MAX_NEW_TOKENS

    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    try:
        tmp.write(data)
        tmp.flush()
        tmp.close()

        t0 = time.time()
        async with _gpu_lock:
            res = await asyncio.to_thread(_run_caption, tmp.name, max_new_tokens)
        elapsed = round(time.time() - t0, 1)

        clips = adapt_events(res)
        print(
            f"/analyze: {len(data) / 1e6:.0f}MB -> {len(clips)} clips in {elapsed}s",
            flush=True,
        )
        return JSONResponse(
            {
                "clips": clips,
                "scene": res.get("scene", ""),
                "event_count": len(res.get("events") or []),
                "elapsed_s": elapsed,
            }
        )
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


@app.post("/find")
async def find(request: Request):
    """Mode 2: resolve a natural-language query to a single (start, end) span.

    Interactive use only — the caller previews the span to confirm it (find always
    fabricates a span, so an unverified result is meaningless on its own).
    """
    if STATE["model"] is None:
        raise HTTPException(status_code=503, detail="Model still loading")

    event = (request.query_params.get("event") or "").strip()
    if not event:
        raise HTTPException(status_code=400, detail="Missing `event` query param")

    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Empty body — send raw video bytes")

    try:
        max_new_tokens = int(request.query_params.get("max_new_tokens", 128))
    except ValueError:
        max_new_tokens = 128
    try:
        temperature = float(request.query_params.get("temperature", 0))
    except ValueError:
        temperature = 0.0
    do_sample = temperature > 0  # greedy/deterministic by default — reproducible boundaries
    # Optional override. MUST keep the "From <start> to <end>" structure or the span
    # parser fails (format_ok=false). None -> Marlin's canonical GROUNDING_PROMPT_TEMPLATE.
    prompt_template = request.query_params.get("prompt_template") or None

    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    try:
        tmp.write(data)
        tmp.flush()
        tmp.close()

        t0 = time.time()
        async with _gpu_lock:
            res = await asyncio.to_thread(
                _run_find, tmp.name, event, prompt_template, do_sample, temperature, max_new_tokens
            )
        elapsed = round(time.time() - t0, 1)

        span = res.get("span")
        # Normalize to a plain [start, end] list of floats (or null).
        norm_span = None
        if span and len(span) == 2:
            try:
                norm_span = [float(span[0]), float(span[1])]
            except (TypeError, ValueError):
                norm_span = None

        print(
            f"/find: q={event!r} {len(data) / 1e6:.0f}MB -> "
            f"span={norm_span} (format_ok={res.get('format_ok')}) in {elapsed}s",
            flush=True,
        )
        return JSONResponse(
            {
                "span": norm_span,
                "raw": res.get("raw", ""),
                "format_ok": bool(res.get("format_ok")),
                "elapsed_s": elapsed,
            }
        )
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("MARLIN_PORT", "8003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
