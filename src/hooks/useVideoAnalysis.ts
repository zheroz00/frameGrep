import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react';
import { uploadVideo, analyzeVideo, UploadPhase } from '../services/geminiService';
import { analyzeVideoLocal, analyzeVideoNative, LocalVLMConfig } from '../services/localVLMService';
import { analyzeVideoMarlin, findInVideoMarlin, MarlinFindResult, MarlinFindOptions } from '../services/marlinService';
import { extractVideoMetadata } from '../services/mediaInfoService';
import { shouldTranscode, transcodeVideo } from '../services/transcodeService';
import { renderFpvMoveDictionary } from '../constants/fpvMoves';
import { AppStatus, ClipSegment, RawClipSegment, VideoQueueItem, QueueItemStatus, AnalysisProvider, VideoMetadata, VideoSource, PresetCategory, GeminiModel, GeminiMediaResolution } from '../types';
import { createVideoSource, formatTimestamp, normalizeRawClips, parseTimestamp } from '../domain/media';
import { relinkProjectSources } from '../domain/project';
import { generateId } from '../utils/ids';

export type AnalysisPhase = UploadPhase | 'analyzing' | 'extracting';

/** Parses MM:SS or HH:MM:SS to seconds */
export const parseTime = (timeStr: string): number => {
  return parseTimestamp(timeStr) ?? 0;
};

/** Formats seconds to "MM:SS" (inverse of parseTime, for spans returned in seconds). */
export const secondsToMmss = (seconds: number): string => {
  return formatTimestamp(seconds);
};

/**
 * Preview playback source: prefer the low-res transcoded proxy when present so the
 * browser decodes/seeks smoothly (4K/100fps 10-bit HEVC originals stutter). Falls
 * back to the original upload URL when there's no proxy (e.g. frame-extraction path).
 */
const previewUrlFor = (item: VideoQueueItem): string => item.transcodedUrl || item.url;

/** Parse error message and provide user-friendly suggestions */
const formatErrorMessage = (error: string, provider: AnalysisProvider): string => {
  // Gemini file size limit (413 or "too large")
  if (error.includes('413') || error.toLowerCase().includes('too large')) {
    if (provider === 'gemini') {
      return 'Video file too large for Gemini (2GB limit). Try: 1) Switch to Custom provider (uses frame extraction), or 2) Transcode with: ffmpeg -i input.mp4 -c:v hevc_nvenc -preset p4 -cq 28 output.mp4';
    }
    return 'File too large. Try transcoding: ffmpeg -i input.mp4 -c:v hevc_nvenc -preset p4 -cq 28 output.mp4';
  }

  // Gemini video duration/processing limits
  if (error.includes('video') && (error.includes('duration') || error.includes('long'))) {
    return 'Video too long for Gemini. Try: 1) Switch to Custom provider, or 2) Split video into shorter segments';
  }

  // Rate limiting
  if (error.includes('429') || error.toLowerCase().includes('rate limit')) {
    return 'Rate limited. Wait a moment and try again, or switch providers.';
  }

  // Too many images for VLM
  if (error.toLowerCase().includes('too many images') || error.toLowerCase().includes('image limit')) {
    return 'Too many frames for model. The adaptive frame rate should handle this - please report if you see this error.';
  }

  return error;
};

/** Builds temporal constraint suffix for Gemini instruction based on content category */
const buildTemporalConstraint = (maxDuration: number, category: PresetCategory = 'generic'): string => {
  if (category === 'fpv') {
    // FPV-specific: emphasize maneuvers, flow, drone terminology
    const minDuration = Math.max(3, Math.floor(maxDuration / 2));
    return `\n\nCRITICAL CLIP DURATION RULES:
1. TARGET DURATION: Aim for ${minDuration}-${maxDuration} seconds per clip. Shorter clips lose context.
2. COMPLETE MANEUVERS: Each clip MUST capture the FULL maneuver from setup to completion. Include the approach, the trick, AND the exit.
3. CONNECTED MOVES: If maneuvers flow together (e.g., proximity pass into a power loop, or dive into a roll), capture them as ONE clip, not separate clips.
4. NEVER cut a clip mid-maneuver. Wait for the drone to stabilize or transition before ending.
5. When in doubt, make the clip LONGER to preserve context, up to ${maxDuration} seconds.`;
  }

  // Generic/custom: flexible durations, neutral language
  return `\n\nCLIP DURATION GUIDELINES:
1. MAXIMUM: ${maxDuration} seconds per clip. Shorter clips are fine when the moment is complete.
2. COMPLETE MOMENTS: Each clip should capture the full action or interaction from start to finish.
3. NATURAL BOUNDARIES: End clips at natural pause points, scene changes, or when the moment concludes.
4. FLEXIBILITY: A 3-second clip showing a quick action is valid. A 20-second clip showing a complex sequence is also valid. Match duration to content.
5. CONNECTED SEQUENCES: If actions flow together naturally, capture them as one clip rather than fragmenting.`;
};

export interface UseVideoAnalysisReturn {
  // Queue state
  videoQueue: VideoQueueItem[];
  activeVideoUrl: string | null;
  activeVideoName: string | null;

  // Combined clips from all videos
  allClips: ClipSegment[];

  // Status
  status: AppStatus;
  error: string | null;
  uploadPhase: AnalysisPhase;
  phaseDetail: string | null;
  elapsedTime: number;
  processingProgress: { attempt: number; maxAttempts: number };
  queueProgress: { current: number; total: number };
  isBusy: boolean;

  // Playback state
  currentStart: number | undefined;
  currentEnd: number | undefined;
  activeClipIndex: number | null;

  // Relink support (for loaded projects)
  needsRelink: boolean;
  missingVideos: string[];

  // Actions
  handleFilesUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  removeFromQueue: (id: string) => void;
  retryItem: (id: string) => void;
  cancelAnalysis: () => void;
  clearQueue: () => void;
  runAnalysis: (
    provider: AnalysisProvider,
    apiKey: string,
    instruction: string,
    maxDuration: number,
    category: PresetCategory,
    options?: {
      localConfig?: LocalVLMConfig;
      geminiModel?: GeminiModel;
      geminiMediaResolution?: GeminiMediaResolution;
      geminiFps?: number;
      autoDownsample?: boolean;
      marlinEndpoint?: string;
    }
  ) => Promise<void>;
  handlePlayClip: (clip: ClipSegment, index: number) => void;

  // Marlin Mode 2 — interactive footage search
  marlinSearch: {
    isSearching: boolean;
    query: string;
    result: MarlinFindResult | null;
    error: string | null;
    added: boolean;
  };
  searchMarlinVideo: (query: string, opts?: MarlinFindOptions) => Promise<void>;
  previewMarlinSpan: () => void;
  addFoundClip: () => void;
  removeClipAt: (globalIndex: number) => void;

  setError: (error: string | null) => void;
  loadClipsFromProject: (clips: ClipSegment[], sources: VideoSource[]) => void;
  relinkVideos: (files: FileList | File[]) => Promise<number>;
}

export function useVideoAnalysis(): UseVideoAnalysisReturn {
  const [videoQueue, setVideoQueue] = useState<VideoQueueItem[]>([]);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [error, setError] = useState<string | null>(null);

  // Progress tracking
  const [uploadPhase, setUploadPhase] = useState<AnalysisPhase>('uploading');
  const [phaseDetail, setPhaseDetail] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [processingProgress, setProcessingProgress] = useState({ attempt: 0, maxAttempts: 150 });
  const [queueProgress, setQueueProgress] = useState({ current: 0, total: 0 });
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const queueRef = useRef<VideoQueueItem[]>([]);

  // Playback state
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [activeVideoName, setActiveVideoName] = useState<string | null>(null);
  const [currentStart, setCurrentStart] = useState<number | undefined>(undefined);
  const [currentEnd, setCurrentEnd] = useState<number | undefined>(undefined);
  const [activeClipIndex, setActiveClipIndex] = useState<number | null>(null);

  // Marlin Mode 2 — interactive footage search (find mode). Independent of the analysis
  // queue: the user types a query, we resolve it to a span and preview it in the player.
  const [marlinSearch, setMarlinSearch] = useState<{
    isSearching: boolean;
    query: string;
    result: MarlinFindResult | null;
    error: string | null;
    added: boolean;
  }>({ isSearching: false, query: '', result: null, error: null, added: false });

  const isBusy = status === AppStatus.UPLOADING || status === AppStatus.PROCESSING || status === AppStatus.ANALYZING;

  // Combine all clips from queue
  const allClips = videoQueue.flatMap(item => item.clips);

  useEffect(() => { queueRef.current = videoQueue; }, [videoQueue]);

  // Check if any videos need relinking (loaded from project but no actual file)
  const missingVideos = videoQueue
    .filter(item => !item.url && item.file.size === 0)
    .map(item => item.file.name);
  const needsRelink = missingVideos.length > 0;

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
      queueRef.current.forEach(item => {
        if (item.url) URL.revokeObjectURL(item.url);
        if (item.transcodedUrl) URL.revokeObjectURL(item.transcodedUrl);
      });
    };
  }, []);

  const handleFilesUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const reservedIds = new Set(videoQueue.map(item => item.source.id));
    const newItems: VideoQueueItem[] = Array.from(files as FileList, (file: File) => {
      let source = createVideoSource(file);
      if (reservedIds.has(source.id)) source = { ...source, id: `${source.id}-${generateId()}` };
      reservedIds.add(source.id);
      return {
      id: source.id,
      source,
      file,
      url: URL.createObjectURL(file),
      status: 'pending' as QueueItemStatus,
      clips: [],
    }});

    setVideoQueue(prev => [...prev, ...newItems]);
    setStatus(AppStatus.IDLE);
    setError(null);

    // Set first video as active for preview if none selected
    if (!activeVideoUrl && newItems.length > 0) {
      setActiveVideoUrl(previewUrlFor(newItems[0]));
      setActiveVideoName(newItems[0].file.name);
    }

    // Reset input
    e.target.value = '';

    // Extract metadata for each video in background
    for (const item of newItems) {
      try {
        const metadata = await extractVideoMetadata(item.file);
        setVideoQueue(prev => prev.map(qItem =>
          qItem.id === item.id ? { ...qItem, metadata, source: { ...qItem.source, metadata } } : qItem
        ));
      } catch (err) {
        console.warn(`Failed to extract metadata for ${item.file.name}:`, err);
      }
    }
  }, [activeVideoUrl, videoQueue]);

  const removeFromQueue = useCallback((id: string) => {
    setVideoQueue(prev => {
      const item = prev.find(i => i.id === id);
      if (item?.url) URL.revokeObjectURL(item.url);
      if (item?.transcodedUrl) URL.revokeObjectURL(item.transcodedUrl);

      const updated = prev.filter(i => i.id !== id);

      // Update active video if removed (activeVideoUrl may be the original OR the proxy)
      if (item && activeVideoUrl && (item.url === activeVideoUrl || item.transcodedUrl === activeVideoUrl)) {
        const nextItem = updated[0];
        setActiveVideoUrl(nextItem ? previewUrlFor(nextItem) : null);
        setActiveVideoName(nextItem?.file.name || null);
      }

      return updated;
    });
  }, [activeVideoUrl]);

  const clearQueue = useCallback(() => {
    videoQueue.forEach(item => {
      if (item.url) URL.revokeObjectURL(item.url);
      if (item.transcodedUrl) URL.revokeObjectURL(item.transcodedUrl);
    });
    setVideoQueue([]);
    setActiveVideoUrl(null);
    setActiveVideoName(null);
    setActiveClipIndex(null);
    setCurrentStart(undefined);
    setCurrentEnd(undefined);
    setStatus(AppStatus.IDLE);
  }, [videoQueue]);

  const updateQueueItem = useCallback((id: string, updates: Partial<VideoQueueItem>) => {
    setVideoQueue(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ));
  }, []);

  const retryItem = useCallback((id: string) => {
    updateQueueItem(id, { status: 'pending', error: undefined, clips: [] });
    setError(null);
    setStatus(AppStatus.IDLE);
  }, [updateQueueItem]);

  const cancelAnalysis = useCallback(() => {
    abortControllerRef.current?.abort(new DOMException('Analysis cancelled', 'AbortError'));
  }, []);

  const runAnalysis = async (
    provider: AnalysisProvider,
    apiKey: string,
    instruction: string,
    maxDuration: number,
    category: PresetCategory,
    options: {
      localConfig?: LocalVLMConfig;
      geminiModel?: GeminiModel;
      geminiMediaResolution?: GeminiMediaResolution;
      geminiFps?: number;
      autoDownsample?: boolean;
      marlinEndpoint?: string;
    } = {}
  ) => {
    const { localConfig, geminiModel = 'gemini-2.5-flash-lite', geminiMediaResolution = 'low', geminiFps = 1, autoDownsample = true, marlinEndpoint = '/api/marlin' } = options;
    const pendingItems = videoQueue.filter(item => item.status === 'pending');

    if (pendingItems.length === 0) {
      setError("No videos in queue to analyze.");
      return;
    }

    // Validate based on provider
    if (provider === 'gemini' && !apiKey) {
      setError("Please provide a Gemini API Key.");
      return;
    }
    if (provider === 'custom' && !localConfig) {
      setError("Please configure custom model settings.");
      return;
    }

    setStatus(AppStatus.UPLOADING);
    setError(null);
    setElapsedTime(0);
    setPhaseDetail(null);
    setQueueProgress({ current: 0, total: pendingItems.length });
    const controller = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;

    // Start elapsed time timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const dictionarySection = category === 'fpv' ? '\n\n' + renderFpvMoveDictionary() : '';
    const finalInstruction = instruction + dictionarySection + buildTemporalConstraint(maxDuration, category);

    try {
      for (let i = 0; i < pendingItems.length; i++) {
        const item = pendingItems[i];
        setQueueProgress({ current: i + 1, total: pendingItems.length });

        try {
          let result: RawClipSegment[];

          if (provider === 'marlin') {
            // Local Marlin-2B server. Caption-mode only — `finalInstruction` (preset +
            // FPV dictionary + temporal constraint) is intentionally NOT sent: Marlin
            // only honors its canonical prompt, and overriding it degrades output.
            updateQueueItem(item.id, { status: 'analyzing' });
            setUploadPhase('analyzing');
            setPhaseDetail('Analyzing with Marlin (local)...');

            result = await analyzeVideoMarlin(
              { endpoint: marlinEndpoint },
              item.file,
              (phase, detail) => {
                setUploadPhase(phase as AnalysisPhase);
                setPhaseDetail(detail || null);
                if (phase === 'analyzing') {
                  updateQueueItem(item.id, { status: 'analyzing' });
                }
              },
              controller.signal,
            );
          } else if (provider === 'custom' && localConfig) {
            if (localConfig.useNativeVideo) {
              // Native video path — send full video to vLLM
              updateQueueItem(item.id, { status: 'preparing' });
              setUploadPhase('preparing');
              setPhaseDetail('Preparing native video...');

              result = await analyzeVideoNative(
                localConfig,
                item.file,
                finalInstruction,
                (phase, detail) => {
                  setUploadPhase(phase as AnalysisPhase);
                  setPhaseDetail(detail || null);
                  if (phase === 'analyzing') {
                    updateQueueItem(item.id, { status: 'analyzing' });
                  }
                },
                item.transcodedUrl,
                (proxyFile) => {
                  // Keep the 480p proxy for smooth preview playback (the 4K/100fps
                  // original stutters when the browser software-decodes + seeks it).
                  const proxyUrl = URL.createObjectURL(proxyFile);
                  if (item.transcodedUrl) URL.revokeObjectURL(item.transcodedUrl);
                  updateQueueItem(item.id, { transcodedUrl: proxyUrl, transcodedSize: proxyFile.size });
                },
                controller.signal,
              );
            } else {
              // Frame extraction path — OpenRouter/Ollama/vLLM API call
              updateQueueItem(item.id, { status: 'processing' });
              setUploadPhase('extracting');
              setPhaseDetail('Preparing video frames...');

              result = await analyzeVideoLocal(
                localConfig,
                item.file,
                finalInstruction,
                (phase, detail) => {
                  setUploadPhase(phase as AnalysisPhase);
                  setPhaseDetail(detail || null);
                  if (phase === 'analyzing') {
                    updateQueueItem(item.id, { status: 'analyzing' });
                  }
                },
                controller.signal,
              );
            }
          } else {
            // Gemini path - prepare (transcode if needed) then upload then analyze
            let fileToUpload = item.file;

            const decision = await shouldTranscode(item.file, autoDownsample);
            if (decision.transcode) {
              console.log(`Transcoding ${item.file.name}: ${decision.reason}`);
              updateQueueItem(item.id, { status: 'preparing' });
              setUploadPhase('preparing');
              setPhaseDetail('Transcoding for analysis — connecting...');
              setProcessingProgress({ attempt: 0, maxAttempts: 100 });

              fileToUpload = await transcodeVideo(item.file, (progress) => {
                const receivedMB = progress.receivedBytes / 1_048_576;
                setPhaseDetail(
                  `Transcoding for analysis — ${receivedMB.toFixed(1)} MB received`
                );
                // Drive the progress bar from received/input bytes, capped at 95%
                // (output is usually smaller than input, so we never hit 100% here).
                if (progress.inputBytes > 0) {
                  const pct = Math.min(
                    95,
                    Math.round((progress.receivedBytes / progress.inputBytes) * 100)
                  );
                  setProcessingProgress({ attempt: pct, maxAttempts: 100 });
                }
              }, controller.signal);

              // Surface the transcoded file in the queue UI so the user can
              // inspect what's actually being sent to Gemini (quality, duration, frame rate).
              const transcodedUrl = URL.createObjectURL(fileToUpload);
              if (item.transcodedUrl) URL.revokeObjectURL(item.transcodedUrl);
              updateQueueItem(item.id, { transcodedUrl, transcodedSize: fileToUpload.size });
            }

            const uploadSizeMB = (fileToUpload.size / 1_048_576).toFixed(1);
            updateQueueItem(item.id, { status: 'uploading' });
            setUploadPhase('uploading');
            setPhaseDetail(`Uploading ${uploadSizeMB} MB to Gemini Files API...`);
            setProcessingProgress({ attempt: 0, maxAttempts: 150 });

            const fileUri = await uploadVideo(apiKey, fileToUpload, (phase, detail) => {
              setUploadPhase(phase);
              updateQueueItem(item.id, { status: phase as QueueItemStatus });
              if (phase === 'uploading') {
                setPhaseDetail(`Uploading ${uploadSizeMB} MB to Gemini Files API...`);
              } else if (phase === 'processing') {
                const attempt = detail?.attempt ?? 0;
                const maxAttempts = detail?.maxAttempts ?? 150;
                const elapsedSec = attempt * 2;
                setPhaseDetail(
                  `Gemini processing video on Google servers (${attempt}/${maxAttempts} polls, ${elapsedSec}s elapsed)...`
                );
              }
              if (detail?.attempt !== undefined) {
                setProcessingProgress({ attempt: detail.attempt, maxAttempts: detail.maxAttempts || 150 });
              }
            }, controller.signal);

            updateQueueItem(item.id, { status: 'analyzing' });
            setUploadPhase('analyzing');
            setPhaseDetail('Analyzing with Gemini...');

            // Use the transcoded file's mime type if we transcoded (mp4); otherwise the original.
            const uploadedMime = fileToUpload.type || item.file.type;
            result = await analyzeVideo(apiKey, fileUri, uploadedMime, finalInstruction, geminiModel, geminiMediaResolution, geminiFps, controller.signal);
          }

          const normalized = normalizeRawClips(result, {
            sourceId: item.source.id,
            duration: item.metadata?.duration || item.source.metadata.duration,
            idFactory: index => `${item.source.id}-clip-${index}`,
          });
          if (normalized.rejections.length) {
            console.warn(`Rejected ${normalized.rejections.length} invalid model clip(s) for ${item.file.name}`, normalized.rejections);
          }

          updateQueueItem(item.id, { status: 'complete', clips: normalized.clips });

        } catch (e: unknown) {
          if (controller.signal.aborted) {
            updateQueueItem(item.id, { status: 'cancelled', error: 'Cancelled' });
            break;
          }
          const rawMessage = e instanceof Error ? e.message : 'Analysis failed';
          const message = formatErrorMessage(rawMessage, provider);
          updateQueueItem(item.id, { status: 'error', error: message });
          // Continue with next video instead of stopping
          console.error(`Error processing ${item.file.name}:`, rawMessage);
        }
      }

      setStatus(controller.signal.aborted ? AppStatus.IDLE : AppStatus.COMPLETE);
      setPhaseDetail(null);
    } catch (e: unknown) {
      const rawMessage = e instanceof Error ? e.message : 'Analysis failed';
      setError(formatErrorMessage(rawMessage, provider));
      setStatus(AppStatus.ERROR);
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  };

  const handlePlayClip = useCallback((clip: ClipSegment, index: number) => {
    // Find the video that contains this clip
    const sourceItem = videoQueue.find(item => item.source.id === clip.sourceId);
    if (sourceItem) {
      setActiveVideoUrl(previewUrlFor(sourceItem));
      setActiveVideoName(sourceItem.file.name);
    }

    setCurrentStart(clip.startSeconds);
    setCurrentEnd(clip.endSeconds);
    setActiveClipIndex(index);
  }, [videoQueue]);

  /** Seek the player to a raw (start, end) span in seconds, on a given queue item. */
  const previewSpan = useCallback((item: VideoQueueItem, startSec: number, endSec: number) => {
    setActiveVideoUrl(previewUrlFor(item));
    setActiveVideoName(item.file.name);
    setCurrentStart(startSec);
    setCurrentEnd(endSec);
    setActiveClipIndex(null); // not one of the analyzed clips
  }, []);

  /**
   * Marlin Mode 2 — resolve a query to a span and preview it. Searches the active video
   * (matched by name) or, failing that, the first queued item with a real file.
   */
  const searchMarlinVideo = useCallback(async (query: string, opts?: MarlinFindOptions) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const target =
      videoQueue.find(item => item.file.name === activeVideoName && item.file.size > 0) ??
      videoQueue.find(item => item.file.size > 0);

    if (!target) {
      setMarlinSearch({ isSearching: false, query: trimmed, result: null, error: 'Upload a video before searching.', added: false });
      return;
    }

    setMarlinSearch({ isSearching: true, query: trimmed, result: null, error: null, added: false });
    try {
      const result = await findInVideoMarlin({ endpoint: '/api/marlin' }, target.file, trimmed, opts);
      setMarlinSearch({ isSearching: false, query: trimmed, result, error: null, added: false });
      if (result.span) {
        previewSpan(target, result.span[0], result.span[1]);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Search failed.';
      setMarlinSearch({ isSearching: false, query: trimmed, result: null, error: message, added: false });
    }
  }, [videoQueue, activeVideoName, previewSpan]);

  /** Re-seek the player to the last found span without re-querying the model. */
  const previewMarlinSpan = useCallback(() => {
    const span = marlinSearch.result?.span;
    if (!span) return;
    const target =
      videoQueue.find(item => item.file.name === activeVideoName && item.file.size > 0) ??
      videoQueue.find(item => item.file.size > 0);
    if (target) previewSpan(target, span[0], span[1]);
  }, [marlinSearch.result, videoQueue, activeVideoName, previewSpan]);

  /**
   * Persist the current Marlin find result as a real ClipSegment on its source video's
   * queue item, so it shows in the sidebar and exports. Description = the search query
   * verbatim. excitement_score is a neutral placeholder (find produces no real score).
   */
  const addFoundClip = useCallback(() => {
    const span = marlinSearch.result?.span;
    const query = marlinSearch.query.trim();
    if (!span || !query) return;

    const target =
      videoQueue.find(item => item.file.name === activeVideoName && item.file.size > 0) ??
      videoQueue.find(item => item.file.size > 0);
    if (!target) return;

    const newClip: ClipSegment = {
      id: `${target.source.id}-marlin-${Date.now()}`,
      sourceId: target.source.id,
      startSeconds: span[0],
      endSeconds: span[1],
      description: query,
      excitementScore: 5, // neutral placeholder — find does no scoring
      reasoning: `Added from Marlin search: "${query}"`,
    };

    // Dedupe: skip if an identical clip already exists on this item.
    const isDuplicate = target.clips.some(
      c =>
        c.startSeconds === newClip.startSeconds &&
        c.endSeconds === newClip.endSeconds &&
        c.description === newClip.description,
    );
    if (!isDuplicate) {
      updateQueueItem(target.id, { clips: [...target.clips, newClip] });
    }
    setMarlinSearch(prev => ({ ...prev, added: true }));
  }, [marlinSearch.result, marlinSearch.query, videoQueue, activeVideoName, updateQueueItem]);

  /**
   * Remove a clip by its position in `allClips`. Maps the global index to the owning
   * queue item + local index (allClips preserves queue order) and splices it out.
   */
  const removeClipAt = useCallback((globalIndex: number) => {
    let remaining = globalIndex;
    for (const item of videoQueue) {
      if (remaining < item.clips.length) {
        const nextClips = item.clips.filter((_, i) => i !== remaining);
        updateQueueItem(item.id, { clips: nextClips });
        return;
      }
      remaining -= item.clips.length;
    }
  }, [videoQueue, updateQueueItem]);

  const loadClipsFromProject = useCallback((clips: ClipSegment[], sources: VideoSource[]) => {
    // Clear existing queue
    videoQueue.forEach(item => {
      if (item.url) URL.revokeObjectURL(item.url);
      if (item.transcodedUrl) URL.revokeObjectURL(item.transcodedUrl);
    });

    const loadedItems: VideoQueueItem[] = sources.map(source => ({
      id: source.id,
      source,
      file: new File([], source.filename, { lastModified: source.lastModified }),
      url: '', // No video URL available
      status: 'complete' as QueueItemStatus, // Already "analyzed"
      clips: clips.filter(c => c.sourceId === source.id),
      metadata: source.metadata,
    }));

    setVideoQueue(loadedItems);
    setActiveVideoUrl(null); // No video to preview until re-uploaded
    setActiveVideoName(loadedItems[0]?.file.name || null);
    setActiveClipIndex(null);
    setStatus(AppStatus.COMPLETE);
    setError(null);
  }, [videoQueue]);

  const relinkVideos = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    let linkedCount = 0;
    let firstLinkedUrl: string | null = null;
    let firstLinkedName: string | null = null;

    const placeholders = videoQueue.filter(item => item.file.size === 0).map(item => item.source);
    const relink = relinkProjectSources(placeholders, fileArray);
    if (relink.ambiguousSourceIds.length) {
      setError('Duplicate legacy filenames are ambiguous. Rename the files uniquely, then select them again to confirm the mapping.');
    }

    for (const [sourceId, file] of relink.matches) {
      const matchingItem = videoQueue.find(item => item.source.id === sourceId && item.file.size === 0);

      if (matchingItem) {
        const url = URL.createObjectURL(file);

        // Extract metadata
        let metadata: VideoMetadata | undefined;
        try {
          metadata = await extractVideoMetadata(file);
        } catch (err) {
          console.warn(`Failed to extract metadata for ${file.name}:`, err);
        }

        // Update the queue item with the real file
        setVideoQueue(prev => prev.map(item =>
          item.id === matchingItem.id
            ? { ...item, file, url, metadata, source: { ...item.source, fingerprint: createVideoSource(file, metadata).fingerprint, size: file.size, lastModified: file.lastModified, metadata: metadata ?? item.source.metadata, legacy: false } }
            : item
        ));

        if (!firstLinkedUrl) {
          firstLinkedUrl = url;
          firstLinkedName = file.name;
        }
        linkedCount++;
      }
    }

    // Set the first linked video as active for preview
    if (firstLinkedUrl && !activeVideoUrl) {
      setActiveVideoUrl(firstLinkedUrl);
      setActiveVideoName(firstLinkedName);
    }

    return linkedCount;
  }, [videoQueue, activeVideoUrl]);

  return {
    videoQueue,
    activeVideoUrl,
    activeVideoName,
    allClips,
    status,
    error,
    uploadPhase,
    phaseDetail,
    elapsedTime,
    processingProgress,
    queueProgress,
    isBusy,
    currentStart,
    currentEnd,
    activeClipIndex,
    // Relink support
    needsRelink,
    missingVideos,
    handleFilesUpload,
    removeFromQueue,
    retryItem,
    cancelAnalysis,
    clearQueue,
    runAnalysis,
    handlePlayClip,
    // Marlin Mode 2 search
    marlinSearch,
    searchMarlinVideo,
    previewMarlinSpan,
    addFoundClip,
    removeClipAt,
    setError,
    loadClipsFromProject,
    relinkVideos,
  };
}
