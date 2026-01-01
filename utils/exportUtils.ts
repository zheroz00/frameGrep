import { ClipSegment, PromptPreset } from "../types";

const parseTimeToSeconds = (timeStr: string): number => {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
};

const formatSecondsToSMPTE = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 24); // Assuming 24fps for EDL standard
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
};

/**
 * Generates a CMX 3600 EDL string for DaVinci Resolve / Premiere
 */
export const generateEDL = (filename: string, clips: ClipSegment[]): string => {
  let edl = `TITLE: FPV_SUPERCUT_${filename}\nFCM: NON-DROP FRAME\n\n`;
  let timelineCursor = 0;
  clips.forEach((clip, index) => {
    const startSec = parseTimeToSeconds(clip.start_time);
    const endSec = parseTimeToSeconds(clip.end_time);
    const duration = endSec - startSec;
    const clipStart = formatSecondsToSMPTE(startSec);
    const clipEnd = formatSecondsToSMPTE(endSec);
    const timelineStart = formatSecondsToSMPTE(timelineCursor);
    const timelineEnd = formatSecondsToSMPTE(timelineCursor + duration);
    const idx = String(index + 1).padStart(3, '0');
    edl += `${idx}  AX       V     C        ${clipStart} ${clipEnd} ${timelineStart} ${timelineEnd}\n`;
    edl += `* FROM CLIP NAME: ${filename}\n`;
    edl += `* COMMENT: ${clip.description}\n\n`;
    timelineCursor += duration;
  });
  return edl;
};

/**
 * Escapes shell special characters in filenames
 */
const escapeShellArg = (str: string, isWin: boolean): string => {
  if (isWin) {
    // Windows CMD: escape special chars with ^
    return str.replace(/([&|<>^%])/g, '^$1');
  }
  // Unix: escape shell metacharacters
  return str.replace(/(["\$`\\])/g, '\\$1');
};

/**
 * Generates a platform-specific batch script for FFmpeg
 */
export const generateFFmpegScript = (filename: string, clips: ClipSegment[], platform: 'win' | 'unix'): string => {
  const isWin = platform === 'win';
  const sep = isWin ? '\\' : '/';
  const safeFilename = filename.replace(/\s+/g, '_');
  const escapedFilename = escapeShellArg(filename, isWin);

  let script = isWin ? "@echo off\n" : "#!/bin/bash\n";
  script += isWin ? "mkdir segments 2>nul\n" : "mkdir -p segments\n";
  script += isWin ? "del /q filelist.txt 2>nul\n" : "rm -f filelist.txt\n";

  clips.forEach((clip, index) => {
    const start = parseTimeToSeconds(clip.start_time);
    const end = parseTimeToSeconds(clip.end_time);
    const duration = end - start;
    if (duration <= 0) return; // Skip invalid clips
    const idx = String(index).padStart(3, '0');
    const outName = `segments${sep}clip_${idx}.mp4`;
    script += `ffmpeg -ss ${start} -i "${escapedFilename}" -t ${duration} -c:v copy -c:a copy "${outName}" -y\n`;
    script += isWin ? `echo file '${outName}' >> filelist.txt\n` : `echo "file '${outName}'" >> filelist.txt\n`;
  });

  script += `ffmpeg -f concat -safe 0 -i filelist.txt -c copy "${safeFilename}_supercut.mp4"\n`;
  return script;
};

/**
 * Exports prompt presets to a JSON file
 */
export const exportPresetsToJSON = (presets: PromptPreset[]) => {
  const data = JSON.stringify(presets, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fpv_presets_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
