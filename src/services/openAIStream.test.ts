import { describe, expect, it } from 'vitest';
import { parseOpenAIResponse } from './openAIStream';

const response = (body: string, contentType = 'text/event-stream') => new Response(body, { headers: { 'Content-Type': contentType } });

describe('parseOpenAIResponse', () => {
  it('handles CRLF SSE and a final frame without a trailing delimiter', async () => {
    const parsed = await parseOpenAIResponse(response(
      'data: {"choices":[{"delta":{"content":"["}}]}\r\n\r\n' +
      'data: {"choices":[{"delta":{"content":"]"},"finish_reason":"stop"}]}',
    ));
    expect(parsed.content).toBe('[]');
    expect(parsed.finishReason).toBe('stop');
  });

  it('handles non-stream OpenAI responses', async () => {
    const parsed = await parseOpenAIResponse(response(
      JSON.stringify({ choices: [{ message: { content: '[]' }, finish_reason: 'stop' }] }),
      'application/json',
    ));
    expect(parsed.content).toBe('[]');
  });

  it('ignores malformed SSE events and keeps valid events', async () => {
    const parsed = await parseOpenAIResponse(response(
      'data: nope\n\ndata: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
    ));
    expect(parsed.content).toBe('ok');
  });
});
