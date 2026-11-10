import { describe, expect, it } from 'vitest';
import {
  captionModelName,
  describeCaptionError,
  extractJsonObject,
  parseCaptionResponse,
  resolveCaptionBackend,
  type CaptionBackend,
} from './captionService';

const customConfig = { endpoint: 'https://openrouter.ai/api/v1', model: 'qwen/qwen3-vl-8b', apiKey: 'sk-or-1' };
const gemini: CaptionBackend = { kind: 'gemini', apiKey: 'AIza', model: 'gemini-2.5-flash' };
const openai: CaptionBackend = { kind: 'openai', endpoint: customConfig.endpoint, apiKey: 'sk', model: 'qwen/qwen3-vl-8b' };

describe('resolveCaptionBackend', () => {
  it('uses the custom config for the custom provider, even without a Gemini key', () => {
    expect(resolveCaptionBackend({ provider: 'custom', geminiApiKey: '', customConfig })).toEqual({
      kind: 'openai',
      endpoint: customConfig.endpoint,
      apiKey: 'sk-or-1',
      model: 'qwen/qwen3-vl-8b',
    });
  });

  it('omits the api key for a keyless local server', () => {
    const result = resolveCaptionBackend({
      provider: 'custom',
      geminiApiKey: '',
      customConfig: { endpoint: 'http://localhost:8000/v1', model: 'local', apiKey: '' },
    });
    expect(result).toEqual({ kind: 'openai', endpoint: 'http://localhost:8000/v1', apiKey: undefined, model: 'local' });
  });

  it('uses Gemini for the gemini provider when a key is set', () => {
    expect(resolveCaptionBackend({ provider: 'gemini', geminiApiKey: 'AIza', customConfig })).toEqual(gemini);
  });

  it('explains a missing Gemini key', () => {
    expect(resolveCaptionBackend({ provider: 'gemini', geminiApiKey: '', customConfig })).toEqual({
      error: 'Add a Gemini API key in Settings, or switch to the Custom provider.',
    });
  });

  it('falls back to Gemini for marlin when a key is set', () => {
    expect(resolveCaptionBackend({ provider: 'marlin', geminiApiKey: 'AIza', customConfig })).toEqual(gemini);
  });

  it('explains that marlin cannot write captions without a Gemini key', () => {
    expect(resolveCaptionBackend({ provider: 'marlin', geminiApiKey: '', customConfig })).toEqual({
      error: "Marlin can't write captions. Add a Gemini API key in Settings, or switch to the Custom provider.",
    });
  });
});

describe('describeCaptionError', () => {
  const googleRejected =
    'Google rejected the Gemini API key. Check it in Settings (the key must be allowed to use the Gemini API), or switch to the Custom provider.';

  it('maps a blocked key (403 PERMISSION_DENIED) to the Google message', () => {
    const body =
      '{"error":{"code":403,"status":"PERMISSION_DENIED","message":"Requests to this API generativelanguage.googleapis.com method google.ai.generativelanguage.v1beta.GenerativeService.GenerateContent are blocked."}}';
    expect(describeCaptionError(new Error(body), gemini)).toBe(googleRejected);
  });

  it('maps an invalid key to the Google message', () => {
    const body = '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}';
    expect(describeCaptionError(new Error(body), gemini)).toBe(googleRejected);
  });

  it('maps an OpenAI-compatible 401 to the Custom provider message', () => {
    const error = Object.assign(new Error('Provider returned 401: unauthorized'), { status: 401 });
    expect(describeCaptionError(error, openai)).toBe(
      'The Custom provider rejected the API key for qwen/qwen3-vl-8b. Check it in Settings.'
    );
  });

  it('maps 429 to a rate limit message on either backend', () => {
    const expected = 'Rate limited by the provider. Wait a moment and try again.';
    const error = Object.assign(new Error('Provider returned 429'), { status: 429 });
    expect(describeCaptionError(error, openai)).toBe(expected);
    expect(describeCaptionError(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'), gemini)).toBe(expected);
  });

  it('passes other errors through unchanged', () => {
    expect(describeCaptionError(new Error('Network down'), gemini)).toBe('Network down');
    expect(describeCaptionError(new Error('The model did not return a JSON object'), openai)).toBe(
      'The model did not return a JSON object'
    );
  });
});

describe('JSON extraction', () => {
  const payload = { instagram: 'ig', tiktok: 'tt', youtube: { title: 'T', description: 'D' }, twitter: 'tw', hashtags: ['fpv'] };
  const json = JSON.stringify(payload);

  it('parses plain JSON', () => {
    expect(parseCaptionResponse(json)).toEqual(payload);
  });

  it('parses a fenced json block', () => {
    expect(parseCaptionResponse('```json\n' + json + '\n```')).toEqual(payload);
  });

  it('parses JSON after leading prose and before trailing prose', () => {
    expect(parseCaptionResponse(`Sure, here are your captions:\n${json}\nHope that helps!`)).toEqual(payload);
  });

  it('fills missing fields with empty values', () => {
    expect(parseCaptionResponse('{"instagram":"only"}')).toEqual({
      instagram: 'only',
      tiktok: '',
      youtube: { title: '', description: '' },
      twitter: '',
      hashtags: [],
    });
  });

  it('throws a clear error when there is no object', () => {
    expect(() => extractJsonObject('no json here')).toThrow('did not return a JSON object');
  });
});

describe('captionModelName', () => {
  it('shows the part after the last slash', () => {
    expect(captionModelName(openai)).toBe('qwen3-vl-8b');
    expect(captionModelName(gemini)).toBe('gemini-2.5-flash');
  });
});
