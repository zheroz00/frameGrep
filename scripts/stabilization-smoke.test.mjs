import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVideoSource, normalizeFrameRate, normalizeRawClips, parseTimestamp } from '../src/domain/media.ts';
import { applyPresetState, createPresetState } from '../src/domain/presets.ts';
import { generateFCPXML, generateFFmpegScript, getEDLCompatibility } from '../src/utils/exportCore.ts';
import { parseOpenAIResponse } from '../src/services/openAIStream.ts';
import { TranscodeCoordinator, buildTranscodeArgs, chooseEncoder } from '../server/transcodeMiddleware.ts';

test('development server defaults to frameGrep port 3008 and refuses port hopping', () => {
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(config, /\bport:\s*3007\b/);
  assert.match(config, /FRAMEGREP_PORT[^\n]+['"]3008['"]/);
  assert.match(config, /\bport:\s*frameGrepPort\b/);
  assert.match(config, /\bstrictPort:\s*true\b/);
});

const source = (id, filename, numerator, denominator, mode = 'constant') => ({
  id, fingerprint: id, filename, size: 1, lastModified: 1,
  metadata: { filename, frameRate: { numerator, denominator, nominal: Math.round(numerator / denominator), mode }, width: 1920, height: 1080, codec: 'H.264', duration: 30 },
});

test('domain normalization preserves timebases and rejects invalid clips', () => {
  assert.equal(parseTimestamp('01:02.5'), 62.5);
  assert.deepEqual(normalizeFrameRate('29.97', 30000, 1001, 'CFR'), { numerator: 30000, denominator: 1001, nominal: 30, mode: 'constant' });
  const normalized = normalizeRawClips([
    { start_time: '-1', end_time: '2', excitement_score: 12, description: 'ok' },
    { start_time: '2', end_time: '2', description: 'bad' },
  ], { sourceId: 's', duration: 5 });
  assert.equal(normalized.clips.length, 1);
  assert.equal(normalized.clips[0].startSeconds, 0);
  assert.equal(normalized.clips[0].excitementScore, 10);
  assert.equal(normalized.rejections.length, 1);
  assert.notEqual(createVideoSource({ name: 'a.mp4', size: 1, lastModified: 1 }).id, createVideoSource({ name: 'a.mp4', size: 2, lastModified: 1 }).id);
});

test('preset overrides round-trip independently of factory defaults', () => {
  const defaults = [{ id: 'a', name: 'A', instruction: 'factory', maxDuration: 6, isDefault: true, category: 'fpv' }];
  const current = [{ ...defaults[0], instruction: 'edited' }, { id: 'b', name: 'B', instruction: 'custom', maxDuration: 4, category: 'custom' }];
  const state = createPresetState(defaults, current);
  assert.equal(applyPresetState(defaults, state)[0].instruction, 'edited');
  assert.equal(state.customPresets.length, 1);
});

test('exports use exact per-source formats and accurate re-encoding', () => {
  const sources = [source('a', 'a.mp4', 24000, 1001), source('b', 'b.mp4', 30000, 1001)];
  const clips = [{ id: 'c', sourceId: 'b', startSeconds: 1.25, endSeconds: 2.5, description: 'clip', excitementScore: 8 }];
  const fcpxml = generateFCPXML('test', clips, { sources });
  assert.match(fcpxml, /frameDuration="1001\/30000s"/);
  const ffmpeg = generateFFmpegScript(clips, sources, 'unix');
  assert.match(ffmpeg, /-ss 1\.250000 -to 2\.500000/);
  assert.match(ffmpeg, /-c:v libx264/);
  assert.doesNotMatch(ffmpeg, /-c:v copy/);
  assert.equal(getEDLCompatibility(sources).supported, false);
});

test('OpenAI response parser handles CRLF, final buffers, and JSON responses', async () => {
  const sse = new Response('data: {"choices":[{"delta":{"content":"["}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"]"}}]}', { headers: { 'content-type': 'text/event-stream' } });
  assert.equal((await parseOpenAIResponse(sse)).content, '[]');
  const json = new Response('{"choices":[{"message":{"content":"ok"}}]}', { headers: { 'content-type': 'application/json' } });
  assert.equal((await parseOpenAIResponse(json)).content, 'ok');
});

test('transcode core falls back to CPU and enforces one active job', async () => {
  assert.equal(await chooseEncoder('auto', async () => false), 'libx264');
  assert.ok(buildTranscodeArgs('in', 'out', { includeAudio: true, maxHeight: 720, fpsCap: 30 }, 'libx264').includes('+faststart'));
  const gate = new TranscodeCoordinator();
  const release = gate.acquire();
  assert.equal(gate.acquire(), null);
  release();
  assert.equal(typeof gate.acquire(), 'function');
});
