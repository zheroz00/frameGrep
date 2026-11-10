/**
 * Caption prompt text and context builders, shared by every caption backend.
 */
import type { ClipSegment } from "../types";

// Platform character limits
export const PLATFORM_LIMITS = {
  instagram: { optimal: 150, max: 2200 },
  tiktok: { optimal: 150, max: 2200 },
  youtube: { titleMax: 100, descriptionMax: 5000 },
  twitter: { max: 280 },
};

// Base system instruction for caption generation
export const CAPTION_SYSTEM_PROMPT = `You are a social media copywriter for FPV drone content creators.

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
export function buildClipContext(clip: ClipSegment): string {
  const parts: string[] = [];

  parts.push(`Description: ${clip.description}`);
  parts.push(`Excitement: ${clip.excitementScore}/10`);

  if (clip.mood) parts.push(`Mood: ${clip.mood}`);
  if (clip.energyLevel) parts.push(`Energy: ${clip.energyLevel}`);
  if (clip.lighting) parts.push(`Lighting: ${clip.lighting}`);
  if (clip.dominantColors?.length) {
    parts.push(`Colors: ${clip.dominantColors.join(", ")}`);
  }
  if (clip.sectionType) parts.push(`Type: ${clip.sectionType}`);

  return parts.join("\n");
}

/**
 * Build context string from multiple clips (video summary)
 */
export function buildVideoContext(clips: ClipSegment[]): string {
  const highlights = clips
    .filter((c) => c.excitementScore >= 7)
    .slice(0, 5)
    .map((c) => `- ${c.description} (${c.mood || "dynamic"}, ${c.excitementScore}/10)`)
    .join("\n");

  const moods = [...new Set(clips.map((c) => c.mood).filter(Boolean))];
  const avgExcitement = clips.reduce((sum, c) => sum + c.excitementScore, 0) / clips.length;

  return `Video Summary:
Total clips: ${clips.length}
Average excitement: ${avgExcitement.toFixed(1)}/10
Moods: ${moods.join(", ") || "varied"}

Top moments:
${highlights || "Various highlights throughout"}`;
}
