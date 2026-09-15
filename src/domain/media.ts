import type {
  ClipMood,
  ClipSegment,
  EditRecommendation,
  EnergyLevel,
  FrameRate,
  LightingCondition,
  RawClipSegment,
  SectionType,
  VideoMetadata,
  VideoSource,
} from '../types';

const MOODS = new Set<ClipMood>(['intense', 'smooth', 'dramatic', 'peaceful', 'playful', 'technical']);
const LIGHTING = new Set<LightingCondition>(['golden_hour', 'midday', 'overcast', 'shade', 'indoor', 'mixed', 'low_light']);
const SECTION_TYPES = new Set<SectionType>(['highlight', 'flow', 'transition', 'dead_time']);
const ENERGY_LEVELS = new Set<EnergyLevel>(['high', 'medium', 'low']);
const RECOMMENDATIONS = new Set<EditRecommendation>(['keep', 'trim', 'review']);

const gcd = (a: number, b: number): number => {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
};

const ratioFromDecimal = (value: string | number): [number, number] => {
  const raw = String(value).trim();
  if (!raw || !Number.isFinite(Number(raw)) || Number(raw) <= 0) return [30, 1];
  if (!raw.includes('.') && !/[eE]/.test(raw)) return [Number(raw), 1];
  const decimal = Number(raw).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  const places = decimal.includes('.') ? decimal.length - decimal.indexOf('.') - 1 : 0;
  const denominator = 10 ** places;
  const numerator = Math.round(Number(decimal) * denominator);
  const divisor = gcd(numerator, denominator);
  return [numerator / divisor, denominator / divisor];
};

export const normalizeFrameRate = (
  rate?: string | number,
  numerator?: string | number,
  denominator?: string | number,
  mode?: string,
): FrameRate => {
  let num = Number(numerator);
  let den = Number(denominator);
  if (!Number.isFinite(num) || num <= 0 || !Number.isFinite(den) || den <= 0) {
    [num, den] = ratioFromDecimal(rate ?? 30);
  } else {
    const divisor = gcd(num, den);
    num /= divisor;
    den /= divisor;
  }
  const normalizedMode = String(mode ?? '').toLowerCase();
  return {
    numerator: num,
    denominator: den,
    nominal: Math.max(1, Math.round(num / den)),
    mode: normalizedMode.includes('vfr') || normalizedMode.includes('variable')
      ? 'variable'
      : normalizedMode.includes('cfr') || normalizedMode.includes('constant')
        ? 'constant'
        : 'unknown',
  };
};

/**
 * MediaInfo JSON output reports `Duration` in seconds (e.g. "11.109"), despite
 * older MediaInfo APIs using milliseconds. Prefer the General track's value,
 * fall back to the video track's.
 */
export const parseMediaInfoDuration = (
  generalDuration?: string | number,
  videoDuration?: string | number,
): number => {
  for (const candidate of [generalDuration, videoDuration]) {
    const seconds = parseFloat(String(candidate ?? ''));
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }
  return 0;
};

export const parseTimestamp = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (!raw.includes(':')) {
    const seconds = Number(raw);
    return Number.isFinite(seconds) ? seconds : null;
  }
  const parts = raw.split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const numbers = parts.map(Number);
  if (numbers.some(part => !Number.isFinite(part))) return null;
  if (numbers.slice(1).some(part => part < 0 || part >= 60)) return null;
  return parts.length === 2
    ? numbers[0] * 60 + numbers[1]
    : numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
};

export const formatTimestamp = (seconds: number): string => {
  // Work in whole milliseconds so sub-millisecond values round instead of
  // producing artifacts like "00:5.9995", and rounding carries into minutes.
  const totalMs = Math.round(Math.max(0, seconds) * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const wholeSecs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  const fraction = ms ? `.${String(ms).padStart(3, '0')}`.replace(/0+$/, '') : '';
  const secondsText = `${String(wholeSecs).padStart(2, '0')}${fraction}`;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${secondsText}`
    : `${String(minutes).padStart(2, '0')}:${secondsText}`;
};

const fnv1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

type FileIdentity = Pick<File, 'name' | 'size' | 'lastModified'>;

export const createSourceFingerprint = (file: FileIdentity): string =>
  `v1:${file.size}:${file.lastModified}:${encodeURIComponent(file.name)}`;

export const createVideoSource = (
  file: FileIdentity,
  metadata?: VideoMetadata,
): VideoSource => {
  const fingerprint = createSourceFingerprint(file);
  return {
    id: `source-${fnv1a(fingerprint)}`,
    fingerprint,
    filename: file.name,
    size: file.size,
    lastModified: file.lastModified,
    metadata: metadata ?? {
      filename: file.name,
      frameRate: normalizeFrameRate(30, 30, 1),
      width: 1920,
      height: 1080,
      codec: 'unknown',
      duration: 0,
    },
  };
};

export interface ClipRejection {
  index: number;
  reason: string;
  value: RawClipSegment;
}

export interface NormalizeRawClipsOptions {
  sourceId: string;
  duration?: number;
  idFactory?: (index: number) => string;
}

const optionalEnum = <T extends string>(value: unknown, allowed: Set<T>): T | undefined =>
  typeof value === 'string' && allowed.has(value as T) ? value as T : undefined;

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export const normalizeRawClips = (
  values: unknown,
  options: NormalizeRawClipsOptions,
): { clips: ClipSegment[]; rejections: ClipRejection[] } => {
  const clips: ClipSegment[] = [];
  const rejections: ClipRejection[] = [];
  if (!Array.isArray(values)) return { clips, rejections: [{ index: -1, reason: 'Provider result is not an array', value: {} }] };

  values.forEach((unknownValue, index) => {
    if (!unknownValue || typeof unknownValue !== 'object') {
      rejections.push({ index, reason: 'Clip is not an object', value: {} });
      return;
    }
    const value = unknownValue as RawClipSegment;
    const parsedStart = parseTimestamp(value.startSeconds ?? value.start_time);
    const parsedEnd = parseTimestamp(value.endSeconds ?? value.end_time);
    if (parsedStart === null || parsedEnd === null) {
      rejections.push({ index, reason: 'Clip has an invalid timestamp', value });
      return;
    }
    const upperBound = Number.isFinite(options.duration) && Number(options.duration) > 0
      ? Number(options.duration)
      : Number.POSITIVE_INFINITY;
    const startSeconds = Math.min(upperBound, Math.max(0, parsedStart));
    const endSeconds = Math.min(upperBound, Math.max(0, parsedEnd));
    if (endSeconds <= startSeconds) {
      rejections.push({ index, reason: 'Clip must have a positive duration after clamping', value });
      return;
    }
    const rawScore = Number(value.excitementScore ?? value.excitement_score ?? 5);
    const excitementScore = Math.min(10, Math.max(1, Number.isFinite(rawScore) ? Math.round(rawScore) : 5));
    const description = optionalString(value.description) ?? 'Untitled clip';
    const dominant = value.dominantColors ?? value.dominant_colors;
    clips.push({
      id: optionalString(value.id) ?? options.idFactory?.(index) ?? `clip-${options.sourceId}-${index}`,
      sourceId: optionalString(value.sourceId) ?? options.sourceId,
      startSeconds,
      endSeconds,
      description,
      excitementScore,
      reasoning: optionalString(value.reasoning),
      mood: optionalEnum(value.mood, MOODS),
      lighting: optionalEnum(value.lighting, LIGHTING),
      dominantColors: Array.isArray(dominant) ? dominant.filter((item): item is string => typeof item === 'string').slice(0, 3) : undefined,
      sectionType: optionalEnum(value.sectionType ?? value.section_type, SECTION_TYPES),
      energyLevel: optionalEnum(value.energyLevel ?? value.energy_level, ENERGY_LEVELS),
      recommendation: optionalEnum(value.recommendation, RECOMMENDATIONS),
      transitionNote: optionalString(value.transitionNote ?? value.transition_note),
    });
  });
  return { clips, rejections };
};
