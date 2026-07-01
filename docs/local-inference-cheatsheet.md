# frameGrep — Analysis Provider Cheatsheet

Every way frameGrep can analyze video — cloud and local — plus how to run the local ones:
services, ports, GPUs, and how to start/stop each. The local half is written for the
dual-GPU box (`fpv.r3belmind.dev`).

> **Start here:** pick a provider from the table below. Cloud providers (Gemini, OpenRouter)
> need only an API key. Local providers (vLLM, llama-swap, Marlin) are PM2 services — start
> the one you want, stop the others, because **GPU 0 holds one heavy user at a time**.

---

## Which provider do I pick?

Set the provider in-app under **Settings → AI Provider** (Gemini · Custom · Marlin). "Custom"
is any OpenAI-compatible endpoint — that's where OpenRouter (cloud) *and* the local vLLM /
llama-swap servers live; you just point the endpoint URL at the right place.

| Provider | Local/Cloud | In-app selection | Video input | Pick it when… |
|---|---|---|---|---|
| **Gemini** | Cloud | Gemini | Native full-video upload | You want the easiest path and best accuracy; you're OK sending footage to Google + paying per use. |
| **OpenRouter** | Cloud | Custom → `openrouter.ai` endpoint | Frame extraction | You want a strong model (Qwen3-VL 235B etc.) with no local GPU, pay-per-use. |
| **vLLM** | Local | Custom → `/api/vllm/v1` | Native **or** frames | You want native video, fully private, on your own GPU. |
| **llama-swap** | Local | Custom → `/api/llama/v1` | Frame extraction only | You want to run GGUF models (llama.cpp) and swap between them. |
| **Marlin** | Local | Marlin (local) | Built-in (its own pipeline) | You want zero prompt engineering — a 2B model purpose-built to auto-caption clips or find a span from a text query. |

### Frame extraction vs native video

- **Native video** — the whole file (or a transcoded-down version) goes to the model, which
  sees real motion. Best temporal accuracy, especially for sub-second action (backflips,
  gaps). Supported by **Gemini** and **vLLM** (with a video-capable model like Qwen-VL).
- **Frame extraction** — frameGrep grabs JPEG frames client-side (canvas) at an adaptive FPS
  and sends them as images. **Required** for OpenRouter and llama.cpp (they don't take video
  natively). Frame budget + FPS auto-scale to the clip length; short clips clamp to 4 FPS to
  catch fast moves. Tunable via `VITE_MAX_FRAMES` / `VITE_FRAME_EXTRACTION_FPS`.
- Toggle for the Custom provider: **"Use native video"** (only meaningful for vLLM; leave off
  for OpenRouter/llama.cpp). Details in `src/services/localVLMService.ts`.

---

## Cloud providers (no server to run)

Just an API key — set it in `.env.local` (Vite build-time) or in the in-app Settings.

**Gemini** — `Settings → Gemini`:
```bash
# .env.local
VITE_GEMINI_API_KEY=AIza...
```
Default model `gemini-2.5-flash-lite` (chosen empirically — see `docs/model_test_notes.md`);
switchable in Settings. Uploads the full video to the Gemini Files API. Two sampling knobs
in Settings:
- **Media Resolution** (`low`/`default`) — frame *sharpness* / tokens-per-frame. `low` is ~3× cheaper.
- **Sampling Rate (FPS)** (`1`/`2`/`4`/`6`) — how *many* frames/sec Gemini looks at. Gemini's
  native default is **1 fps**, which misses sub-second FPV action; frameGrep defaults to **4 fps**
  (sent as `videoMetadata.fps`). Higher fps catches fast moves but costs more tokens — pair high
  fps with `low` resolution to keep the bill down.

**OpenRouter** — `Settings → Custom`:
```bash
# .env.local
VITE_OPENROUTER_API_KEY=sk-or-v1-...
VITE_OPENROUTER_ENDPOINT=https://openrouter.ai/api/v1
VITE_OPENROUTER_MODEL=qwen/qwen3-vl-8b-instruct   # e.g. qwen/qwen3-vl-235b-a22b-instruct
```
Frame extraction (OpenRouter has no native-video upload). `anthropic/*` models are pinned to
the Anthropic-direct provider (Bedrock otherwise substitutes a non-vision Haiku).

---

## The four PM2 services (app + three engines)

| Service | PM2 name | Port | GPU | Purpose | App provider |
|---|---|---|---|---|---|
| **Vite app** | `frameGrep-Marlin` | 3007 | — | The web app (dev server) | — |
| **llama-swap** | `llama-server-cuda` | 7744 | 0 (+1) | llama.cpp GGUF server, swaps models on demand | Custom → `/api/llama/v1` |
| **vLLM** | `vllm-server` | 8002 | 0 | Native-video analysis (Qwen-VL & other standard archs) | Custom → `/api/vllm/v1` |
| **Marlin** | `marlin-server` | 8003 | 0 | Local Marlin-2B clip-ID (caption/find) | Marlin (local) |

Uniform control — same verbs for every service:

```bash
pm2 start  <name>      # bring up
pm2 stop   <name>      # take down
pm2 restart <name>     # bounce
pm2 logs   <name>      # tail logs
```

> **First-time start** of a service that PM2 hasn't seen yet (e.g. right after adding it):
> `pm2 start ecosystem.config.cjs --only <name>`. After that, `pm2 start <name>` works by name.
>
> `vllm-server` and `marlin-server` are **not** in the boot-resurrect set on purpose (they
> hold GPU-0 VRAM). Run `pm2 save` only if you want one always-on across reboots.

---

## ⚠️ Two gotchas worth remembering

**1. The process-name red herring.** The conda env is *named* `vllm`, and *both* vLLM and
the Marlin server run inside it. So **every** Python process from that env shows up as
`/home/hank/miniconda/envs/vllm/bin/python …` — Marlin *looks* like vLLM in `ps`/`top`.
**Don't trust `ps`. Identify by PM2 name + port.** To be sure what's actually running:

```bash
ss -tlnp | grep -E ':(7744|8002|8003) '   # 7744=llama-swap  8002=vLLM  8003=Marlin
pgrep -af "vllm serve"                     # real vLLM only (empty = vLLM is NOT up)
pgrep -af marlin_server.py                 # the Marlin server
```

**2. PM2 "online" ≠ healthy.** A crash-looping service flickers as `online` during each
doomed start attempt (and `restarts` climbs fast). Confirm with the **port + health
endpoint**, not PM2 status alone:

```bash
curl -s localhost:8002/v1/models     # vLLM   (JSON = up; empty/refused = not ready)
curl -s localhost:8003/health        # Marlin ({"status":"ok",...} = up)
curl -s localhost:7744/v1/models     # llama-swap
```

---

## GPU layout & the one rule

| GPU | Card | VRAM | Used by |
|---|---|---|---|
| **0** | RTX 4060 Ti | 16 GB | vLLM **or** llama-swap **or** Marlin |
| **1** | Quadro RTX 4000 | 8 GB | llama-swap spillover; NVENC transcode (`/api/transcode`). Too small for Marlin/vLLM. |

**The one rule: run a single heavy GPU-0 user at a time.** vLLM grabs ~95% of the card,
so it can't share with llama-swap or Marlin. There's **no auto-swap** anymore — *you* stop
the others before starting the one you want. If something OOMs, check what else is loaded:

```bash
nvidia-smi --query-compute-apps=pid,used_memory --format=csv
```

---

## Recipes — bring each engine up

**Use vLLM** (native video, :8002):
```bash
pm2 stop marlin-server llama-server-cuda    # free GPU 0
pm2 start vllm-server                        # (first time: pm2 start ecosystem.config.cjs --only vllm-server)
curl -s localhost:8002/v1/models             # poll until JSON appears (~60-90s cold)
```
In the app: **Custom** provider, endpoint `/api/vllm/v1`, native-video mode.

**Switch the vLLM model** — single-sourced in `.env.local`:
```bash
# edit .env.local:  VLLM_MODEL=<hf-model-id>   (and optional VLLM_MAX_LEN=…)
pm2 restart vllm-server --update-env
curl -s localhost:8002/v1/models             # confirm the new model id
```
> The old in-app "swap model" button is retired — it would fight PM2's autorestart.
> Model choice lives in `.env.local` only.

**Use llama-swap** (:7744):
```bash
pm2 stop vllm-server marlin-server
pm2 start llama-server-cuda
curl -s localhost:7744/v1/models
```
llama-swap loads GGUF models on demand and swaps between them (config:
`/mnt/dockerSSD/git/llama.cpp/llama-swap.yaml`); one model is loaded at a time and a
request for a different one evicts the current. In the app: **Custom**, endpoint
`/api/llama/v1`, pick a model id. Available ids: `bonsai-8b`, `qwen3-vl-8b`, `gpt-oss-20b`,
`gemma4-26b`, `qwen3.5-27b-tq3`, `qwen3.6-27b`, `qwen3.6-27b-mtp`, `qwen3.6-27b-vl`.

**Use Marlin** (local clip-ID, :8003):
```bash
pm2 stop vllm-server llama-server-cuda
pm2 start marlin-server
curl -s localhost:8003/health
```
In the app: select the **Marlin (local)** provider. Two modes: `/analyze` (auto-caption,
returns clips) and `/find` (interactive query → one span). Marlin only — its architecture
can't be served by vLLM, which is why it has its own server.

**Free GPU 0 entirely:**
```bash
pm2 stop vllm-server marlin-server llama-server-cuda
```

---

## Config & secrets

- **`.env.local`** (gitignored) is the single source for local-inference config:
  - `HF_TOKEN` — Hugging Face token (account `Zheroz00`). Needed for the **gated**
    `NemoStation/Marlin-2B` download, and for any gated vLLM model. Sourced by both
    `scripts/vllm-server.sh` and `scripts/marlin-server.sh`. **Not** hardcoded in any
    tracked script. Rotate here if it ever leaks/expires.
  - `VLLM_MODEL`, `VLLM_MAX_LEN`, optional `VLLM_GPU_MEM_UTIL` — vLLM model selection.
- **HF cache** is pinned to `/mnt/gamesSSD/models/huggingface` (persistent, shared) so a
  wipe of `~/.cache/huggingface` can't strand a server with no weights + no token — the
  exact failure that crash-looped `marlin-server` once.

---

## App proxies (`vite.config.ts`)

The HTTPS app reaches these HTTP services through Vite proxies (avoids CORS / mixed-content):

| App endpoint | → target |
|---|---|
| `/api/llama` | `http://localhost:7744` (llama-swap) |
| `/api/vllm` | `http://localhost:8002` (vLLM) |
| `/api/marlin` | `http://localhost:8003` (Marlin) |
| `/api/jamendo` | `https://api.jamendo.com` (music) |
| `/api/transcode` | NVENC ffmpeg middleware (GPU 1) |

`GET /api/local-vlm/models` and `/api/local-vlm/swap-status` still work (read-only — they
report which vLLM model is loaded). `POST /api/local-vlm/swap` is retired (returns 410):
switch models via `.env.local` + `pm2 restart vllm-server` instead.

---

## Quick "what's running?" check

```bash
pm2 list | grep -E "frameGrep-Marlin|vllm-server|marlin-server|llama-server-cuda"
ss -tlnp | grep -E ':(3007|7744|8002|8003) '
nvidia-smi --query-compute-apps=pid,used_memory --format=csv
```
