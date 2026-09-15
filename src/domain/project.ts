import type { AnalysisProvider, Project, RawClipSegment, VideoSource } from '../types';
import { createSourceFingerprint, createVideoSource, normalizeRawClips, type ClipRejection } from './media';

type LegacyProject = Record<string, unknown> & {
  clips?: RawClipSegment[];
  videoFilenames?: string[];
};

/** Filename given to a synthesized source when a stored clip names no file at all. */
export const UNKNOWN_SOURCE_FILENAME = 'unknown-source';

export interface ProjectMigrationResult {
  project: Project;
  /** Stored clips that could not be carried into schema 2 (index = position in the stored array). */
  rejections: ClipRejection[];
}

const stringValue = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;

const legacySources = (filenames: string[], indexOffset = 0): VideoSource[] => filenames.map((filename, index) => {
  const source = createVideoSource({ name: filename, size: 0, lastModified: 0 });
  return { ...source, id: `${source.id}-legacy-${indexOffset + index}`, legacy: true };
});

/** True when a stored project predates schema 2 and migration would rewrite it. */
export const needsProjectMigration = (input: unknown): boolean =>
  !input || typeof input !== 'object' || (input as { schemaVersion?: unknown }).schemaVersion !== 2;

/**
 * Migrate a stored project (any schema version) to schema 2.
 *
 * Clips are never silently discarded. A clip whose source cannot be found gets a legacy
 * source synthesized from its filename so the user can relink it later, and clips that
 * cannot be normalized at all are returned in `rejections` so the caller can decide
 * whether the result is safe to persist.
 */
export const migrateProjectDetailed = (input: unknown): ProjectMigrationResult => {
  if (!input || typeof input !== 'object') throw new Error('Project must be an object');
  const value = input as LegacyProject;
  if (!Array.isArray(value.clips)) throw new Error('Project clips must be an array');
  if (!Array.isArray(value.sources) && !Array.isArray(value.videoFilenames)) {
    throw new Error('Project must contain sources or legacy videoFilenames');
  }
  const rawSources = Array.isArray(value.sources) ? value.sources as VideoSource[] : null;
  const sources: VideoSource[] = rawSources?.length
    ? rawSources.map(source => ({ ...source, metadata: source.metadata ?? createVideoSource({ name: source.filename, size: source.size, lastModified: source.lastModified }).metadata }))
    : legacySources(Array.isArray(value.videoFilenames) ? value.videoFilenames.filter((item): item is string => typeof item === 'string') : []);

  const byFilename = new Map<string, VideoSource>();
  sources.forEach(source => { if (!byFilename.has(source.filename)) byFilename.set(source.filename, source); });

  const addLegacySource = (filename: string): VideoSource => {
    const [source] = legacySources([filename], sources.length);
    sources.push(source);
    byFilename.set(filename, source);
    return source;
  };

  const resolveSource = (raw: RawClipSegment): VideoSource => {
    const requestedSourceId = typeof raw.sourceId === 'string' ? raw.sourceId : undefined;
    const filename = typeof raw.sourceFile === 'string' ? raw.sourceFile : undefined;
    const byId = requestedSourceId ? sources.find(item => item.id === requestedSourceId) : undefined;
    if (byId) return byId;
    if (filename) return byFilename.get(filename) ?? addLegacySource(filename);
    return sources[0] ?? addLegacySource(UNKNOWN_SOURCE_FILENAME);
  };

  const rejections: ClipRejection[] = [];
  const clips = value.clips.flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      rejections.push({ index, reason: 'Clip is not an object', value: {} });
      return [];
    }
    const source = resolveSource(raw);
    const normalized = normalizeRawClips([{ ...raw, sourceId: source.id }], {
      sourceId: source.id,
      duration: source.metadata.duration,
      idFactory: () => typeof raw.id === 'string' ? raw.id : `clip-${index}`,
    });
    normalized.rejections.forEach(rejection => rejections.push({ ...rejection, index }));
    return normalized.clips;
  });

  const project: Project = {
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
  return { project, rejections };
};

export const migrateProject = (input: unknown): Project => migrateProjectDetailed(input).project;

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
