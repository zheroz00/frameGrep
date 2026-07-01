import { ClipSegment } from '../types';
import { downscaleForNativeVideo } from './localVLMService';

/**
 * Client for the local Marlin-2B analysis server (scripts/marlin_server.py),
 * reached via the `/api/marlin` Vite proxy → http://localhost:8003.
 *
 * Two modes:
 *  - Mode 1 (analyzeVideoMarlin → POST /analyze): CAPTION mode. Watches the whole clip
 *    unprompted; the server adapts its timestamped Events into ClipSegment[].
 *  - Mode 2 (findInVideoMarlin → POST /find): FIND mode. Resolves a natural-language
 *    query to a single (start, end) span the user previews to confirm.
 *
 * Marlin only honors its canonical prompts — for caption there is no prompt to send; for
 * find, an optional prompt_template override MUST keep the "From <start> to <end>"
 * output structure or the server's span parser fails (format_ok=false).
 */
export interface MarlinConfig {
  endpoint: string; // e.g. '/api/marlin' (proxied) or 'http://localhost:8003'
}

interface MarlinAnalyzeResponse {
  clips: ClipSegment[];
  scene?: string;
  event_count?: number;
  elapsed_s?: number;
}

/** Mode 2 result — a single span (seconds) for a query, or null if unparseable. */
export interface MarlinFindResult {
  span: [number, number] | null;
  raw: string;
  format_ok: boolean;
  elapsed_s?: number;
}

/** Tunable find-mode knobs (Advanced panel). All optional — server applies defaults. */
export interface MarlinFindOptions {
  promptTemplate?: string; // override canonical template; must keep "From <start> to <end>"
  temperature?: number; // 0 (default) = greedy/deterministic; >0 enables sampling
  maxNewTokens?: number; // default 128
}

/**
 * Marlin downsamples internally to ~448px, so a 480p upload is lossless to it and avoids
 * POSTing multi-hundred-MB 4K files. Downscaling is expensive, so we memoize the result
 * per source File — repeat searches of the same clip reuse the cached blob instead of
 * re-transcoding. Best-effort: on failure, fall back to the original file.
 */
const _downscaleCache = new WeakMap<File, Promise<File>>();

const getDownscaled = async (
  videoFile: File,
  onProgress?: (phase: string, detail?: string) => void,
): Promise<File> => {
  let pending = _downscaleCache.get(videoFile);
  if (!pending) {
    pending = downscaleForNativeVideo(videoFile, onProgress).catch((e) => {
      // Don't cache the failure — drop it so a later call can retry — and fall back.
      _downscaleCache.delete(videoFile);
      console.warn('Marlin: downscale failed, sending original file', e);
      return videoFile;
    });
    _downscaleCache.set(videoFile, pending);
  }
  return pending;
};

/** GET /health — used as a connection test (parallels testLocalConnection). */
export const testMarlinConnection = async (endpoint: string): Promise<boolean> => {
  try {
    const base = endpoint.replace(/\/$/, '');
    const res = await fetch(`${base}/health`);
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({} as { status?: string }));
    return data.status === 'ok';
  } catch {
    return false;
  }
};

/**
 * Mode 1 — analyze a video with the local Marlin server.
 * Returns ClipSegment[] (start_time, end_time, description, excitement_score).
 */
export const analyzeVideoMarlin = async (
  config: MarlinConfig,
  videoFile: File,
  onProgress?: (phase: string, detail?: string) => void,
): Promise<ClipSegment[]> => {
  const fileToSend = await getDownscaled(videoFile, onProgress);

  const base = config.endpoint.replace(/\/$/, '');
  const sizeMB = (fileToSend.size / (1024 * 1024)).toFixed(0);
  onProgress?.('analyzing', `Analyzing ${sizeMB}MB with Marlin (local)...`);

  const response = await fetch(`${base}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': fileToSend.type || 'video/mp4' },
    body: fileToSend,
    // @ts-expect-error — duplex is valid but missing from current TS lib types
    duplex: 'half',
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Marlin server error: ${response.status} - ${errText}`);
  }

  onProgress?.('parsing', 'Parsing Marlin results...');
  const data = (await response.json()) as MarlinAnalyzeResponse;
  return data.clips ?? [];
};

/**
 * Mode 2 — resolve a natural-language query to a single (start, end) span (seconds).
 * The caller previews the span to confirm it — find always fabricates a span, so the
 * human is the verifier.
 */
export const findInVideoMarlin = async (
  config: MarlinConfig,
  videoFile: File,
  event: string,
  opts: MarlinFindOptions = {},
  onProgress?: (phase: string, detail?: string) => void,
): Promise<MarlinFindResult> => {
  const query = event.trim();
  if (!query) throw new Error('Search query is empty.');

  const fileToSend = await getDownscaled(videoFile, onProgress);

  const base = config.endpoint.replace(/\/$/, '');
  const params = new URLSearchParams({ event: query });
  if (opts.maxNewTokens != null) params.set('max_new_tokens', String(opts.maxNewTokens));
  if (opts.temperature != null) params.set('temperature', String(opts.temperature));
  if (opts.promptTemplate) params.set('prompt_template', opts.promptTemplate);

  onProgress?.('analyzing', `Searching for "${query}" with Marlin (local)...`);

  const response = await fetch(`${base}/find?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': fileToSend.type || 'video/mp4' },
    body: fileToSend,
    // @ts-expect-error — duplex is valid but missing from current TS lib types
    duplex: 'half',
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Marlin server error: ${response.status} - ${errText}`);
  }

  const data = (await response.json()) as MarlinFindResult;
  return {
    span: data.span ?? null,
    raw: data.raw ?? '',
    format_ok: Boolean(data.format_ok),
    elapsed_s: data.elapsed_s,
  };
};
