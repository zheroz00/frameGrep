import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AlertCircle, Film, Loader2, Upload, Video } from 'lucide-react';
import { optimizeSystemInstruction } from './services/geminiService';
import VideoPlayer, { VideoPlayerHandle } from './components/VideoPlayer';
import ClipTimeline from './components/ClipTimeline';
import NowPlayingBar from './components/NowPlayingBar';
import PromptLab from './components/PromptLab';
import SettingsModal from './components/settings/SettingsModal';
import ProjectsSidebar from './components/ProjectsSidebar';
import CaptionModal from './components/CaptionModal';
import MusicPanel from './components/MusicPanel';
import MarlinSearchPanel from './components/MarlinSearchPanel';
import AppHeader from './components/layout/AppHeader';
import SourcePanel from './components/SourcePanel';
import ExportPanel from './components/ExportPanel';
import ClipList from './components/ClipList';
import { isLocalProvider } from './utils/providerUtils';
import { usePresets } from './hooks/usePresets';
import { useVideoAnalysis } from './hooks/useVideoAnalysis';
import { useAppSettings } from './hooks/useAppSettings';
import { useProjects } from './hooks/useProjects';
import { useMusic } from './hooks/useMusic';
import { useClipReview } from './hooks/useClipReview';
import { useFileDrop } from './hooks/useFileDrop';
import { usePreviewProxy } from './hooks/usePreviewProxy';
import { buildTimelineSegments, timelineSpan } from './domain/review';
import { rememberFolder } from './utils/recentFolders';
import { summarizeKeptCut } from './utils/reviewTimeline';
import { getEDLCompatibility, getSourceIdentityIssue } from './utils/exportUtils';
import { resolveCaptionBackend } from './services/captionService';
import { ExportMode, Project, ClipSegment, CaptionMode } from './types';

const serializeComparable = (value: unknown): string => JSON.stringify(value ?? null);

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
  const { settings, updateProvider, updateSettings } = appSettings;
  const captionBackend = resolveCaptionBackend(settings);
  const provider = settings.provider;
  const currentVideoSources = analysis.videoQueue.map(v => v.source);

  // Compute export helpers
  const currentProject = projects.currentProjectId
    ? projects.projects.find(p => p.id === projects.currentProjectId)
    : null;
  const exportProjectName = currentProject?.name || 'FPV_Supercut';
  const exportFilename = `${exportProjectName.replace(/[^a-z0-9]/gi, '_')}.fcpxml`;

  // Get video metadata from first video in queue (for FCPXML export)
  const firstVideoMetadata = analysis.videoQueue.find(v => v.metadata)?.metadata;
  const currentProjectMetadata = useMemo(() => ({
    presetId: presets.activePresetId,
    presetInstruction: presets.currentInstruction,
    provider,
    selectedMusic: music.selectedTrack,
  }), [
    presets.activePresetId,
    presets.currentInstruction,
    provider,
    music.selectedTrack,
  ]);

  const hasUnsavedChanges = useMemo(() => {
    if (!currentProject) {
      return analysis.allClips.length > 0;
    }

    return (
      currentProject.presetId !== currentProjectMetadata.presetId ||
      currentProject.presetInstruction !== currentProjectMetadata.presetInstruction ||
      currentProject.provider !== currentProjectMetadata.provider ||
      serializeComparable(currentProject.sources) !== serializeComparable(currentVideoSources) ||
      serializeComparable(currentProject.clips) !== serializeComparable(analysis.allClips) ||
      serializeComparable(currentProject.selectedMusic) !== serializeComparable(currentProjectMetadata.selectedMusic)
    );
  }, [
    currentProject,
    currentProjectMetadata,
    currentVideoSources,
    analysis.allClips,
  ]);

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
      presets.activeCategory,
      {
        localConfig: provider === 'custom' ? {
          ...settings.customConfig,
          contextLength: appSettings.openrouterModels.find(model => model.id === settings.customConfig.model)?.context_length,
        } : undefined,
        geminiModel: settings.geminiModel,
        geminiMediaResolution: settings.geminiMediaResolution,
        geminiFps: settings.geminiFps,
        autoDownsample: settings.autoDownsample,
        marlinEndpoint: settings.marlinEndpoint,
      }
    );
  };

  const handleLoadProject = (project: Project) => {
    updateProvider(project.provider);
    presets.loadProjectPreset(project.presetId, project.presetInstruction);
    music.setSelectedTrack(project.selectedMusic ?? null);
    // Load clips from saved project into the analysis state
    analysis.loadClipsFromProject(project.clips, project.sources);
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

  // Get unique source files for export
  const usedSourceIds = new Set(analysis.allClips.map(clip => clip.sourceId));
  const exportSources = currentVideoSources.filter(source => usedSourceIds.has(source.id));
  const sourceFiles = exportSources.map(source => source.filename);
  const hasMultipleSources = exportSources.length > 1;
  const edlCompatibility = getEDLCompatibility(exportSources);
  const exportIdentityIssue = getSourceIdentityIssue(exportSources);

  // Review desk: player handle, clip map and clip stepping
  const playerRef = useRef<VideoPlayerHandle>(null);
  const getPlayerTime = useCallback(() => playerRef.current?.getCurrentTime() ?? null, []);
  const togglePlayback = useCallback(() => playerRef.current?.togglePlay(), []);
  // Duration reported by the player, used when metadata extraction came back empty.
  const [playerDuration, setPlayerDuration] = useState<{ url: string; seconds: number } | null>(null);

  const activeItem = analysis.videoQueue.find(item => item.source.id === analysis.activeSourceId);
  const activeDuration = activeItem?.metadata?.duration
    || activeItem?.source.metadata?.duration
    || (playerDuration && playerDuration.url === analysis.activeVideoUrl ? playerDuration.seconds : 0);
  const timeline = useMemo(() => ({
    segments: buildTimelineSegments(analysis.allClips, analysis.activeSourceId, activeDuration),
    span: timelineSpan(analysis.allClips, analysis.activeSourceId, activeDuration) || activeDuration,
  }), [analysis.allClips, analysis.activeSourceId, activeDuration]);

  // How much footage the current export mode keeps, across every analyzed video
  const keptCut = useMemo(() => summarizeKeptCut(
    analysis.allClips,
    analysis.videoQueue.filter(item => item.status === 'complete').map(item => item.source),
    exportMode,
  ), [analysis.allClips, analysis.videoQueue, exportMode]);

  const isOverlayOpen = isPromptLabOpen || isSettingsOpen || isProjectsOpen
    || captionModal.isOpen || confirmAction.isOpen || music.isOpen;
  const review = useClipReview({
    clips: analysis.allClips,
    activeIndex: analysis.activeClipIndex,
    exportMode,
    enabled: !isOverlayOpen,
    onPlay: analysis.handlePlayClip,
    onRemove: analysis.removeClipAt,
    canUndo: analysis.lastRemovedClip !== null,
    onUndo: analysis.undoRemoveClip,
    togglePlay: togglePlayback,
  });
  // When the browser cannot decode the video in the player, build a playable copy of it.
  const previewProxy = usePreviewProxy({
    activeItem,
    activeVideoUrl: analysis.activeVideoUrl,
    onReady: analysis.setPreviewProxy,
  });

  const activeClip = analysis.activeClipIndex !== null ? analysis.allClips[analysis.activeClipIndex] ?? null : null;

  // Dropped videos relink a loaded project when it is waiting for its files, else join the queue.
  const { addFiles, relinkVideos, needsRelink } = analysis;
  const handleDroppedFiles = useCallback(async (files: File[]) => {
    if (needsRelink && await relinkVideos(files) > 0) return;
    await addFiles(files);
  }, [needsRelink, relinkVideos, addFiles]);
  const fileDrop = useFileDrop(handleDroppedFiles);

  // Get display name for custom model
  const customModelDisplay = appSettings.openrouterModels.find(m => m.id === settings.customConfig.model)?.name
    || settings.customConfig.model.split('/').pop()
    || 'Custom';

  return (
    <div
      {...fileDrop.dropHandlers}
      className="min-h-screen xl:h-screen xl:overflow-hidden flex flex-col bg-transparent text-zinc-200 font-sans selection:bg-amber-500/30"
    >
      {/* Confirmation Modal */}
      {confirmAction.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
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
        backend={'error' in captionBackend ? null : captionBackend}
        backendError={'error' in captionBackend ? captionBackend.error : undefined}
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
        onLinkFolder={presets.connectToLocalFolder}
        canLinkFolder={presets.supportsFileSystemAccess}
      />

      {/* Header */}
      <AppHeader
        provider={provider}
        onProviderChange={updateProvider}
        customModelId={settings.customConfig.model}
        customModelDisplay={customModelDisplay}
        isProjectsOpen={isProjectsOpen}
        projectCount={projects.projects.length}
        onToggleProjects={() => setIsProjectsOpen(!isProjectsOpen)}
        clipCount={analysis.allClips.length}
        isMusicOpen={music.isOpen}
        onOpenMusic={() => music.openPanel('all_clips')}
        gpuWidgetEnabled={isLocalProvider(settings)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isPromptLabOpen={isPromptLabOpen}
        onTogglePromptLab={() => setIsPromptLabOpen(!isPromptLabOpen)}
      />

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
        backend={'error' in captionBackend ? null : captionBackend}
        backendError={'error' in captionBackend ? captionBackend.error : undefined}
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
        videoSources={currentVideoSources}
        hasUnsavedChanges={hasUnsavedChanges}
        activePresetId={presets.activePresetId}
        activePresetInstruction={presets.currentInstruction}
        provider={provider}
        selectedMusic={music.selectedTrack}
        onLoadProject={handleLoadProject}
        onConfirmAction={handleConfirmAction}
      />


      <main className="flex-1 min-h-0 w-full px-4 sm:px-6 py-5 grid gap-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[300px_minmax(0,1fr)_380px] xl:grid-rows-[minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)_440px] min-[1920px]:grid-cols-[360px_minmax(0,1fr)_480px]">
        {/* Left rail: source + export */}
        <aside className="order-2 lg:order-3 xl:order-1 flex flex-col gap-5 min-w-0 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <SourcePanel
            analysis={analysis}
            provider={provider}
            onAnalyze={handleRunAnalysis}
          />

          {/* Marlin Mode 2: interactive footage search */}
          {provider === 'marlin' && analysis.videoQueue.some(item => item.file.size > 0) && (
            <MarlinSearchPanel
              targetVideoName={analysis.activeVideoName}
              isSearching={analysis.marlinSearch.isSearching}
              result={analysis.marlinSearch.result}
              error={analysis.marlinSearch.error}
              added={analysis.marlinSearch.added}
              onSearch={analysis.searchMarlinVideo}
              onReplay={analysis.previewMarlinSpan}
              onAdd={analysis.addFoundClip}
            />
          )}

          {/* Export Panel */}
          {analysis.allClips.length > 0 && (
            <ExportPanel
              clips={analysis.allClips}
              exportSources={exportSources}
              exportMode={exportMode}
              setExportMode={setExportMode}
              davinciMediaFolder={settings.davinciMediaFolder}
              onDavinciMediaFolderChange={(folder) => updateSettings({ davinciMediaFolder: folder })}
              recentFolders={settings.davinciRecentFolders ?? []}
              onFolderUsed={(folder) => updateSettings({ davinciRecentFolders: rememberFolder(settings.davinciRecentFolders ?? [], folder) })}
              selectedMusic={music.selectedTrack}
              exportProjectName={exportProjectName}
              exportFilename={exportFilename}
              firstVideoMetadata={firstVideoMetadata}
              hasMultipleSources={hasMultipleSources}
              sourceFiles={sourceFiles}
              edlCompatibility={edlCompatibility}
              exportIdentityIssue={exportIdentityIssue}
              onOpenCaptions={() => setCaptionModal({ isOpen: true, mode: 'video' })}
            />
          )}
        </aside>

        {/* Center: player */}
        <section className="order-1 xl:order-2 flex flex-col gap-4 min-w-0 xl:min-h-0">
          <div className="relative xl:flex-1 xl:min-h-0">
            {analysis.activeVideoUrl ? (
              <>
                <VideoPlayer
                  ref={playerRef}
                  src={analysis.activeVideoUrl}
                  startTime={analysis.currentStart}
                  endTime={analysis.currentEnd}
                  autoPlay={true}
                  playToken={analysis.playToken}
                  onSegmentEnd={review.handleSegmentEnd}
                  onDuration={seconds => setPlayerDuration({ url: analysis.activeVideoUrl ?? '', seconds })}
                  onUnplayable={previewProxy.reportUnplayable}
                />
                {previewProxy.state.status !== 'idle' && (
                  <div role="status" className="absolute inset-0 rounded-lg bg-zinc-950/95 flex flex-col items-center justify-center gap-3 px-6 text-center">
                    {previewProxy.state.status === 'building' ? (
                      <>
                        <Loader2 size={28} className="text-amber-400 animate-spin motion-reduce:animate-none" />
                        <p className="text-sm font-medium text-zinc-200">Making a preview copy this browser can play</p>
                        <p className="text-xs text-zinc-400 max-w-[60ch] leading-relaxed">
                          This browser can't decode the video's format (often 10-bit HEVC from DJI cameras).
                          Your original file is untouched and is still what gets exported.
                        </p>
                        <p className="text-xs text-zinc-500 tabular-nums">{previewProxy.state.detail}</p>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={28} className="text-red-400" />
                        <p className="text-sm font-medium text-zinc-200">This browser can't play this video</p>
                        <p className="text-xs text-zinc-400 max-w-[60ch] leading-relaxed">{previewProxy.state.message}</p>
                        <button
                          type="button"
                          onClick={previewProxy.retry}
                          className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-medium text-zinc-200 hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
                        >
                          Try again
                        </button>
                      </>
                    )}
                  </div>
                )}
                {analysis.activeVideoName && (
                  <div className="absolute top-3 left-3 max-w-[70%] px-2 py-1 bg-black/70 rounded text-xs text-zinc-300 flex items-center gap-1.5 pointer-events-none">
                    <Film size={12} className="shrink-0" />
                    <span className="truncate">{analysis.activeVideoName}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full aspect-video xl:aspect-auto xl:h-full bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center gap-3 text-zinc-500">
                <Video size={48} className="opacity-40" />
                <p className="text-sm font-medium text-zinc-400">Drop footage here</p>
                <p className="text-xs">or use Select videos to pick files</p>
              </div>
            )}
            {fileDrop.isDragging && (
              <div className="absolute inset-0 z-10 rounded-xl border-2 border-dashed border-amber-500 bg-zinc-950/85 flex flex-col items-center justify-center gap-3 text-amber-400 pointer-events-none">
                <Upload size={32} />
                <p className="text-sm font-medium">
                  {analysis.needsRelink ? 'Drop to relink the project videos' : 'Drop to add to the queue'}
                </p>
              </div>
            )}
          </div>
          <ClipTimeline
            segments={timeline.segments}
            clips={analysis.allClips}
            span={timeline.span}
            activeIndex={analysis.activeClipIndex}
            getTime={getPlayerTime}
            onSelect={index => analysis.handlePlayClip(analysis.allClips[index])}
          />
          <NowPlayingBar
            clip={activeClip}
            index={analysis.activeClipIndex}
            total={analysis.allClips.length}
            canPrev={review.canPrev}
            canNext={review.canNext}
            onPrev={review.goPrev}
            onNext={review.goNext}
            playAll={review.playAll}
            onTogglePlayAll={review.togglePlayAll}
            playableCount={review.playableCount}
          />
        </section>

        {/* Right rail: clips */}
        <aside className="order-3 lg:order-2 xl:order-3 lg:row-span-2 xl:row-span-1 min-w-0 h-[70vh] lg:h-[calc(100vh-6.5rem)] lg:sticky lg:top-[5.25rem] lg:self-start xl:static xl:h-auto xl:min-h-0 xl:self-stretch">
          <ClipList
            clips={analysis.allClips}
            sources={currentVideoSources}
            isBusy={analysis.isBusy}
            activeClipIndex={analysis.activeClipIndex}
            hasMultipleSources={hasMultipleSources}
            sourceCount={sourceFiles.length}
            onPlay={analysis.handlePlayClip}
            onCaption={(clip) => setCaptionModal({ isOpen: true, clip, mode: 'clip' })}
            onMusic={(idx) => music.openPanel('single_clip', idx)}
            onRemove={analysis.removeClipAt}
            keptCut={keptCut}
            exportMode={exportMode}
            lastRemovedClip={analysis.lastRemovedClip}
            onUndoRemove={analysis.undoRemoveClip}
          />
        </aside>
      </main>
    </div>
  );
}
