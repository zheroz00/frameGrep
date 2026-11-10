import React from 'react';
import { Cloud, Server, Cpu, FolderOpen, Music, Settings, Wand2 } from 'lucide-react';
import GpuWidget from '../GpuWidget';
import { AnalysisProvider } from '../../types';

interface AppHeaderProps {
  provider: AnalysisProvider;
  onProviderChange: (provider: AnalysisProvider) => void;
  /** Full custom model id, shown as the tooltip of the custom model label. */
  customModelId: string;
  /** Friendly custom model name shown next to the provider switch. */
  customModelDisplay: string;
  isProjectsOpen: boolean;
  projectCount: number;
  onToggleProjects: () => void;
  clipCount: number;
  isMusicOpen: boolean;
  onOpenMusic: () => void;
  gpuWidgetEnabled: boolean;
  onOpenSettings: () => void;
  isPromptLabOpen: boolean;
  onTogglePromptLab: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  provider,
  onProviderChange,
  customModelId,
  customModelDisplay,
  isProjectsOpen,
  projectCount,
  onToggleProjects,
  clipCount,
  isMusicOpen,
  onOpenMusic,
  gpuWidgetEnabled,
  onOpenSettings,
  isPromptLabOpen,
  onTogglePromptLab,
}) => (
  <header className="shrink-0 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
    <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <img src="/assets/frameGrep-header.png" alt="frameGrep" className="h-9 w-auto" />
      </div>
      <div className="flex items-center gap-3">
        {/* Provider Toggle */}
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
          <button
            onClick={() => onProviderChange('gemini')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              provider === 'gemini'
                ? 'bg-amber-500 text-zinc-950'
                : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Cloud size={12} /> Gemini
          </button>
          <button
            onClick={() => onProviderChange('custom')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              provider === 'custom'
                ? 'bg-purple-500 text-white'
                : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Server size={12} /> Custom
          </button>
          <button
            onClick={() => onProviderChange('marlin')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              provider === 'marlin'
                ? 'bg-sky-500 text-white'
                : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Cpu size={12} /> Marlin
          </button>
        </div>

        {/* Provider indicator / Quick info */}
        {provider === 'custom' && (
          <span className="text-xs text-purple-400 max-w-[120px] truncate" title={customModelId}>
            {customModelDisplay}
          </span>
        )}
        {provider === 'marlin' && (
          <span className="text-xs text-sky-400 max-w-[140px] truncate" title="Local Marlin-2B (caption mode)">
            Marlin-2B · local
          </span>
        )}

        {/* Projects Button */}
        <button
          onClick={onToggleProjects}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isProjectsOpen
              ? 'bg-amber-500 text-white'
              : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <FolderOpen size={16} />
          {projectCount > 0 && (
            <span className={`text-xs ${isProjectsOpen ? 'text-amber-200' : 'text-zinc-500'}`}>
              {projectCount}
            </span>
          )}
        </button>

        {/* Music Button */}
        <button
          onClick={onOpenMusic}
          disabled={clipCount === 0}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isMusicOpen
              ? 'bg-emerald-500 text-zinc-950'
              : clipCount === 0
                ? 'bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
          title={clipCount === 0 ? 'Analyze clips first' : 'Find music for all clips'}
        >
          <Music size={16} />
        </button>

        {/* GPU Activity Widget: only while a local model is the active provider */}
        <GpuWidget enabled={gpuWidgetEnabled} />

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
        >
          <Settings size={16} />
        </button>

        <button
          onClick={onTogglePromptLab}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isPromptLabOpen
              ? 'bg-amber-500 text-zinc-950'
              : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <Wand2 size={16} /> Prompt Lab
        </button>
      </div>
    </div>
  </header>
);

export default AppHeader;
