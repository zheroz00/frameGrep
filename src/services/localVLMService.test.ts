import { describe, expect, it } from 'vitest';
import { framesForContext, getMaxFrames, parseModelResponse } from './localVLMService';

const OPENROUTER = 'https://openrouter.ai/api/v1';
const CLOUD_TOKENS_PER_FRAME = 945;
const CLOUD_OUTPUT_RESERVE = 16384;

describe('local provider validation helpers', () => {
  it('surfaces refusal objects and malformed JSON', () => {
    expect(() => parseModelResponse('{"error":"nothing usable"}')).toThrow(/model refused.*nothing usable/i);
    expect(() => parseModelResponse('not json')).toThrow(/failed to parse/i);
  });

  it('derives the frame budget from the active model context length', () => {
    const small = getMaxFrames({ endpoint: 'http://localhost:8000/v1', model: 'x', contextLength: 16_384 });
    const large = getMaxFrames({ endpoint: 'http://localhost:8000/v1', model: 'x', contextLength: 65_536 });
    expect(large).toBeGreaterThan(small);
  });

  it('keeps a cloud model with a known context inside its window at 720p frame cost', () => {
    const frames = getMaxFrames({ endpoint: OPENROUTER, model: 'qwen/qwen3-vl-8b-instruct', contextLength: 131_072 });
    expect(frames * CLOUD_TOKENS_PER_FRAME + CLOUD_OUTPUT_RESERVE).toBeLessThanOrEqual(131_072);
    expect(frames).toBeGreaterThan(50);
  });

  it('assumes a 128K window for a cloud model with unknown context instead of 200 frames', () => {
    const frames = getMaxFrames({ endpoint: OPENROUTER, model: 'unknown/model' });
    expect(frames).toBe(framesForContext(131_072, false));
    expect(frames).toBeLessThan(200);
  });

  it('caps cloud frames at 200 even when a huge context could fit more', () => {
    expect(getMaxFrames({ endpoint: OPENROUTER, model: 'google/gemini-2.0-flash-001', contextLength: 1_000_000 })).toBe(200);
  });

  it('still derives the local budget from LOCAL_CONTEXT_TOKENS when no context is given', () => {
    expect(getMaxFrames({ endpoint: 'http://localhost:8000/v1', model: 'x' })).toBe(framesForContext(32_768, true));
  });
});
