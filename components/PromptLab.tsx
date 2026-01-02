import React from 'react';
import {
  Sparkles, Loader2, RefreshCw, FileUp, FileDown,
  HardDrive, CheckCircle2, XCircle, Clock, Save, Plane, Film, User
} from 'lucide-react';
import { PromptPreset, PresetCategory } from '../types';
import { exportPresetsToJSON } from '../utils/exportUtils';

const CATEGORY_CONFIG: Record<PresetCategory, { label: string; icon: React.ReactNode }> = {
  fpv: { label: 'FPV Drone', icon: <Plane size={14} /> },
  generic: { label: 'Generic', icon: <Film size={14} /> },
  custom: { label: 'Custom', icon: <User size={14} /> },
};

interface PromptLabProps {
  presets: PromptPreset[];
  activeCategory: PresetCategory;
  activePresetId: string;
  currentInstruction: string;
  currentMaxDuration: number;
  newPresetName: string;
  isOptimizing: boolean;
  apiKey: string;
  directoryHandle: FileSystemDirectoryHandle | null;
  supportsFileSystemAccess: boolean;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  onCategoryChange: (category: PresetCategory) => void;
  onActivePresetChange: (id: string) => void;
  onInstructionChange: (instruction: string) => void;
  onDurationChange: (duration: number) => void;
  onNewPresetNameChange: (name: string) => void;
  onSavePreset: () => void;
  onDeletePreset: (id: string) => void;
  onResetDefaults: () => void;
  onOptimizePrompt: () => void;
  onImportPresets: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onConnectFolder: () => void;
}

const PromptLab: React.FC<PromptLabProps> = ({
  presets,
  activeCategory,
  activePresetId,
  currentInstruction,
  currentMaxDuration,
  newPresetName,
  isOptimizing,
  apiKey,
  directoryHandle,
  supportsFileSystemAccess,
  importInputRef,
  onCategoryChange,
  onActivePresetChange,
  onInstructionChange,
  onDurationChange,
  onNewPresetNameChange,
  onSavePreset,
  onDeletePreset,
  onResetDefaults,
  onOptimizePrompt,
  onImportPresets,
  onConnectFolder,
}) => {
  return (
    <div className="bg-zinc-900 border border-amber-500/30 rounded-xl overflow-hidden shadow-2xl animate-in slide-in-from-top-4 duration-300">
      {/* Header */}
      <div className="p-4 bg-amber-500/5 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-500">
          <Sparkles size={18} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Prompt Lab</h3>
        </div>
        <div className="flex gap-4 items-center">
          <button
            onClick={() => exportPresetsToJSON(presets)}
            className="text-zinc-500 hover:text-white transition-colors flex items-center gap-1.5 text-xs"
          >
            <FileDown size={14} /> Export
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="text-zinc-500 hover:text-white transition-colors flex items-center gap-1.5 text-xs"
          >
            <FileUp size={14} /> Import
          </button>
          <input
            type="file"
            ref={importInputRef}
            onChange={onImportPresets}
            accept=".json"
            className="hidden"
          />
          {supportsFileSystemAccess && (
            <>
              <div className="w-px h-4 bg-zinc-800" />
              <button
                onClick={onConnectFolder}
                className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                  directoryHandle ? 'text-green-500' : 'text-zinc-500 hover:text-white'
                }`}
              >
                {directoryHandle ? <CheckCircle2 size={14} /> : <HardDrive size={14} />}
                {directoryHandle ? 'Linked' : 'Link Disk'}
              </button>
            </>
          )}
          <button
            onClick={onResetDefaults}
            className="p-1.5 text-zinc-500 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Category Tabs */}
        <div className="flex gap-1 p-1 bg-zinc-950 rounded-lg border border-zinc-800">
          {(Object.keys(CATEGORY_CONFIG) as PresetCategory[]).map(cat => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeCategory === cat
                  ? 'bg-amber-500 text-zinc-950'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {CATEGORY_CONFIG[cat].icon}
              {CATEGORY_CONFIG[cat].label}
            </button>
          ))}
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap gap-2">
          {presets.length === 0 ? (
            <p className="text-xs text-zinc-600 italic py-2">
              {activeCategory === 'generic'
                ? 'No generic presets yet. Create one below or switch to FPV mode.'
                : activeCategory === 'custom'
                ? 'No custom presets yet. Create one below!'
                : 'No presets in this category.'}
            </p>
          ) : presets.map(p => (
            <div key={p.id} className="relative group/tag">
              <button
                onClick={() => onActivePresetChange(p.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-2 ${
                  activePresetId === p.id
                    ? 'bg-amber-500 border-amber-500 text-zinc-950'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                }`}
              >
                {p.name}
              </button>
              {!p.isDefault && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePreset(p.id);
                  }}
                  className="absolute -top-1 -right-1 bg-zinc-800 text-zinc-400 hover:text-red-500 rounded-full p-0.5 opacity-0 group-hover/tag:opacity-100 transition-opacity border border-zinc-700"
                >
                  <XCircle size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Temporal Settings */}
        <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-zinc-500">
            <div className="flex items-center gap-2">
              <Clock size={14} /> Temporal Constraints
            </div>
            <span className="text-amber-500">{currentMaxDuration}s max duration</span>
          </div>
          <input
            type="range"
            min="3"
            max="20"
            step="1"
            value={currentMaxDuration}
            onChange={(e) => onDurationChange(parseInt(e.target.value))}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <p className="text-[10px] text-zinc-600 italic">
            Overrides instruction text to ensure highlights capture the full maneuver up to {currentMaxDuration} seconds.
          </p>
        </div>

        {/* Instruction Area */}
        <div className="relative group/text">
          <textarea
            value={currentInstruction}
            onChange={(e) => onInstructionChange(e.target.value)}
            className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs font-mono text-zinc-300 focus:outline-none focus:border-amber-500/50 resize-none transition-all"
            placeholder="Enter system instruction for Gemini..."
          />
          <div className="absolute top-2 right-2 flex gap-2">
            <button
              onClick={onOptimizePrompt}
              disabled={isOptimizing || !apiKey}
              className="bg-zinc-900 border border-zinc-700 hover:border-amber-500 p-2 rounded-md text-amber-500 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isOptimizing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              <span className="text-[10px] font-bold uppercase tracking-tight">AI Polish</span>
            </button>
          </div>
        </div>

        {/* Save Logic */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Save as new preset..."
            value={newPresetName}
            onChange={(e) => onNewPresetNameChange(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500/50"
          />
          <button
            onClick={onSavePreset}
            disabled={!newPresetName}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-xs rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Save size={14} /> Create Preset
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromptLab;
