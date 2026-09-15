import { describe, expect, it } from 'vitest';
import type { ClipSegment, VideoSource } from '../types';
import { generateFCPXML, generateFFmpegScript, getEDLCompatibility } from './exportCore';

const source = (id: string, filename: string, numerator: number, denominator: number, width = 1920, height = 1080, mode: 'constant' | 'variable' = 'constant'): VideoSource => ({
  id, fingerprint: id, filename, size: 100, lastModified: 1,
  metadata: { filename, frameRate: { numerator, denominator, nominal: Math.round(numerator / denominator), mode }, width, height, codec: 'H.264', duration: 60 },
});
const clip = (id: string, sourceId: string, startSeconds: number, endSeconds: number): ClipSegment => ({ id, sourceId, startSeconds, endSeconds, description: id, excitementScore: 8 });

describe('FCPXML export', () => {
  it('defines a separate exact format for each source and uses the first as sequence profile', () => {
    const sources = [source('a', 'a.mp4', 24000, 1001, 1920, 1080), source('b', 'b.mp4', 30000, 1001, 3840, 2160)];
    const xml = generateFCPXML('Mixed', [clip('c1', 'a', 1, 2), clip('c2', 'b', 3, 4)], { sources });
    expect(xml).toContain('frameDuration="1001/24000s" width="1920" height="1080"');
    expect(xml).toContain('frameDuration="1001/30000s" width="3840" height="2160"');
    expect(xml).toContain('<sequence format="r1"');
    expect(xml).toContain('ref="r4"');
  });
});

describe('EDL compatibility', () => {
  it('blocks mixed rates and variable-rate sources', () => {
    expect(getEDLCompatibility([source('a', 'a.mp4', 24000, 1001), source('b', 'b.mp4', 30000, 1001)])).toEqual(expect.objectContaining({ supported: false, reason: expect.stringMatching(/same exact timebase/i) }));
    expect(getEDLCompatibility([source('a', 'a.mp4', 30000, 1001, 1920, 1080, 'variable')])).toEqual(expect.objectContaining({ supported: false, reason: expect.stringMatching(/constant-frame-rate/i) }));
  });
});

describe('FFmpeg export', () => {
  it('re-encodes frame-accurate cuts into the first source profile', () => {
    const sources = [source('a', 'a.mp4', 24000, 1001), source('b', 'b.mp4', 60000, 1001, 3840, 2160)];
    const script = generateFFmpegScript([clip('c1', 'b', 1.25, 2.5)], sources, 'unix');
    expect(script).toContain('-ss 1.250000 -to 2.500000 -i');
    expect(script).toContain('fps=24000/1001');
    expect(script).toContain('scale=1920:1080');
    expect(script).toContain('-c:v libx264');
    expect(script).not.toContain('-c:v copy');
  });
});
