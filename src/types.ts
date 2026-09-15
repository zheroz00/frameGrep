export type ClipMood = 'intense' | 'smooth' | 'dramatic' | 'peaceful' | 'playful' | 'technical';
export type LightingCondition = 'golden_hour' | 'midday' | 'overcast' | 'shade' | 'indoor' | 'mixed' | 'low_light';

// Smart Edit Roadmap types
export type SectionType = 'highlight' | 'flow' | 'transition' | 'dead_time';
export type EnergyLevel = 'high' | 'medium' | 'low';
export type EditRecommendation = 'keep' | 'trim' | 'review';
export type ExportMode = 'highlights_only' | 'full_edit';

export interface RawClipSegment {
  id?: unknown;
  sourceId?: unknown;
  sourceFile?: unknown;
  startSeconds?: unknown;
  endSeconds?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  description?: unknown;
  excitementScore?: unknown;
  excitement_score?: unknown;
  reasoning?: unknown;
  mood?: unknown;
  lighting?: unknown;
  dominantColors?: unknown;
  dominant_colors?: unknown;
  sectionType?: unknown;
  section_type?: unknown;
  energyLevel?: unknown;
  energy_level?: unknown;
  recommendation?: unknown;
  transitionNote?: unknown;
  transition_note?: unknown;
}

export interface ClipSegment {
  id: string;
  sourceId: string;
  startSeconds: number;
  endSeconds: number;
  description: string;
  excitementScore: number;
  reasoning?: string; // Chain-of-thought explanation for why this clip was selected
  // AI Color/Mood analysis (Issue #19)
  mood?: ClipMood;
  lighting?: LightingCondition;
  dominantColors?: string[]; // e.g., ["orange", "blue", "green"]
  // Smart Edit Roadmap fields (all optional for backward compatibility)
  sectionType?: SectionType;
  energyLevel?: EnergyLevel;
  recommendation?: EditRecommendation;
  transitionNote?: string; // e.g., "Good cut point", "Fade-worthy"
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

export interface FrameRate {
  numerator: number;
  denominator: number;
  nominal: number;
  mode: 'constant' | 'variable' | 'unknown';
}

// Video metadata extracted via MediaInfo.js
export interface VideoMetadata {
  filename: string;
  frameRate: FrameRate;  // Exact timebase (e.g., 30000/1001)
  width: number;         // Video width in pixels
  height: number;        // Video height in pixels
  codec: string;         // Video codec (e.g., "HEVC", "H.264")
  duration: number;      // Duration in seconds
}

export interface VideoSource {
  id: string;
  fingerprint: string;
  filename: string;
  size: number;
  lastModified: number;
  metadata: VideoMetadata;
  /** Legacy filename-only sources cannot be safely auto-linked when duplicated. */
  legacy?: boolean;
}

export type QueueItemStatus = 'pending' | 'preparing' | 'uploading' | 'processing' | 'analyzing' | 'complete' | 'error' | 'cancelled';

export interface VideoQueueItem {
  id: string;
  source: VideoSource;
  file: File;
  url: string;
  status: QueueItemStatus;
  clips: ClipSegment[];
  error?: string;
  metadata?: VideoMetadata; // Extracted video metadata
  /** Blob URL of the transcoded file actually uploaded to Gemini, if transcoding occurred. Used for inspection. */
  transcodedUrl?: string;
  /** Byte size of the transcoded file, for displaying input → output reduction. */
  transcodedSize?: number;
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
// 'marlin' = local NemoStation/Marlin-2B server (caption-mode clip-ID, fully offline)
export type AnalysisProvider = 'gemini' | 'custom' | 'marlin';

export interface CustomProviderConfig {
  endpoint: string;      // e.g., "https://openrouter.ai/api/v1" or "http://localhost:11434/v1"
  model: string;         // e.g., "qwen/qwen3-vl-8b-instruct"
  apiKey?: string;       // Required for OpenRouter, optional for Ollama
  useNativeVideo?: boolean; // When true, send video_url instead of frame extraction (vLLM only)
  contextLength?: number;    // Model-reported context window used to derive frame budget
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

// Gemini model selection (free-form to allow future additions without code changes)
export type GeminiModel =
  | 'gemini-2.5-flash-lite'
  | 'gemini-3.1-flash-lite'
  | 'gemini-3-flash-preview'
  | 'gemini-2.5-flash'
  | 'gemini-3.5-flash'
  | 'gemini-3.5-flash-lite'
  | 'gemini-3.6-flash'
  | 'gemini-3.7-flash'
  | 'gemini-3.8-flash';

export type GeminiMediaResolution = 'default' | 'low';

// App settings (persisted to localStorage)
export interface AppSettings {
  provider: AnalysisProvider;
  geminiApiKey: string;
  geminiModel: GeminiModel;                       // Selected Gemini model for analysis
  geminiMediaResolution: GeminiMediaResolution;   // Token/cost vs detail trade-off (frame sharpness)
  geminiFps: number;                              // Frames/sec Gemini samples (default 1). Higher = catches sub-second action, more tokens
  autoDownsample: boolean;                        // Auto-transcode over-target clips to 720p/30fps before upload (original file untouched)
  davinciMediaFolder?: string;                    // Optional source-video folder path; embeds absolute paths in FCPXML so DaVinci auto-links media (blank = relink in NLE)
  customConfig: CustomProviderConfig;
  marlinEndpoint?: string;                        // Local Marlin-2B server (default '/api/marlin', proxied to :8003)
  jamendoClientId?: string;                       // For music suggestions feature
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

// Selected music track info (saved with project)
export interface SelectedMusicTrack {
  track: JamendoTrack;           // Full track metadata
  filename: string;              // Downloaded filename (e.g., "track_12345.mp3")
  downloadedAt: string;          // ISO timestamp
}

// Saved analysis project (persisted to localStorage)
export interface Project {
  schemaVersion: 2;
  id: string;                    // Unique ID (timestamp-based)
  name: string;                  // User-editable name
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  clips: ClipSegment[];          // All analyzed clips
  sources: VideoSource[];        // Stable source identities; media is relinked locally
  presetId: string;              // Preset used for analysis
  presetInstruction: string;     // Instruction snapshot at analysis time
  provider: AnalysisProvider;    // Provider used ('gemini' | 'custom')
  selectedMusic?: SelectedMusicTrack; // Selected music track for this project
}
