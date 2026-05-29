import { ClipSegment } from '../types';
import { downscaleForNativeVideo } from './localVLMService';

/**
 * Client for the local Marlin-2B analysis server (scripts/marlin_server.py),
 * reached via the `/api/marlin` Vite proxy → http://localhost:8003.
 *
 * Marlin runs in CAPTION mode only: it watches the whole clip unprompted and the
 * server adapts its timestamped Events into ClipSegment[]. There is no prompt to
 * send — the preset/instruction is intentionally ignored by this provider.
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
 * Analyze a video with the local Marlin server.
 * Returns ClipSegment[] (start_time, end_time, description, excitement_score).
 */
export const analyzeVideoMarlin = async (
  config: MarlinConfig,
  videoFile: File,
  onProgress?: (phase: string, detail?: string) => void,
): Promise<ClipSegment[]> => {
  // Marlin downsamples internally to ~448px, so a 480p upload is lossless to it and
  // avoids POSTing multi-hundred-MB 4K files. Best-effort: fall back to the original.
  let fileToSend = videoFile;
  try {
    fileToSend = await downscaleForNativeVideo(videoFile, onProgress);
  } catch (e) {
    console.warn('Marlin: downscale failed, sending original file', e);
  }

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
