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
- `App.tsx` - Main component containing UI state, prompt presets, video handling, and analysis orchestration
- `services/geminiService.ts` - Gemini API integration: video upload, analysis with structured JSON output, prompt optimization
- `components/VideoPlayer.tsx` - HTML5 video player with segment playback (start/end time control)
- `components/ClipCard.tsx` - Displays individual clip metadata with FFmpeg copy command
- `utils/exportUtils.ts` - EDL and FFmpeg batch script generation
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
