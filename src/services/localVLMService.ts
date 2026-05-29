import { ClipSegment, VideoMetadata } from '../types';
import { extractVideoMetadata } from './mediaInfoService';

export interface LocalVLMConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
  maxFrames?: number; // Override max frames for local models with limited context
  useNativeVideo?: boolean;
}

export type FrameExtractionProgress = (current: number, total: number) => void;

// Max frames to send to VLM
// Cloud APIs (OpenRouter): 60 frames works well with large context windows
// Local VLMs (vLLM/Ollama): 15-20 frames recommended for 8K context models
const DEFAULT_MAX_FRAMES = 200;          // cloud: Qwen3-VL 256K ctx handles ~200 frames comfortably
const LOCAL_MODEL_MAX_FRAMES = 60;       // local llama-swap qwen3-vl-8b @ 65K ctx
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
  // Priority: config override > env var > endpoint-based default
  if (config.maxFrames) return config.maxFrames;
  if (ENV_MAX_FRAMES && !isNaN(ENV_MAX_FRAMES)) return ENV_MAX_FRAMES;
  return isLocalEndpoint(config.endpoint) ? LOCAL_MODEL_MAX_FRAMES : DEFAULT_MAX_FRAMES;
};

/**
 * Get video duration without fully loading the video
 */
export const getVideoDuration = (videoFile: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(video.src);
      resolve(duration);
    };

    video.onerror = () => {
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
export const extractFramesFromVideo = async (
  videoFile: File,
  framesPerSecond: number = 0.5,
  onProgress?: FrameExtractionProgress
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

    const frames: { timestamp: number; base64: string }[] = [];
    let currentTime = 0;
    const interval = 1 / framesPerSecond;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const totalFrames = Math.ceil(duration * framesPerSecond);

      // Set canvas size to reasonable dimensions (max 720p to save tokens)
      const scale = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;

      const captureFrame = () => {
        if (currentTime >= duration) {
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
const parseModelResponse = (response: string): ClipSegment[] => {
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
    return parsed as ClipSegment[];
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
  onProgress?: (phase: string, detail?: string) => void
): Promise<ClipSegment[]> => {
  // Get video duration first to calculate adaptive FPS
  onProgress?.('extracting', 'Reading video metadata...');
  const duration = await getVideoDuration(videoFile);

  // Get max frames based on endpoint type (local models need fewer frames)
  const maxFrames = getMaxFrames(config);

  // Calculate adaptive FPS to stay under frame limit
  const fps = calculateAdaptiveFps(duration, maxFrames);
  const estimatedFrames = Math.ceil(duration * fps);

  const endpointType = isLocalEndpoint(config.endpoint) ? 'local' : 'cloud';
  onProgress?.('extracting', `Extracting ~${estimatedFrames} frames (${fps.toFixed(2)} fps, ${endpointType} mode)...`);

  const frames = await extractFramesFromVideo(
    videoFile,
    fps,
    (current, total) => {
      onProgress?.('extracting', `Extracting frames: ${current}/${total}`);
    }
  );

  if (frames.length === 0) {
    throw new Error('No frames extracted from video');
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
    headers['X-Title'] = 'FPV.AI Editor';
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
    // Higher cap so reasoning-mode models (Qwen3.x) have headroom to think AND emit JSON.
    max_tokens: 16384,
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
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    throw new Error('Streaming response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let contentText = '';
  let reasoningText = '';
  let finishReason: string | null = null;
  let lastTick = Date.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by blank lines (\n\n). Process complete frames only;
    // keep the trailing partial frame in the buffer for the next read.
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const chunk = JSON.parse(payload);
          const delta = chunk.choices?.[0]?.delta || {};
          if (typeof delta.content === 'string') contentText += delta.content;
          if (typeof delta.reasoning_content === 'string') reasoningText += delta.reasoning_content;
          const fr = chunk.choices?.[0]?.finish_reason;
          if (fr) finishReason = fr;
        } catch {
          // Tolerate malformed chunks rather than blow up mid-stream.
        }
      }
    }

    const now = Date.now();
    if (now - lastTick > 5000) {
      const chars = contentText.length + reasoningText.length;
      onProgress?.('analyzing', `Streaming response... ${chars} chars received`);
      lastTick = now;
    }
  }

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
  });

  const response = await fetch(`/api/transcode?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'video/mp4' },
    body: file,
    // @ts-expect-error — duplex is valid but missing from current TS lib types
    duplex: 'half',
  });

  if (!response.ok) {
    throw new Error(`Downscale failed: HTTP ${response.status}`);
  }

  const blob = await response.blob();
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
): Promise<ClipSegment[]> => {
  let fileToSend = videoFile;
  if (transcodedUrl) {
    onProgress?.('preparing', 'Using transcoded video for native analysis...');
    fileToSend = await blobUrlToFile(transcodedUrl, videoFile.name);
  }

  fileToSend = await downscaleForNativeVideo(fileToSend, onProgress);

  onProgress?.('preparing', 'Reading video metadata...');
  const duration = await getVideoDuration(fileToSend);

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
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    throw new Error('Streaming response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let contentText = '';
  let reasoningText = '';
  let finishReason: string | null = null;
  let lastTick = Date.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const chunk = JSON.parse(payload);
          const delta = chunk.choices?.[0]?.delta || {};
          if (typeof delta.content === 'string') contentText += delta.content;
          if (typeof delta.reasoning_content === 'string') reasoningText += delta.reasoning_content;
          const fr = chunk.choices?.[0]?.finish_reason;
          if (fr) finishReason = fr;
        } catch {
          // Tolerate malformed chunks
        }
      }
    }

    const now = Date.now();
    if (now - lastTick > 5000) {
      const chars = contentText.length + reasoningText.length;
      onProgress?.('analyzing', `Streaming response... ${chars} chars received`);
      lastTick = now;
    }
  }

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
