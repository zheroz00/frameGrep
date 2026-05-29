import { useState, useEffect, useCallback } from 'react';
import { AppSettings, AnalysisProvider, CustomProviderConfig, OpenRouterModel, GeminiModel, GeminiMediaResolution } from '../types';
import { fetchOpenRouterModels, filterVisionModels } from '../services/openrouterService';

const SETTINGS_KEY = 'fpv_app_settings';

/**
 * Check if endpoint is OpenRouter
 */
const isOpenRouterEndpoint = (endpoint: string): boolean => {
  return endpoint.includes('openrouter.ai');
};

interface LocalVLMResponse {
  cacheDir: string;
  models: Array<{
    id: string;
    architecture: string;
    quantization?: string;
    maxModelLen?: number;
    sizeBytes: number;
  }>;
  currentlyLoaded: string | null;
  currentMaxModelLen: number | null;
}

/**
 * Fetch local-VLM inventory from the Vite middleware. Returns the full set of
 * downloaded vision models plus which one is currently loaded by vLLM, regardless
 * of what `customConfig.endpoint` is pointed at — the middleware always reads the
 * HuggingFace cache on disk and queries vLLM on port 8002 directly.
 */
const fetchLocalVLMInventory = async (): Promise<LocalVLMResponse | null> => {
  try {
    const r = await fetch('/api/local-vlm/models');
    if (!r.ok) return null;
    return await r.json() as LocalVLMResponse;
  } catch (err) {
    console.warn('Local-VLM inventory unavailable (middleware may be down):', err);
    return null;
  }
};

/**
 * Fetch models from a local OpenAI-compatible endpoint (vLLM, Ollama, etc.) by
 * hitting `${endpoint}/models` directly. Used as a fallback for non-vLLM servers
 * (e.g. Ollama, llama-swap) where our middleware-based discovery doesn't apply.
 */
const fetchLocalModels = async (endpoint: string, apiKey?: string): Promise<OpenRouterModel[]> => {
  try {
    const baseUrl = endpoint.replace(/\/+$/, '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/models`, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];

    // vLLM and Ollama both follow OpenAI-style /v1/models. Field names differ:
    // vLLM emits `max_model_len`; OpenAI clients (and Ollama) often emit
    // `context_length`. Honor either before falling back to a conservative 8K.
    return models
      .filter((m: { id?: string }) => typeof m.id === 'string')
      .map((m: {
        id: string;
        name?: string;
        owned_by?: string;
        context_length?: number;
        max_model_len?: number;
        description?: string;
      }) => ({
        id: m.id,
        name: m.name || m.id.split('/').pop() || m.id,
        provider: m.owned_by || m.id.split('/')[0] || 'local',
        context_length: typeof m.context_length === 'number'
          ? m.context_length
          : typeof m.max_model_len === 'number' ? m.max_model_len : 8192,
        prompt_price_per_1m: 0,
        completion_price_per_1m: 0,
        description: m.description || `Local model from ${m.owned_by || 'local server'}`
      }));
  } catch (error) {
    console.error('Failed to fetch local models:', error);
    return [];
  }
};

/**
 * Heuristic: does this endpoint point at our local vLLM (port 8002 or the Vite
 * `/api/vllm` proxy)? When true, we use the local-VLM middleware to populate the
 * model list, which exposes every downloaded model — not just the loaded one.
 */
const isLocalVLMEndpoint = (endpoint: string): boolean => {
  return /:8002(\b|\/)/.test(endpoint) || /\/api\/vllm(\b|\/)/.test(endpoint);
};

// Default settings - use env vars if available
const getDefaultSettings = (): AppSettings => ({
  provider: 'gemini',
  geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  geminiModel: 'gemini-2.5-flash-lite',
  geminiMediaResolution: 'low',
  customConfig: {
    endpoint: import.meta.env.VITE_OPENROUTER_ENDPOINT || 'https://openrouter.ai/api/v1',
    model: import.meta.env.VITE_OPENROUTER_MODEL || 'qwen/qwen3-vl-8b-instruct',
    apiKey: import.meta.env.VITE_OPENROUTER_API_KEY || ''
  },
  marlinEndpoint: import.meta.env.VITE_MARLIN_ENDPOINT || '/api/marlin',
  jamendoClientId: import.meta.env.VITE_JAMENDO_CLIENT_ID || ''
});

export interface UseAppSettingsReturn {
  settings: AppSettings;
  isLoading: boolean;
  isSaving: boolean;

  // OpenRouter models
  openrouterModels: OpenRouterModel[];
  visionModels: OpenRouterModel[];
  loadingModels: boolean;

  // Local vLLM state (populated when endpoint targets localhost:8002).
  // `currentlyLoadedVLM` reflects what the running vLLM server reports; the
  // selected model in `settings.customConfig.model` may differ until a swap runs.
  currentlyLoadedVLM: string | null;
  swapInProgress: boolean;
  swapError: string | null;

  // Actions
  updateSettings: (updates: Partial<AppSettings>) => void;
  updateProvider: (provider: AnalysisProvider) => void;
  updateGeminiApiKey: (key: string) => void;
  updateGeminiModel: (model: GeminiModel) => void;
  updateGeminiMediaResolution: (resolution: GeminiMediaResolution) => void;
  updateCustomConfig: (config: Partial<CustomProviderConfig>) => void;
  updateJamendoClientId: (clientId: string) => void;
  saveSettings: () => void;
  resetSettings: () => void;
  refreshModels: () => Promise<void>;

  /**
   * Swap the local vLLM to a different cached model. Resolves once the new
   * server is responding to /v1/models, or rejects after ~3 minutes. UI should
   * disable inputs while `swapInProgress` is true.
   */
  swapLocalVLM: (modelId: string) => Promise<void>;
}

export function useAppSettings(): UseAppSettingsReturn {
  const [settings, setSettings] = useState<AppSettings>(getDefaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // OpenRouter models
  const [openrouterModels, setOpenrouterModels] = useState<OpenRouterModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Local-vLLM specific state.
  const [currentlyLoadedVLM, setCurrentlyLoadedVLM] = useState<string | null>(null);
  const [swapInProgress, setSwapInProgress] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      // One-shot cleanup: remove orphan key from a pre-rename version of this code.
      // Old key was `fpv_settings`; current key is `fpv_app_settings`. Safe to remove
      // unconditionally — no code reads `fpv_settings` anywhere in the app.
      if (localStorage.getItem('fpv_settings') !== null) {
        localStorage.removeItem('fpv_settings');
        console.log('[useAppSettings] removed orphan fpv_settings key from a previous app version');
      }

      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle new fields
        setSettings({
          ...getDefaultSettings(),
          ...parsed,
          customConfig: {
            ...getDefaultSettings().customConfig,
            ...parsed.customConfig
          }
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch models when settings load or endpoint changes
  useEffect(() => {
    if (!isLoading) {
      refreshModels();
    }
  }, [isLoading, settings.customConfig.endpoint]);

  const refreshModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const endpoint = settings.customConfig.endpoint;
      let models: OpenRouterModel[];

      if (isOpenRouterEndpoint(endpoint)) {
        models = await fetchOpenRouterModels();
        setCurrentlyLoadedVLM(null);
      } else if (isLocalVLMEndpoint(endpoint)) {
        // Surface every downloaded VLM, not just the loaded one. Lets the
        // user pick a model to swap to without restarting from the shell.
        const inv = await fetchLocalVLMInventory();
        if (inv) {
          models = inv.models.map(m => ({
            id: m.id,
            name: m.id.split('/').pop() || m.id,
            provider: m.id.split('/')[0] || 'local',
            // Currently loaded model's max_model_len reflects active config;
            // for others we fall back to whatever the model's config claims,
            // and finally a conservative 32K (matches our defaults).
            context_length: m.id === inv.currentlyLoaded && inv.currentMaxModelLen
              ? inv.currentMaxModelLen
              : (m.maxModelLen || 32768),
            prompt_price_per_1m: 0,
            completion_price_per_1m: 0,
            description: [
              m.architecture,
              m.quantization ? `quant=${m.quantization}` : null,
              `${(m.sizeBytes / 1e9).toFixed(1)} GB`,
              m.id === inv.currentlyLoaded ? 'CURRENTLY LOADED' : 'Cached, not loaded',
            ].filter(Boolean).join(' • '),
          }));
          setCurrentlyLoadedVLM(inv.currentlyLoaded);
        } else {
          // Middleware unreachable (e.g. dev server bypass). Fall back to
          // direct /v1/models so the user isn't completely stuck.
          models = await fetchLocalModels(endpoint, settings.customConfig.apiKey);
          setCurrentlyLoadedVLM(null);
        }
      } else {
        models = await fetchLocalModels(endpoint, settings.customConfig.apiKey);
        setCurrentlyLoadedVLM(null);
      }

      setOpenrouterModels(models);
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setLoadingModels(false);
    }
  }, [settings.customConfig.endpoint, settings.customConfig.apiKey]);

  const swapLocalVLM = useCallback(async (modelId: string) => {
    setSwapInProgress(true);
    setSwapError(null);
    try {
      const dispatchRes = await fetch('/api/local-vlm/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
      });
      if (!dispatchRes.ok) {
        const body = await dispatchRes.json().catch(() => ({}));
        throw new Error(body.error || `swap dispatch failed (${dispatchRes.status})`);
      }

      // Poll until vLLM reports the new model. ~180s budget covers cold load
      // + cudagraph warmup on a 4060 Ti (observed ~80-90s in practice).
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3_000));
        try {
          const statusRes = await fetch('/api/local-vlm/swap-status');
          if (statusRes.ok) {
            const status = await statusRes.json() as { ready: boolean; currentlyLoaded: string | null };
            if (status.ready && status.currentlyLoaded === modelId) {
              setCurrentlyLoadedVLM(modelId);
              // Pull fresh inventory so model-list descriptions (CURRENTLY
              // LOADED vs Cached) reflect the new state.
              await refreshModels();
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      throw new Error(`Timed out waiting for ${modelId} to load (180s).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSwapError(msg);
      throw err;
    } finally {
      setSwapInProgress(false);
    }
  }, [refreshModels]);

  const visionModels = filterVisionModels(openrouterModels);

  const saveSettings = useCallback(() => {
    setIsSaving(true);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  // Auto-save when settings change
  useEffect(() => {
    if (!isLoading) {
      const timeout = setTimeout(() => {
        saveSettings();
      }, 500); // Debounce
      return () => clearTimeout(timeout);
    }
  }, [settings, isLoading, saveSettings]);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const updateProvider = useCallback((provider: AnalysisProvider) => {
    setSettings(prev => ({ ...prev, provider }));
  }, []);

  const updateGeminiApiKey = useCallback((geminiApiKey: string) => {
    setSettings(prev => ({ ...prev, geminiApiKey }));
  }, []);

  const updateGeminiModel = useCallback((geminiModel: GeminiModel) => {
    setSettings(prev => ({ ...prev, geminiModel }));
  }, []);

  const updateGeminiMediaResolution = useCallback((geminiMediaResolution: GeminiMediaResolution) => {
    setSettings(prev => ({ ...prev, geminiMediaResolution }));
  }, []);

  const updateCustomConfig = useCallback((config: Partial<CustomProviderConfig>) => {
    setSettings(prev => ({
      ...prev,
      customConfig: { ...prev.customConfig, ...config }
    }));
  }, []);

  const updateJamendoClientId = useCallback((jamendoClientId: string) => {
    setSettings(prev => ({ ...prev, jamendoClientId }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(getDefaultSettings());
    localStorage.removeItem(SETTINGS_KEY);
  }, []);

  return {
    settings,
    isLoading,
    isSaving,
    openrouterModels,
    visionModels,
    loadingModels,
    currentlyLoadedVLM,
    swapInProgress,
    swapError,
    updateSettings,
    updateProvider,
    updateGeminiApiKey,
    updateGeminiModel,
    updateGeminiMediaResolution,
    updateCustomConfig,
    updateJamendoClientId,
    saveSettings,
    resetSettings,
    refreshModels,
    swapLocalVLM
  };
}
