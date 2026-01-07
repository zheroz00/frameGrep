import { useState, useRef } from 'react';
import { X, Save, Settings, Cloud, Server, RefreshCw, ChevronDown, Download, Upload, Database, Music } from 'lucide-react';
import { UseAppSettingsReturn } from '../../hooks/useAppSettings';
import { AnalysisProvider } from '../../types';
import ModelSelectorModal from './ModelSelectorModal';
import { exportAllAppData, importAllAppData } from '../../utils/exportUtils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appSettings: UseAppSettingsReturn;
}

export default function SettingsModal({ isOpen, onClose, appSettings }: SettingsModalProps) {
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const {
    settings,
    isSaving,
    openrouterModels,
    loadingModels,
    updateProvider,
    updateGeminiApiKey,
    updateCustomConfig,
    updateJamendoClientId,
    saveSettings,
    refreshModels
  } = appSettings;

  const handleSave = () => {
    saveSettings();
    onClose();
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus('Importing...');
    const result = await importAllAppData(file);

    if (result.error) {
      setImportStatus(`Error: ${result.error}`);
    } else if (result.presets === 0 && result.projects === 0) {
      setImportStatus('No new data to import (duplicates skipped)');
    } else {
      setImportStatus(`Imported ${result.presets} presets, ${result.projects} projects. Refresh to see changes.`);
    }

    // Reset input
    if (importInputRef.current) {
      importInputRef.current.value = '';
    }

    // Clear status after 5 seconds
    setTimeout(() => setImportStatus(null), 5000);
  };

  // Find the selected model name for display
  const selectedModel = openrouterModels.find(m => m.id === settings.customConfig.model);
  const modelDisplayName = selectedModel?.name || settings.customConfig.model || 'Select a model...';

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
        <div className="bg-zinc-900 rounded-xl shadow-2xl max-w-2xl w-full mx-4 border border-zinc-800 animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-semibold text-white">Settings</h3>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* AI Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                AI Provider
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => updateProvider('gemini')}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                    settings.provider === 'gemini'
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                  }`}
                >
                  <Cloud className={`w-5 h-5 ${settings.provider === 'gemini' ? 'text-amber-400' : 'text-zinc-500'}`} />
                  <div className="text-left">
                    <div className={`font-medium ${settings.provider === 'gemini' ? 'text-white' : 'text-zinc-300'}`}>
                      Google Gemini
                    </div>
                    <div className="text-xs text-zinc-500">Native video analysis</div>
                  </div>
                </button>

                <button
                  onClick={() => updateProvider('custom')}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                    settings.provider === 'custom'
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                  }`}
                >
                  <Server className={`w-5 h-5 ${settings.provider === 'custom' ? 'text-purple-400' : 'text-zinc-500'}`} />
                  <div className="text-left">
                    <div className={`font-medium ${settings.provider === 'custom' ? 'text-white' : 'text-zinc-300'}`}>
                      Custom
                    </div>
                    <div className="text-xs text-zinc-500">OpenRouter, Ollama, vLLM</div>
                  </div>
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Gemini uploads full video. Custom providers use frame extraction.
              </p>
            </div>

            {/* Gemini Settings */}
            {settings.provider === 'gemini' && (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={settings.geminiApiKey}
                  onChange={(e) => updateGeminiApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Get your key from{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:underline"
                  >
                    Google AI Studio
                  </a>
                </p>
              </div>
            )}

            {/* Custom Provider Settings */}
            {settings.provider === 'custom' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Endpoint URL
                  </label>
                  <input
                    type="text"
                    value={settings.customConfig.endpoint}
                    onChange={(e) => updateCustomConfig({ endpoint: e.target.value })}
                    placeholder="https://openrouter.ai/api/v1"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    OpenRouter: <code className="text-zinc-400">https://openrouter.ai/api/v1</code> |
                    Ollama: <code className="text-zinc-400">http://localhost:11434/v1</code>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    API Key {settings.customConfig.endpoint.includes('openrouter') && <span className="text-red-400">*</span>}
                  </label>
                  <input
                    type="password"
                    value={settings.customConfig.apiKey || ''}
                    onChange={(e) => updateCustomConfig({ apiKey: e.target.value || undefined })}
                    placeholder={settings.customConfig.endpoint.includes('localhost') ? 'Optional for local' : 'sk-or-v1-...'}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Get your OpenRouter key from{' '}
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:underline"
                    >
                      openrouter.ai/keys
                    </a>
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-zinc-300">
                      Model {loadingModels && <span className="text-xs text-zinc-500">(Loading...)</span>}
                    </label>
                    <button
                      onClick={refreshModels}
                      disabled={loadingModels}
                      className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <RefreshCw size={12} className={loadingModels ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                  </div>

                  <button
                    onClick={() => setIsModelSelectorOpen(true)}
                    disabled={loadingModels}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-left flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="truncate">{modelDisplayName}</span>
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                  </button>

                  {openrouterModels.length > 0 && (
                    <p className="text-xs text-zinc-500 mt-1">
                      {openrouterModels.length} models available - Click to browse
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Jamendo Music Settings */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                <Music className="w-4 h-4 inline mr-1" />
                Music Suggestions (Jamendo)
              </label>
              <input
                type="password"
                value={settings.jamendoClientId || ''}
                onChange={(e) => updateJamendoClientId(e.target.value)}
                placeholder="Jamendo Client ID"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Get your Client ID from{' '}
                <a
                  href="https://developer.jamendo.com/v3.0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline"
                >
                  Jamendo Developer Portal
                </a>
                . Enables AI-powered music suggestions for your clips.
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <p className="text-sm text-amber-200">
                <strong>Note:</strong> Settings are saved to your browser's local storage.
                They persist across sessions but are specific to this browser.
              </p>
            </div>

            {/* Data & Backup Section */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                <Database className="w-4 h-4 inline mr-1" />
                Data & Backup
              </label>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={exportAllAppData}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Export All Data
                  </button>
                  <button
                    onClick={() => importInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Import Backup
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportData}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-zinc-500">
                  Export includes presets and projects. Import accepts any backup file (presets, projects, or all-data).
                </p>
                {importStatus && (
                  <p className={`text-xs ${importStatus.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                    {importStatus}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-zinc-800 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:cursor-not-allowed text-zinc-950 font-medium rounded-lg transition-colors"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Model Selector Modal */}
      <ModelSelectorModal
        isOpen={isModelSelectorOpen}
        onClose={() => setIsModelSelectorOpen(false)}
        onSelect={(modelId) => updateCustomConfig({ model: modelId })}
        models={openrouterModels}
        currentModel={settings.customConfig.model}
      />
    </>
  );
}
