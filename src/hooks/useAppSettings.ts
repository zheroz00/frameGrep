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

/**
 * Fetch models from a local OpenAI-compatible endpoint (vLLM, Ollama, etc.)
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

    // Convert to OpenRouterModel format for compatibility
    return models
      .filter((m: { id?: string }) => typeof m.id === 'string')
      .map((m: {
        id: string;
        name?: string;
        owned_by?: string;
        context_length?: number;
        description?: string;
      }) => ({
        id: m.id,
        name: m.name || m.id.split('/').pop() || m.id,
        provider: m.owned_by || m.id.split('/')[0] || 'local',
        context_length: typeof m.context_length === 'number' ? m.context_length : 8192,
        prompt_price_per_1m: 0,
        completion_price_per_1m: 0,
        description: m.description || `Local model from ${m.owned_by || 'local server'}`
      }));
  } catch (error) {
    console.error('Failed to fetch local models:', error);
    return [];
  }
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
}

export function useAppSettings(): UseAppSettingsReturn {
  const [settings, setSettings] = useState<AppSettings>(getDefaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // OpenRouter models
  const [openrouterModels, setOpenrouterModels] = useState<OpenRouterModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

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
      } else {
        models = await fetchLocalModels(endpoint, settings.customConfig.apiKey);
      }

      setOpenrouterModels(models);
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setLoadingModels(false);
    }
  }, [settings.customConfig.endpoint, settings.customConfig.apiKey]);

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
    updateSettings,
    updateProvider,
    updateGeminiApiKey,
    updateGeminiModel,
    updateGeminiMediaResolution,
    updateCustomConfig,
    updateJamendoClientId,
    saveSettings,
    resetSettings,
    refreshModels
  };
}
