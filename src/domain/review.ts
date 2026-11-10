import type { ClipSegment } from '../types';

/**
 * Pure helpers for the review desk: the clip map geometry and the next/previous
 * stepping used by the keyboard, the prev/next buttons and "Play all".
 */

/** Visual tone of a clip. Section type wins when the preset emitted one, else the score tier. */
export type ClipTone = 'highlight' | 'flow' | 'transition' | 'dead' | 'top' | 'strong' | 'standard';

export const clipTone = (clip: Pick<ClipSegment, 'sectionType' | 'excitementScore'>): ClipTone => {
  switch (clip.sectionType) {
    case 'highlight': return 'highlight';
    case 'flow': return 'flow';
    case 'transition': return 'transition';
    case 'dead_time': return 'dead';
    default:
      if (clip.excitementScore >= 9) return 'top';
      if (clip.excitementScore >= 7) return 'strong';
      return 'standard';
  }
};

export interface TimelineSegment {
  clipId: string;
  /** Index of the clip in the list that was passed in (the global clip index). */
  index: number;
  leftPct: number;
  widthPct: number;
  heightPct: number;
  tone: ClipTone;
}

/** Narrowest a block is drawn, so a one-second clip in a long video stays clickable. */
const MIN_WIDTH_PCT = 0.6;
const MIN_HEIGHT_PCT = 30;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Lay the clips of one source video out over its duration. `duration` may be 0 when
 * metadata extraction failed; the latest clip end is used instead so the map still draws.
 */
export const buildTimelineSegments = (
  clips: ClipSegment[],
  sourceId: string | null,
  duration: number,
): TimelineSegment[] => {
  if (!sourceId) return [];
  const own = clips
    .map((clip, index) => ({ clip, index }))
    .filter(({ clip }) => clip.sourceId === sourceId);
  if (own.length === 0) return [];

  const latestEnd = Math.max(...own.map(({ clip }) => clip.endSeconds));
  const span = Number.isFinite(duration) && duration > 0 ? Math.max(duration, latestEnd) : latestEnd;
  if (!(span > 0)) return [];

  return own.map(({ clip, index }) => {
    const widthPct = clamp(((clip.endSeconds - clip.startSeconds) / span) * 100, MIN_WIDTH_PCT, 100);
    const leftPct = clamp((clip.startSeconds / span) * 100, 0, 100 - widthPct);
    const score = clamp(clip.excitementScore, 1, 10);
    return {
      clipId: clip.id,
      index,
      leftPct,
      widthPct,
      heightPct: MIN_HEIGHT_PCT + ((score - 1) / 9) * (100 - MIN_HEIGHT_PCT),
      tone: clipTone(clip),
    };
  });
};

/** The span the map covers for a source: its duration, stretched to the latest clip end. */
export const timelineSpan = (clips: ClipSegment[], sourceId: string | null, duration: number): number => {
  const ends = clips.filter(clip => clip.sourceId === sourceId).map(clip => clip.endSeconds);
  const latestEnd = ends.length ? Math.max(...ends) : 0;
  return Number.isFinite(duration) && duration > 0 ? Math.max(duration, latestEnd) : latestEnd;
};

/** Playhead position as a percentage of the span, or null when it cannot be placed. */
export const playheadPct = (time: number | null, span: number): number | null => {
  if (time === null || !Number.isFinite(time) || !(span > 0)) return null;
  return clamp((time / span) * 100, 0, 100);
};

/**
 * Step to the neighbouring clip. No wrap-around: at either end the index stays put.
 * With nothing selected, forward picks the first clip and backward the last.
 */
export const stepClipIndex = (count: number, current: number | null, direction: 1 | -1): number | null => {
  if (count <= 0) return null;
  if (current === null || current < 0 || current >= count) return direction === 1 ? 0 : count - 1;
  return clamp(current + direction, 0, count - 1);
};

/**
 * Next clip after `current` whose id is in `playableIds` (the clips the current export
 * mode would keep). Null when the run is over.
 */
export const nextPlayableIndex = (
  clips: ClipSegment[],
  current: number | null,
  playableIds: ReadonlySet<string>,
): number | null => {
  const start = current === null ? 0 : current + 1;
  for (let index = Math.max(0, start); index < clips.length; index += 1) {
    if (playableIds.has(clips[index].id)) return index;
  }
  return null;
};

/**
 * Which clip to select after removing the one at `removedIndex` from a list that had
 * `countBefore` clips: the clip that slid into its place, else the new last clip.
 */
export const indexAfterRemoval = (countBefore: number, removedIndex: number): number | null => {
  const countAfter = countBefore - 1;
  if (countAfter <= 0) return null;
  return Math.min(removedIndex, countAfter - 1);
};
