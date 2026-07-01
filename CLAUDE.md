# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The app's core purpose is **clip identification + music suggestion + export to external tools**. Features that turn it into a full video editor should be questioned and discussed before implementation.

## Project Overview

frameGrep is a React application that analyzes FPV/drone footage to automatically identify highlight moments. Users upload video files, configure analysis presets, and export clips as EDL files (DaVinci Resolve/Premiere), FFmpeg scripts, or FCPXML. Analysis runs through one of three providers: Google Gemini (native video), a Custom OpenAI-compatible endpoint (OpenRouter / local vLLM / local llama.cpp), or the local Marlin-2B clip-ID model. (The app was formerly named "FPV.AI Editor"; the header/title/package are now branded **frameGrep**.)

**Source files live in `src/`** — `App.tsx`, `types.ts`, `index.tsx` and all subdirectories (`components/`, `hooks/`, `services/`, `utils/`, `constants/`) are under `src/`. Config files (`vite.config.ts`, `tsconfig.json`, `index.html`, `package.json`) remain at the project root.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server at http://localhost:3007
npm run build        # Production build
npm run preview      # Preview production build
```

**No test infrastructure** — no vitest/jest config or test files exist. Verify changes by running the dev server and testing in-browser.

**No linting or formatting tools** — no ESLint, Prettier, or EditorConfig. Code style is enforced by convention only.

**PM2 deployment** (`ecosystem.config.cjs`): Runs `npm run dev` (the Vite dev server), not a production build. This is intentional for the current single-user deployment at `fpv.r3belmind.dev`.

## Environment Setup

Set API keys in `.env.local`:

```bash
VITE_GEMINI_API_KEY=AIza...               # Google Gemini API key

# OpenRouter (optional, for custom provider)
VITE_OPENROUTER_API_KEY=sk-or-v1-...      # OpenRouter API key
VITE_OPENROUTER_ENDPOINT=https://openrouter.ai/api/v1
VITE_OPENROUTER_MODEL=qwen/qwen3-vl-235b-a22b-instruct

# Frame extraction (optional, for custom provider)
VITE_FRAME_EXTRACTION_FPS=0.5             # Fixed FPS for frame extraction (default: adaptive)

# Jamendo Music (optional, for music suggestions)
VITE_JAMENDO_CLIENT_ID=4d45d0dd           # Jamendo API Client ID
```

If not set, users can enter API keys in the Settings UI. Frame extraction uses adaptive FPS by default (adjusts based on video length to stay under 60 frames).

## Architecture

**Stack**: React 19, Vite 6, TypeScript, Tailwind CSS (CDN), Google Gemini AI (@google/genai), mediainfo.js (WASM)

**Dependency Strategy (CDN + Import Maps)**:
`index.html` loads Tailwind CSS from CDN (`cdn.tailwindcss.com`) and declares browser import maps via esm.sh for `react`, `react-dom`, `recharts`, `@google/genai`, and `lucide-react`. These same packages appear in `package.json` for TypeScript type resolution, but at runtime the browser import map takes precedence. The `recharts` library is mapped but currently unused in any component. `public/MediaInfoModule.wasm` (2.5MB) is required at runtime for video metadata extraction via `mediainfo.js`.

**Key Architectural Files** (all paths relative to `src/` unless noted):
- `App.tsx` - Orchestrator (785 lines): creates all 5 hooks, wires them to components via props, handles export logic. Intentionally exceeds the 300-line guideline — it is the sole integration point and splitting it would require introducing a state management layer.
- `types.ts` - All shared interfaces (`ClipSegment`, `PromptPreset`, `VideoQueueItem`, `AppSettings`, `Project`)
- `hooks/useVideoAnalysis.ts` - Video queue management, provider routing (Gemini vs Custom), temporal constraint injection
- `hooks/usePresets.ts` - Preset CRUD with hybrid persistence (localStorage + IndexedDB directory handle + File System Access API)
- `hooks/useProjects.ts` - Project save/load, auto-backup with debounce, folder linking via File System Access API
- `hooks/useAppSettings.ts` - Provider config, API key management, OpenRouter model list fetching
- `hooks/useMusic.ts` - Music search/selection state, Jamendo integration coordination, audio preview playback
- `services/geminiService.ts` - Gemini Files API upload with polling, structured JSON analysis, category-aware prompt optimization
- `services/captionService.ts` - Social media caption generation via Gemini (Instagram, TikTok, YouTube, Twitter/X)
- `services/openrouterService.ts` - OpenRouter model listing with caching, vision model filtering, fallback model list
- `services/localVLMService.ts` - Client-side frame extraction via canvas, adaptive FPS calculation, OpenAI-compatible API calls
- `services/jamendoService.ts` - Mood/energy analysis to music search terms, Jamendo API queries, royalty-free track results
- `services/mediaInfoService.ts` - WASM-based video metadata extraction (fps, resolution, codec) for accurate FCPXML export
- `utils/exportUtils.ts` - EDL/FFmpeg/FCPXML generation with multi-source support, data import/export with format auto-detection
- `constants/defaultPresets.ts` - FPV + Generic preset definitions. FPV preset instructions are role + scoring only — the canonical move vocabulary is sourced separately from `fpvMoves.ts` and appended at prompt-build time.
- `constants/fpvMoves.ts` - Canonical FPV maneuver dictionary (22 moves: rotations, orbits, gaps, proximity, combos, vertical, hover). Exported as structured `FpvMove[]` plus `renderFpvMoveDictionary()` which formats them into prompt text. Auto-appended to every FPV preset's instruction by `useVideoAnalysis.ts`.
- `services/transcodeService.ts` - Client-side wrapper that POSTs raw video bytes to the `/api/transcode` Vite middleware (server-side NVENC ffmpeg). `shouldTranscode(file, autoDownsample)` forces a transcode over Gemini's hard limits (2GB / 4K / 100Mbps) always, and — when `autoDownsample` is on (default, `AppSettings.autoDownsample`) — also normalizes any over-target clip to **720p / 30fps** (`TARGET_HEIGHT` / `TARGET_FPS`) so 4K/100fps sources don't upload full-size. Only an in-memory copy is transcoded; the user's original file on disk is never touched. Returns a new `File` plus streaming progress.
- `components/FpvMoveDictionaryPanel.tsx` - Collapsible read-only dictionary viewer shown in Prompt Lab when the active category is `fpv`. Lets the user browse what the model is being taught.
- `transcode/convert.sh` *(root, not in src/)* - HEVC/NVENC transcoding helper script (standalone CLI, separate from the in-app transcode service)

**State Management (Prop Drilling, No Context API)**:
All state lives in 5 custom hooks instantiated in `App.tsx`. Hook return values are passed as props to child components. There is no React Context, no Redux, no Zustand. Cross-hook coordination happens in `App.tsx` handler functions (e.g., `handleLoadProject` reads from projects, writes to presets, analysis, and music state). New features needing data from multiple hooks should add coordination logic in `App.tsx`.

**Data Flow (Gemini - native video)**:
1. User uploads video(s) → kept as local blob URLs
2. User triggers analysis → `shouldTranscode(file, autoDownsample)` checks size / resolution / fps / bitrate. With auto-downsample ON (default), any clip over **720p or 30fps** (or over Gemini's 2GB/4K/100Mbps hard limits) is transcoded via `transcodeVideo()` → `/api/transcode?maxHeight=720&fps=30` (server-side NVENC); the result blob URL is stored on the queue item as `transcodedUrl` so the user can preview what's actually being sent. With auto-downsample OFF, only the hard limits trigger a transcode. In-spec clips upload as-is.
3. (Possibly-transcoded) file → `uploadVideo()` sends to Gemini Files API with polling for PROCESSING state
4. User triggers analysis → `analyzeVideo()` sends video URI + system instruction (preset + auto-appended FPV move dictionary + temporal constraint) to Gemini with JSON schema
5. Response parsed into `ClipSegment[]` (start_time, end_time, description, excitement_score, mood, lighting, dominant_colors)
6. User exports as EDL, FFmpeg script, or FCPXML (DaVinci Resolve) via `exportUtils`

**Data Flow (Custom/OpenRouter - frame extraction)**:
1. User uploads video(s) → stored as local blob URLs
2. User triggers analysis → `analyzeVideoLocal()` extracts frames client-side using canvas
3. Frames sent as base64 images to OpenRouter/Ollama chat completions API
4. Response parsed into `ClipSegment[]`, user exports via `exportUtils`

**Adaptive Frame Extraction** (`localVLMService.ts`):
- Frame budget: 200 frames for cloud VLMs (Qwen3-VL on OpenRouter handles ~256K context). For local vLLM the budget is **derived from a token budget** (not hardcoded) so it can't overflow the context: `floor((LOCAL_CONTEXT_TOKENS − LOCAL_MAX_OUTPUT_TOKENS − LOCAL_PROMPT_RESERVE) / LOCAL_EST_TOKENS_PER_FRAME)` ≈ **50 frames** at 32K ctx. Keep `LOCAL_CONTEXT_TOKENS` (in `localVLMService.ts`) in sync with `VLLM_MAX_LEN` (`.env.local`). A previous hardcoded "60 @ 65K" assumption blew past the 32K vLLM (57924 > 32768). `capFrames()` is a hard post-extraction safety trim so the adaptive-FPS floor can't overshoot on very long clips.
- Frame rate adapts to video duration: `fps = max(MIN_FPS, min(MAX_FPS, maxFrames / duration))` where `MIN_FPS=0.1`, `MAX_FPS=4.0`.
- Short clips (< 15s on cloud): clamps at 4 fps — enough to catch sub-second action like backflips.
- Long videos: reduced fps to stay under the frame budget.
- Frames scaled to JPEG q0.7 to reduce token cost: max 1280x720 for cloud, **max 896x512 for local vLLM** (smaller frames → more of them fit the 32K window; temporal coverage beats per-frame sharpness for spotting FPV action).
- Local VLMs receive `/no_think` directive in the prompt + `chat_template_kwargs.enable_thinking: false` to disable Qwen3.x reasoning blocks (otherwise they burn the token budget before emitting JSON).

**Multi-Video Support**:
- Queue multiple videos for batch processing
- Each clip tracks its `sourceFile` for multi-source exports
- Videos processed sequentially with error isolation

**Music Suggestions** (`jamendoService.ts`):
- Analyzes clip mood, energy level, and excitement scores to generate music search terms
- Two modes: "All Clips" (header button) for cohesive video-wide music, "Single Clip" (per-clip button) for individual ditties
- Queries Jamendo API with generated tags (genre, mood) and speed (tempo)
- Returns royalty-free tracks with inline audio preview
- Music is free for personal use with attribution (Creative Commons)

**AI Provider Notes**:
- **Gemini**: Default analysis model is `gemini-2.5-flash-lite` — chosen based on Marc's empirical testing (5 accurate clips vs 1 from `gemini-3.1-flash-lite` on the same FPV footage; see `docs/model_test_notes.md`). User can switch via Settings dropdown; choice is auto-saved to localStorage. Prompt optimization ("AI Polish" button) uses `gemini-3-flash-preview` hardcoded. Caption generation (`captionService.ts`) uses `gemini-2.5-flash` with free-form JSON. All analysis uses structured JSON via `responseSchema`.
- **Gemini video sampling — two independent knobs** (both in Settings, both persisted): `geminiMediaResolution` (`low`/`default`) sets frame *sharpness* / tokens-per-frame; `geminiFps` sets how *many* frames/sec Gemini samples. Gemini's own default is **1 fps**, which misses sub-second FPV action (backflips/gaps fall between frames), so frameGrep defaults `geminiFps` to **4**. It's passed as `videoMetadata: { fps }` on the video part in `geminiService.ts`, and only sent when `fps > 1` (so `fps=1` preserves Gemini's native default). Higher fps = more tokens; pairs well with `low` resolution. This mirrors the Custom/frame-extraction path, which already clamps short clips to 4 fps.
- **FPV preset prompts** auto-append the canonical move dictionary (`fpvMoves.ts`) at runtime via `useVideoAnalysis.ts`. AI Polish is instructed to NOT generate a `MOVE VOCABULARY` section to avoid duplication.
- **Custom (OpenRouter/Ollama/vLLM)**: OpenAI-compatible API. Default model `qwen/qwen3-vl-235b-a22b-instruct`. Uses frame extraction since these APIs don't support video upload natively. Anthropic-direct provider is force-pinned for `anthropic/*` models on OpenRouter (Bedrock substitutes a non-vision Haiku otherwise).
- Clips use "MM:SS" time format internally across all providers

**Data Persistence**:
- All app data stored in browser localStorage. Active keys: `fpv_app_settings`, `fpv_presets`, `fpv_projects`. Settings auto-save 500ms after every change (no manual "save" required — the Settings modal's "Save Settings" button is essentially redundant but kept for clarity).
- An orphan `fpv_settings` key from a pre-rename version of the code is auto-removed on load by a one-shot cleanup in `useAppSettings.ts`. New installs never see it.
- Presets: Custom presets saved alongside defaults. Editing a default preset saves modified version.
- Projects: Save analysis sessions (clips + metadata) for later reload. Videos must be re-uploaded.
- Auto-backup: Optional feature that saves JSON backup 30s after changes (debounced)
- Folder linking: Link a local folder via File System Access API for silent auto-backups (no download dialogs)
- Directory handles persisted to IndexedDB; requires one-click "Reconnect" after page refresh (browser security)
- Export/Import: Settings modal provides unified backup (`fpv-all-data-*.json`) that includes presets + projects

**Backup File Naming**:
- Manual exports: Dated filenames (`fpv-presets-2024-01-07.json`, `fpv-projects-2024-01-07.json`)
- Auto-backups: Static filenames that overwrite (`fpv-presets-auto-backup.json`, `fpv-projects-auto-backup.json`)
- Import auto-detects format (bundle, presets-only, or projects-only)

**Path Alias**: `@/*` maps to `src/` (configured in tsconfig.json and vite.config.ts)

**Dev Server Notes**:
- Vite proxies `/api/jamendo/*` → `https://api.jamendo.com` to avoid CORS in development
- Vite middleware exposes `POST /api/transcode` — receives raw video bytes, spawns NVENC ffmpeg child process on GPU 1, streams output back as fragmented MP4. Defined in `vite.config.ts` (`nvencTranscodeMiddleware`). Used by `services/transcodeService.ts` for files exceeding Gemini's upload limits. The filter chain forces `format=yuv420p` (8-bit): DJI D-Log/HLG footage is often **10-bit HEVC**, which `h264_nvenc` cannot encode ("10 bit encode not supported") — downconverting keeps the H.264 path working.
- Allowed hosts: `localhost` and `fpv.r3belmind.dev` (production)
- PM2 deployment config in `ecosystem.config.cjs`

## Code Organization Guidelines

**Avoid monolithic files.** Keep files focused and under 300 lines when possible. Known exceptions: `src/App.tsx` (~800 lines, orchestrator), `src/constants/defaultPresets.ts` (~700 lines, prompt text), `src/constants/fpvMoves.ts` (~430 lines, dictionary content), `src/utils/exportUtils.ts` (~520 lines, format generators).

**File structure conventions** (all under `src/`):
- `components/` - React components, one per file. Extract sub-components when they exceed ~150 lines or are reusable.
- `components/settings/` - Settings-related components (`SettingsModal`, `ModelSelectorModal`)
- `components/projects/` - Project management sub-components (`ProjectListItem`)
- `components/ui/` - Generic UI primitives (buttons, modals, inputs)
- `hooks/` - Custom React hooks. Extract hooks from components when logic is reusable or complex.
- `services/` - External API integrations (Gemini, file handling)
- `utils/` - Pure utility functions with no React dependencies
- `types.ts` - Shared TypeScript interfaces and types
- `constants/` - App-wide constants, default presets, configuration

**When to extract:**
- Component has multiple responsibilities → split into focused components
- useState/useEffect logic is complex → extract to custom hook
- Business logic is mixed with UI → move to service or utility
- Same code appears twice → extract to shared module

**Naming conventions:**
- Components: PascalCase (`ClipCard.tsx`)
- Hooks: camelCase with `use` prefix (`useVideoAnalysis.ts`)
- Utils/services: camelCase (`exportUtils.ts`)
- Constants: SCREAMING_SNAKE_CASE for values, camelCase for files

