import type { ExportMode, Project, PromptPreset, SocialCaptions, VideoSource, ClipSegment } from '../types';
import { DEFAULT_PRESETS } from '../constants/defaultPresets';
import { createPresetState, parsePresetBackup, type PresetStateV2 } from '../domain/presets';
import { migrateProject } from '../domain/project';
import {
  filterClipsForExport,
  generateEDL,
  generateFCPXML,
  generateFFmpegScript,
  getEDLCompatibility,
  getSourceIdentityIssue,
  type EDLCompatibility,
  type FCPXMLOptions,
} from './exportCore';

export { filterClipsForExport, generateEDL, generateFCPXML, generateFFmpegScript, getEDLCompatibility, getSourceIdentityIssue };
export type { EDLCompatibility, FCPXMLOptions };

export const generateFCPXMLWithMode = (
  projectName: string,
  clips: ClipSegment[],
  mode: ExportMode,
  options: FCPXMLOptions,
): string => generateFCPXML(projectName, filterClipsForExport(clips, mode), options);

export const generateEDLWithMode = (
  clips: ClipSegment[],
  sources: VideoSource[],
  mode: ExportMode,
): string => generateEDL(filterClipsForExport(clips, mode), sources);

export const generateFFmpegScriptWithMode = (
  clips: ClipSegment[],
  sources: VideoSource[],
  platform: 'win' | 'unix',
  mode: ExportMode,
): string => generateFFmpegScript(filterClipsForExport(clips, mode), sources, platform);

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const exportPresetsToJSON = (presets: PromptPreset[]): void => {
  const state = createPresetState(DEFAULT_PRESETS, presets);
  downloadBlob(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), `fpv-presets-${new Date().toISOString().split('T')[0]}.json`);
};

interface BackupV2 {
  schemaVersion: 2;
  exportedAt: string;
  presets: PresetStateV2;
  projects: Project[];
}

const readStoredPresets = (): PresetStateV2 => {
  const raw = localStorage.getItem('fpv_presets');
  if (!raw) return createPresetState(DEFAULT_PRESETS, DEFAULT_PRESETS);
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? createPresetState(DEFAULT_PRESETS, parsed) : parsePresetBackup(parsed, DEFAULT_PRESETS);
};

const readStoredProjects = (): Project[] => {
  const raw = localStorage.getItem('fpv_projects');
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Stored projects must be an array');
  return parsed.map(migrateProject);
};

export const exportAllAppData = (): void => {
  const bundle: BackupV2 = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    presets: readStoredPresets(),
    projects: readStoredProjects(),
  };
  downloadBlob(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }), `fpv-all-data-${new Date().toISOString().split('T')[0]}.json`);
};

const parseImport = (parsed: unknown): { presets?: PresetStateV2; projects?: Project[] } => {
  if (Array.isArray(parsed)) {
    if (!parsed.length) throw new Error('Empty backup file');
    if (typeof parsed[0]?.instruction === 'string') return { presets: createPresetState(DEFAULT_PRESETS, parsed as PromptPreset[]) };
    if (Array.isArray(parsed[0]?.clips)) return { projects: parsed.map(migrateProject) };
    throw new Error('Could not detect backup type');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid backup file format');
  const record = parsed as Record<string, unknown>;
  const result: { presets?: PresetStateV2; projects?: Project[] } = {};
  if ('presets' in record) result.presets = parsePresetBackup(record.presets, DEFAULT_PRESETS);
  else if (record.schemaVersion === 2 && 'overrides' in record) result.presets = parsePresetBackup(record, DEFAULT_PRESETS);
  if ('projects' in record) {
    if (!Array.isArray(record.projects)) throw new Error('Projects backup must be an array');
    result.projects = record.projects.map(migrateProject);
  }
  if (!result.presets && !result.projects) throw new Error('Invalid backup file format');
  return result;
};

export const importAllAppData = async (file: File): Promise<{ presets: number; projects: number; error?: string }> => {
  try {
    const imported = parseImport(JSON.parse(await file.text()));
    const existingPresetState = readStoredPresets();
    const existingProjects = readStoredProjects();
    const previousPresets = localStorage.getItem('fpv_presets');
    const previousProjects = localStorage.getItem('fpv_projects');
    let presetCount = 0;
    let projectCount = 0;
    try {
      if (imported.presets) {
        const customIds = new Set(existingPresetState.customPresets.map(preset => preset.id));
        const newCustom = imported.presets.customPresets.filter(preset => !customIds.has(preset.id));
        const merged: PresetStateV2 = {
          schemaVersion: 2,
          overrides: { ...existingPresetState.overrides, ...imported.presets.overrides },
          customPresets: [...existingPresetState.customPresets, ...newCustom],
        };
        localStorage.setItem('fpv_presets', JSON.stringify(merged));
        presetCount = newCustom.length + Object.keys(imported.presets.overrides).length;
      }
      if (imported.projects) {
        const ids = new Set(existingProjects.map(project => project.id));
        const additions = imported.projects.filter(project => !ids.has(project.id));
        localStorage.setItem('fpv_projects', JSON.stringify([...additions, ...existingProjects]));
        projectCount = additions.length;
      }
    } catch (error) {
      if (previousPresets === null) localStorage.removeItem('fpv_presets'); else localStorage.setItem('fpv_presets', previousPresets);
      if (previousProjects === null) localStorage.removeItem('fpv_projects'); else localStorage.setItem('fpv_projects', previousProjects);
      throw error;
    }
    window.dispatchEvent(new CustomEvent('framegrep:data-imported'));
    return { presets: presetCount, projects: projectCount };
  } catch (error) {
    return { presets: 0, projects: 0, error: error instanceof Error ? error.message : 'Failed to parse backup file' };
  }
};

interface CaptionExportItem {
  clipIndex: number;
  clipDescription: string;
  captions: SocialCaptions;
}

export const exportCaptionsJSON = (items: CaptionExportItem[], filename = 'fpv-captions.json'): void => {
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
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
};

export const exportCaptionsCSV = (items: CaptionExportItem[], filename = 'fpv-captions.csv'): void => {
  const escapeCSV = (value: string): string => value.includes(',') || value.includes('"') || value.includes('\n')
    ? `"${value.replace(/"/g, '""')}"`
    : value;
  const headers = ['Clip', 'Description', 'Instagram', 'TikTok', 'YouTube Title', 'YouTube Description', 'Twitter', 'Hashtags'];
  const rows = items.map(item => [
    String(item.clipIndex + 1), escapeCSV(item.clipDescription), escapeCSV(item.captions.instagram),
    escapeCSV(item.captions.tiktok), escapeCSV(item.captions.youtube.title),
    escapeCSV(item.captions.youtube.description), escapeCSV(item.captions.twitter),
    escapeCSV(item.captions.hashtags.map(tag => `#${tag}`).join(' ')),
  ]);
  downloadBlob(new Blob([[headers.join(','), ...rows.map(row => row.join(','))].join('\n')], { type: 'text/csv' }), filename);
};
