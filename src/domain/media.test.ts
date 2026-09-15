import { describe, expect, it } from 'vitest';
import {
  createVideoSource,
  formatTimestamp,
  normalizeFrameRate,
  normalizeRawClips,
  parseMediaInfoDuration,
  parseTimestamp,
} from './media';

describe('parseMediaInfoDuration', () => {
  it('treats MediaInfo Duration values as seconds', () => {
    expect(parseMediaInfoDuration('11.109')).toBe(11.109);
  });

  it('falls back to the video track duration', () => {
    expect(parseMediaInfoDuration(undefined, '42.5')).toBe(42.5);
    expect(parseMediaInfoDuration('', '42.5')).toBe(42.5);
  });

  it('returns 0 for missing or malformed durations', () => {
    expect(parseMediaInfoDuration()).toBe(0);
    expect(parseMediaInfoDuration('nope', '-3')).toBe(0);
  });
});

describe('formatTimestamp', () => {
  it('pads fractional seconds under ten', () => {
    expect(formatTimestamp(65.5)).toBe('01:05.5');
    expect(formatTimestamp(3723)).toBe('01:02:03');
  });

  it('rounds sub-millisecond values instead of emitting artifacts', () => {
    expect(formatTimestamp(5.9995)).toBe('00:06');
  });
});

describe('parseTimestamp', () => {
  it('accepts seconds, MM:SS, and HH:MM:SS timestamps', () => {
    expect(parseTimestamp(1.25)).toBe(1.25);
    expect(parseTimestamp('01:02.5')).toBe(62.5);
    expect(parseTimestamp('01:02:03')).toBe(3723);
  });

  it('rejects malformed timestamps', () => {
    expect(parseTimestamp('1:99')).toBeNull();
    expect(parseTimestamp('nope')).toBeNull();
  });
});

describe('normalizeFrameRate', () => {
  it('preserves exact NTSC rational rates', () => {
    expect(normalizeFrameRate('29.970', '30000', '1001', 'CFR')).toEqual({
      numerator: 30000,
      denominator: 1001,
      nominal: 30,
      mode: 'constant',
    });
  });

  it('marks variable-rate media without rounding its average', () => {
    expect(normalizeFrameRate('23.976', undefined, undefined, 'VFR')).toEqual({
      numerator: 2997,
      denominator: 125,
      nominal: 24,
      mode: 'variable',
    });
  });
});

describe('normalizeRawClips', () => {
  it('clamps bounds, normalizes scores, and reports rejected spans', () => {
    const result = normalizeRawClips([
      { start_time: '-1', end_time: '00:03', description: 'first', excitement_score: 20 },
      { start_time: '00:05', end_time: '00:05', description: 'zero', excitement_score: 5 },
      { start_time: '00:09', end_time: '00:20', description: 'last', excitement_score: '7' },
    ], { sourceId: 'source-1', duration: 10, idFactory: index => `clip-${index}` });

    expect(result.clips).toEqual([
      expect.objectContaining({ id: 'clip-0', sourceId: 'source-1', startSeconds: 0, endSeconds: 3, excitementScore: 10 }),
      expect.objectContaining({ id: 'clip-2', sourceId: 'source-1', startSeconds: 9, endSeconds: 10, excitementScore: 7 }),
    ]);
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0].reason).toMatch(/positive duration/i);
  });
});

describe('createVideoSource', () => {
  it('distinguishes duplicate filenames using stable file identity', () => {
    const a = createVideoSource({ name: 'clip.mp4', size: 10, lastModified: 100 });
    const b = createVideoSource({ name: 'clip.mp4', size: 11, lastModified: 100 });
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.id).not.toBe(b.id);
  });
});
