import { ClipSegment } from '../types';

export interface LocalVLMConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
  maxFrames?: number; // Override max frames for local models with limited context
}

export type FrameExtractionProgress = (current: number, total: number) => void;

// Max frames to send to VLM
// Cloud APIs (OpenRouter): 60 frames works well with large context windows
// Local VLMs (vLLM/Ollama): 15-20 frames recommended for 8K context models
const DEFAULT_MAX_FRAMES = 60;
const LOCAL_MODEL_MAX_FRAMES = 15; // Safe default for 8K context local models
const MIN_FPS = 0.1; // Minimum 1 frame per 10 seconds
const MAX_FPS = 1.0; // Maximum 1 frame per second

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

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'user',
          content
        }
      ],
      temperature: 0.2,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const messageContent = data.choices?.[0]?.message?.content;

  if (!messageContent) {
    throw new Error('No content in API response');
  }

  onProgress?.('parsing', 'Parsing results...');

  return parseModelResponse(messageContent);
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
