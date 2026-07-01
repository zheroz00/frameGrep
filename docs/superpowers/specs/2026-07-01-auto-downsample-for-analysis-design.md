# Auto-Downsample for Analysis — Design

**Date:** 2026-07-01
**Status:** Approved, building

## Problem

FPV source clips are often 4K/100fps. The models (Gemini, vLLM) don't need anywhere near
that resolution or frame rate for clip identification. Today the Gemini path only transcodes
when a file is over Gemini's *hard limits* (>2GB / >4K / >100Mbps), so an in-spec 4K/100fps
clip uploads **as-is** — wasting upload time. The user works around this by manually
converting clips before upload, producing duplicate files that must be deleted (and which
aren't the clip used for real editing). Goal: the app downsamples an in-memory copy
automatically, leaving the original file on disk untouched.

## Decisions (locked)

- Target resolution: **720p**. Target frame rate: **30fps**. Trigger: **automatic, with a
  Settings toggle to disable**. Audio: **kept** (negligible size vs video).

## Approach

Extend the existing server-side NVENC transcode (GPU-fast, already 10-bit-safe) rather than
add a client-side downsampler (browser 4K HEVC decode is heavy/unreliable). Change the
transcode *policy* from "only over hard limits" to "normalize any over-target clip," and add
fps capping (which the middleware doesn't do today).

## Components

### 1. `services/transcodeService.ts`
- New `TARGET_FPS = 30` (keep `TARGET_HEIGHT = 720`).
- `shouldTranscode(file, autoDownsample = false)`:
  - Unchanged hard-limit checks (>2GB, >4K, >100Mbps) always apply.
  - When `autoDownsample` is true, **also** transcode if `meta.height > TARGET_HEIGHT`
    or `meta.fps > TARGET_FPS`, with a clear reason string.
- `transcodeViaServer` passes `fps=TARGET_FPS` as a query param (in addition to `maxHeight`).

### 2. `vite.config.ts` (NVENC middleware)
- Read an `fps` query param; when valid (1–120), **prepend** `fps=${fps},` to the filter
  chain: `fps=30,scale=-2:'min(720,ih)',format=yuv420p`. Backward-compatible (no param → no
  fps filter). fps filter caps high frame rates; sub-target sources are effectively unchanged.

### 3. `services/localVLMService.ts`
- `downscaleForNativeVideo` adds `fps: '30'` to its transcode params (consistency; also
  trims frames the vLLM-native path must process). Frame-extraction path untouched.

### 4. Setting — `types.ts`, `hooks/useAppSettings.ts`, `components/settings/SettingsModal.tsx`
- `AppSettings.autoDownsample: boolean` (default **true**), persisted in `fpv_app_settings`.
- `updateAutoDownsample` callback (mirrors `updateGeminiFps`), added to the hook's return +
  `UseAppSettingsReturn`.
- Toggle in the SettingsModal Gemini section (after "Sampling Rate"), matching the existing
  button-style controls: "Auto-downsample for analysis — 720p / 30fps. Your original file is
  never modified."

### 5. Wiring — `hooks/useVideoAnalysis.ts`, `App.tsx`
- `runAnalysis` options gain `autoDownsample?: boolean` (default true); passed into
  `shouldTranscode(item.file, autoDownsample)` on the Gemini path.
- `App.tsx` passes `autoDownsample: settings.autoDownsample`.

## Data flow (Gemini)

queue item → `shouldTranscode(file, autoDownsample)` → if over target/limits,
`transcodeVideo` POSTs source to `/api/transcode?maxHeight=720&fps=30` (NVENC) → smaller
in-memory `File` stored as `transcodedUrl`/`transcodedSize` (existing preview) → uploaded to
Gemini. Original `item.file` never touched; exports still reference the original filename.

## Error handling

- Transcode failure throws a clear error (current behavior) — no silent full-res upload.
  Toggle off to send originals (only safe under Gemini's 2GB/4K/100Mbps limits, which the
  toggle-off path still enforces).
- Metadata extraction failure falls back to the size-only check (existing).

## Out of scope (v1)

- Configurable target res/fps dropdowns (kept as constants; trivial to expose later).
- Dropping audio. Changing the frame-extraction path (already optimal).

## Files touched

`transcodeService.ts`, `vite.config.ts`, `localVLMService.ts`, `types.ts`, `useAppSettings.ts`,
`SettingsModal.tsx`, `useVideoAnalysis.ts`, `App.tsx`.

## Operational note

`vite.config.ts` changes need a `pm2 restart frameGrep-Marlin` (Vite doesn't hot-reload its
config). The rest HMR normally.
