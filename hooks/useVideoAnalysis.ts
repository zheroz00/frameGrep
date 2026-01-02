import { useState, useRef, useEffect } from 'react';
import { uploadVideo, analyzeVideo, UploadPhase } from '../services/geminiService';
import { AppStatus, ClipSegment, VideoFile } from '../types';

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
  videoFile: VideoFile | null;
  status: AppStatus;
  clips: ClipSegment[];
  error: string | null;
  uploadPhase: UploadPhase | 'analyzing';
  elapsedTime: number;
  processingProgress: { attempt: number; maxAttempts: number };
  isBusy: boolean;
  currentStart: number | undefined;
  currentEnd: number | undefined;
  activeClipIndex: number | null;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  runAnalysis: (apiKey: string, instruction: string, maxDuration: number) => Promise<void>;
  handlePlayClip: (startStr: string, endStr: string, index: number) => void;
  setError: (error: string | null) => void;
}

export function useVideoAnalysis(): UseVideoAnalysisReturn {
  const [videoFile, setVideoFile] = useState<VideoFile | null>(null);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [clips, setClips] = useState<ClipSegment[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Progress tracking
  const [uploadPhase, setUploadPhase] = useState<UploadPhase | 'analyzing'>('uploading');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [processingProgress, setProcessingProgress] = useState({ attempt: 0, maxAttempts: 150 });
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Playback state
  const [currentStart, setCurrentStart] = useState<number | undefined>(undefined);
  const [currentEnd, setCurrentEnd] = useState<number | undefined>(undefined);
  const [activeClipIndex, setActiveClipIndex] = useState<number | null>(null);

  const isBusy = status === AppStatus.UPLOADING || status === AppStatus.PROCESSING || status === AppStatus.ANALYZING;

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (videoFile?.url) {
        URL.revokeObjectURL(videoFile.url);
      }
    };
  }, [videoFile?.url]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Cleanup previous blob URL to prevent memory leak
      if (videoFile?.url) {
        URL.revokeObjectURL(videoFile.url);
      }
      const url = URL.createObjectURL(file);
      setVideoFile({ file, url });
      setStatus(AppStatus.IDLE);
      setClips([]);
      setError(null);
    }
  };

  const runAnalysis = async (apiKey: string, instruction: string, maxDuration: number) => {
    if (!videoFile || !apiKey) {
      setError("Please provide both an API Key and a Video File.");
      return;
    }

    setStatus(AppStatus.UPLOADING);
    setError(null);
    setElapsedTime(0);
    setUploadPhase('uploading');
    setProcessingProgress({ attempt: 0, maxAttempts: 150 });

    // Start elapsed time timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const finalInstruction = instruction + buildTemporalConstraint(maxDuration);

    try {
      const fileUri = await uploadVideo(apiKey, videoFile.file, (phase, detail) => {
        setUploadPhase(phase);
        if (detail?.attempt !== undefined) {
          setProcessingProgress({ attempt: detail.attempt, maxAttempts: detail.maxAttempts || 150 });
        }
      });

      setStatus(AppStatus.ANALYZING);
      setUploadPhase('analyzing');

      const result = await analyzeVideo(apiKey, fileUri, videoFile.file.type, finalInstruction);

      // Filter out invalid clips
      const validClips = result.filter(isValidClip);
      if (validClips.length < result.length) {
        console.warn(`Filtered ${result.length - validClips.length} invalid clips`);
      }

      setClips(validClips);
      setStatus(AppStatus.COMPLETE);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Analysis failed';
      setError(message);
      setStatus(AppStatus.ERROR);
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handlePlayClip = (startStr: string, endStr: string, index: number) => {
    setCurrentStart(parseTime(startStr));
    setCurrentEnd(parseTime(endStr));
    setActiveClipIndex(index);
  };

  return {
    videoFile,
    status,
    clips,
    error,
    uploadPhase,
    elapsedTime,
    processingProgress,
    isBusy,
    currentStart,
    currentEnd,
    activeClipIndex,
    handleFileUpload,
    runAnalysis,
    handlePlayClip,
    setError,
  };
}
