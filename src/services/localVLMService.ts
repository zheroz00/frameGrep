import { RawClipSegment, VideoMetadata } from '../types';
import { extractVideoMetadata } from './mediaInfoService';
import { parseOpenAIResponse } from './openAIStream';

export interface LocalVLMConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
  maxFrames?: number; // Override max frames for local models with limited context
  useNativeVideo?: boolean;
  contextLength?: number;
}

export type FrameExtractionProgress = (current: number, total: number) => void;

// ── Frame budget ────────────────────────────────────────────────────────────
// Both endpoint types derive their frame budget from a token budget:
//   frames = (context - output reserve - prompt reserve) / tokens per frame
// The per-frame cost differs because cloud frames are sent at 720p and local frames at
// 512p, and cloud gets a larger output reserve for reasoning models.
const PROMPT_RESERVE = 1500;             // system instruction + move dictionary + frame list

// Cloud (OpenRouter). The model's context comes from the OpenRouter models API; when it
// is unknown, assume a 128K window rather than the 256K of the largest Qwen3-VL.
const CLOUD_MAX_OUTPUT_TOKENS = 16384;   // reasoning headroom
const CLOUD_EST_TOKENS_PER_FRAME = 945;  // 1280x720 Qwen3-VL image (empirical)
const CLOUD_ASSUMED_CONTEXT_TOKENS = 131072;
const CLOUD_MAX_FRAMES = 200;            // cost ceiling even when the context could fit more

// Local vLLM (Qwen3-VL-8B). Context is small, so the frame budget is DERIVED from a
// token budget rather than hardcoded — this is what previously drifted: a fixed "60
// frames @ 65K ctx" assumption blew past the actual 32K server (57924 > 32768).
// Keep LOCAL_CONTEXT_TOKENS in sync with VLLM_MAX_LEN in .env.local.
const LOCAL_CONTEXT_TOKENS = 32768;
const LOCAL_MAX_OUTPUT_TOKENS = 6144;    // room for the JSON clip array (thinking is disabled)
const LOCAL_EST_TOKENS_PER_FRAME = 500;  // ~512p Qwen3-VL image (empirical: ~945 tok @ 720p → ~470 @ 512p)

/** Frames that fit `contextTokens` with headroom for the prompt and the generated output. */
export const framesForContext = (contextTokens: number, isLocal: boolean): number => {
  const outputReserve = isLocal ? LOCAL_MAX_OUTPUT_TOKENS : CLOUD_MAX_OUTPUT_TOKENS;
  const tokensPerFrame = isLocal ? LOCAL_EST_TOKENS_PER_FRAME : CLOUD_EST_TOKENS_PER_FRAME;
  return Math.max(1, Math.floor((contextTokens - outputReserve - PROMPT_RESERVE) / tokensPerFrame));
};

const LOCAL_MODEL_MAX_FRAMES = framesForContext(LOCAL_CONTEXT_TOKENS, true);

// Per-frame resolution ceilings. Local uses smaller frames so more of them fit the
// 32K window — temporal coverage beats per-frame sharpness for spotting FPV action.
const CLOUD_FRAME_MAX_W = 1280, CLOUD_FRAME_MAX_H = 720;
const LOCAL_FRAME_MAX_W = 896, LOCAL_FRAME_MAX_H = 512;

const MIN_FPS = 0.1;                     // 1 frame per 10s — long-clip floor
const MAX_FPS = 4.0;                     // 1 frame per 0.25s — catches sub-second action (e.g. backflips)

// Optional fixed FPS override from environment (e.g., 0.5, 1.0)
const ENV_FPS_OVERRIDE = import.meta.env.VITE_FRAME_EXTRACTION_FPS
  ? parseFloat(import.meta.env.VITE_FRAME_EXTRACTION_FPS)
  : null;

// Optional max frames override from environment
const ENV_MAX_FRAMES = import.meta.env.VITE_MAX_FRAMES
  ? parseInt(import.meta.env.VITE_MAX_FRAMES)
  : null;

/**
 * Check if endpoint is a local server (not OpenRouter)
 */
const isLocalEndpoint = (endpoint: string): boolean => {
  return !endpoint.includes('openrouter.ai');
};

/**
 * Calculate adaptive FPS based on video duration to stay under frame limit.
 * If VITE_FRAME_EXTRACTION_FPS is set, uses that fixed value instead.
 */
export const calculateAdaptiveFps = (durationSeconds: number, maxFrames: number): number => {
  // Use fixed FPS if configured via environment
  if (ENV_FPS_OVERRIDE && !isNaN(ENV_FPS_OVERRIDE) && ENV_FPS_OVERRIDE > 0) {
    return ENV_FPS_OVERRIDE;
  }

  const idealFps = maxFrames / durationSeconds;
  return Math.max(MIN_FPS, Math.min(MAX_FPS, idealFps));
};

/**
 * Get appropriate max frames based on endpoint type
 */
export const getMaxFrames = (config: LocalVLMConfig): number => {
  // Priority: config override > env var > budget derived from the model's context
  if (config.maxFrames) return config.maxFrames;
  if (ENV_MAX_FRAMES && !isNaN(ENV_MAX_FRAMES)) return ENV_MAX_FRAMES;
  const isLocal = isLocalEndpoint(config.endpoint);
  const contextTokens = Number.isFinite(config.contextLength) && Number(config.contextLength) > 0
    ? Number(config.contextLength)
    : (isLocal ? LOCAL_CONTEXT_TOKENS : CLOUD_ASSUMED_CONTEXT_TOKENS);
  const budget = framesForContext(contextTokens, isLocal);
  return isLocal ? budget : Math.min(CLOUD_MAX_FRAMES, budget);
};

/**
 * Get video duration without fully loading the video
 */
export const getVideoDuration = (videoFile: File, signal?: AbortSignal): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    const abort = () => {
      URL.revokeObjectURL(video.src);
      video.removeAttribute('src');
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });

    video.onloadedmetadata = () => {
      signal?.removeEventListener('abort', abort);
      const duration = video.duration;
      URL.revokeObjectURL(video.src);
      resolve(duration);
    };

    video.onerror = () => {
      signal?.removeEventListener('abort', abort);
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };

    video.src = URL.createObjectURL(videoFile);
  });
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read video file'));
    reader.readAsDataURL(file);
  });
};

const blobUrlToFile = async (blobUrl: string, filename: string): Promise<File> => {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || 'video/mp4' });
};

/**
 * Extract frames from video at specified interval using canvas
 */
/**
 * Evenly sample a frame list down to `limit` so we never exceed the token budget —
 * a safety net for the adaptive-FPS floor (MIN_FPS on very long clips can overshoot
 * the frame budget). Preserves first/last coverage and real timestamps.
 */
const capFrames = <T,>(frames: T[], limit: number): T[] => {
  if (limit <= 0 || frames.length <= limit) return frames;
  const step = frames.length / limit;
  const out: T[] = [];
  for (let i = 0; i < limit; i++) out.push(frames[Math.floor(i * step)]);
  return out;
};

export const extractFramesFromVideo = async (
  videoFile: File,
  framesPerSecond: number = 0.5,
  onProgress?: FrameExtractionProgress,
  maxWidth: number = CLOUD_FRAME_MAX_W,
  maxHeight: number = CLOUD_FRAME_MAX_H,
  signal?: AbortSignal,
): Promise<{ timestamp: number; base64: string }[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const abort = () => {
      URL.revokeObjectURL(video.src);
      video.removeAttribute('src');
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });

    const frames: { timestamp: number; base64: string }[] = [];
    let currentTime = 0;
    const interval = 1 / framesPerSecond;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const totalFrames = Math.ceil(duration * framesPerSecond);

      // Scale down to the caller's ceiling (720p cloud / 512p local) to save tokens.
      const scale = Math.min(1, maxWidth / video.videoWidth, maxHeight / video.videoHeight);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;

      const captureFrame = () => {
        if (currentTime >= duration) {
          signal?.removeEventListener('abort', abort);
          URL.revokeObjectURL(video.src);
          resolve(frames);
          return;
        }

        video.currentTime = currentTime;
      };

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];

        frames.push({
          timestamp: currentTime,
          base64
        });

        onProgress?.(frames.length, totalFrames);
        currentTime += interval;
        captureFrame();
      };

      captureFrame();
    };

    video.onerror = () => {
      signal?.removeEventListener('abort', abort);
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };

    video.src = URL.createObjectURL(videoFile);
  });
};

/**
 * Format timestamp as MM:SS
 */
const formatTimestamp = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Build the prompt with frame timestamps for the VLM
 */
const buildAnalysisPrompt = (
  systemInstruction: string,
  frames: { timestamp: number; base64: string }[]
): string => {
  const frameList = frames
    .map((f, i) => `Frame ${i + 1} at ${formatTimestamp(f.timestamp)}`)
    .join(', ');

  return `${systemInstruction}

/no_think

VIDEO CONTEXT:
You are analyzing a video through ${frames.length} frames extracted at regular intervals.
Frames: ${frameList}

IMPORTANT: When identifying clips, use the frame timestamps to determine start_time and end_time.
- If action starts at Frame 5 (00:10) and ends at Frame 8 (00:16), use start_time: "00:10", end_time: "00:16"
- Provide times in MM:SS format

Respond with a JSON array of clips. Each clip must have:
- start_time: string (MM:SS format)
- end_time: string (MM:SS format)
- description: string (brief description of the action)
- excitement_score: number (1-10)
- mood: string (one of: intense, smooth, dramatic, peaceful, playful, technical)
- lighting: string (one of: golden_hour, midday, overcast, shade, indoor, mixed, low_light)
- dominant_colors: string[] (1-3 dominant colors like "orange", "blue", "green")

Optional fields (include when using Smart Edit Roadmap or similar presets):
- section_type: string (one of: highlight, flow, transition, dead_time)
- energy_level: string (one of: high, medium, low)
- recommendation: string (one of: keep, trim, review)
- transition_note: string (notes for transition sections, e.g., "Good cut point")

Return ONLY valid JSON array, no markdown or explanation.`;
};

/**
 * Parse JSON from model response, handling common issues
 */
export const parseModelResponse = (response: string): RawClipSegment[] => {
  // Try to extract JSON array from response
  let jsonStr = response.trim();

  // Remove markdown code blocks if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  // Try to find array bounds
  const arrayStart = jsonStr.indexOf('[');
  const arrayEnd = jsonStr.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd !== -1) {
    jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Some models return an explicit refusal object instead of an array, e.g.
    //   {"error": "All frames show ground footage. STRICT DISCARD applies..."}
    // Surface that message verbatim so the user sees WHY the model refused,
    // rather than a generic "Response is not an array" parser error.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const refusal =
        (parsed as { error?: string; message?: string; reason?: string }).error ??
        (parsed as { message?: string }).message ??
        (parsed as { reason?: string }).reason;
      if (typeof refusal === 'string' && refusal.length > 0) {
        throw new Error(`Model refused: ${refusal}. Try a different preset (e.g. "Generic") or relax STRICT DISCARD rules.`);
      }
      throw new Error('Response is not a clip array. Got: ' + JSON.stringify(parsed).slice(0, 200));
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }
    return parsed as RawClipSegment[];
  } catch (e) {
    console.error('Failed to parse model response:', response);
    throw new Error(`Failed to parse model response as JSON: ${e}`);
  }
};

/**
 * Analyze video using local VLM via OpenAI-compatible API
 */
export const analyzeVideoLocal = async (
  config: LocalVLMConfig,
  videoFile: File,
  systemInstruction: string,
  onProgress?: (phase: string, detail?: string) => void,
  signal?: AbortSignal,
): Promise<RawClipSegment[]> => {
  // Get video duration first to calculate adaptive FPS
  onProgress?.('extracting', 'Reading video metadata...');
  const duration = await getVideoDuration(videoFile, signal);

  // Get max frames based on endpoint type (local models have a smaller context)
  const isLocal = isLocalEndpoint(config.endpoint);
  const maxFrames = getMaxFrames(config);

  // Calculate adaptive FPS to stay under frame limit
  const fps = calculateAdaptiveFps(duration, maxFrames);
  const estimatedFrames = Math.ceil(duration * fps);

  const endpointType = isLocal ? 'local' : 'cloud';
  onProgress?.('extracting', `Extracting ~${estimatedFrames} frames (${fps.toFixed(2)} fps, ${endpointType} mode)...`);

  let frames = await extractFramesFromVideo(
    videoFile,
    fps,
    (current, total) => {
      onProgress?.('extracting', `Extracting frames: ${current}/${total}`);
    },
    isLocal ? LOCAL_FRAME_MAX_W : CLOUD_FRAME_MAX_W,
    isLocal ? LOCAL_FRAME_MAX_H : CLOUD_FRAME_MAX_H,
    signal,
  );

  if (frames.length === 0) {
    throw new Error('No frames extracted from video');
  }

  // Hard safety net: never send more frames than the token budget allows, even if the
  // adaptive-FPS floor overshot on a very long clip. Guarantees we stay under context.
  const beforeTrim = frames.length;
  frames = capFrames(frames, maxFrames);
  if (frames.length < beforeTrim) {
    onProgress?.('extracting', `Trimmed ${beforeTrim} → ${frames.length} frames to fit context window`);
  }

  const interval = (1 / fps).toFixed(1);
  onProgress?.('analyzing', `Analyzing ${frames.length} frames (1 per ${interval}s) with ${config.model}...`);

  // Build message content with images
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: 'text',
      text: buildAnalysisPrompt(systemInstruction, frames)
    }
  ];

  // Add frames as images
  for (const frame of frames) {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${frame.base64}`
      }
    });
  }

  // Make API call
  const endpoint = config.endpoint.replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  // Add OpenRouter-specific headers if using OpenRouter
  if (endpoint.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'frameGrep';
  }

  // OpenRouter routes `anthropic/*` to whichever backend is cheapest by default.
  // Bedrock's "claude-haiku-4.5" is actually the older claude-3-5-haiku-20241022,
  // which doesn't support image input — so we force Anthropic-direct for vision.
  const isAnthropicOpenRouter =
    endpoint.includes('openrouter.ai') && config.model.startsWith('anthropic/');

  const requestBody: Record<string, unknown> = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content
      }
    ],
    temperature: 0.2,
    // Local: keep output within the 32K window (see budget constants). Cloud: generous
    // headroom. Thinking is disabled below, so 6K is ample for the JSON clip array.
    max_tokens: isLocal ? LOCAL_MAX_OUTPUT_TOKENS : CLOUD_MAX_OUTPUT_TOKENS,
    // Honored by llama.cpp jinja templates for Qwen3.x — disables <think> blocks entirely.
    chat_template_kwargs: { enable_thinking: false },
    stream: true
  };

  if (isAnthropicOpenRouter) {
    requestBody.provider = { order: ['Anthropic'], allow_fallbacks: false };
  }

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  const parsedStream = await parseOpenAIResponse(response, signal, chars => onProgress?.('analyzing', `Streaming response... ${chars} chars received`));
  const contentText = parsedStream.content;
  const reasoningText = parsedStream.reasoning;
  const finishReason = parsedStream.finishReason;

  onProgress?.('parsing', 'Parsing results...');

  // Prefer content; fall back to reasoning_content for thinking models that
  // ignore /no_think and emit the JSON inside their reasoning channel instead.
  const sources: Array<[string, string]> = [
    ['content', contentText],
    ['reasoning_content', reasoningText]
  ];

  let lastError: unknown = null;
  for (const [name, text] of sources) {
    if (!text.trim()) continue;
    try {
      return parseModelResponse(text);
    } catch (e) {
      lastError = e;
      console.warn(`Failed to parse model response from ${name}:`, e);
    }
  }

  if (!contentText.trim() && !reasoningText.trim()) {
    throw new Error(`No content in streamed response (finish_reason=${finishReason ?? 'unknown'})`);
  }
  throw new Error(`Failed to parse streamed model response: ${lastError}`);
};

const buildNativeVideoPrompt = (
  systemInstruction: string,
  durationSeconds: number
): string => {
  const durationStr = `${Math.floor(durationSeconds / 60)}:${String(Math.floor(durationSeconds % 60)).padStart(2, '0')}`;
  return `${systemInstruction}

/no_think

VIDEO CONTEXT:
You are analyzing a full video (duration: ${durationStr}) with native temporal understanding.
You can see motion, transitions, and timing directly — not just still frames.

IMPORTANT: Identify clips using real timestamps from the video.
- Provide times in MM:SS format
- You have access to the full temporal flow, so be precise about when actions start and end.

Respond with a JSON array of clips. Each clip must have:
- start_time: string (MM:SS format)
- end_time: string (MM:SS format)
- description: string (brief description of the action)
- excitement_score: number (1-10)
- mood: string (one of: intense, smooth, dramatic, peaceful, playful, technical)
- lighting: string (one of: golden_hour, midday, overcast, shade, indoor, mixed, low_light)
- dominant_colors: string[] (1-3 dominant colors like "orange", "blue", "green")

Optional fields (include when using Smart Edit Roadmap or similar presets):
- section_type: string (one of: highlight, flow, transition, dead_time)
- energy_level: string (one of: high, medium, low)
- recommendation: string (one of: keep, trim, review)
- transition_note: string (notes for transition sections, e.g., "Good cut point")

Return ONLY valid JSON array, no markdown or explanation.`;
};

/**
 * Analyze video using native video_url content type (vLLM + Qwen-VL).
 * Sends the full video instead of extracting frames.
 */
const NATIVE_VIDEO_MAX_HEIGHT = 480;

export async function downscaleForNativeVideo(
  file: File,
  onProgress?: (phase: string, detail?: string) => void,
  signal?: AbortSignal,
): Promise<File> {
  let meta: VideoMetadata | null = null;
  try {
    meta = await extractVideoMetadata(file);
  } catch {
    // If metadata extraction fails, attempt transcode anyway
  }

  if (meta && meta.height <= NATIVE_VIDEO_MAX_HEIGHT) {
    return file;
  }

  const resLabel = meta ? `${meta.width}x${meta.height}` : 'unknown resolution';
  onProgress?.('preparing', `Downscaling ${resLabel} → 480p for vLLM token budget...`);

  const params = new URLSearchParams({
    audio: 'false',
    maxHeight: String(NATIVE_VIDEO_MAX_HEIGHT),
    fps: '30', // cap frame rate — vLLM samples the video; 100fps is wasted work/tokens
  });

  const response = await fetch(`/api/transcode?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'video/mp4' },
    body: file,
    signal,
    // @ts-expect-error — duplex is valid but missing from current TS lib types
    duplex: 'half',
  });

  if (!response.ok) {
    throw new Error(`Downscale failed: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  if (!blob.size) throw new Error('Downscale returned an empty output');
  const sizeMB = (sz: number) => (sz / (1024 * 1024)).toFixed(0);
  console.log(`Native video downscale: ${sizeMB(file.size)}MB → ${sizeMB(blob.size)}MB`);

  return new File([blob], file.name, { type: 'video/mp4', lastModified: Date.now() });
}

export const analyzeVideoNative = async (
  config: LocalVLMConfig,
  videoFile: File,
  systemInstruction: string,
  onProgress?: (phase: string, detail?: string) => void,
  transcodedUrl?: string,
  onProxyReady?: (proxyFile: File) => void,
  signal?: AbortSignal,
): Promise<RawClipSegment[]> => {
  let fileToSend = videoFile;
  if (transcodedUrl) {
    onProgress?.('preparing', 'Using transcoded video for native analysis...');
    fileToSend = await blobUrlToFile(transcodedUrl, videoFile.name);
  }

  fileToSend = await downscaleForNativeVideo(fileToSend, onProgress, signal);
  // Surface the downscaled 480p proxy so the caller can reuse it for smooth
  // preview playback (the 4K/100fps original stutters in-browser).
  onProxyReady?.(fileToSend);

  onProgress?.('preparing', 'Reading video metadata...');
  const duration = await getVideoDuration(fileToSend, signal);

  const fileSizeMB = fileToSend.size / (1024 * 1024);
  onProgress?.('preparing', `Encoding ${fileSizeMB.toFixed(0)}MB video to base64...`);
  const base64Video = await fileToBase64(fileToSend);

  onProgress?.('analyzing', `Sending native video (${fileSizeMB.toFixed(0)}MB) to ${config.model}...`);

  const mimeType = fileToSend.type || 'video/mp4';

  const content: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: buildNativeVideoPrompt(systemInstruction, duration)
    },
    {
      type: 'video_url',
      video_url: {
        url: `data:${mimeType};base64,${base64Video}`
      }
    }
  ];

  const endpoint = config.endpoint.replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const requestBody: Record<string, unknown> = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content
      }
    ],
    temperature: 0.2,
    max_tokens: 16384,
    stream: true
  };

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  const parsedStream = await parseOpenAIResponse(response, signal, chars => onProgress?.('analyzing', `Streaming response... ${chars} chars received`));
  const contentText = parsedStream.content;
  const reasoningText = parsedStream.reasoning;
  const finishReason = parsedStream.finishReason;

  onProgress?.('parsing', 'Parsing results...');

  const sources: Array<[string, string]> = [
    ['content', contentText],
    ['reasoning_content', reasoningText]
  ];

  let lastError: unknown = null;
  for (const [name, text] of sources) {
    if (!text.trim()) continue;
    try {
      return parseModelResponse(text);
    } catch (e) {
      lastError = e;
      console.warn(`Failed to parse model response from ${name}:`, e);
    }
  }

  if (!contentText.trim() && !reasoningText.trim()) {
    throw new Error(`No content in streamed response (finish_reason=${finishReason ?? 'unknown'})`);
  }
  throw new Error(`Failed to parse streamed model response: ${lastError}`);
};

/**
 * Test connection to local VLM endpoint
 */
export const testLocalConnection = async (config: LocalVLMConfig): Promise<boolean> => {
  try {
    const endpoint = config.endpoint.replace(/\/$/, '');
    const response = await fetch(`${endpoint}/models`, {
      headers: config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}
    });
    return response.ok;
  } catch {
    return false;
  }
};
