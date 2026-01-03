import { ClipSegment } from '../types';

export interface LocalVLMConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
}

export type FrameExtractionProgress = (current: number, total: number) => void;

// Max frames to send to VLM (most models cap at ~50-100 images)
const MAX_FRAMES = 60;
const MIN_FPS = 0.1; // Minimum 1 frame per 10 seconds
const MAX_FPS = 1.0; // Maximum 1 frame per second

/**
 * Calculate adaptive FPS based on video duration to stay under frame limit
 */
export const calculateAdaptiveFps = (durationSeconds: number): number => {
  const idealFps = MAX_FRAMES / durationSeconds;
  return Math.max(MIN_FPS, Math.min(MAX_FPS, idealFps));
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

  // Calculate adaptive FPS to stay under frame limit
  const fps = calculateAdaptiveFps(duration);
  const estimatedFrames = Math.ceil(duration * fps);

  onProgress?.('extracting', `Extracting ~${estimatedFrames} frames (${fps.toFixed(2)} fps)...`);

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
