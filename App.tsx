import React, { useState } from 'react';
import {
  Upload, Zap, Video, Terminal, AlertTriangle, PlayCircle, Loader2,
  CloudUpload, Cpu, FileCode, Monitor, Sparkles, Wand2, AlertCircle,
  X, CheckCircle2, XCircle, Film, Server, Cloud, Settings, FolderOpen, Hash, Music
} from 'lucide-react';
import { optimizeSystemInstruction } from './services/geminiService';
import VideoPlayer from './components/VideoPlayer';
import ClipCard from './components/ClipCard';
import PromptLab from './components/PromptLab';
import SettingsModal from './components/settings/SettingsModal';
import ProjectsSidebar from './components/ProjectsSidebar';
import CaptionModal from './components/CaptionModal';
import MusicPanel from './components/MusicPanel';
import { usePresets } from './hooks/usePresets';
import { useVideoAnalysis } from './hooks/useVideoAnalysis';
import { useAppSettings } from './hooks/useAppSettings';
import { useProjects } from './hooks/useProjects';
import { useMusic } from './hooks/useMusic';
import { generateEDLWithMode, generateFFmpegScriptWithMode, generateFCPXMLWithMode, filterClipsForExport, FCPXMLOptions } from './utils/exportUtils';
import { ExportMode, Project, ClipSegment, CaptionMode, VideoMetadata } from './types';

export default function App() {
  const [isPromptLabOpen, setIsPromptLabOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>('highlights_only');

  // Caption Modal State
  const [captionModal, setCaptionModal] = useState<{
    isOpen: boolean;
    clip?: ClipSegment;
    mode: CaptionMode;
  }>({ isOpen: false, mode: 'clip' });

  // Custom Modal State
  const [confirmAction, setConfirmAction] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Use extracted hooks
  const presets = usePresets();
  const analysis = useVideoAnalysis();
  const appSettings = useAppSettings();
  const projects = useProjects();
  const music = useMusic();

  // Destructure commonly used settings
  const { settings, updateProvider } = appSettings;
  const provider = settings.provider;

  // Compute export helpers
  const currentProject = projects.currentProjectId
    ? projects.projects.find(p => p.id === projects.currentProjectId)
    : null;
  const exportProjectName = currentProject?.name || 'FPV_Supercut';
  const exportFilename = `${exportProjectName.replace(/[^a-z0-9]/gi, '_')}.fcpxml`;

  // Get video metadata from first video in queue (for FCPXML export)
  const firstVideoMetadata = analysis.videoQueue.find(v => v.metadata)?.metadata;

  const handleOptimizePrompt = async () => {
    const apiKey = settings.geminiApiKey;
    if (!apiKey || !presets.currentInstruction) return;
    presets.setIsOptimizing(true);
    try {
      // Get the current preset's category for context-aware optimization
      const activePreset = presets.presets.find(p => p.id === presets.activePresetId);
      const category = activePreset?.category || 'generic';
      const optimized = await optimizeSystemInstruction(apiKey, presets.currentInstruction, category);
      presets.updateCurrentPresetInstruction(optimized);
    } catch (err) {
      console.error(err);
    } finally {
      presets.setIsOptimizing(false);
    }
  };

  const handleDeletePreset = (id: string) => {
    const action = presets.deletePreset(id);
    if (action) {
      setConfirmAction({
        isOpen: true,
        ...action,
        onConfirm: () => {
          action.onConfirm();
          setConfirmAction(prev => ({ ...prev, isOpen: false }));
        }
      });
    }
  };

  const handleResetDefaults = () => {
    const action = presets.resetToDefaults();
    setConfirmAction({
      isOpen: true,
      ...action,
      onConfirm: () => {
        action.onConfirm();
        setConfirmAction(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleImportPresets = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const result = await presets.handleImportPresets(e);
    if (result.error) {
      analysis.setError(result.error);
    } else if (result.imported === 0) {
      analysis.setError('No new presets to import (duplicates skipped)');
    } else {
      // Clear any existing error and let the UI update naturally
      analysis.setError(null);
    }
  };

  const handleRunAnalysis = () => {
    analysis.runAnalysis(
      provider,
      settings.geminiApiKey,
      presets.currentInstruction,
      presets.currentMaxDuration,
      provider === 'custom' ? settings.customConfig : undefined
    );
  };

  const handleLoadProject = (project: Project) => {
    // Load clips from saved project into the analysis state
    analysis.loadClipsFromProject(project.clips, project.videoFilenames);
    setIsProjectsOpen(false);
  };

  const handleConfirmAction = (action: { title: string; message: string; onConfirm: () => void }) => {
    setConfirmAction({
      isOpen: true,
      ...action,
      onConfirm: () => {
        action.onConfirm();
        setConfirmAction(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get unique source files for export
  const sourceFiles = [...new Set(analysis.allClips.map(c => c.sourceFile).filter(Boolean))] as string[];
  const hasMultipleSources = sourceFiles.length > 1;

  // Get display name for custom model
  const customModelDisplay = appSettings.openrouterModels.find(m => m.id === settings.customConfig.model)?.name
    || settings.customConfig.model.split('/').pop()
    || 'Custom';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans selection:bg-amber-500/30">
      {/* Confirmation Modal */}
      {confirmAction.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-500 mb-4">
              <AlertCircle size={24} />
              <h3 className="text-lg font-bold text-white">{confirmAction.title}</h3>
            </div>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">{confirmAction.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.onConfirm}
                className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-red-900/20 transition-all"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        appSettings={appSettings}
      />

      {/* Caption Modal */}
      <CaptionModal
        isOpen={captionModal.isOpen}
        onClose={() => setCaptionModal({ isOpen: false, mode: 'clip' })}
        apiKey={settings.geminiApiKey}
        clip={captionModal.clip}
        clips={analysis.allClips}
        initialMode={captionModal.mode}
        videoFilename={sourceFiles[0]}
      />

      {/* Music Panel */}
      <MusicPanel
        music={music}
        clips={analysis.allClips}
        jamendoClientId={settings.jamendoClientId}
        directoryHandle={presets.directoryHandle}
        onRequestFolderLink={() => setIsSettingsOpen(true)}
      />

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)]">
              <Zap className="text-zinc-900" size={20} fill="currentColor" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              FPV<span className="text-zinc-500 font-light">.AI</span> Editor
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Provider Toggle */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              <button
                onClick={() => updateProvider('gemini')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  provider === 'gemini'
                    ? 'bg-amber-500 text-zinc-950'
                    : 'text-zinc-500 hover:text-white'
                }`}
              >
                <Cloud size={12} /> Gemini
              </button>
              <button
                onClick={() => updateProvider('custom')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  provider === 'custom'
                    ? 'bg-purple-500 text-white'
                    : 'text-zinc-500 hover:text-white'
                }`}
              >
                <Server size={12} /> Custom
              </button>
            </div>

            {/* Provider indicator / Quick info */}
            {provider === 'custom' && (
              <span className="text-xs text-purple-400 max-w-[120px] truncate" title={settings.customConfig.model}>
                {customModelDisplay}
              </span>
            )}

            {/* Projects Button */}
            <button
              onClick={() => setIsProjectsOpen(!isProjectsOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isProjectsOpen
                  ? 'bg-purple-500 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
              }`}
            >
              <FolderOpen size={16} />
              {projects.projects.length > 0 && (
                <span className={`text-xs ${isProjectsOpen ? 'text-purple-200' : 'text-zinc-500'}`}>
                  {projects.projects.length}
                </span>
              )}
            </button>

            {/* Music Button */}
            <button
              onClick={() => music.openPanel('all_clips')}
              disabled={analysis.allClips.length === 0}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                music.isOpen
                  ? 'bg-emerald-500 text-zinc-950'
                  : analysis.allClips.length === 0
                    ? 'bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
              }`}
              title={analysis.allClips.length === 0 ? 'Analyze clips first' : 'Find music for all clips'}
            >
              <Music size={16} />
            </button>

            {/* Settings Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
            >
              <Settings size={16} />
            </button>

            <button
              onClick={() => setIsPromptLabOpen(!isPromptLabOpen)}
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

      {/* Prompt Lab Slide-in Panel */}
      <PromptLab
        isOpen={isPromptLabOpen}
        presets={presets.filteredPresets}
        activeCategory={presets.activeCategory}
        activePresetId={presets.activePresetId}
        currentInstruction={presets.currentInstruction}
        currentMaxDuration={presets.currentMaxDuration}
        newPresetName={presets.newPresetName}
        isOptimizing={presets.isOptimizing}
        apiKey={settings.geminiApiKey}
        directoryHandle={presets.directoryHandle}
        hasPendingHandle={presets.hasPendingHandle}
        supportsFileSystemAccess={presets.supportsFileSystemAccess}
        importInputRef={presets.importInputRef}
        autoBackupEnabled={presets.autoBackupEnabled}
        lastBackupTime={presets.lastBackupTime}
        onClose={() => setIsPromptLabOpen(false)}
        onCategoryChange={presets.setActiveCategory}
        onActivePresetChange={presets.setActivePresetId}
        onInstructionChange={presets.updateCurrentPresetInstruction}
        onDurationChange={presets.updateCurrentPresetDuration}
        onNewPresetNameChange={presets.setNewPresetName}
        onSavePreset={presets.savePreset}
        onDeletePreset={handleDeletePreset}
        onResetDefaults={handleResetDefaults}
        onOptimizePrompt={handleOptimizePrompt}
        onImportPresets={handleImportPresets}
        onConnectFolder={presets.connectToLocalFolder}
        onAutoBackupChange={presets.setAutoBackupEnabled}
        onBackupNow={presets.triggerBackupNow}
      />

      {/* Projects Sidebar */}
      <ProjectsSidebar
        isOpen={isProjectsOpen}
        onClose={() => setIsProjectsOpen(false)}
        projects={projects}
        currentClips={analysis.allClips}
        videoFilenames={analysis.videoQueue.map(v => v.file.name)}
        hasUnsavedChanges={analysis.allClips.length > 0 && !projects.currentProjectId}
        activePresetId={presets.activePresetId}
        activePresetInstruction={presets.currentInstruction}
        provider={provider}
        onLoadProject={handleLoadProject}
        onConfirmAction={handleConfirmAction}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* Video Player */}
            <div className="relative group">
              {analysis.activeVideoUrl ? (
                <>
                  <VideoPlayer
                    src={analysis.activeVideoUrl}
                    startTime={analysis.currentStart}
                    endTime={analysis.currentEnd}
                    autoPlay={true}
                  />
                  {analysis.activeVideoName && (
                    <div className="absolute top-3 left-3 px-2 py-1 bg-black/70 rounded text-xs text-zinc-300 flex items-center gap-1.5">
                      <Film size={12} />
                      {analysis.activeVideoName}
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full aspect-video bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center gap-4 text-zinc-600 group-hover:border-zinc-700 transition-colors">
                  <Video size={48} className="opacity-50" />
                  <p className="text-sm font-medium">Drop Footage Here</p>
                </div>
              )}
            </div>

            {/* Upload & Analyze Controls */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg">
              <div className="flex items-center gap-4">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-3 px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors">
                    <Upload size={18} className="text-zinc-400" />
                    <span className="text-sm font-medium truncate">
                      {analysis.videoQueue.length > 0
                        ? `${analysis.videoQueue.length} video${analysis.videoQueue.length > 1 ? 's' : ''} queued`
                        : "Select Videos (multi-select supported)"}
                    </span>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="video/*"
                    multiple
                    onChange={analysis.handleFilesUpload}
                  />
                </label>
                <button
                  onClick={handleRunAnalysis}
                  disabled={analysis.videoQueue.length === 0 || analysis.isBusy}
                  className={`px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-all min-w-[140px] justify-center ${
                    analysis.isBusy
                      ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/20 border border-amber-500/30'
                      : 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-lg shadow-amber-500/10'
                  }`}
                >
                  {analysis.isBusy ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} fill="currentColor" />}
                  {analysis.isBusy ? "Processing" : "Analyze"}
                </button>
              </div>

              {/* Video Queue */}
              {analysis.videoQueue.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="font-medium uppercase tracking-wide">Video Queue</span>
                    {!analysis.isBusy && (
                      <button
                        onClick={analysis.clearQueue}
                        className="text-zinc-600 hover:text-red-400 transition-colors"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {analysis.videoQueue.map(item => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 px-3 py-2 bg-zinc-950 rounded-lg text-xs"
                      >
                        <div className="flex-shrink-0">
                          {item.status === 'pending' && <div className="w-3 h-3 rounded-full bg-zinc-600" />}
                          {item.status === 'uploading' && <CloudUpload size={12} className="text-cyan-400 animate-bounce" />}
                          {item.status === 'processing' && <Cpu size={12} className="text-amber-400 animate-pulse" />}
                          {item.status === 'analyzing' && <Sparkles size={12} className="text-purple-400 animate-pulse" />}
                          {item.status === 'complete' && <CheckCircle2 size={12} className="text-green-500" />}
                          {item.status === 'error' && <XCircle size={12} className="text-red-500" />}
                        </div>
                        <span className="flex-1 truncate text-zinc-400">{item.file.name}</span>
                        {item.status === 'complete' && (
                          <span className="text-green-500/70">{item.clips.length} clips</span>
                        )}
                        {item.status === 'error' && (
                          <span className="text-red-400 truncate max-w-[100px]" title={item.error}>
                            {item.error}
                          </span>
                        )}
                        {!analysis.isBusy && item.status === 'pending' && (
                          <button
                            onClick={() => analysis.removeFromQueue(item.id)}
                            className="text-zinc-600 hover:text-red-400 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress Indicator */}
              {analysis.isBusy && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-3 text-sm font-medium ${
                      analysis.uploadPhase === 'uploading' ? 'text-cyan-400' :
                      analysis.uploadPhase === 'processing' ? 'text-amber-400' :
                      analysis.uploadPhase === 'extracting' ? 'text-orange-400' :
                      'text-purple-400'
                    }`}>
                      {analysis.uploadPhase === 'uploading' && <CloudUpload size={16} className="animate-bounce" />}
                      {analysis.uploadPhase === 'processing' && <Cpu size={16} className="animate-pulse" />}
                      {analysis.uploadPhase === 'extracting' && <Film size={16} className="animate-pulse" />}
                      {analysis.uploadPhase === 'analyzing' && <Sparkles size={16} className="animate-pulse" />}
                      <span>
                        {analysis.queueProgress.total > 1 && (
                          <span className="text-zinc-500 mr-2">
                            [{analysis.queueProgress.current}/{analysis.queueProgress.total}]
                          </span>
                        )}
                        {analysis.phaseDetail || (
                          <>
                            {analysis.uploadPhase === 'uploading' && "Uploading to Gemini..."}
                            {analysis.uploadPhase === 'processing' && `Processing (${analysis.processingProgress.attempt}/${analysis.processingProgress.maxAttempts})...`}
                            {analysis.uploadPhase === 'extracting' && "Extracting video frames..."}
                            {analysis.uploadPhase === 'analyzing' && "AI analyzing footage..."}
                          </>
                        )}
                      </span>
                    </div>
                    <span className={`font-mono font-bold tabular-nums text-sm ${
                      provider === 'custom' ? 'text-purple-500' : 'text-amber-500'
                    }`}>
                      {Math.floor(analysis.elapsedTime / 60)}:{String(analysis.elapsedTime % 60).padStart(2, '0')}
                    </span>
                  </div>
                  {analysis.uploadPhase === 'processing' && (
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                        style={{ width: `${Math.min((analysis.processingProgress.attempt / analysis.processingProgress.maxAttempts) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Error Display */}
              {analysis.error && (
                <div className="mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-3 text-red-400 text-sm">
                  <AlertTriangle size={16} />
                  {analysis.error}
                </div>
              )}
            </div>

            {/* Export Panel */}
            {analysis.allClips.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
                <div className="p-4 border-b border-zinc-800 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Export Supercut</h3>
                      {hasMultipleSources && (
                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] font-medium rounded">
                          {sourceFiles.length} sources
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => downloadFile(generateEDLWithMode(sourceFiles[0] || 'video.mp4', analysis.allClips, exportMode), 'FPV_Supercut.edl')}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded flex items-center gap-2 transition-colors"
                      >
                        <Monitor size={12} /> EDL
                      </button>
                      <button
                        onClick={() => downloadFile(generateFFmpegScriptWithMode(sourceFiles[0] || 'video.mp4', analysis.allClips, 'unix', exportMode), 'stitch.sh')}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded flex items-center gap-2 transition-colors"
                      >
                        <FileCode size={12} /> FFmpeg
                      </button>
                      <button
                        onClick={() => {
                          const fcpxmlOptions: FCPXMLOptions = {
                            audioFilename: music.selectedTrack?.filename,
                            metadata: firstVideoMetadata,
                          };
                          downloadFile(
                            generateFCPXMLWithMode(exportProjectName, analysis.allClips, exportMode, fcpxmlOptions),
                            exportFilename
                          );
                        }}
                        className="px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 text-orange-400 text-xs rounded flex items-center gap-2 transition-colors"
                        title={`Export as FCPXML for DaVinci Resolve${firstVideoMetadata ? ` (${firstVideoMetadata.fps}fps ${firstVideoMetadata.width}x${firstVideoMetadata.height})` : ''}${music.selectedTrack ? ` with music: ${music.selectedTrack.track.name}` : ''}`}
                      >
                        <Film size={12} /> DaVinci {music.selectedTrack && <Music size={10} className="text-emerald-400" />}
                      </button>
                      <button
                        onClick={() => setCaptionModal({ isOpen: true, mode: 'video' })}
                        className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-400 text-xs rounded flex items-center gap-2 transition-colors"
                        title="Generate social media captions for all clips"
                      >
                        <Hash size={12} /> Captions
                      </button>
                    </div>
                  </div>
                  {/* Export Mode Toggle - show when Smart Edit data is present */}
                  {analysis.allClips.some(c => c.section_type) && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Mode:</span>
                      <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
                        <button
                          onClick={() => setExportMode('highlights_only')}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                            exportMode === 'highlights_only'
                              ? 'bg-green-500 text-zinc-950'
                              : 'text-zinc-500 hover:text-white'
                          }`}
                        >
                          Highlights Only
                        </button>
                        <button
                          onClick={() => setExportMode('full_edit')}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                            exportMode === 'full_edit'
                              ? 'bg-amber-500 text-zinc-950'
                              : 'text-zinc-500 hover:text-white'
                          }`}
                        >
                          Full Edit (Remove Dead Time)
                        </button>
                      </div>
                      <span className="text-[10px] text-zinc-600">
                        {filterClipsForExport(analysis.allClips, exportMode).length} clips
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-4 bg-black/50">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3 font-mono">
                    <Terminal size={14} /> FFmpeg Commands
                  </div>
                  <pre className="text-[10px] font-mono text-zinc-400 overflow-x-auto whitespace-pre p-3 bg-black rounded border border-zinc-800 scrollbar-thin max-h-32">
                    {generateFFmpegScriptWithMode(sourceFiles[0] || 'video.mp4', analysis.allClips, 'unix', exportMode).split('\n').filter((l: string) => l.includes('ffmpeg')).slice(0, 5).join('\n')}
                    {filterClipsForExport(analysis.allClips, exportMode).length > 5 && '\n# ... and more'}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Clips List */}
          <div className="lg:col-span-5 flex flex-col h-[calc(100vh-8rem)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PlayCircle className="text-amber-500" size={20} />
                <h2 className="text-lg font-bold text-white">Analyzed Clips</h2>
              </div>
              {analysis.allClips.length > 0 && (
                <div className="flex items-center gap-2">
                  {/* Section type breakdown when Smart Edit is used */}
                  {analysis.allClips.some(c => c.section_type) ? (
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="text-green-400">{analysis.allClips.filter(c => c.section_type === 'highlight').length} highlights</span>
                      <span className="text-zinc-600">|</span>
                      <span className="text-blue-400">{analysis.allClips.filter(c => c.section_type === 'flow').length} flow</span>
                      <span className="text-zinc-600">|</span>
                      <span className="text-yellow-400">{analysis.allClips.filter(c => c.section_type === 'transition').length} transitions</span>
                      <span className="text-zinc-600">|</span>
                      <span className="text-red-400">{analysis.allClips.filter(c => c.section_type === 'dead_time').length} dead</span>
                    </div>
                  ) : (
                    <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-500 rounded">
                      {analysis.allClips.length} HIGHLIGHTS
                      {hasMultipleSources && ` / ${sourceFiles.length} VIDEOS`}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3 pb-8 scrollbar-thin">
              {analysis.allClips.length === 0 && !analysis.isBusy ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-800 rounded-xl p-8 bg-zinc-900/20">
                  <Zap className="opacity-10 mb-4" size={48} />
                  <p className="text-center text-sm opacity-50">Upload footage to begin highlight extraction.</p>
                </div>
              ) : (
                analysis.allClips.map((clip, idx) => (
                  <ClipCard
                    key={idx}
                    index={idx}
                    clip={clip}
                    filename={clip.sourceFile || 'video.mp4'}
                    onPlay={() => analysis.handlePlayClip(clip, idx)}
                    onCaption={() => setCaptionModal({ isOpen: true, clip, mode: 'clip' })}
                    onMusic={() => music.openPanel('single_clip', idx)}
                    isActive={analysis.activeClipIndex === idx}
                    showSource={hasMultipleSources}
                  />
                ))
              )}
              {analysis.isBusy && (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-32 bg-zinc-900/50 rounded-xl border border-zinc-800" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
