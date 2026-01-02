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

Set `GEMINI_API_KEY` in `.env.local` for the Gemini API. If not set, users enter the API key in the UI.

## Architecture

**Stack**: React 19, Vite 6, TypeScript, Tailwind CSS, Google Gemini AI (@google/genai)

**Key Files**:
- `App.tsx` - Main component orchestrating UI layout and connecting hooks to components
- `hooks/usePresets.ts` - Preset state management, localStorage sync, and disk persistence
- `hooks/useVideoAnalysis.ts` - Video upload, Gemini analysis, progress tracking, and playback state
- `components/PromptLab.tsx` - Prompt editing panel with preset selector, duration slider, AI polish
- `components/VideoPlayer.tsx` - HTML5 video player with segment playback (start/end time control)
- `components/ClipCard.tsx` - Displays individual clip metadata with FFmpeg copy command
- `services/geminiService.ts` - Gemini API integration: video upload, analysis with structured JSON output, prompt optimization
- `utils/exportUtils.ts` - EDL and FFmpeg batch script generation
- `constants/defaultPresets.ts` - Default FPV analysis presets (Cinematic, Shorts, Technical, Crash)
- `types.ts` - Core interfaces: `ClipSegment`, `PromptPreset`, `VideoFile`, `AppStatus` enum

**Data Flow**:
1. User uploads video → `uploadVideo()` sends to Gemini Files API with polling for PROCESSING state
2. User triggers analysis → `analyzeVideo()` sends video URI + system instruction to Gemini with JSON schema
3. Response parsed into `ClipSegment[]` (start_time, end_time, description, excitement_score)
4. User exports as EDL or FFmpeg script via `exportUtils`

**Gemini Integration Notes**:
- Uses `gemini-2.5-flash` for video analysis with structured JSON output via `responseSchema`
- Uses `gemini-3-flash-preview` for prompt optimization
- Clips use "MM:SS" time format internally

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
