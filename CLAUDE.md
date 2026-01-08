# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working With This User

**Scope Creep Check**: The user tends to get excited when features are implemented quickly and may start requesting additional features mid-task. Before implementing new feature requests that seem to expand scope significantly, STOP and ask:

1. "This sounds like a bigger feature - should we finish [current task] first and create a GitHub issue for this?"
2. "Is this something you want right now, or should we track it for later?"

Signs to watch for:
- Requests for features unrelated to the current task
- "What if we also..." or "Could we add..." during implementation
- Escalating complexity (e.g., simple export → full video editor)

The app's core purpose is **clip identification + music suggestion + export to external tools**. Features that turn it into a full video editor should be questioned and discussed before implementation.

## Project Overview

FPV.AI Editor is a React application that uses Google's Gemini AI to analyze FPV drone footage and automatically identify highlight moments. Users upload video files, configure analysis presets, and export clips as EDL files (DaVinci Resolve/Premiere) or FFmpeg scripts.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run preview      # Preview production build
```

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

**Stack**: React 19, Vite 6, TypeScript, Tailwind CSS, Google Gemini AI (@google/genai)

**Key Files**:
- `App.tsx` - Main component orchestrating UI layout and connecting hooks to components
- `hooks/usePresets.ts` - Preset state management, localStorage sync, auto-backup, and disk persistence
- `hooks/useVideoAnalysis.ts` - Video upload, analysis routing (Gemini vs Custom), progress tracking, playback state
- `hooks/useAppSettings.ts` - App settings (provider, API keys), localStorage persistence, OpenRouter model fetching
- `hooks/useProjects.ts` - Project CRUD operations, localStorage persistence, auto-backup, import/export
- `components/PromptLab.tsx` - Prompt editing panel with preset selector, duration slider, AI polish
- `components/ProjectsSidebar.tsx` - Left slide-in panel for saving/loading analysis sessions
- `components/projects/ProjectListItem.tsx` - Project card with load/delete/export/rename actions
- `components/VideoPlayer.tsx` - HTML5 video player with segment playback (start/end time control)
- `components/ClipCard.tsx` - Displays individual clip metadata with FFmpeg copy command, caption/music triggers
- `components/MusicPanel.tsx` - Slide-in panel for AI-powered music suggestions from Jamendo
- `hooks/useMusic.ts` - Music panel state, Jamendo search, audio preview playback
- `services/jamendoService.ts` - Jamendo API integration, music suggestion generation from clip analysis
- `components/CaptionModal.tsx` - Social media caption generation modal with platform-specific outputs
- `components/settings/SettingsModal.tsx` - Settings UI for provider selection, API keys, model picker, data backup
- `components/settings/ModelSelectorModal.tsx` - OpenRouter model browser with search, filtering, pricing info
- `services/geminiService.ts` - Gemini API integration: video upload, analysis with structured JSON output, category-aware prompt optimization
- `services/localVLMService.ts` - Custom provider (OpenRouter/Ollama): adaptive frame extraction, VLM API calls
- `services/openrouterService.ts` - Fetches available models from OpenRouter API with caching
- `services/captionService.ts` - AI-generated social media captions for clips/videos (Instagram, TikTok, YouTube, Twitter)
- `utils/exportUtils.ts` - EDL/FFmpeg/FCPXML generation, data export/import with auto-detection
- `constants/defaultPresets.ts` - Default presets: FPV (Cinematic, Shorts, Technical, Crash) + Generic (Highlights, Tutorial, Sports, Event, B-Roll, Best Takes)
- `types.ts` - Core interfaces: `ClipSegment`, `PromptPreset`, `VideoQueueItem`, `AppSettings`, `OpenRouterModel`, `Project`, `SocialCaptions`

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
- **Gemini**: Uses `gemini-2.5-flash` for native video analysis with structured JSON via `responseSchema`. Prompt optimization via `gemini-3-flash-preview` with category-aware guidelines (FPV vs generic).
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

**Path Alias**: `@/*` maps to project root (configured in tsconfig.json and vite.config.ts)

## Code Organization Guidelines

**Avoid monolithic files.** Keep files focused and under 300 lines when possible.

**File structure conventions:**
- `components/` - React components, one per file. Extract sub-components when they exceed ~150 lines or are reusable.
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
