/**
 * Transcode Service
 *
 * Server-only path: POST raw bytes to /api/transcode (Vite middleware spawns
 * an ffmpeg child process on the dev host (NVENC when available, libx264 otherwise).
 *
 * No client-side fallback. If the server endpoint fails, we throw a clear
 * user-facing error so the caller can surface it immediately rather than
 * silently degrading to a slow path.
 */

import { extractVideoMetadata } from './mediaInfoService';

// --- Types ---

export interface TranscodeDecision {
  transcode: boolean;
  reason: string;
}

export interface TranscodeProgress {
  phase: 'connecting' | 'streaming' | 'done';
  /** Bytes received so far from the server (transcoded output stream). */
  receivedBytes: number;
  /** Total bytes of source file, for context in the UI status text. */
  inputBytes: number;
}

// --- Constants ---

// Gemini Files API hard limit is 2GB per file — anything larger MUST be transcoded
// or chunked before upload. For sub-2GB files, Gemini handles arbitrary resolution
// and bitrate internally, so we let them through and skip the server transcode.
const SIZE_THRESHOLD = 2 * 1024 * 1024 * 1024; // 2 GB (Gemini Files API max)
const MAX_WIDTH = 3840; // 4K — Gemini downsamples internally
const MAX_HEIGHT = 2160;
const MAX_BITRATE = 100_000_000; // 100 Mbps — covers 4K drone footage
const TARGET_HEIGHT = 720;       // Server-side output height ceiling
const TARGET_FPS = 30;           // Analysis-optimal frame-rate cap (models sample ~1-4 fps)

// --- Public API ---

/**
 * Determines whether a file should be transcoded before upload.
 *
 * Hard limits (>2GB / >4K / >100Mbps) ALWAYS force a transcode — Gemini rejects or
 * chokes otherwise. When `autoDownsample` is on, we additionally normalize any clip
 * that's over the analysis target (>720p or >30fps) so 4K/100fps sources don't upload
 * at full size for no analysis benefit. Only an in-memory copy is transcoded; the
 * user's original file on disk is never touched.
 */
export async function shouldTranscode(
  file: File,
  autoDownsample = false
): Promise<TranscodeDecision> {
  // Quick size check first (no metadata extraction needed)
  if (file.size > SIZE_THRESHOLD) {
    return { transcode: true, reason: `File size ${(file.size / (1024 * 1024)).toFixed(0)}MB exceeds 2GB threshold` };
  }

  try {
    const meta = await extractVideoMetadata(file);

    if (meta.width > MAX_WIDTH || meta.height > MAX_HEIGHT) {
      return { transcode: true, reason: `Resolution ${meta.width}x${meta.height} exceeds 4K` };
    }

    // Calculate bitrate from file size and duration
    if (meta.duration > 0) {
      const bitrate = (file.size * 8) / meta.duration;
      if (bitrate > MAX_BITRATE) {
        return { transcode: true, reason: `Bitrate ${(bitrate / 1_000_000).toFixed(1)}Mbps exceeds 100Mbps threshold` };
      }
    }

    // Analysis normalization: downsize over-target clips to save upload without
    // changing what the model can actually resolve.
    if (autoDownsample) {
      if (meta.height > TARGET_HEIGHT) {
        return { transcode: true, reason: `Downsampling ${meta.height}p → ${TARGET_HEIGHT}p for analysis` };
      }
      const framesPerSecond = meta.frameRate.numerator / meta.frameRate.denominator;
      if (framesPerSecond > TARGET_FPS) {
        return { transcode: true, reason: `Capping ${Math.round(framesPerSecond)}fps → ${TARGET_FPS}fps for analysis` };
      }
    }
  } catch (e) {
    // If metadata extraction fails, fall back to size-only check (already done above)
    console.warn('Metadata extraction failed for transcode check:', e);
  }

  return { transcode: false, reason: 'File within acceptable parameters' };
}

/**
 * Transcodes a video file via the server-side FFmpeg endpoint (NVENC when available,
 * otherwise libx264). On failure,
 * throws a user-friendly error — no silent fallback.
 */
export async function transcodeVideo(
  file: File,
  onProgress?: (progress: TranscodeProgress) => void,
  signal?: AbortSignal,
): Promise<File> {
  try {
    const result = await transcodeViaServer(file, onProgress, signal);
    const reduction = ((1 - result.size / file.size) * 100).toFixed(0);
    console.log(
      `Server-side transcode ${file.name}: ${(file.size / (1024 * 1024)).toFixed(0)}MB → ${(result.size / (1024 * 1024)).toFixed(0)}MB (${reduction}% reduction)`
    );
    return result;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`Transcode failed: ${detail}. Check pm2 logs frameGrep-Marlin.`);
  }
}

// --- Server-side path ---

/**
 * POSTs the file bytes to the Vite middleware. Reads the streamed response and
 * assembles a new File. Throws on non-2xx or empty body so the caller sees the
 * failure immediately (no silent fallback).
 */
async function transcodeViaServer(
  file: File,
  onProgress?: (progress: TranscodeProgress) => void,
  signal?: AbortSignal,
): Promise<File> {
  const params = new URLSearchParams({
    audio: 'true',
    maxHeight: String(TARGET_HEIGHT),
    fps: String(TARGET_FPS),
  });

  onProgress?.({ phase: 'connecting', receivedBytes: 0, inputBytes: file.size });

  // Stream the file body. fetch() supports a Blob body, which the browser streams.
  const response = await fetch(`/api/transcode?${params.toString()}`, {
    method: 'POST',
    headers: {
      // Hint that the body is the raw video; the middleware reads stdin directly.
      'Content-Type': file.type || 'video/mp4',
    },
    body: file,
    signal,
    // Required to allow body streaming in Chrome.
    // @ts-expect-error — duplex is valid but missing from current TS lib types
    duplex: 'half',
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const text = await response.text();
      if (text) detail += `: ${text.slice(0, 200)}`;
    } catch { /* ignore */ }
    throw new Error(`Server transcode endpoint returned ${detail}`);
  }

  if (!response.body) {
    throw new Error('Server transcode returned no body');
  }

  // Stream response, count bytes and surface them to the caller via onProgress.
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedBytes += value.byteLength;
      onProgress?.({ phase: 'streaming', receivedBytes, inputBytes: file.size });
    }
  }

  onProgress?.({ phase: 'done', receivedBytes, inputBytes: file.size });

  const blob = new Blob(chunks as BlobPart[], { type: 'video/mp4' });
  if (blob.size === 0) throw new Error('Server transcode returned an empty output');
  const transcodedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.mp4'), {
    type: 'video/mp4',
    lastModified: Date.now(),
  });

  return transcodedFile;
}
