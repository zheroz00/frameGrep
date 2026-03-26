/**
 * MediaInfo Service
 * Extracts video metadata (fps, resolution, codec) using MediaInfo.js WASM.
 */

import MediaInfoFactory, { type MediaInfo } from 'mediainfo.js';
import { VideoMetadata } from '../types';

// Singleton instance of MediaInfo
let mediaInfoInstance: MediaInfo<'JSON'> | null = null;

/**
 * Initialize MediaInfo WASM instance (lazy loaded)
 */
async function getMediaInfo(): Promise<MediaInfo<'JSON'>> {
  if (!mediaInfoInstance) {
    mediaInfoInstance = await MediaInfoFactory({
      format: 'JSON',
      locateFile: () => '/MediaInfoModule.wasm', // Loaded from public folder
    }) as MediaInfo<'JSON'>;
  }
  return mediaInfoInstance;
}

/**
 * Extract metadata from a video File
 */
export async function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  const mediaInfo = await getMediaInfo();

  const getSize = () => file.size;
  const readChunk = (chunkSize: number, offset: number): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result instanceof ArrayBuffer) {
          resolve(new Uint8Array(e.target.result));
        } else {
          reject(new Error('Failed to read file chunk'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
    });
  };

  try {
    const result = await mediaInfo.analyzeData(getSize, readChunk);
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    // Find video track
    const videoTrack = parsed.media?.track?.find(
      (t: { '@type': string }) => t['@type'] === 'Video'
    );

    if (!videoTrack) {
      console.warn('No video track found in file:', file.name);
      return getDefaultMetadata(file.name);
    }

    // Extract FPS - MediaInfo can report it in several formats
    let fps = 30; // Default fallback
    if (videoTrack.FrameRate) {
      fps = parseFloat(videoTrack.FrameRate);
    } else if (videoTrack.FrameRate_Num && videoTrack.FrameRate_Den) {
      fps = videoTrack.FrameRate_Num / videoTrack.FrameRate_Den;
    }

    // Round to common frame rates to avoid weird decimals
    fps = normalizeFrameRate(fps);

    // Extract resolution
    const width = parseInt(videoTrack.Width) || 1920;
    const height = parseInt(videoTrack.Height) || 1080;

    // Extract codec
    const codec = videoTrack.Format || videoTrack.CodecID || 'unknown';

    // Extract duration in seconds
    const generalTrack = parsed.media?.track?.find(
      (t: { '@type': string }) => t['@type'] === 'General'
    );
    const durationMs = parseFloat(generalTrack?.Duration || videoTrack.Duration || '0');
    const duration = durationMs > 0 ? Math.round(durationMs) / 1000 : 0;

    console.log(`MediaInfo extracted for ${file.name}:`, { fps, width, height, codec, duration });

    return {
      filename: file.name,
      fps,
      width,
      height,
      codec,
      duration,
    };
  } catch (error) {
    console.error('MediaInfo extraction failed:', error);
    return getDefaultMetadata(file.name);
  }
}

/**
 * Normalize frame rate to common values
 * Handles cases like 29.97 → 30, 23.976 → 24, 59.94 → 60
 */
function normalizeFrameRate(fps: number): number {
  const commonRates = [24, 25, 30, 48, 50, 60, 100, 120, 240];

  // Check for NTSC variants (29.97, 59.94, etc.)
  for (const rate of commonRates) {
    // NTSC rates are rate * 1000/1001
    const ntscRate = rate * 1000 / 1001;
    if (Math.abs(fps - ntscRate) < 0.1) {
      return rate; // Return the clean number
    }
    if (Math.abs(fps - rate) < 0.5) {
      return rate;
    }
  }

  // If not a common rate, round to nearest integer
  return Math.round(fps);
}

/**
 * Default metadata when extraction fails
 */
function getDefaultMetadata(filename: string): VideoMetadata {
  return {
    filename,
    fps: 30,
    width: 1920,
    height: 1080,
    codec: 'unknown',
    duration: 0,
  };
}

/**
 * Get the "dominant" metadata from multiple videos
 * Uses the first video's settings (most common workflow)
 */
export function getDominantMetadata(metadataList: VideoMetadata[]): VideoMetadata | null {
  if (metadataList.length === 0) return null;

  // For now, use the first video's metadata
  // Could be extended to find the most common fps/resolution
  return metadataList[0];
}
