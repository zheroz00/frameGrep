import type { RawClipSegment } from '../types';

export interface ProviderProgress {
  phase: string;
  detail?: string;
}

export interface ProviderAnalysisRequest {
  file: File;
  signal: AbortSignal;
  onProgress?: (progress: ProviderProgress) => void;
}

/** Shared contract for every analysis backend before domain normalization. */
export interface ProviderAdapter {
  readonly id: string;
  analyze(request: ProviderAnalysisRequest): Promise<RawClipSegment[]>;
}
