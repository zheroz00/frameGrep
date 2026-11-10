/**
 * Social Media Caption Generation Service
 * Generates platform-specific captions from clip analysis data using the active
 * provider: Gemini directly, or any OpenAI-compatible endpoint (OpenRouter, local server).
 */
import { GoogleGenAI } from "@google/genai";
import type { AppSettings, ClipSegment, SocialCaptions, CaptionRequest } from "../types";
import { parseOpenAIResponse } from "./openAIStream";
import { CAPTION_SYSTEM_PROMPT, buildClipContext, buildVideoContext } from "./captionPrompts";

const CAPTION_TEMPERATURE = 0.8; // Slightly creative for captions
const CAPTION_MAX_TOKENS = 2048;
const GEMINI_CAPTION_MODEL = "gemini-2.5-flash";

export type CaptionBackend =
  | { kind: "gemini"; apiKey: string; model: string }
  | { kind: "openai"; endpoint: string; apiKey?: string; model: string };

/** Error carrying the HTTP status of a failed OpenAI-compatible request. */
class CaptionHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "CaptionHttpError";
  }
}

/**
 * Pick the caption backend for the active provider, or explain why none is available.
 * Marlin has no text model, so it falls back to Gemini when a key is set.
 */
export function resolveCaptionBackend(
  settings: Pick<AppSettings, "provider" | "geminiApiKey" | "customConfig">
): CaptionBackend | { error: string } {
  if (settings.provider === "custom") {
    const { endpoint, apiKey, model } = settings.customConfig;
    return { kind: "openai", endpoint, apiKey: apiKey || undefined, model };
  }
  if (settings.geminiApiKey) {
    return { kind: "gemini", apiKey: settings.geminiApiKey, model: GEMINI_CAPTION_MODEL };
  }
  return {
    error:
      settings.provider === "marlin"
        ? "Marlin can't write captions. Add a Gemini API key in Settings, or switch to the Custom provider."
        : "Add a Gemini API key in Settings, or switch to the Custom provider.",
  };
}

/** Model name for display: the part after the last slash of an id like "qwen/qwen3-vl-8b". */
export function captionModelName(backend: CaptionBackend): string {
  return backend.model.slice(backend.model.lastIndexOf("/") + 1);
}

function httpStatusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") return status;
  // The Gemini SDK embeds the Google JSON error body in the message
  const match = error instanceof Error ? error.message.match(/"code"\s*:\s*(\d{3})/) : null;
  return match ? Number(match[1]) : undefined;
}

/** Turn a provider failure into one clear sentence for the user. */
export function describeCaptionError(error: unknown, backend: CaptionBackend): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = httpStatusOf(error);

  if (status === 429 || /RESOURCE_EXHAUSTED/.test(message)) {
    return "Rate limited by the provider. Wait a moment and try again.";
  }

  if (backend.kind === "gemini") {
    const rejectedStatus = status === 400 || status === 401 || status === 403;
    if (
      /API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(message) ||
      (rejectedStatus && /key|blocked/i.test(message))
    ) {
      return "Google rejected the Gemini API key. Check it in Settings (the key must be allowed to use the Gemini API), or switch to the Custom provider.";
    }
  } else if (status === 401 || status === 403) {
    return `The Custom provider rejected the API key for ${backend.model}. Check it in Settings.`;
  }

  return message || "Failed to generate captions";
}

/**
 * Pull the JSON object out of model output: strips a markdown fence and any prose
 * around it by slicing from the first "{" to the last "}".
 */
export function extractJsonObject(text: string): string {
  const unfenced = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The model did not return a JSON object");
  }
  return unfenced.slice(start, end + 1);
}

/** Parse model output into SocialCaptions, filling any missing fields. */
export function parseCaptionResponse(text: string): SocialCaptions {
  const parsed = JSON.parse(extractJsonObject(text));

  return {
    instagram: parsed.instagram || "",
    tiktok: parsed.tiktok || "",
    youtube: {
      title: parsed.youtube?.title || "",
      description: parsed.youtube?.description || "",
    },
    twitter: parsed.twitter || "",
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
  };
}

async function requestGemini(
  backend: Extract<CaptionBackend, { kind: "gemini" }>,
  context: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: backend.apiKey });
  const response = await ai.models.generateContent({
    model: backend.model,
    contents: context,
    config: {
      systemInstruction: CAPTION_SYSTEM_PROMPT,
      temperature: CAPTION_TEMPERATURE,
    },
  });
  return response.text ?? "";
}

async function requestOpenAI(
  backend: Extract<CaptionBackend, { kind: "openai" }>,
  context: string
): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (backend.apiKey) headers["Authorization"] = `Bearer ${backend.apiKey}`;
  if (backend.endpoint.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = window.location.origin;
    headers["X-Title"] = "frameGrep";
  }

  // No response_format: local servers reject it, so the prompt alone asks for JSON
  const response = await fetch(`${backend.endpoint.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: backend.model,
      messages: [
        { role: "system", content: CAPTION_SYSTEM_PROMPT },
        { role: "user", content: context },
      ],
      temperature: CAPTION_TEMPERATURE,
      stream: false,
      max_tokens: CAPTION_MAX_TOKENS,
    }),
  });

  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 300);
    throw new CaptionHttpError(
      response.status,
      `Provider returned ${response.status}${body ? `: ${body}` : ""}`
    );
  }

  const result = await parseOpenAIResponse(response);
  return result.content.trim() || result.reasoning;
}

/**
 * Generate social media captions for a single clip or full video
 */
export async function generateCaptions(
  backend: CaptionBackend,
  request: CaptionRequest
): Promise<SocialCaptions> {
  if (backend.kind === "gemini" && !backend.apiKey) {
    throw new Error("Gemini API key is required for caption generation");
  }

  // Build context based on mode
  let context: string;
  if (request.mode === "clip" && request.clip) {
    context = `Generate captions for this FPV clip:\n\n${buildClipContext(request.clip)}`;
  } else if (request.mode === "video" && request.clips?.length) {
    context = `Generate captions summarizing this FPV video:\n\n${buildVideoContext(request.clips)}`;
  } else {
    throw new Error("Invalid request: provide clip for clip mode or clips for video mode");
  }

  if (request.videoFilename) {
    context += `\n\nFilename context: ${request.videoFilename}`;
  }

  try {
    const text =
      backend.kind === "gemini"
        ? await requestGemini(backend, context)
        : await requestOpenAI(backend, context);
    if (!text.trim()) {
      throw new Error(`Empty response from ${backend.model}`);
    }

    return parseCaptionResponse(text);
  } catch (error) {
    console.error("Caption generation failed:", error);
    throw error;
  }
}

/**
 * Generate captions for a single clip
 */
export async function generateClipCaption(
  backend: CaptionBackend,
  clip: ClipSegment,
  videoFilename?: string
): Promise<SocialCaptions> {
  return generateCaptions(backend, {
    mode: "clip",
    clip,
    videoFilename,
  });
}

/**
 * Generate captions summarizing an entire video
 */
export async function generateVideoCaption(
  backend: CaptionBackend,
  clips: ClipSegment[],
  videoFilename?: string
): Promise<SocialCaptions> {
  return generateCaptions(backend, {
    mode: "video",
    clips,
    videoFilename,
  });
}
