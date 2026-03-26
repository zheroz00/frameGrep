# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## User info
My name is Marc (Captain Awesome.) ;) Here are a few important notes about me. Please keep these in mind when I'm starting to veer off path.
- I'm a former Systems Engineer
- I'm 49, single male, no dependancies.
- Hobbies includes, woodworking, CNC router and laser, freestyle dancing, FPV drones, coding, hyper-ebikes.
- I have weapons grade ADHD with a major side of imposter syndrome with is completely unwarranted.
- Ask me about my website if we're doing anything where more info about me would be useful.
- I tend to go `Rabbit Holing` where I go down a rabbit hole and don't emerge for hours. This can happen without me even realizing it.
- Smaller tasks are easily to accomplish simply because of the satifaction of knocking something, ANYTHING off the list.
- Question me about my choices if they are off-topic, unrelated to the project, bizarre, etc. e.g. I may ask for a feature and you will say "Sure!" and create it. But what you don't tell me is that you created a magical bridge to make it work. Those are the kind of things I want to know beforehand. 
- Before we start adding features, ask me about the end-goal, or why I want to do that. I want to at least explain my reasoning so you can let me know what you think.
- I have countless projects at 95% and for whatever reason I never complete them. I need to start understanding there is a reason people release v1, then v2. I always feel things need to be perfect before I release anything.
- I am painfully self-aware of what I'm doing and that makes me nuts.
- Always feel free to ask me about anything as we go.


The app's core purpose is **clip identification + music suggestion + export to external tools**. Features that turn it into a full video editor should be questioned and discussed before implementation.

## Project Overview

FPV.AI Editor is a React application that uses Google's Gemini AI to analyze FPV drone footage and automatically identify highlight moments. Users upload video files, configure analysis presets, and export clips as EDL files (DaVinci Resolve/Premiere) or FFmpeg scripts.

**Source files live in `src/`** — `App.tsx`, `types.ts`, `index.tsx` and all subdirectories (`components/`, `hooks/`, `services/`, `utils/`, `constants/`) are under `src/`. Config files (`vite.config.ts`, `tsconfig.json`, `index.html`, `package.json`) remain at the project root.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server at http://localhost:3006
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
- `constants/defaultPresets.ts` - FPV + Generic preset definitions with detailed system instructions (717 lines of prompt text)
- `transcode/convert.sh` *(root, not in src/)* - HEVC/NVENC transcoding helper script

**State Management (Prop Drilling, No Context API)**:
All state lives in 5 custom hooks instantiated in `App.tsx`. Hook return values are passed as props to child components. There is no React Context, no Redux, no Zustand. Cross-hook coordination happens in `App.tsx` handler functions (e.g., `handleLoadProject` reads from projects, writes to presets, analysis, and music state). New features needing data from multiple hooks should add coordination logic in `App.tsx`.

**Data Flow (Gemini - native video)**:
1. User uploads video(s) → `uploadVideo()` sends to Gemini Files API with polling for PROCESSING state
2. User triggers analysis → `analyzeVideo()` sends video URI + system instruction to Gemini with JSON schema
3. Response parsed into `ClipSegment[]` (start_time, end_time, description, excitement_score, mood, lighting, dominant_colors)
4. User exports as EDL, FFmpeg script, or FCPXML (DaVinci Resolve) via `exportUtils`

**Data Flow (Custom/OpenRouter - frame extraction)**:
1. User uploads video(s) → stored as local blob URLs
2. User triggers analysis → `analyzeVideoLocal()` extracts frames client-side using canvas
3. Frames sent as base64 images to OpenRouter/Ollama chat completions API
4. Response parsed into `ClipSegment[]`, user exports via `exportUtils`

**Adaptive Frame Extraction** (`localVLMService.ts`):
- VLMs have image limits (~50-100 per request)
- Frame rate adapts to video duration: `fps = min(1.0, max(0.1, 60 / duration))`
- Short videos (< 60s): 1 fps (max precision)
- Long videos (> 60s): Reduced fps to stay under 60 frames
- Frames scaled to max 1280x720 to reduce token cost

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
- **Gemini**: Uses `gemini-3-flash-preview` for video analysis and prompt optimization with structured JSON via `responseSchema`. Caption generation (`captionService.ts`) uses `gemini-2.5-flash` with free-form JSON (no `responseSchema`).
- **Custom (OpenRouter/Ollama)**: OpenAI-compatible API. Default model `qwen/qwen3-vl-235b-a22b-instruct`. Uses frame extraction since these APIs don't support video upload.
- Clips use "MM:SS" time format internally across all providers

**Data Persistence**:
- All app data stored in browser localStorage (keys: `fpv_presets`, `fpv_projects`, `fpv_settings`)
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
- Allowed hosts: `localhost` and `fpv.r3belmind.dev` (production)
- PM2 deployment config in `ecosystem.config.cjs`

## Code Organization Guidelines

**Avoid monolithic files.** Keep files focused and under 300 lines when possible. Known exceptions: `src/App.tsx` (785 lines, orchestrator), `src/constants/defaultPresets.ts` (717 lines, prompt text), `src/utils/exportUtils.ts` (523 lines, format generators).

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


---

## Corkboard Integration

The corkboard is for **action items only** - things that require Marc's attention or intervention. Don't clutter it with status updates or informational notes.

**Automated alerts (handled by hooks):**
- AskUserQuestion tool triggers → auto-posts when waiting for input
- Critical command failures → auto-posts on fatal errors, permission denied, etc.

**When to manually post:**
- Task complete and needs testing/review
- Blocked and need Marc to provide info, credentials, or make a decision
- Found something important Marc should know about (security issue, breaking change, etc.)
- Build/deploy ready for verification

**When NOT to post:**
- Progress updates ("finished step 3 of 5")
- Commits made (informational, not actionable)
- Simple completions that don't need review
- Anything Marc doesn't need to act on

```bash
# Post + alert (brings board forward)
corkboard add task "READY FOR TESTING" "Login flow complete - test at localhost:3000" 1 && corkboard alert
corkboard add task "NEED INFO" "Which S3 bucket for prod assets?" 1 && corkboard alert
corkboard add alert "SECURITY" "Found exposed API key in .env.example" 1 && corkboard alert

# Just list or manage (no alert needed)
corkboard list
corkboard complete <id>
```

**Types:** task, note, link, event, alert, email
**Priority:** 1=high, 2=medium, 3=low
