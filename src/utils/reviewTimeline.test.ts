import { describe, expect, it } from 'vitest';
import type { ClipSegment, VideoSource } from '../types';
import { cutRanges, generateReviewFCPXML, mergeRanges } from './reviewTimeline';

const source = (id: string, filename: string, duration: number, numerator = 30, denominator = 1): VideoSource => ({
  id, fingerprint: id, filename, size: 100, lastModified: 1,
  metadata: { filename, frameRate: { numerator, denominator, nominal: Math.round(numerator / denominator), mode: 'constant' }, width: 1920, height: 1080, codec: 'H.264', duration },
});
const clip = (id: string, sourceId: string, startSeconds: number, endSeconds: number, extra: Partial<ClipSegment> = {}): ClipSegment => ({
  id, sourceId, startSeconds, endSeconds, description: `desc ${id}`, excitementScore: 8, ...extra,
});

/** Pull `attr="value"` pairs out of each element whose tag line contains `match`. */
const elements = (xmlText: string, match: string): Record<string, string>[] => xmlText
  .split('\n')
  .filter(line => line.includes(match))
  .map(line => Object.fromEntries([...line.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value])));

describe('mergeRanges', () => {
  it('sorts, clamps and merges overlapping or touching ranges', () => {
    expect(mergeRanges([{ start: 10, end: 20 }, { start: -5, end: 4 }, { start: 18, end: 25 }, { start: 25, end: 99 }], 30))
      .toEqual([{ start: 0, end: 4 }, { start: 10, end: 30 }]);
  });
});

describe('cutRanges', () => {
  it('returns the head, the holes and the tail', () => {
    expect(cutRanges([{ start: 4, end: 13 }, { start: 22, end: 28 }], 60))
      .toEqual([{ start: 0, end: 4 }, { start: 13, end: 22 }, { start: 28, end: 60 }]);
  });

  it('returns the whole video when nothing is kept, and nothing when all of it is', () => {
    expect(cutRanges([], 10)).toEqual([{ start: 0, end: 10 }]);
    expect(cutRanges([{ start: 0, end: 10 }], 10)).toEqual([]);
  });
});

describe('generateReviewFCPXML', () => {
  const sources = [source('a', 'flight.mp4', 60)];
  const clips = [
    clip('dead', 'a', 0, 4, { sectionType: 'dead_time' }),
    clip('flow', 'a', 4, 13, { sectionType: 'flow' }),
    clip('hit', 'a', 13, 22, { sectionType: 'highlight' }),
    clip('late', 'a', 30, 36, { sectionType: 'highlight' }),
  ];

  it('keeps original timing: kept clips on V1, cut footage on V2 in the gaps', () => {
    const out = generateReviewFCPXML('Flight', clips, 'highlights_only', { sources });
    const kept = elements(out, '<asset-clip ref').filter(el => !el.lane);
    const cuts = elements(out, 'lane="1"');
    const gaps = elements(out, '<gap ');

    // flow and hit touch, and still stay two separate pieces on V1
    expect(kept.map(el => [el.name, el.offset, el.start, el.duration])).toEqual([
      ['Clip 2', '4/1s', '4/1s', '9/1s'],
      ['Clip 3', '13/1s', '13/1s', '9/1s'],
      ['Clip 4', '30/1s', '30/1s', '6/1s'],
    ]);
    expect(gaps.map(el => [el.offset, el.duration])).toEqual([['0/1s', '4/1s'], ['22/1s', '8/1s'], ['36/1s', '24/1s']]);
    expect(cuts.map(el => [el.name, el.offset, el.start, el.duration])).toEqual([
      ['Cut 00:00 to 00:04', '0s', '0/1s', '4/1s'],
      ['Cut 00:22 to 00:30', '0s', '22/1s', '8/1s'],
      ['Cut 00:36 to 01:00', '0s', '36/1s', '24/1s'],
    ]);
    expect(out).toContain('<sequence format="r1" duration="60/1s"');
    expect(out).toContain('name="Flight (review)"');
  });

  it('labels clips by their number in the app and marks dropped clips inside the cut footage', () => {
    const out = generateReviewFCPXML('Flight', clips, 'highlights_only', { sources });
    const markers = elements(out, '<marker ');
    expect(markers.map(el => [el.start, el.value])).toEqual([
      ['0/1s', 'Cut clip 1: desc dead'],
      ['4/1s', 'Clip 2: desc flow'],
      ['13/1s', 'Clip 3: desc hit'],
      ['30/1s', 'Clip 4: desc late'],
    ]);
  });

  it('follows the export mode: full edit keeps everything except dead time', () => {
    const withTransition = [...clips, clip('trans', 'a', 22, 30, { sectionType: 'transition' })];
    const highlights = generateReviewFCPXML('Flight', withTransition, 'highlights_only', { sources });
    const full = generateReviewFCPXML('Flight', withTransition, 'full_edit', { sources });
    expect(elements(highlights, 'lane="1"').map(el => el.name)).toContain('Cut 00:22 to 00:30');
    expect(elements(full, 'lane="1"').map(el => el.name)).toEqual(['Cut 00:00 to 00:04', 'Cut 00:36 to 01:00']);
  });

  it('places a second source after the first and leaves no frame holes at NTSC rates', () => {
    const mixed = [source('a', 'a.mp4', 10, 30000, 1001), source('b', 'b.mp4', 20, 30000, 1001)];
    const out = generateReviewFCPXML('Two', [clip('c1', 'a', 2.5, 7.3), clip('c2', 'b', 5, 9)], 'highlights_only', { sources: mixed });
    const pieces = [...elements(out, '<gap '), ...elements(out, '<asset-clip ref').filter(el => !el.lane)];
    const seconds = (rational: string): number => {
      const [n, d] = rational.replace('s', '').split('/').map(Number);
      return n / (d || 1);
    };
    const spans = pieces.map(el => [seconds(el.offset), seconds(el.offset) + seconds(el.duration)]).sort((x, y) => x[0] - y[0]);
    spans.slice(1).forEach(([start], index) => expect(start).toBeCloseTo(spans[index][1], 9));
    expect(spans[0][0]).toBe(0);
    // 10 s and 20 s at 30000/1001 are 300 and 599 whole frames, so the timeline is 899 frames long
    expect(spans[spans.length - 1][1]).toBeCloseTo(899 * 1001 / 30000, 9);
    expect(elements(out, '<asset-clip ref').filter(el => !el.lane)[1].ref).toBe('r4');
  });

  it('starts an overlapping clip where the previous one ends', () => {
    const out = generateReviewFCPXML('Flight', [clip('one', 'a', 4, 13), clip('two', 'a', 10, 20), clip('inside', 'a', 11, 12)], 'highlights_only', { sources });
    const kept = elements(out, '<asset-clip ref').filter(el => !el.lane);
    expect(kept.map(el => [el.name, el.offset, el.start, el.duration])).toEqual([
      ['Clip 1', '4/1s', '4/1s', '9/1s'],
      ['Clip 2', '13/1s', '13/1s', '7/1s'],
    ]);
    expect(elements(out, 'lane="1"').map(el => el.name)).toEqual(['Cut 00:00 to 00:04', 'Cut 00:20 to 01:00']);
  });

  it('writes well-formed XML with escaped text and sub-second cut labels', () => {
    const out = generateReviewFCPXML('A & B', [clip('q', 'a', 0, 52.5, { description: 'Dive <fast> & "low"' })], 'highlights_only', { sources });
    expect(out).toContain('value="Clip 1: Dive &lt;fast&gt; &amp; &quot;low&quot;"');
    expect(out).toContain('name="Cut 00:52.5 to 01:00"');
    const opened = (out.match(/<(?!\/|\?|!)[^>]*[^/]>/g) ?? []).length;
    const closed = (out.match(/<\//g) ?? []).length;
    expect(opened).toBe(closed);
  });

  it('drops slivers of cut footage but still keeps V1 timing', () => {
    const out = generateReviewFCPXML('Flight', [clip('x', 'a', 0, 29.9), clip('y', 'a', 30, 60)], 'highlights_only', { sources });
    expect(elements(out, 'lane="1"')).toEqual([]);
    expect(elements(out, '<gap ')).toHaveLength(1);
  });

  it('embeds the media folder and never the music track', () => {
    const out = generateReviewFCPXML('Flight', clips, 'highlights_only', { sources, mediaFolder: '/footage/day 1', audioFilename: 'song.mp3' });
    expect(out).toContain('src="file:///footage/day%201/flight.mp4"');
    expect(out).not.toContain('song.mp3');
  });
});
