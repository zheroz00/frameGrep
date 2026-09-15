import type { AnalysisProvider, Project, RawClipSegment, VideoSource } from '../types';
import { createSourceFingerprint, createVideoSource, normalizeRawClips } from './media';

type LegacyProject = Record<string, unknown> & {
  clips?: RawClipSegment[];
  videoFilenames?: string[];
};

const stringValue = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;

const legacySources = (filenames: string[]): VideoSource[] => filenames.map((filename, index) => {
  const source = createVideoSource({ name: filename, size: 0, lastModified: 0 });
  return { ...source, id: `${source.id}-legacy-${index}`, legacy: true };
});

export const migrateProject = (input: unknown): Project => {
  if (!input || typeof input !== 'object') throw new Error('Project must be an object');
  const value = input as LegacyProject;
  if (!Array.isArray(value.clips)) throw new Error('Project clips must be an array');
  if (!Array.isArray(value.sources) && !Array.isArray(value.videoFilenames)) {
    throw new Error('Project must contain sources or legacy videoFilenames');
  }
  const rawSources = Array.isArray(value.sources) ? value.sources as VideoSource[] : null;
  const sources = rawSources?.length
    ? rawSources.map(source => ({ ...source, metadata: source.metadata ?? createVideoSource({ name: source.filename, size: source.size, lastModified: source.lastModified }).metadata }))
    : legacySources(Array.isArray(value.videoFilenames) ? value.videoFilenames.filter((item): item is string => typeof item === 'string') : []);
  const byFilename = new Map<string, VideoSource[]>();
  sources.forEach(source => byFilename.set(source.filename, [...(byFilename.get(source.filename) ?? []), source]));
  const rawClips = value.clips;
  const clips = rawClips.flatMap((raw, index) => {
    const requestedSourceId = typeof raw.sourceId === 'string' ? raw.sourceId : undefined;
    const filename = typeof raw.sourceFile === 'string' ? raw.sourceFile : undefined;
    const source = sources.find(item => item.id === requestedSourceId)
      ?? (filename ? byFilename.get(filename)?.[0] : sources[0]);
    if (!source) return [];
    return normalizeRawClips([{ ...raw, sourceId: source.id }], {
      sourceId: source.id,
      duration: source.metadata.duration,
      idFactory: () => typeof raw.id === 'string' ? raw.id : `clip-${index}`,
    }).clips;
  });

  return {
    schemaVersion: 2,
    id: stringValue(value.id, `project-${Date.now()}`),
    name: stringValue(value.name, 'Untitled Project'),
    createdAt: stringValue(value.createdAt, new Date().toISOString()),
    updatedAt: stringValue(value.updatedAt, new Date().toISOString()),
    clips,
    sources,
    presetId: stringValue(value.presetId),
    presetInstruction: stringValue(value.presetInstruction),
    provider: (['gemini', 'custom', 'marlin'].includes(String(value.provider)) ? value.provider : 'gemini') as AnalysisProvider,
    selectedMusic: value.selectedMusic as Project['selectedMusic'],
  };
};

export interface RelinkResult {
  matches: Map<string, File>;
  missingSourceIds: string[];
  ambiguousSourceIds: string[];
}

export const relinkProjectSources = (sources: VideoSource[], files: File[]): RelinkResult => {
  const matches = new Map<string, File>();
  const ambiguousSourceIds: string[] = [];
  const claimed = new Set<File>();
  const exactFiles = new Map<string, File[]>();
  files.forEach(file => {
    const fingerprint = createSourceFingerprint(file);
    exactFiles.set(fingerprint, [...(exactFiles.get(fingerprint) ?? []), file]);
  });
  const fingerprintCounts = new Map<string, number>();
  sources.forEach(source => fingerprintCounts.set(source.fingerprint, (fingerprintCounts.get(source.fingerprint) ?? 0) + 1));
  const sourcesByFilename = new Map<string, VideoSource[]>();
  sources.forEach(source => sourcesByFilename.set(source.filename, [...(sourcesByFilename.get(source.filename) ?? []), source]));

  sources.forEach(source => {
    const exactCandidates = (exactFiles.get(source.fingerprint) ?? []).filter(file => !claimed.has(file));
    const exact = exactCandidates.length === 1 && fingerprintCounts.get(source.fingerprint) === 1 ? exactCandidates[0] : undefined;
    if (exact) {
      matches.set(source.id, exact);
      claimed.add(exact);
      return;
    }
    const filenameSources = sourcesByFilename.get(source.filename) ?? [];
    const candidates = files.filter(file => file.name === source.filename && !claimed.has(file));
    if ((source.legacy || exactCandidates.length > 1 || (fingerprintCounts.get(source.fingerprint) ?? 0) > 1) && (filenameSources.length > 1 || candidates.length > 1)) {
      ambiguousSourceIds.push(source.id);
      return;
    }
    if (candidates.length === 1) {
      matches.set(source.id, candidates[0]);
      claimed.add(candidates[0]);
    }
  });

  return {
    matches,
    ambiguousSourceIds,
    missingSourceIds: sources.filter(source => !matches.has(source.id) && !ambiguousSourceIds.includes(source.id)).map(source => source.id),
  };
};
