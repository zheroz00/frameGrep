import type { GeminiModel } from '../types';

export interface GeminiAnalysisModel {
  id: GeminiModel;
  label: string;
  description: string;
  capabilities: {
    videoInput: true;
    textOutput: true;
    structuredOutput: true;
    filesApi: true;
    customVideoFps: true;
  };
}

const CAPABILITIES = {
  videoInput: true,
  textOutput: true,
  structuredOutput: true,
  filesApi: true,
  customVideoFps: true,
} as const;

/** Only video-input to text-output models belong in the analysis selector. */
export const GEMINI_ANALYSIS_MODELS: readonly GeminiAnalysisModel[] = [
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', description: 'Recommended — low-cost video understanding and structured extraction', capabilities: CAPABILITIES },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', description: 'Current low-latency multimodal model with video input and text output', capabilities: CAPABILITIES },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', description: 'Low-latency, low-cost Flash Lite with 1M context, video input and structured output', capabilities: CAPABILITIES },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', description: 'Preview video understanding model', capabilities: CAPABILITIES },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Stable multimodal workhorse', capabilities: CAPABILITIES },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', description: 'Higher-capability video understanding and structured extraction', capabilities: CAPABILITIES },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', description: 'Frontier-level Flash at higher speed and lower cost, 1M context, video input and structured output', capabilities: CAPABILITIES },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', description: 'Previous-generation Flash, 1M context, video input and structured output', capabilities: CAPABILITIES },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', description: 'Latest stable Flash, 1M context, video input and structured output', capabilities: CAPABILITIES },
];

export const isGeminiAnalysisModel = (value: unknown): value is GeminiModel =>
  typeof value === 'string' && GEMINI_ANALYSIS_MODELS.some(model => model.id === value);
