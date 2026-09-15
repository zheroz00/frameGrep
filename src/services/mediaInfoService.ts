/**
 * MediaInfo Service
 * Extracts video metadata (fps, resolution, codec) using MediaInfo.js WASM.
 */

import MediaInfoFactory, { type MediaInfo } from 'mediainfo.js';
import { VideoMetadata } from '../types';
import { normalizeFrameRate, parseMediaInfoDuration } from '../domain/media';

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

    const frameRate = normalizeFrameRate(
      videoTrack.FrameRate,
      videoTrack.FrameRate_Num,
      videoTrack.FrameRate_Den,
      videoTrack.FrameRate_Mode,
    );

    // Extract resolution
    const width = parseInt(videoTrack.Width) || 1920;
    const height = parseInt(videoTrack.Height) || 1080;

    // Extract codec
    const codec = videoTrack.Format || videoTrack.CodecID || 'unknown';

    // Extract duration in seconds
    const generalTrack = parsed.media?.track?.find(
      (t: { '@type': string }) => t['@type'] === 'General'
    );
    const duration = parseMediaInfoDuration(generalTrack?.Duration, videoTrack.Duration);

    console.log(`MediaInfo extracted for ${file.name}:`, { frameRate, width, height, codec, duration });

    return {
      filename: file.name,
      frameRate,
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
 * Default metadata when extraction fails
 */
function getDefaultMetadata(filename: string): VideoMetadata {
  return {
    filename,
    frameRate: normalizeFrameRate(30, 30, 1),
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
