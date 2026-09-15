import { describe, expect, it } from 'vitest';
import { TranscodeCoordinator, buildTranscodeArgs, chooseEncoder } from './transcodeMiddleware';

describe('transcode encoder selection', () => {
  it('falls back to CPU when NVENC probing fails', async () => {
    await expect(chooseEncoder('auto', async () => false)).resolves.toBe('libx264');
    await expect(chooseEncoder('auto', async () => true)).resolves.toBe('h264_nvenc');
    await expect(chooseEncoder('cpu', async () => true)).resolves.toBe('libx264');
  });
});

describe('transcode arguments', () => {
  it('uses a seekable output and the selected CPU encoder', () => {
    const args = buildTranscodeArgs('input.mov', 'output.mp4', { includeAudio: true, maxHeight: 720, fpsCap: 30 }, 'libx264');
    expect(args).toContain('libx264');
    expect(args).toContain('+faststart');
    expect(args.at(-1)).toBe('output.mp4');
    expect(args).not.toContain('pipe:1');
  });
});

describe('single-job coordination', () => {
  it('rejects concurrent work and releases the slot', () => {
    const gate = new TranscodeCoordinator();
    const release = gate.acquire();
    expect(release).toBeTypeOf('function');
    expect(gate.acquire()).toBeNull();
    release?.();
    expect(gate.acquire()).toBeTypeOf('function');
  });
});
