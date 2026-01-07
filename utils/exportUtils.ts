import { ClipSegment, PromptPreset, ExportMode } from "../types";

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
 * Supports multi-source clips via clip.sourceFile
 */
export const generateEDL = (filename: string, clips: ClipSegment[]): string => {
  let edl = `TITLE: FPV_SUPERCUT\nFCM: NON-DROP FRAME\n\n`;
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
    const sourceFile = clip.sourceFile || filename;
    edl += `${idx}  AX       V     C        ${clipStart} ${clipEnd} ${timelineStart} ${timelineEnd}\n`;
    edl += `* FROM CLIP NAME: ${sourceFile}\n`;
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
 * Supports multi-source clips via clip.sourceFile
 */
export const generateFFmpegScript = (filename: string, clips: ClipSegment[], platform: 'win' | 'unix'): string => {
  const isWin = platform === 'win';
  const sep = isWin ? '\\' : '/';

  let script = isWin ? "@echo off\n" : "#!/bin/bash\n";
  script += isWin ? "mkdir segments 2>nul\n" : "mkdir -p segments\n";
  script += isWin ? "del /q filelist.txt 2>nul\n" : "rm -f filelist.txt\n";
  script += "\n# Extract each clip segment\n";

  clips.forEach((clip, index) => {
    const start = parseTimeToSeconds(clip.start_time);
    const end = parseTimeToSeconds(clip.end_time);
    const duration = end - start;
    if (duration <= 0) return; // Skip invalid clips

    const sourceFile = clip.sourceFile || filename;
    const escapedSource = escapeShellArg(sourceFile, isWin);
    const idx = String(index).padStart(3, '0');
    const outName = `segments${sep}clip_${idx}.mp4`;

    script += `ffmpeg -ss ${start} -i "${escapedSource}" -t ${duration} -c:v copy -c:a copy "${outName}" -y\n`;
    script += isWin ? `echo file '${outName}' >> filelist.txt\n` : `echo "file '${outName}'" >> filelist.txt\n`;
  });

  script += "\n# Concatenate all clips\n";
  script += `ffmpeg -f concat -safe 0 -i filelist.txt -c copy "supercut.mp4"\n`;
  return script;
};

/**
 * Filters clips based on export mode
 * - highlights_only: Keep clips without section_type OR non-dead_time sections
 * - full_edit: Remove dead_time clips, keep everything else
 */
export const filterClipsForExport = (
  clips: ClipSegment[],
  mode: ExportMode
): ClipSegment[] => {
  if (mode === 'highlights_only') {
    // Original behavior: clips without section_type or highlight/flow types
    return clips.filter(c =>
      !c.section_type ||
      c.section_type === 'highlight' ||
      c.section_type === 'flow'
    );
  }

  // Full edit mode: remove dead_time, keep everything else
  return clips.filter(c => c.section_type !== 'dead_time');
};

/**
 * Generates EDL with export mode filtering
 */
export const generateEDLWithMode = (
  filename: string,
  clips: ClipSegment[],
  mode: ExportMode
): string => {
  const filteredClips = filterClipsForExport(clips, mode);
  return generateEDL(filename, filteredClips);
};

/**
 * Generates FFmpeg script with export mode filtering
 */
export const generateFFmpegScriptWithMode = (
  filename: string,
  clips: ClipSegment[],
  platform: 'win' | 'unix',
  mode: ExportMode
): string => {
  const filteredClips = filterClipsForExport(clips, mode);
  return generateFFmpegScript(filename, filteredClips, platform);
};

/**
 * Exports prompt presets to a JSON file (manual export, dated filename)
 */
export const exportPresetsToJSON = (presets: PromptPreset[]) => {
  const data = JSON.stringify(presets, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fpv-presets-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Export all app data (presets + projects) as a single JSON file.
 * Excludes settings/API keys for security. (manual export, dated filename)
 */
export const exportAllAppData = () => {
  const presetsRaw = localStorage.getItem('fpv_presets');
  const projectsRaw = localStorage.getItem('fpv_projects');

  const bundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: presetsRaw ? JSON.parse(presetsRaw) : [],
    projects: projectsRaw ? JSON.parse(projectsRaw) : [],
  };

  const data = JSON.stringify(bundle, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fpv-all-data-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

/** Helper to detect if an array contains presets (has 'instruction' field) */
const isPresetsArray = (arr: unknown[]): arr is PromptPreset[] => {
  return arr.length > 0 && typeof (arr[0] as PromptPreset).instruction === 'string';
};

/** Helper to detect if an array contains projects (has 'clips' field) */
const isProjectsArray = (arr: unknown[]): boolean => {
  return arr.length > 0 && Array.isArray((arr[0] as { clips?: unknown[] }).clips);
};

/**
 * Import app data from any backup file format.
 * Auto-detects: fpv-all-data (bundle), fpv-presets (array), or fpv-projects (array).
 * Returns counts of imported items.
 */
export const importAllAppData = async (file: File): Promise<{ presets: number; projects: number; error?: string }> => {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        let presetsToImport: PromptPreset[] = [];
        let projectsToImport: { id: string; clips: unknown[] }[] = [];

        // Auto-detect format
        if (Array.isArray(parsed)) {
          // It's a raw array - detect if presets or projects
          if (isPresetsArray(parsed)) {
            presetsToImport = parsed;
          } else if (isProjectsArray(parsed)) {
            projectsToImport = parsed as { id: string; clips: unknown[] }[];
          } else if (parsed.length === 0) {
            resolve({ presets: 0, projects: 0, error: 'Empty backup file' });
            return;
          } else {
            resolve({ presets: 0, projects: 0, error: 'Could not detect backup type' });
            return;
          }
        } else if (parsed.presets || parsed.projects) {
          // It's a bundle format (fpv-all-data)
          if (Array.isArray(parsed.presets)) presetsToImport = parsed.presets;
          if (Array.isArray(parsed.projects)) projectsToImport = parsed.projects;
        } else {
          resolve({ presets: 0, projects: 0, error: 'Invalid backup file format' });
          return;
        }

        let presetsImported = 0;
        let projectsImported = 0;

        // Import presets (merge with existing, avoid duplicates by ID)
        if (presetsToImport.length > 0) {
          const existingRaw = localStorage.getItem('fpv_presets');
          const existing = existingRaw ? JSON.parse(existingRaw) : [];
          const existingIds = new Set(existing.map((p: PromptPreset) => p.id));

          const newPresets = presetsToImport.filter((p: PromptPreset) => !p.isDefault && !existingIds.has(p.id));
          if (newPresets.length > 0) {
            const merged = [...existing, ...newPresets];
            localStorage.setItem('fpv_presets', JSON.stringify(merged));
            presetsImported = newPresets.length;
          }
        }

        // Import projects (merge with existing, avoid duplicates by ID)
        if (projectsToImport.length > 0) {
          const existingRaw = localStorage.getItem('fpv_projects');
          const existing = existingRaw ? JSON.parse(existingRaw) : [];
          const existingIds = new Set(existing.map((p: { id: string }) => p.id));

          const newProjects = projectsToImport.filter((p: { id: string }) => !existingIds.has(p.id));
          if (newProjects.length > 0) {
            const merged = [...newProjects, ...existing];
            localStorage.setItem('fpv_projects', JSON.stringify(merged));
            projectsImported = newProjects.length;
          }
        }

        resolve({ presets: presetsImported, projects: projectsImported });
      } catch (e) {
        resolve({ presets: 0, projects: 0, error: 'Failed to parse backup file' });
      }
    };

    reader.onerror = () => {
      resolve({ presets: 0, projects: 0, error: 'Failed to read file' });
    };

    reader.readAsText(file);
  });
};
