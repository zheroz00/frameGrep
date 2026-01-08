import { useState, useRef, useEffect, useCallback } from 'react';
import { uploadVideo, analyzeVideo, UploadPhase } from '../services/geminiService';
import { analyzeVideoLocal, LocalVLMConfig } from '../services/localVLMService';
import { extractVideoMetadata } from '../services/mediaInfoService';
import { AppStatus, ClipSegment, VideoQueueItem, QueueItemStatus, AnalysisProvider, VideoMetadata } from '../types';

export type AnalysisPhase = UploadPhase | 'analyzing' | 'extracting';

/** Parses MM:SS or HH:MM:SS to seconds */
export const parseTime = (timeStr: string): number => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
};

/** Validates clip has valid start/end times */
const isValidClip = (clip: ClipSegment): boolean => {
  const start = parseTime(clip.start_time);
  const end = parseTime(clip.end_time);
  return end > start && start >= 0;
};

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

/** Builds temporal constraint suffix for Gemini instruction */
const buildTemporalConstraint = (maxDuration: number): string => {
  const minDuration = Math.max(3, Math.floor(maxDuration / 2));
  return `\n\nCRITICAL CLIP DURATION RULES:
1. TARGET DURATION: Aim for ${minDuration}-${maxDuration} seconds per clip. Shorter clips lose context.
2. COMPLETE MANEUVERS: Each clip MUST capture the FULL maneuver from setup to completion. Include the approach, the trick, AND the exit.
3. CONNECTED MOVES: If maneuvers flow together (e.g., proximity pass into a power loop, or dive into a roll), capture them as ONE clip, not separate clips.
4. NEVER cut a clip mid-maneuver. Wait for the drone to stabilize or transition before ending.
5. When in doubt, make the clip LONGER to preserve context, up to ${maxDuration} seconds.`;
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

  // Actions
  handleFilesUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  runAnalysis: (
    provider: AnalysisProvider,
    apiKey: string,
    instruction: string,
    maxDuration: number,
    localConfig?: LocalVLMConfig
  ) => Promise<void>;
  handlePlayClip: (clip: ClipSegment, index: number) => void;
  setError: (error: string | null) => void;
  loadClipsFromProject: (clips: ClipSegment[], videoFilenames: string[]) => void;
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

  // Playback state
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [activeVideoName, setActiveVideoName] = useState<string | null>(null);
  const [currentStart, setCurrentStart] = useState<number | undefined>(undefined);
  const [currentEnd, setCurrentEnd] = useState<number | undefined>(undefined);
  const [activeClipIndex, setActiveClipIndex] = useState<number | null>(null);

  const isBusy = status === AppStatus.UPLOADING || status === AppStatus.PROCESSING || status === AppStatus.ANALYZING;

  // Combine all clips from queue
  const allClips = videoQueue.flatMap(item => item.clips);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      videoQueue.forEach(item => {
        if (item.url) URL.revokeObjectURL(item.url);
      });
    };
  }, []);

  const handleFilesUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: VideoQueueItem[] = Array.from(files).map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      url: URL.createObjectURL(file),
      status: 'pending' as QueueItemStatus,
      clips: [],
    }));

    setVideoQueue(prev => [...prev, ...newItems]);
    setStatus(AppStatus.IDLE);
    setError(null);

    // Set first video as active for preview if none selected
    if (!activeVideoUrl && newItems.length > 0) {
      setActiveVideoUrl(newItems[0].url);
      setActiveVideoName(newItems[0].file.name);
    }

    // Reset input
    e.target.value = '';

    // Extract metadata for each video in background
    for (const item of newItems) {
      try {
        const metadata = await extractVideoMetadata(item.file);
        setVideoQueue(prev => prev.map(qItem =>
          qItem.id === item.id ? { ...qItem, metadata } : qItem
        ));
      } catch (err) {
        console.warn(`Failed to extract metadata for ${item.file.name}:`, err);
      }
    }
  }, [activeVideoUrl]);

  const removeFromQueue = useCallback((id: string) => {
    setVideoQueue(prev => {
      const item = prev.find(i => i.id === id);
      if (item?.url) URL.revokeObjectURL(item.url);

      const updated = prev.filter(i => i.id !== id);

      // Update active video if removed
      if (item?.url === activeVideoUrl) {
        const nextItem = updated[0];
        setActiveVideoUrl(nextItem?.url || null);
        setActiveVideoName(nextItem?.file.name || null);
      }

      return updated;
    });
  }, [activeVideoUrl]);

  const clearQueue = useCallback(() => {
    videoQueue.forEach(item => {
      if (item.url) URL.revokeObjectURL(item.url);
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

  const runAnalysis = async (
    provider: AnalysisProvider,
    apiKey: string,
    instruction: string,
    maxDuration: number,
    localConfig?: LocalVLMConfig
  ) => {
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

    // Start elapsed time timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const finalInstruction = instruction + buildTemporalConstraint(maxDuration);

    try {
      for (let i = 0; i < pendingItems.length; i++) {
        const item = pendingItems[i];
        setQueueProgress({ current: i + 1, total: pendingItems.length });

        try {
          let result: ClipSegment[];

          if (provider === 'custom' && localConfig) {
            // Custom provider path - frame extraction + OpenRouter/Ollama API call
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
              }
            );
          } else {
            // Gemini path - upload then analyze
            updateQueueItem(item.id, { status: 'uploading' });
            setUploadPhase('uploading');
            setPhaseDetail('Uploading to Gemini...');
            setProcessingProgress({ attempt: 0, maxAttempts: 150 });

            const fileUri = await uploadVideo(apiKey, item.file, (phase, detail) => {
              setUploadPhase(phase);
              setPhaseDetail(phase === 'uploading' ? 'Uploading...' : 'Processing on Gemini servers...');
              updateQueueItem(item.id, { status: phase as QueueItemStatus });
              if (detail?.attempt !== undefined) {
                setProcessingProgress({ attempt: detail.attempt, maxAttempts: detail.maxAttempts || 150 });
              }
            });

            updateQueueItem(item.id, { status: 'analyzing' });
            setUploadPhase('analyzing');
            setPhaseDetail('Analyzing with Gemini...');

            result = await analyzeVideo(apiKey, fileUri, item.file.type, finalInstruction);
          }

          // Add sourceFile to each clip and filter invalid ones
          const clipsWithSource = result
            .filter(isValidClip)
            .map(clip => ({
              ...clip,
              sourceFile: item.file.name,
            }));

          updateQueueItem(item.id, { status: 'complete', clips: clipsWithSource });

        } catch (e: unknown) {
          const rawMessage = e instanceof Error ? e.message : 'Analysis failed';
          const message = formatErrorMessage(rawMessage, provider);
          updateQueueItem(item.id, { status: 'error', error: message });
          // Continue with next video instead of stopping
          console.error(`Error processing ${item.file.name}:`, rawMessage);
        }
      }

      setStatus(AppStatus.COMPLETE);
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
    }
  };

  const handlePlayClip = useCallback((clip: ClipSegment, index: number) => {
    // Find the video that contains this clip
    const sourceItem = videoQueue.find(item => item.file.name === clip.sourceFile);
    if (sourceItem) {
      setActiveVideoUrl(sourceItem.url);
      setActiveVideoName(sourceItem.file.name);
    }

    setCurrentStart(parseTime(clip.start_time));
    setCurrentEnd(parseTime(clip.end_time));
    setActiveClipIndex(index);
  }, [videoQueue]);

  const loadClipsFromProject = useCallback((clips: ClipSegment[], videoFilenames: string[]) => {
    // Clear existing queue
    videoQueue.forEach(item => {
      if (item.url) URL.revokeObjectURL(item.url);
    });

    // Create placeholder queue items for each video (no actual files)
    // Group clips by their sourceFile
    const loadedItems: VideoQueueItem[] = videoFilenames.map(filename => ({
      id: `loaded-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file: new File([], filename), // Placeholder file with just the name
      url: '', // No video URL available
      status: 'complete' as QueueItemStatus, // Already "analyzed"
      clips: clips.filter(c => c.sourceFile === filename),
    }));

    setVideoQueue(loadedItems);
    setActiveVideoUrl(null); // No video to preview until re-uploaded
    setActiveVideoName(loadedItems[0]?.file.name || null);
    setActiveClipIndex(null);
    setStatus(AppStatus.COMPLETE);
    setError(null);
  }, [videoQueue]);

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
    handleFilesUpload,
    removeFromQueue,
    clearQueue,
    runAnalysis,
    handlePlayClip,
    setError,
    loadClipsFromProject,
  };
}
