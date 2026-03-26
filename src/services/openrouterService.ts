import { OpenRouterModel } from '../types';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

// Cache models to avoid repeated API calls
let cachedModels: OpenRouterModel[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface OpenRouterAPIModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

/**
 * Fetch available models from OpenRouter API
 */
export const fetchOpenRouterModels = async (): Promise<OpenRouterModel[]> => {
  // Return cached if fresh
  if (cachedModels && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return cachedModels;
  }

  try {
    const response = await fetch(OPENROUTER_MODELS_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response format');
    }

    // Transform and filter models (only vision models for video analysis)
    const models: OpenRouterModel[] = data.data
      .map((model: OpenRouterAPIModel) => {
        // Extract provider from model ID (e.g., "qwen/qwen3-vl-8b" -> "qwen")
        const provider = model.id.split('/')[0] || 'unknown';

        // Parse pricing (comes as string like "0.00008")
        const promptPrice = parseFloat(model.pricing?.prompt || '0') * 1000000;
        const completionPrice = parseFloat(model.pricing?.completion || '0') * 1000000;

        return {
          id: model.id,
          name: model.name || model.id,
          provider,
          context_length: model.context_length || 0,
          prompt_price_per_1m: promptPrice,
          completion_price_per_1m: completionPrice,
          description: model.description || ''
        };
      })
      // Sort by name
      .sort((a: OpenRouterModel, b: OpenRouterModel) => a.name.localeCompare(b.name));

    // Cache the results
    cachedModels = models;
    cacheTimestamp = Date.now();

    return models;
  } catch (error) {
    console.error('Failed to fetch OpenRouter models:', error);

    // Return cached if available, even if stale
    if (cachedModels) {
      return cachedModels;
    }

    // Return fallback models for vision
    return [
      {
        id: 'qwen/qwen3-vl-8b-instruct',
        name: 'Qwen3 VL 8B Instruct',
        provider: 'qwen',
        context_length: 131072,
        prompt_price_per_1m: 0.08,
        completion_price_per_1m: 0.50,
        description: 'Qwen3 Vision-Language model with 8B parameters'
      },
      {
        id: 'qwen/qwen3-vl-32b-instruct',
        name: 'Qwen3 VL 32B Instruct',
        provider: 'qwen',
        context_length: 262144,
        prompt_price_per_1m: 0.50,
        completion_price_per_1m: 1.50,
        description: 'Qwen3 Vision-Language model with 32B parameters'
      },
      {
        id: 'google/gemini-2.0-flash-001',
        name: 'Gemini 2.0 Flash',
        provider: 'google',
        context_length: 1000000,
        prompt_price_per_1m: 0.10,
        completion_price_per_1m: 0.40,
        description: 'Google Gemini 2.0 Flash with vision capabilities'
      }
    ];
  }
};

/**
 * Filter models to only show vision-capable models
 */
export const filterVisionModels = (models: OpenRouterModel[]): OpenRouterModel[] => {
  const visionKeywords = ['vl', 'vision', 'gemini', 'gpt-4o', 'claude-3', 'pixtral', 'llava'];

  return models.filter(model => {
    const idLower = model.id.toLowerCase();
    const nameLower = model.name.toLowerCase();
    const descLower = model.description.toLowerCase();

    return visionKeywords.some(keyword =>
      idLower.includes(keyword) ||
      nameLower.includes(keyword) ||
      descLower.includes('vision') ||
      descLower.includes('image') ||
      descLower.includes('multimodal')
    );
  });
};

/**
 * Clear the model cache
 */
export const clearModelCache = () => {
  cachedModels = null;
  cacheTimestamp = 0;
};
