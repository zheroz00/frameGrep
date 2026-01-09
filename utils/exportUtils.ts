import { ClipSegment, PromptPreset, ExportMode, SocialCaptions, VideoMetadata } from "../types";

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
 * Converts seconds to FCPXML rational time format (frames/fps)
 * FCPXML uses "numerator/denominator s" format, e.g., "3600/24s" = 150 seconds at 24fps
 */
const secondsToFCPXMLTime = (seconds: number, fps: number = 24): string => {
  const frames = Math.round(seconds * fps);
  return `${frames}/${fps}s`;
};

/**
 * Escapes special characters for XML attribute values
 */
const escapeXMLAttr = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

/**
 * FCPXML export options
 */
export interface FCPXMLOptions {
  audioFilename?: string;    // Optional music track filename
  metadata?: VideoMetadata;  // Video metadata for fps/resolution (auto-detected)
}

/**
 * Generates FCPXML 1.9 for DaVinci Resolve / Final Cut Pro import.
 * Creates a timeline with all clips in sequence, including markers with descriptions.
 * Uses filenames only for media references (user relinks in NLE).
 * Optionally includes a music track that spans the entire timeline.
 * Uses auto-detected video metadata for fps/resolution when available.
 */
export const generateFCPXML = (
  projectName: string,
  clips: ClipSegment[],
  options: FCPXMLOptions = {}
): string => {
  const { audioFilename, metadata } = options;

  // Use detected metadata or sensible defaults
  const fps = metadata?.fps || 30;
  const width = metadata?.width || 1920;
  const height = metadata?.height || 1080;
  const frameDuration = `100/${fps * 100}s`; // e.g., "100/3000s" for 30fps

  // Collect unique source files and create asset IDs
  const sourceFiles = new Set<string>();
  clips.forEach(clip => {
    sourceFiles.add(clip.sourceFile || 'video.mp4');
  });

  // Create asset map: filename -> asset ID (r2, r3, r4, ...)
  const assetMap = new Map<string, string>();
  let assetId = 2; // r1 is reserved for format
  sourceFiles.forEach(file => {
    assetMap.set(file, `r${assetId}`);
    assetId++;
  });

  // Reserve ID for audio asset if present
  const audioAssetId = audioFilename ? `r${assetId}` : null;

  // Build resources section - use detected resolution
  const formatName = height >= 2160 ? `FFVideoFormat4K${fps}` : `FFVideoFormat${height}p${fps}`;
  let resources = `    <format id="r1" name="${formatName}" frameDuration="${frameDuration}" width="${width}" height="${height}"/>\n`;

  sourceFiles.forEach(file => {
    const id = assetMap.get(file)!;
    const escapedName = escapeXMLAttr(file);
    resources += `    <asset id="${id}" name="${escapedName}" src="file:///${escapedName}" hasVideo="1" hasAudio="1">\n`;
    resources += `      <media-rep kind="original-media" src="file:///${escapedName}"/>\n`;
    resources += `    </asset>\n`;
  });

  // Add audio asset if present
  if (audioFilename && audioAssetId) {
    const escapedAudioName = escapeXMLAttr(audioFilename);
    resources += `    <asset id="${audioAssetId}" name="${escapedAudioName}" src="file:///${escapedAudioName}" hasVideo="0" hasAudio="1">\n`;
    resources += `      <media-rep kind="original-media" src="file:///${escapedAudioName}"/>\n`;
    resources += `    </asset>\n`;
  }

  // Build spine with clips
  let spine = '';
  let timelineOffset = 0;

  clips.forEach((clip, index) => {
    const sourceFile = clip.sourceFile || 'video.mp4';
    const assetRef = assetMap.get(sourceFile)!;

    const startSec = parseTimeToSeconds(clip.start_time);
    const endSec = parseTimeToSeconds(clip.end_time);
    const duration = endSec - startSec;

    if (duration <= 0) return; // Skip invalid clips

    const clipName = escapeXMLAttr(`Clip ${index + 1}`);
    const offsetTime = secondsToFCPXMLTime(timelineOffset, fps);
    const startTime = secondsToFCPXMLTime(startSec, fps);
    const durationTime = secondsToFCPXMLTime(duration, fps);
    const markerText = escapeXMLAttr(clip.description || `Clip ${index + 1}`);

    spine += `          <asset-clip ref="${assetRef}" offset="${offsetTime}" name="${clipName}" start="${startTime}" duration="${durationTime}">\n`;
    spine += `            <marker start="0s" duration="1/${fps}s" value="${markerText}"/>\n`;
    spine += `          </asset-clip>\n`;

    timelineOffset += duration;
  });

  // Calculate total duration
  const totalDuration = secondsToFCPXMLTime(timelineOffset, fps);
  const escapedProjectName = escapeXMLAttr(projectName);

  // Build audio lane if music is selected
  let audioLane = '';
  if (audioFilename && audioAssetId) {
    const escapedAudioName = escapeXMLAttr(audioFilename);
    // Audio clip spans the entire timeline duration, starting from 0
    audioLane = `
          <audio-clip ref="${audioAssetId}" lane="-1" offset="0s" name="${escapedAudioName}" start="0s" duration="${totalDuration}"/>`;
  }

  // Assemble full FCPXML
  const fcpxml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
${resources}  </resources>
  <library>
    <event name="${escapedProjectName}">
      <project name="${escapedProjectName}">
        <sequence format="r1" duration="${totalDuration}" tcStart="0s" tcFormat="NDF">
          <spine>
${spine}          </spine>${audioLane}
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;

  return fcpxml;
};

/**
 * Generates FCPXML with export mode filtering
 * Optionally includes a music track that spans the entire timeline.
 * Uses auto-detected video metadata for fps/resolution when available.
 */
export const generateFCPXMLWithMode = (
  projectName: string,
  clips: ClipSegment[],
  mode: ExportMode,
  options: FCPXMLOptions = {}
): string => {
  const filteredClips = filterClipsForExport(clips, mode);
  return generateFCPXML(projectName, filteredClips, options);
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

// ===========================================
// Caption Export Functions
// ===========================================

interface CaptionExportItem {
  clipIndex: number;
  clipDescription: string;
  captions: SocialCaptions;
}

/**
 * Export captions as a structured JSON file
 */
export const exportCaptionsJSON = (items: CaptionExportItem[], filename: string = 'fpv-captions.json'): void => {
  const data = {
    exportedAt: new Date().toISOString(),
    clips: items.map(item => ({
      index: item.clipIndex,
      description: item.clipDescription,
      instagram: item.captions.instagram,
      tiktok: item.captions.tiktok,
      youtube: item.captions.youtube,
      twitter: item.captions.twitter,
      hashtags: item.captions.hashtags,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Export captions as CSV for spreadsheet use
 */
export const exportCaptionsCSV = (items: CaptionExportItem[], filename: string = 'fpv-captions.csv'): void => {
  const escapeCSV = (str: string): string => {
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = ['Clip', 'Description', 'Instagram', 'TikTok', 'YouTube Title', 'YouTube Description', 'Twitter', 'Hashtags'];
  const rows = items.map(item => [
    String(item.clipIndex + 1),
    escapeCSV(item.clipDescription),
    escapeCSV(item.captions.instagram),
    escapeCSV(item.captions.tiktok),
    escapeCSV(item.captions.youtube.title),
    escapeCSV(item.captions.youtube.description),
    escapeCSV(item.captions.twitter),
    escapeCSV(item.captions.hashtags.map(h => `#${h}`).join(' ')),
  ]);

  const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
