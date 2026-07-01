# GPU Activity Widget — Design

**Date:** 2026-07-01
**Status:** Approved, building

## Problem

While testing local models (Marlin / local vLLM), the user repeatedly jumps out to a
terminal to run `nvidia-smi` to see whether a model is loaded and whether the GPU is
actually working, then back to the app. A live in-app readout removes that context switch.

## Scope (v1)

A small live GPU readout in the app header, shown **only when a local provider is active**.
Per-GPU utilization % + VRAM used/total.

Explicitly **out of scope** for v1: history/graphs, per-process breakdown, temperature/power,
click-to-expand, configurability. Iterate later if wanted.

## Architecture

Four pieces, mirroring existing patterns (the app already shells out to server-side
commands via Vite middleware — NVENC transcode, vLLM model manager).

### 1. Server endpoint — `GET /api/gpu` (new middleware in `vite.config.ts`)
- Spawns `nvidia-smi --query-gpu=index,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits`
- Returns `{ gpus: [{ index, util, memUsedMB, memTotalMB }, ...] }`
- **Throttle:** ~1s in-memory cache so multiple polls/clients don't spam `nvidia-smi`
- **Timeout:** kill the child after 3s if it hangs
- On spawn error / non-zero exit / missing `nvidia-smi` → `503 { error }`

### 2. Client hook — `hooks/useGpuStats.ts`
- Polls `/api/gpu` every **2s** via `setInterval`, but only when `enabled` is true
- Auto-pauses when the tab is hidden (`visibilitychange`) — no background `nvidia-smi` spawns
- Returns `{ gpus, error, loading }`

### 3. Component — `components/GpuWidget.tsx`
- One compact pill per GPU in the header: `GPU0 ▓▓▓▓▓▓░░ 74%  13.6/16 GB`
- Util bar color ramps green → amber → red with load
- Muted styling, monospace numbers; on error shows a muted "GPU n/a"

### 4. Visibility gate — `utils/providerUtils.ts` + `App.tsx`
- `isLocalProvider(settings)`: true for `marlin`, or `custom` whose endpoint is local
  (`/api/vllm`, `/api/llama`, `/api/marlin`, `localhost`, `127.0.0.1`, or a private LAN IP).
  `gemini` → false.
- `App.tsx` mounts `<GpuWidget enabled={isLocalProvider(settings)} />` in the header near
  the Settings button. When not enabled, the hook does not poll.

## Data flow

`GpuWidget` (enabled) → `useGpuStats` polls `GET /api/gpu` every 2s → middleware runs
`nvidia-smi` (≤1s cached) → JSON → pills re-render.

## Error handling

- `nvidia-smi` missing or errors → endpoint returns 503; widget shows muted "GPU n/a",
  keeps polling (recovers automatically if the driver comes back).
- Tab hidden → polling paused.
- Non-local provider → widget unmounted, zero polling.

## Caveat

Reads GPU stats **host-wide**, not just frameGrep's usage. If another process shares the
GPU, totals are combined. For the "is my model loaded / working now" use case this is the
desired behavior.

## Files touched

- `vite.config.ts` — add `gpuStatsMiddleware()`, register in `plugins`
- `src/hooks/useGpuStats.ts` — new
- `src/components/GpuWidget.tsx` — new
- `src/utils/providerUtils.ts` — new (`isLocalProvider`)
- `src/App.tsx` — mount widget + import helper

No new dependencies. ~150 lines total.

## Operational note

`/api/gpu` is added in `vite.config.ts`; Vite does **not** hot-reload config changes, so the
PM2 dev server (`frameGrep-Marlin`) must be restarted once after this lands for the endpoint
to exist. The hook/component changes HMR normally.
