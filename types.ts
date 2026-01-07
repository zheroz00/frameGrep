export type ClipMood = 'intense' | 'smooth' | 'dramatic' | 'peaceful' | 'playful' | 'technical';
export type LightingCondition = 'golden_hour' | 'midday' | 'overcast' | 'shade' | 'indoor' | 'mixed' | 'low_light';

// Smart Edit Roadmap types
export type SectionType = 'highlight' | 'flow' | 'transition' | 'dead_time';
export type EnergyLevel = 'high' | 'medium' | 'low';
export type EditRecommendation = 'keep' | 'trim' | 'review';
export type ExportMode = 'highlights_only' | 'full_edit';

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
  // Smart Edit Roadmap fields (all optional for backward compatibility)
  section_type?: SectionType;
  energy_level?: EnergyLevel;
  recommendation?: EditRecommendation;
  transition_note?: string; // e.g., "Good cut point", "Fade-worthy"
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

// Provider configuration for AI backends
export type AnalysisProvider = 'gemini' | 'custom';

export interface CustomProviderConfig {
  endpoint: string;      // e.g., "https://openrouter.ai/api/v1" or "http://localhost:11434/v1"
  model: string;         // e.g., "qwen/qwen3-vl-8b-instruct"
  apiKey?: string;       // Required for OpenRouter, optional for Ollama
}

// Alias for backward compatibility
export type LocalVLMConfig = CustomProviderConfig;

// OpenRouter model info (from their API)
export interface OpenRouterModel {
  id: string;
  name: string;
  provider: string;
  context_length: number;
  prompt_price_per_1m: number;
  completion_price_per_1m: number;
  description: string;
}

// App settings (persisted to localStorage)
export interface AppSettings {
  provider: AnalysisProvider;
  geminiApiKey: string;
  customConfig: CustomProviderConfig;
  jamendoClientId?: string;  // For music suggestions feature
}

// Social Media Captions (Issue #21)
export type SocialPlatform = 'instagram' | 'tiktok' | 'youtube' | 'twitter';
export type CaptionMode = 'clip' | 'video';

export interface YouTubeCaption {
  title: string;
  description: string;
}

export interface SocialCaptions {
  instagram: string;
  tiktok: string;
  youtube: YouTubeCaption;
  twitter: string;
  hashtags: string[];
}

export interface CaptionRequest {
  mode: CaptionMode;
  clip?: ClipSegment;           // For single clip mode
  clips?: ClipSegment[];        // For full video summary mode
  videoFilename?: string;       // Optional context
}

// Jamendo Music Integration (Issue #17 - Music Suggestions)
export interface JamendoTrack {
  id: string;
  name: string;
  artist_name: string;
  album_name: string;
  duration: number;          // Duration in seconds
  audio: string;             // Streaming URL (low quality preview)
  audiodownload: string;     // Download URL (requires attribution)
  image: string;             // Album art URL
  shareurl: string;          // Link to Jamendo page
  license_ccurl: string;     // Creative Commons license URL
  tags?: string[];           // Genre/mood tags
  speed?: string;            // verylow, low, medium, high, veryhigh
}

export interface MusicSuggestion {
  searchTerms: string[];     // Generated search terms for Jamendo
  genres: string[];          // Suggested genres
  tempo: string;             // Suggested tempo (verylow to veryhigh)
  mood: string;              // Human-readable mood description
  reasoning: string;         // Why these suggestions fit
}

export type MusicSearchMode = 'all_clips' | 'single_clip';

export interface MusicSearchContext {
  mode: MusicSearchMode;
  clipIndex?: number;        // For single_clip mode
  clips: ClipSegment[];      // Clips to analyze
  suggestion?: MusicSuggestion;
  tracks: JamendoTrack[];
  isLoading: boolean;
  error?: string;
}

// Saved analysis project (persisted to localStorage)
export interface Project {
  id: string;                    // Unique ID (timestamp-based)
  name: string;                  // User-editable name
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  clips: ClipSegment[];          // All analyzed clips
  videoFilenames: string[];      // Original filenames (videos must be re-uploaded)
  presetId: string;              // Preset used for analysis
  presetInstruction: string;     // Instruction snapshot at analysis time
  provider: AnalysisProvider;    // Provider used ('gemini' | 'custom')
}
