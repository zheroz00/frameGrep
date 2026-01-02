
export interface ClipSegment {
  start_time: string; // Format "MM:SS"
  end_time: string;   // Format "MM:SS"
  description: string;
  excitement_score: number; // 1-10
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

export type PresetCategory = 'fpv' | 'generic' | 'custom';

export interface PromptPreset {
  id: string;
  name: string;
  instruction: string;
  maxDuration: number; // Configurable max clip length in seconds
  isDefault?: boolean;
  category?: PresetCategory;
}
