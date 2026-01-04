# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
GEMINI_API_KEY=AIza...                    # Google Gemini API key

# OpenRouter (optional, for custom provider)
VITE_OPENROUTER_API_KEY=sk-or-v1-...      # OpenRouter API key
VITE_OPENROUTER_ENDPOINT=https://openrouter.ai/api/v1
VITE_OPENROUTER_MODEL=qwen/qwen3-vl-235b-a22b-instruct

# Frame extraction (optional, for custom provider)
VITE_FRAME_EXTRACTION_FPS=0.5             # Fixed FPS for frame extraction (default: adaptive)
```

If not set, users can enter API keys in the Settings UI. Frame extraction uses adaptive FPS by default (adjusts based on video length to stay under 60 frames).

## Architecture

**Stack**: React 19, Vite 6, TypeScript, Tailwind CSS, Google Gemini AI (@google/genai)

**Key Files**:
- `App.tsx` - Main component orchestrating UI layout and connecting hooks to components
- `hooks/usePresets.ts` - Preset state management, localStorage sync, and disk persistence
- `hooks/useVideoAnalysis.ts` - Video upload, analysis routing (Gemini vs Custom), progress tracking, playback state
- `hooks/useAppSettings.ts` - App settings (provider, API keys), localStorage persistence, OpenRouter model fetching
- `components/PromptLab.tsx` - Prompt editing panel with preset selector, duration slider, AI polish
- `components/VideoPlayer.tsx` - HTML5 video player with segment playback (start/end time control)
- `components/ClipCard.tsx` - Displays individual clip metadata with FFmpeg copy command
- `components/settings/SettingsModal.tsx` - Settings UI for provider selection, API keys, model picker
- `components/settings/ModelSelectorModal.tsx` - OpenRouter model browser with search, filtering, pricing info
- `services/geminiService.ts` - Gemini API integration: video upload, analysis with structured JSON output, prompt optimization
- `services/localVLMService.ts` - Custom provider (OpenRouter/Ollama): adaptive frame extraction, VLM API calls
- `services/openrouterService.ts` - Fetches available models from OpenRouter API with caching
- `utils/exportUtils.ts` - EDL and FFmpeg batch script generation
- `constants/defaultPresets.ts` - Default presets: FPV (Cinematic, Shorts, Technical, Crash) + Generic (Highlights, Tutorial, Sports, Event, B-Roll, Best Takes)
- `types.ts` - Core interfaces: `ClipSegment`, `PromptPreset`, `VideoQueueItem`, `AppSettings`, `OpenRouterModel`

**Data Flow (Gemini - native video)**:
1. User uploads video(s) → `uploadVideo()` sends to Gemini Files API with polling for PROCESSING state
2. User triggers analysis → `analyzeVideo()` sends video URI + system instruction to Gemini with JSON schema
3. Response parsed into `ClipSegment[]` (start_time, end_time, description, excitement_score, mood, lighting, dominant_colors)
4. User exports as EDL or FFmpeg script via `exportUtils`

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

**AI Provider Notes**:
- **Gemini**: Uses `gemini-2.5-flash` for native video analysis with structured JSON via `responseSchema`. Prompt optimization via `gemini-3-flash-preview`.
- **Custom (OpenRouter/Ollama)**: OpenAI-compatible API. Default model `qwen/qwen3-vl-235b-a22b-instruct`. Uses frame extraction since these APIs don't support video upload.
- Clips use "MM:SS" time format internally across all providers

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
