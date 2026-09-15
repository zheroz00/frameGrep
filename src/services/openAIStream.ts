export interface OpenAIStreamResult {
  content: string;
  reasoning: string;
  finishReason: string | null;
}

const consumeChoice = (value: unknown, result: OpenAIStreamResult): void => {
  const choice = (value as { choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown }; message?: { content?: unknown; reasoning_content?: unknown }; finish_reason?: unknown }> })?.choices?.[0];
  if (!choice) return;
  const payload = choice.delta ?? choice.message ?? {};
  if (typeof payload.content === 'string') result.content += payload.content;
  if (typeof payload.reasoning_content === 'string') result.reasoning += payload.reasoning_content;
  if (typeof choice.finish_reason === 'string') result.finishReason = choice.finish_reason;
};

const consumeSSEFrame = (frame: string, result: OpenAIStreamResult): void => {
  for (const line of frame.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try { consumeChoice(JSON.parse(payload), result); } catch { /* malformed event: keep parsing */ }
  }
};

export const parseOpenAIResponse = async (
  response: Response,
  signal?: AbortSignal,
  onProgress?: (characters: number) => void,
): Promise<OpenAIStreamResult> => {
  const result: OpenAIStreamResult = { content: '', reasoning: '', finishReason: null };
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('text/event-stream')) {
    consumeChoice(await response.json(), result);
    return result;
  }
  if (!response.body) throw new Error('Streaming response has no body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastProgress = Date.now();
  while (true) {
    if (signal?.aborted) {
      await reader.cancel(signal.reason).catch(() => undefined);
      throw signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');
    }
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? '';
    frames.forEach(frame => consumeSSEFrame(frame, result));
    if (Date.now() - lastProgress >= 1000) {
      onProgress?.(result.content.length + result.reasoning.length);
      lastProgress = Date.now();
    }
    if (done) break;
  }
  if (buffer.trim()) consumeSSEFrame(buffer, result);
  return result;
};
