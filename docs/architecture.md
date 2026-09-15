# Architecture

Reference detail for frameGrep's structure. See `CLAUDE.md` for the short version.

## Stack

React 19, Vite 6, TypeScript, locally bundled Tailwind CSS (via PostCSS), Google Gemini AI
(`@google/genai`), mediainfo.js (WASM).

Vite bundles all runtime dependencies and Tailwind builds locally, so the app has no CDN or
import-map dependency at startup. `public/MediaInfoModule.wasm` (2.5MB) is required at runtime
for video metadata extraction.

## Layout

All source lives under `src/`. Config files (`vite.config.ts`, `tsconfig.json`, `index.html`,
`package.json`) stay at the project root.

| Path | Role |
| --- | --- |
| `App.tsx` | Orchestrator. Creates all hooks, wires them to components via props, handles export. |
| `types.ts` | All shared interfaces (`ClipSegment`, `PromptPreset`, `VideoQueueItem`, `AppSettings`, `Project`). |
| `domain/` | Pure, framework-free logic with colocated tests (`media.ts`, `presets.ts`, `project.ts`). Provider output normalization lives here. |
| `hooks/` | Stateful React logic, one concern per hook. |
| `services/` | External API integrations and I/O. |
| `utils/` | Pure helpers with no React dependency. |
| `components/` | One component per file, with `settings/`, `projects/`, `ui/` subfolders. |
| `constants/` | Default presets, FPV move dictionary, app-wide config. |
| `server/` | Vite dev-server middleware (transcode endpoint). |

`@/*` maps to `src/` (configured in both `tsconfig.json` and `vite.config.ts`).

## Key files

**Hooks**
- `useVideoAnalysis.ts`: video queue, provider routing, temporal constraint injection, FPV move
  dictionary appending.
- `usePresets.ts`: preset CRUD with hybrid persistence (localStorage + IndexedDB handle + File
  System Access API).
- `useProjects.ts`: project save/load, debounced auto-backup, folder linking.
- `useAppSettings.ts`: provider config, API keys, OpenRouter model list fetching.
- `useMusic.ts`: music search/selection state, Jamendo coordination, preview playback.
- `useGpuStats.ts`: local GPU telemetry for the GPU widget.

**Services**
- `providerAdapter.ts`: the shared `ProviderAdapter` contract every analysis backend implements.
  Adapters return `RawClipSegment[]`; normalization happens in `domain/`.
- `geminiService.ts`: Files API upload with polling, structured JSON analysis, category-aware
  prompt optimization.
- `geminiModels.ts`: model id catalog and capability metadata.
- `localVLMService.ts`: client-side canvas frame extraction, adaptive FPS, OpenAI-compatible calls.
- `openAIStream.ts`: streaming response parsing for OpenAI-compatible endpoints.
- `openrouterService.ts`: model listing with caching, vision-model filtering, fallback list.
- `marlinService.ts`: local Marlin-2B clip-ID model client.
- `captionService.ts`: social caption generation (Instagram, TikTok, YouTube, Twitter/X).
- `jamendoService.ts`: mood/energy to search terms, Jamendo queries, royalty-free results.
- `mediaInfoService.ts`: WASM metadata extraction (fps, resolution, codec) for accurate FCPXML.
- `transcodeService.ts`: POSTs raw video bytes to `/api/transcode`.
- `workspaceDirectory.ts`: IndexedDB-backed directory handle store for folder linking.

**Utils and constants**
- `utils/exportCore.ts`: the actual EDL / FFmpeg / FCPXML generators (pure, tested).
- `utils/exportUtils.ts`: thin wrapper over `exportCore` plus data import/export with format
  auto-detection.
- `constants/defaultPresets.ts`: FPV + Generic preset definitions. FPV instructions are role and
  scoring only; the move vocabulary is appended at prompt-build time.
- `constants/fpvMoves.ts`: canonical FPV maneuver dictionary (22 moves). Exports structured
  `FpvMove[]` plus `renderFpvMoveDictionary()`.
- `transcode/convert.sh` (root, not in `src/`): standalone HEVC/NVENC CLI helper, unrelated to the
  in-app transcode service.

## State management

Prop drilling, no Context API. All state lives in custom hooks instantiated in `App.tsx`, and hook
return values pass down as props. No Redux, no Zustand, no Context.

Cross-hook coordination happens in `App.tsx` handler functions. For example `handleLoadProject`
reads from projects and writes to presets, analysis, and music state. Any new feature that needs
data from two hooks adds its coordination logic in `App.tsx`.

`App.tsx` intentionally exceeds the 300-line guideline. It is the sole integration point, and
splitting it would require introducing a state management layer.

## Data flow: Gemini (native video)

1. User uploads video(s), kept as local blob URLs.
2. On analyze, `shouldTranscode(file, autoDownsample)` checks size, resolution, exact fps, bitrate.
   With auto-downsample on, over-target media goes through `/api/transcode?maxHeight=720&fps=30`
   (NVENC with CPU fallback) and the result blob URL is previewable. In-spec media uploads as-is.
3. `uploadVideo()` sends the file to the Gemini Files API, polling while it is `PROCESSING`.
4. `analyzeVideo()` sends the video URI plus system instruction (preset + auto-appended FPV move
   dictionary + temporal constraint) with a JSON response schema.
5. Output is validated and normalized into `ClipSegment[]` in `domain/` (sourceId, numeric seconds,
   normalized score and enums). Rejected spans are reported back to the user.
6. Export as EDL, FFmpeg script, or FCPXML.

## Data flow: Custom / OpenRouter (frame extraction)

1. User uploads video(s), stored as local blob URLs.
2. `analyzeVideoLocal()` extracts frames client-side using canvas.
3. Frames go as base64 images to an OpenAI-compatible chat completions API.
4. Response is parsed into `ClipSegment[]` and exported the same way.

## Multi-video support

Videos queue for batch processing and run sequentially with error isolation. Each clip tracks its
`sourceFile` so exports can reference multiple sources.

## Dev server surface (`vite.config.ts` + `server/`)

The Vite dev server is not just a static server. It hosts middleware and proxies the app depends on,
which is why PM2 runs `npm run dev` rather than a production build.

**Middleware**
- `POST /api/transcode` (`server/transcodeMiddleware.ts`): accepts one bounded job at a time, writes
  input and output to temp files, probes NVENC once with CPU `libx264` fallback, validates the
  output with `ffprobe`, and returns HTTP 200 only after FFmpeg exits successfully. Enforces
  request, concurrency, and timeout cleanup. Originals are never touched.
  `FRAMEGREP_TRANSCODE_ENCODER=cpu|nvenc|auto` controls encoder selection.
- `GET /api/gpu`: live per-GPU utilization and VRAM for the in-app activity widget.
- `GET /api/local-vlm/models`: lists VLMs in the local HF cache and which one is loaded.
- `POST /api/local-vlm/swap`: body `{model, maxModelLen?}`, kills and restarts vLLM.
- `GET /api/local-vlm/swap-status`: quick liveness check on the vLLM server.

**Proxies** (all exist to dodge CORS and mixed-content blocks when the app is served over HTTPS)

| Route | Target | Notes |
| --- | --- | --- |
| `/api/jamendo` | `https://api.jamendo.com` | Music search. |
| `/api/llama` | `http://localhost:7744` | llama-swap. Use endpoint `/api/llama/v1` in Settings. |
| `/api/vllm` | `http://localhost:8002` | Local vLLM. Use endpoint `/api/vllm/v1` in Settings. |
| `/api/marlin` | `http://localhost:8003` | Marlin-2B (`scripts/marlin-server.sh`). 300s timeout because captioning can take 20-45s. |

**Server binding**: `FRAMEGREP_PORT` (default 3008, `strictPort`) and `FRAMEGREP_HOST` (default
`127.0.0.1`, set `0.0.0.0` to expose on the LAN). `allowedHosts` is `localhost` plus
`.devtunnels.ms`; `ALLOWED_HOST` in `.env.local` accepts a comma-separated list of extra hostnames.

## Code organization guidelines

Keep files focused and under 300 lines where practical. Known and accepted exceptions:
`src/App.tsx` (orchestrator), `src/constants/defaultPresets.ts` and `src/constants/fpvMoves.ts`
(prompt and dictionary content).

Extract when a component has multiple responsibilities, when `useState`/`useEffect` logic gets
complex (move it to a hook), when business logic mixes with UI (move it to a service, util, or
`domain/`), or when the same code appears twice.

Naming: components PascalCase (`ClipCard.tsx`), hooks camelCase with a `use` prefix
(`useVideoAnalysis.ts`), utils and services camelCase (`exportUtils.ts`), constant values
SCREAMING_SNAKE_CASE in camelCase files.
