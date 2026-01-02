export type ClipMood = 'intense' | 'smooth' | 'dramatic' | 'peaceful' | 'playful' | 'technical';
export type LightingCondition = 'golden_hour' | 'midday' | 'overcast' | 'shade' | 'indoor' | 'mixed' | 'low_light';

export interface ClipSegment {
  start_time: string; // Format "MM:SS"
  end_time: string;   // Format "MM:SS"
  description: string;
  excitement_score: number; // 1-10
  sourceFile?: string; // Original filename for multi-video support
  // AI Color/Mood analysis (Issue #19)
  mood?: ClipMood;
  lighting?: LightingCondition;
  dominant_colors?: string[]; // e.g., ["orange", "blue", "green"]
}

export interface AnalysisResult {
  clips: ClipSegment[];
  raw_response?: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  ANALYZING = 'ANALYZING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface VideoFile {
  file: File;
  url: string;
}

export type QueueItemStatus = 'pending' | 'uploading' | 'processing' | 'analyzing' | 'complete' | 'error';

export interface VideoQueueItem {
  id: string;
  file: File;
  url: string;
  status: QueueItemStatus;
  clips: ClipSegment[];
  error?: string;
}

export type PresetCategory = 'fpv' | 'generic' | 'custom';

export interface PromptPreset {
  id: string;
  name: string;
  instruction: string;
  maxDuration: number; // Configurable max clip length in seconds
  isDefault?: boolean;
  category?: PresetCategory;
}
