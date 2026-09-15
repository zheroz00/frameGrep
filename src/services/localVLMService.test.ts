import { describe, expect, it } from 'vitest';
import { getMaxFrames, parseModelResponse } from './localVLMService';

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
});
