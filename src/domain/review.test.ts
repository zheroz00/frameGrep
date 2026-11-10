import { describe, expect, it } from 'vitest';
import type { ClipSegment } from '../types';
import {
  buildTimelineSegments,
  clipTone,
  indexAfterRemoval,
  nextPlayableIndex,
  playheadPct,
  stepClipIndex,
  timelineSpan,
} from './review';

const clip = (id: string, start: number, end: number, extra: Partial<ClipSegment> = {}): ClipSegment => ({
  id,
  sourceId: 'a',
  startSeconds: start,
  endSeconds: end,
  description: id,
  excitementScore: 5,
  ...extra,
});

describe('clipTone', () => {
  it('prefers the section type over the score', () => {
    expect(clipTone({ sectionType: 'dead_time', excitementScore: 10 })).toBe('dead');
    expect(clipTone({ sectionType: 'highlight', excitementScore: 2 })).toBe('highlight');
  });

  it('falls back to score tiers', () => {
    expect(clipTone({ excitementScore: 9 })).toBe('top');
    expect(clipTone({ excitementScore: 7 })).toBe('strong');
    expect(clipTone({ excitementScore: 6 })).toBe('standard');
  });
});

describe('buildTimelineSegments', () => {
  const clips = [
    clip('one', 0, 4, { excitementScore: 1 }),
    clip('other-source', 0, 10, { sourceId: 'b' }),
    clip('two', 10, 20, { excitementScore: 10 }),
  ];

  it('places only the active source and keeps global indexes', () => {
    const segments = buildTimelineSegments(clips, 'a', 40);
    expect(segments.map(s => s.index)).toEqual([0, 2]);
    expect(segments[0]).toMatchObject({ clipId: 'one', leftPct: 0, widthPct: 10, heightPct: 30 });
    expect(segments[1]).toMatchObject({ clipId: 'two', leftPct: 25, widthPct: 25, heightPct: 100 });
  });

  it('uses the latest clip end when the duration is unknown', () => {
    const segments = buildTimelineSegments(clips, 'a', 0);
    expect(segments[1].leftPct + segments[1].widthPct).toBeCloseTo(100);
    expect(timelineSpan(clips, 'a', 0)).toBe(20);
  });

  it('stretches the span when a clip runs past the reported duration', () => {
    expect(timelineSpan(clips, 'a', 15)).toBe(20);
    const segments = buildTimelineSegments(clips, 'a', 15);
    expect(segments.every(s => s.leftPct + s.widthPct <= 100 + 1e-9)).toBe(true);
  });

  it('keeps very short clips wide enough to click and inside the track', () => {
    const [segment] = buildTimelineSegments([clip('blip', 999, 1000)], 'a', 1000);
    expect(segment.widthPct).toBeGreaterThanOrEqual(0.6);
    expect(segment.leftPct + segment.widthPct).toBeLessThanOrEqual(100);
  });

  it('returns nothing without a source or clips', () => {
    expect(buildTimelineSegments(clips, null, 40)).toEqual([]);
    expect(buildTimelineSegments(clips, 'missing', 40)).toEqual([]);
  });
});

describe('playheadPct', () => {
  it('clamps into the track and rejects unknown positions', () => {
    expect(playheadPct(5, 20)).toBe(25);
    expect(playheadPct(50, 20)).toBe(100);
    expect(playheadPct(null, 20)).toBeNull();
    expect(playheadPct(5, 0)).toBeNull();
  });
});

describe('stepClipIndex', () => {
  it('steps without wrapping', () => {
    expect(stepClipIndex(3, 0, 1)).toBe(1);
    expect(stepClipIndex(3, 2, 1)).toBe(2);
    expect(stepClipIndex(3, 0, -1)).toBe(0);
  });

  it('starts from an end when nothing is selected', () => {
    expect(stepClipIndex(3, null, 1)).toBe(0);
    expect(stepClipIndex(3, null, -1)).toBe(2);
    expect(stepClipIndex(0, null, 1)).toBeNull();
  });
});

describe('nextPlayableIndex', () => {
  const clips = [clip('a', 0, 1), clip('b', 1, 2), clip('c', 2, 3), clip('d', 3, 4)];

  it('skips clips the export would drop', () => {
    const playable = new Set(['a', 'c']);
    expect(nextPlayableIndex(clips, null, playable)).toBe(0);
    expect(nextPlayableIndex(clips, 0, playable)).toBe(2);
    expect(nextPlayableIndex(clips, 2, playable)).toBeNull();
  });
});

describe('indexAfterRemoval', () => {
  it('selects the clip that slid into place, else the new last clip', () => {
    expect(indexAfterRemoval(4, 1)).toBe(1);
    expect(indexAfterRemoval(4, 3)).toBe(2);
    expect(indexAfterRemoval(1, 0)).toBeNull();
  });
});
