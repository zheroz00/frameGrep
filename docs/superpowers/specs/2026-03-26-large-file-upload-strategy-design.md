# Large File Upload Strategy — Client-Side Transcoding

## Context

FPV.AI Editor uploads video files directly to the Gemini Files API for AI analysis. When users upload large files (1.7GB+), the upload succeeds but Gemini's server-side processing times out at the 5-minute hard limit. The bottleneck is not the upload itself — it's Google's servers decoding and tokenizing large, high-resolution video files within the processing window.

Currently, raw files are sent as-is with no optimization. A 4K file encoded at a high bitrate forces Gemini to spend most of its 5-minute processing budget just decoding the video, leaving insufficient time for tokenization. Since Gemini analyzes video at ~1 fps internally, it doesn't benefit from 4K resolution or high bitrates — 720p is more than sufficient for identifying highlights.

**Goal:** Silently optimize large/high-resolution video files before uploading to Gemini, reducing processing time and eliminating timeouts for files up to 2GB. The change must be invisible to users (no workflow changes) and must not regress behavior for small files.

## Approach: FFmpeg.wasm Client-Side Transcoding

Use FFmpeg compiled to WebAssembly (single-threaded, no special header requirements) to transcode large files to an efficient format before uploading. This directly addresses the root cause — reducing server-side decode time — while preserving the native video upload that gives Gemini access to temporal motion and audio information.

### Why not other approaches

- **Frame extraction fallback**: Already exists for the Custom provider path. Loses temporal/audio info critical for FPV footage analysis where action happens between frames.
- **Video segmentation**: Requires FFmpeg.wasm anyway, adds complex merge logic, and clips near segment boundaries can be missed.
- **Server-side transcoding**: App has no backend. Adding one changes the architecture fundamentally.

## Threshold Logic

Transcode when the Gemini provider is active AND any of these conditions are true:

| Condition | Threshold | Rationale |
|-----------|-----------|-----------|
| File size | > 500 MB | Conservative — well below where timeouts begin |
| Resolution | > 1080p (1920×1080) | Gemini doesn't need 4K for highlight detection |
| Bitrate | > 15 Mbps | Bloated encoding wastes processing budget |

**Skip transcoding when:**
- File is ≤ 500MB AND ≤ 1080p AND ≤ 15 Mbps (current behavior, zero regression)
- Provider is "Custom" (uses frame extraction, no Gemini upload)

Threshold checks use `mediainfo.js` which is already in the project and runs before upload.

## Target Output Format

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Resolution | 720p (1280×720) | Sufficient for AI analysis, massive size reduction from 4K |
| Codec | H.264 | Universal Gemini support, fast decode |
| Quality | CRF 28 | Good detail retention with aggressive compression |
| Audio | AAC 128 kbps | Preserves audio cues Gemini can use for analysis |
| Container | MP4 | Standard, widely supported |

**Expected compression:** A 1.7GB 4K file → ~150-300MB at these settings.

## FFmpeg.wasm Integration

### Why single-threaded

FFmpeg.wasm's multi-threaded version requires `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` headers. These would break the project's CDN imports (esm.sh, cdn.tailwindcss.com). The single-threaded version works without any header changes.

**Trade-off:** Transcoding takes ~2-4 minutes for a 1.7GB file instead of ~1 minute. Acceptable given that the alternative is a 5-minute timeout that fails.

### Dependency

- **npm packages:** `@ffmpeg/ffmpeg` (JavaScript wrapper, small) and `@ffmpeg/util` (file helpers)
- **WASM core:** Loaded from CDN (unpkg.com) at runtime — not bundled. The `@ffmpeg/ffmpeg` `load()` method accepts a `coreURL` parameter pointing to the CDN-hosted single-threaded core.
- No changes to Vite config or import maps needed

### Lazy loading

The 30MB WASM binary is only downloaded the first time a user hits the transcode threshold. Subsequent sessions use the browser cache. Users who only work with small files never download it.

## Updated Pipeline

```
Current:   [Upload] → [Processing] → [Analyzing] → Done
Proposed:  [Preparing] → [Upload] → [Processing] → [Analyzing] → Done
           (only when transcoding is triggered)
```

### New "Preparing" phase

- **UploadPhase value:** `'preparing'` added to the existing union type
- **Icon:** Cog or wrench with pulse animation
- **Text:** "Preparing video..."
- **Progress:** Real percentage bar from FFmpeg's frame-level progress reporting
- **Visibility:** Only appears when transcoding is triggered. Small files skip straight to Upload.

## Files Changed

### New file

**`src/services/transcodeService.ts`**
- `shouldTranscode(file: File): Promise<TranscodeDecision>` — inspects file with mediainfo.js, returns decision with reason
- `transcodeVideo(file: File, onProgress: (pct: number) => void): Promise<File>` — runs FFmpeg.wasm transcode, returns new File object
- Lazy-loads FFmpeg.wasm core on first call
- All errors caught and wrapped — never throws unrecoverable errors

### Modified files

**`src/services/geminiService.ts`**
- Add `'preparing'` to `UploadPhase` type union

**`src/hooks/useVideoAnalysis.ts`**
- Insert transcode step before `uploadVideo()` in the Gemini provider path (~15-20 lines)
- Set `'preparing'` phase and progress callbacks
- Pass transcoded file (or original if skipped/failed) to `uploadVideo()`

**`src/App.tsx`**
- Add `'preparing'` phase rendering in the progress indicator block (~10 lines)
- Cog/wrench icon with pulse animation, percentage progress bar

**`package.json`**
- Add `@ffmpeg/ffmpeg` and `@ffmpeg/util` dependencies (WASM core loads from CDN, not bundled)

### Unchanged

- Custom provider path (frame extraction) — untouched
- Analysis logic (`analyzeVideo`) — untouched
- Export utilities — untouched
- Settings, presets, projects — untouched
- Any file under 500MB — identical behavior to today

## Error Handling & Fallbacks

| Scenario | Behavior |
|----------|----------|
| File below all thresholds | Skip transcoding, upload original (current flow) |
| FFmpeg.wasm fails to load (network, CDN) | Upload original file as-is |
| Transcoding fails (unsupported codec, memory) | Upload original file as-is |
| Transcoded file still too large | Upload anyway — it's still smaller than original |
| User on Custom provider | No transcoding (frame extraction handles it) |
| Browser tab closed during transcode | Transcode aborts cleanly, no partial upload |
| Low-memory device | If allocation fails, fall back to original upload |

**Principle:** No scenario leaves the user worse off than they are today. Transcoding is purely additive.

## Memory Considerations

Peak memory during transcoding: original file + FFmpeg workspace + output ≈ 2-2.5× original file size. For a 1.7GB input, this means ~3-4GB browser memory.

**Mitigations:**
- Release original file from FFmpeg virtual FS immediately after transcode completes
- Only one video transcodes at a time (sequential queue processing)
- Catch allocation failures and fall back gracefully

## Verification Plan

1. **Small file (< 500MB, 1080p):** Confirm zero behavior change — no transcoding triggered, upload works as before
2. **Large file (> 500MB, 4K):** Confirm "Preparing video..." phase appears with progress bar, file is transcoded, upload succeeds, analysis returns clips
3. **Transcoding failure simulation:** Confirm graceful fallback to original file upload
4. **FFmpeg.wasm load failure:** Confirm graceful fallback with no error shown to user
5. **Custom provider with large file:** Confirm transcoding does NOT trigger (frame extraction path)
6. **Progress UI:** Confirm progress bar shows real percentage, elapsed timer works across all phases
7. **Memory:** Test with a 1GB+ file and monitor browser memory usage in DevTools
