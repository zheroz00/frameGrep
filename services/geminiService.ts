import { GoogleGenAI, Schema, Type } from "@google/genai";
import { ClipSegment } from "../types";

// Schema definition for structured JSON output
const clipSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      start_time: {
        type: Type.STRING,
        description: "Start time of the clip in MM:SS format",
      },
      end_time: {
        type: Type.STRING,
        description: "End time of the clip in MM:SS format",
      },
      description: {
        type: Type.STRING,
        description: "Brief description of the maneuver (e.g., Power Loop, Gap, Dive)",
      },
      excitement_score: {
        type: Type.INTEGER,
        description: "Excitement score from 1-10",
      },
      mood: {
        type: Type.STRING,
        description: "Overall mood/energy of the clip",
        enum: ["intense", "smooth", "dramatic", "peaceful", "playful", "technical"],
      },
      lighting: {
        type: Type.STRING,
        description: "Lighting conditions in the clip",
        enum: ["golden_hour", "midday", "overcast", "shade", "indoor", "mixed", "low_light"],
      },
      dominant_colors: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Top 1-3 dominant colors (e.g., orange, blue, green, gray)",
      },
    },
    required: ["start_time", "end_time", "description", "excitement_score"],
  },
};

export type UploadPhase = 'uploading' | 'processing';
export type ProgressCallback = (phase: UploadPhase, detail?: { attempt?: number; maxAttempts?: number }) => void;

/**
 * Uploads a file to Gemini using the Files API.
 * Polls for processing completion with a 5-minute timeout.
 * @param onProgress - Optional callback for progress updates
 */
export const uploadVideo = async (
  apiKey: string,
  file: File,
  onProgress?: ProgressCallback
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is required");
  const ai = new GoogleGenAI({ apiKey });

  const MAX_POLL_ATTEMPTS = 150; // 5 minutes at 2s intervals
  const POLL_INTERVAL_MS = 2000;

  try {
    onProgress?.('uploading');

    const uploadResponse = await ai.files.upload({
      file: file,
      config: {
        displayName: file.name,
        mimeType: file.type
      }
    });

    const fileName = uploadResponse.name;
    let fileState = uploadResponse.state;
    let attempts = 0;

    while (fileState === "PROCESSING") {
      if (attempts++ >= MAX_POLL_ATTEMPTS) {
        throw new Error("Video processing timed out after 5 minutes. Try a smaller file or different format.");
      }
      onProgress?.('processing', { attempt: attempts, maxAttempts: MAX_POLL_ATTEMPTS });
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const fileStatus = await ai.files.get({ name: fileName });
      fileState = fileStatus.state;

      if (fileState === "FAILED") {
        throw new Error("Video processing failed on Gemini servers.");
      }
    }

    return uploadResponse.uri;
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
};

/**
 * Analyzes the video using the file URI reference and a custom instruction.
 */
export const analyzeVideo = async (
  apiKey: string,
  fileUri: string,
  mimeType: string,
  systemInstruction: string
): Promise<ClipSegment[]> => {
  if (!apiKey) throw new Error("API Key is required");

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            fileData: {
              mimeType: mimeType,
              fileUri: fileUri,
            },
          },
          {
            text: "Analyze this video and provide a JSON list of the best FPV moments according to your instructions.",
          },
        ],
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: clipSchema,
        temperature: 0.2,
        safetySettings: [
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_ONLY_HIGH",
          },
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_NONE",
          },
        ],
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    return JSON.parse(text) as ClipSegment[];
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    throw error;
  }
};

/**
 * Uses Gemini to optimize a prompt for video analysis.
 */
export const optimizeSystemInstruction = async (apiKey: string, currentPrompt: string): Promise<string> => {
  if (!apiKey) throw new Error("API Key is required for optimization");
  const ai = new GoogleGenAI({ apiKey });

  const metaPrompt = `You are a world-class AI Prompt Engineer specializing in Video Multimodal Analysis. 
Your task is to rewrite the provided "System Instruction" for Gemini to make it extremely precise, clear, and effective for identifying FPV drone maneuvers.

Current Instruction:
"""
${currentPrompt}
"""

Guidelines for the new version:
1. Use professional, technical language appropriate for FPV cinematography.
2. Clarify the goals (what to pick, what to ignore).
3. Ensure the model focuses on temporal cues (audio spikes, motion flow).
4. Maintain the structure so it still works for JSON extraction.
5. DO NOT mention the output schema itself (that is handled separately).
6. Return ONLY the improved instruction text.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: metaPrompt,
      config: {
        temperature: 0.7,
      }
    });

    return response.text || currentPrompt;
  } catch (error) {
    console.error("Optimization failed:", error);
    return currentPrompt;
  }
};
