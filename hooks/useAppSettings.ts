import { useState, useEffect, useCallback } from 'react';
import { AppSettings, AnalysisProvider, CustomProviderConfig, OpenRouterModel } from '../types';
import { fetchOpenRouterModels, filterVisionModels } from '../services/openrouterService';

const SETTINGS_KEY = 'fpv_app_settings';

// Default settings - use env vars if available
const getDefaultSettings = (): AppSettings => ({
  provider: 'gemini',
  geminiApiKey: '',
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

  // Fetch OpenRouter models when settings load
  useEffect(() => {
    if (!isLoading) {
      refreshModels();
    }
  }, [isLoading]);

  const refreshModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const models = await fetchOpenRouterModels();
      setOpenrouterModels(models);
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setLoadingModels(false);
    }
  }, []);

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
    updateCustomConfig,
    updateJamendoClientId,
    saveSettings,
    resetSettings,
    refreshModels
  };
}
