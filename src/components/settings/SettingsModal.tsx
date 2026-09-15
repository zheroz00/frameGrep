import { useState, useRef, type ChangeEvent } from 'react';
import { X, Save, Settings, Cloud, Server, Cpu, RefreshCw, ChevronDown, Download, Upload, Database, Music, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { UseAppSettingsReturn } from '../../hooks/useAppSettings';
import ModelSelectorModal from './ModelSelectorModal';
import { exportAllAppData, importAllAppData } from '../../utils/exportUtils';
import { GeminiModel } from '../../types';
import { GEMINI_ANALYSIS_MODELS } from '../../services/geminiModels';

interface GeminiModelOption {
  id: GeminiModel;
  label: string;
  description: string;
}

const GEMINI_MODEL_OPTIONS: GeminiModelOption[] = GEMINI_ANALYSIS_MODELS.map(({ id, label, description }) => ({ id, label, description }));

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
    currentlyLoadedVLM,
    swapInProgress,
    swapError,
    updateProvider,
    updateGeminiApiKey,
    updateGeminiModel,
    updateGeminiMediaResolution,
    updateGeminiFps,
    updateAutoDownsample,
    updateCustomConfig,
    updateJamendoClientId,
    saveSettings,
    refreshModels,
    swapLocalVLM,
  } = appSettings;

  const selectedGeminiModelDescription =
    GEMINI_MODEL_OPTIONS.find(o => o.id === settings.geminiModel)?.description || '';

  // A pending swap exists when the user picked a local vLLM model that the
  // server isn't currently serving. We DON'T trigger the swap on selection —
  // it's deferred to the Save Settings click so the user can flip between
  // options without each tap kicking off an 80-second load.
  const pendingVLMSwap = currentlyLoadedVLM !== null
    && settings.provider === 'custom'
    && settings.customConfig.model !== currentlyLoadedVLM
    && openrouterModels.some(m => m.id === settings.customConfig.model);

  const handleSave = async () => {
    if (pendingVLMSwap) {
      try {
        await swapLocalVLM(settings.customConfig.model);
      } catch {
        // Surface the error inline (swapError state already set). Keep the
        // modal open so the user can read it and retry.
        return;
      }
    }
    saveSettings();
    onClose();
  };

  const handleImportData = async (e: ChangeEvent<HTMLInputElement>) => {
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

  // Check if using a local endpoint (not OpenRouter)
  const isLocalEndpoint = !settings.customConfig.endpoint.includes('openrouter.ai');

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
              <div className="grid grid-cols-3 gap-3">
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

                <button
                  onClick={() => updateProvider('marlin')}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                    settings.provider === 'marlin'
                      ? 'border-sky-500 bg-sky-500/10'
                      : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                  }`}
                >
                  <Cpu className={`w-5 h-5 ${settings.provider === 'marlin' ? 'text-sky-400' : 'text-zinc-500'}`} />
                  <div className="text-left">
                    <div className={`font-medium ${settings.provider === 'marlin' ? 'text-white' : 'text-zinc-300'}`}>
                      Marlin (local)
                    </div>
                    <div className="text-xs text-zinc-500">Offline clip-ID, no prompt</div>
                  </div>
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Gemini uploads full video. Custom uses frame extraction or native video. Marlin runs a local 2B model that auto-captions clips with timestamps (server: scripts/marlin-server.sh).
              </p>
            </div>

            {/* Gemini Settings */}
            {settings.provider === 'gemini' && (
              <>
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

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="gemini-model-select" className="block text-sm font-medium text-zinc-300">
                      Gemini Model
                    </label>
                    <span className="text-[10px] text-emerald-500/80 flex items-center gap-1" title="Your model selection auto-saves to browser storage on change and is restored every time the app loads.">
                      <CheckCircle2 size={10} /> Auto-saved as your default
                    </span>
                  </div>
                  <select
                    id="gemini-model-select"
                    value={settings.geminiModel}
                    onChange={(e) => updateGeminiModel(e.target.value as GeminiModel)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
                  >
                    {GEMINI_MODEL_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-zinc-500 mt-1">
                    {selectedGeminiModelDescription}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Media Resolution
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateGeminiMediaResolution('low')}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left ${
                        settings.geminiMediaResolution === 'low'
                          ? 'border-amber-500 bg-amber-500/10 text-white'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div>Low</div>
                      <div className="text-xs text-zinc-500 mt-0.5">3x cheaper, ~no quality loss for FPV</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateGeminiMediaResolution('default')}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left ${
                        settings.geminiMediaResolution === 'default'
                          ? 'border-amber-500 bg-amber-500/10 text-white'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div>Default</div>
                      <div className="text-xs text-zinc-500 mt-0.5">Sharper, $$</div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Sampling Rate (FPS)
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 4, 6].map(fps => (
                      <button
                        key={fps}
                        type="button"
                        onClick={() => updateGeminiFps(fps)}
                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          settings.geminiFps === fps
                            ? 'border-amber-500 bg-amber-500/10 text-white'
                            : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        {fps === 1 ? '1 (default)' : `${fps} fps`}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Frames per second Gemini actually looks at. Gemini defaults to 1 fps —
                    fast action (backflips, gaps) can fall between frames. Higher fps catches
                    sub-second moves but costs more tokens (pairs well with Low resolution).
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Auto-downsample for analysis
                  </label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.autoDownsample}
                    onClick={() => updateAutoDownsample(!settings.autoDownsample)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left ${
                      settings.autoDownsample
                        ? 'border-amber-500 bg-amber-500/10 text-white'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <span>{settings.autoDownsample ? 'On — 720p / 30fps' : 'Off — upload as-is'}</span>
                    <span className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.autoDownsample ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                      <span className={`h-4 w-4 rounded-full bg-white transition-transform ${settings.autoDownsample ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </span>
                  </button>
                  <p className="text-xs text-zinc-500 mt-1">
                    Transcodes over-target clips (e.g. 4K/100fps) to 720p/30fps before upload —
                    faster uploads, no quality loss for clip ID. Your original file on disk is
                    never modified. Off still enforces Gemini's 2GB/4K/100Mbps limits.
                  </p>
                </div>
              </>
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
                    vLLM: <code className="text-zinc-400">http://localhost:8002/v1</code> |
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

                  {/* For local endpoints with no models found, show text input */}
                  {isLocalEndpoint && openrouterModels.length === 0 ? (
                    <>
                      <input
                        type="text"
                        value={settings.customConfig.model}
                        onChange={(e) => updateCustomConfig({ model: e.target.value })}
                        placeholder="e.g., Qwen/Qwen3-VL-8B-Instruct-FP8"
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                      />
                      <p className="text-xs text-zinc-500 mt-1">
                        Enter the model name from your local server. Click Refresh to auto-detect available models.
                      </p>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setIsModelSelectorOpen(true)}
                        disabled={loadingModels || swapInProgress}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-left flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <span className="truncate">{modelDisplayName}</span>
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                      </button>
                      <p className="text-xs text-zinc-500 mt-1">
                        {openrouterModels.length > 0
                          ? `${openrouterModels.length} models available - Click to browse`
                          : isLocalEndpoint
                            ? 'No models found. Is the server running?'
                            : 'Loading models...'}
                      </p>
                      {currentlyLoadedVLM && (
                        <p className="text-xs text-zinc-500 mt-1">
                          vLLM currently serving: <code className="text-zinc-400">{currentlyLoadedVLM}</code>
                        </p>
                      )}
                      {pendingVLMSwap && !swapInProgress && (
                        <div className="mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>
                            Pending swap. <strong>Save Settings</strong> will reload vLLM with the selected model (~60-90s).
                          </span>
                        </div>
                      )}
                      {swapInProgress && (
                        <div className="mt-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-200 text-xs flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                          <span>Swapping vLLM model — this takes ~60-90s. Don't close the modal.</span>
                        </div>
                      )}
                      {swapError && !swapInProgress && (
                        <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>Swap failed: {swapError}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Video Input Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateCustomConfig({ useNativeVideo: false })}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left ${
                        !settings.customConfig.useNativeVideo
                          ? 'border-purple-500 bg-purple-500/10 text-white'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div>Frame Extraction</div>
                      <div className="text-xs text-zinc-500 mt-0.5">Extract JPEG frames (all providers)</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCustomConfig({ useNativeVideo: true })}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left ${
                        settings.customConfig.useNativeVideo
                          ? 'border-purple-500 bg-purple-500/10 text-white'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div>Native Video</div>
                      <div className="text-xs text-zinc-500 mt-0.5">Send full video to vLLM (Qwen-VL)</div>
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Native Video sends the full MP4 to models that support <code className="text-zinc-400">video_url</code> (vLLM + Qwen-VL).
                    Frame Extraction works with all OpenAI-compatible APIs.
                  </p>
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
              disabled={swapInProgress}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:cursor-not-allowed text-zinc-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || swapInProgress}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:cursor-not-allowed text-zinc-950 font-medium rounded-lg transition-colors"
            >
              {swapInProgress
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Save className="w-4 h-4" />}
              {swapInProgress
                ? 'Loading model...'
                : pendingVLMSwap
                  ? 'Save & Swap Model'
                  : isSaving ? 'Saving...' : 'Save Settings'}
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
