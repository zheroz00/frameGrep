/**
 * Social Media Caption Generation Service
 * Uses Gemini AI to generate platform-specific captions from clip analysis data
 */
import { GoogleGenAI } from "@google/genai";
import type { ClipSegment, SocialCaptions, CaptionRequest } from "../types";

// Platform character limits
const PLATFORM_LIMITS = {
  instagram: { optimal: 150, max: 2200 },
  tiktok: { optimal: 150, max: 2200 },
  youtube: { titleMax: 100, descriptionMax: 5000 },
  twitter: { max: 280 },
};

// Base system instruction for caption generation
const CAPTION_SYSTEM_PROMPT = `You are a social media copywriter for FPV drone content creators.

TONE GUIDELINES:
- Write like a skilled pilot sharing their work, not a marketer trying to go viral
- Be confident and authentic, never desperate for attention
- Subtle wit is welcome, but don't force it
- Let impressive footage speak for itself

AVOID:
- ALL CAPS words for emphasis
- Excessive emojis (1-2 max per caption)
- Clickbait phrases: "INSANE", "YOU WON'T BELIEVE", "EPIC", "CRAZY"
- Begging for engagement: "like and subscribe!", "follow for more!"
- Generic filler: "Check this out!", "What do you think?"

DO:
- Reference specific moves/moments when mentioned (power loops, gaps, proximity)
- Match each platform's culture naturally
- Keep captions punchy and readable
- Include relevant hashtags that real pilots use

HASHTAG GUIDELINES:
- Generate 4-6 relevant hashtags based on content
- Use a mix of: general (#fpv #drone), style-specific (#fpvfreestyle #cinewhooping), and content-specific (#powerloop #bando)
- No made-up or overly niche hashtags

OUTPUT FORMAT:
Return a valid JSON object with this exact structure:
{
  "instagram": "caption text here",
  "tiktok": "caption text here",
  "youtube": {
    "title": "title here (max 100 chars)",
    "description": "description here"
  },
  "twitter": "caption text here (max 280 chars)",
  "hashtags": ["fpv", "drone", "freestyle"]
}

Platform notes:
- Instagram: ${PLATFORM_LIMITS.instagram.optimal}-${PLATFORM_LIMITS.instagram.max} chars, can be slightly longer and more descriptive
- TikTok: ${PLATFORM_LIMITS.tiktok.optimal} chars optimal, casual and snappy
- YouTube: Compelling title (${PLATFORM_LIMITS.youtube.titleMax} chars max) + 2-3 sentence description
- Twitter/X: Under ${PLATFORM_LIMITS.twitter.max} chars, punchy one-liner`;

/**
 * Build context string from clip data
 */
function buildClipContext(clip: ClipSegment): string {
  const parts: string[] = [];

  parts.push(`Description: ${clip.description}`);
  parts.push(`Excitement: ${clip.excitement_score}/10`);

  if (clip.mood) parts.push(`Mood: ${clip.mood}`);
  if (clip.energy_level) parts.push(`Energy: ${clip.energy_level}`);
  if (clip.lighting) parts.push(`Lighting: ${clip.lighting}`);
  if (clip.dominant_colors?.length) {
    parts.push(`Colors: ${clip.dominant_colors.join(", ")}`);
  }
  if (clip.section_type) parts.push(`Type: ${clip.section_type}`);

  return parts.join("\n");
}

/**
 * Build context string from multiple clips (video summary)
 */
function buildVideoContext(clips: ClipSegment[]): string {
  const highlights = clips
    .filter((c) => c.excitement_score >= 7)
    .slice(0, 5)
    .map((c) => `- ${c.description} (${c.mood || "dynamic"}, ${c.excitement_score}/10)`)
    .join("\n");

  const moods = [...new Set(clips.map((c) => c.mood).filter(Boolean))];
  const avgExcitement = clips.reduce((sum, c) => sum + c.excitement_score, 0) / clips.length;

  return `Video Summary:
Total clips: ${clips.length}
Average excitement: ${avgExcitement.toFixed(1)}/10
Moods: ${moods.join(", ") || "varied"}

Top moments:
${highlights || "Various highlights throughout"}`;
}

/**
 * Parse JSON response from Gemini, handling markdown code blocks
 */
function parseResponse(text: string): SocialCaptions {
  // Strip markdown code blocks if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  // Ensure all required fields exist
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

/**
 * Generate social media captions for a single clip or full video
 */
export async function generateCaptions(
  apiKey: string,
  request: CaptionRequest
): Promise<SocialCaptions> {
  if (!apiKey) {
    throw new Error("Gemini API key is required for caption generation");
  }

  const ai = new GoogleGenAI({ apiKey });

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
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: context,
      config: {
        systemInstruction: CAPTION_SYSTEM_PROMPT,
        temperature: 0.8, // Slightly creative for captions
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini");
    }

    return parseResponse(text);
  } catch (error) {
    console.error("Caption generation failed:", error);
    throw error;
  }
}

/**
 * Generate captions for a single clip
 */
export async function generateClipCaption(
  apiKey: string,
  clip: ClipSegment,
  videoFilename?: string
): Promise<SocialCaptions> {
  return generateCaptions(apiKey, {
    mode: "clip",
    clip,
    videoFilename,
  });
}

/**
 * Generate captions summarizing an entire video
 */
export async function generateVideoCaption(
  apiKey: string,
  clips: ClipSegment[],
  videoFilename?: string
): Promise<SocialCaptions> {
  return generateCaptions(apiKey, {
    mode: "video",
    clips,
    videoFilename,
  });
}
