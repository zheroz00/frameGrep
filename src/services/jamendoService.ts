/**
 * Jamendo API Service
 * Handles music search and track retrieval from Jamendo's free music library.
 *
 * API Docs: https://developer.jamendo.com/v3.0/tracks
 */

import { JamendoTrack, ClipSegment, MusicSuggestion, ClipMood, EnergyLevel } from '../types';

// Use proxy in development to avoid CORS/Origin issues
// Vite proxies /api/jamendo/* to https://api.jamendo.com/*
const JAMENDO_API_BASE = import.meta.env.DEV
  ? '/api/jamendo/v3.0'
  : 'https://api.jamendo.com/v3.0';

// Map clip moods to Jamendo search tags
const MOOD_TO_TAGS: Record<ClipMood, string[]> = {
  intense: ['energetic', 'powerful', 'driving', 'action', 'epic'],
  smooth: ['chill', 'relaxing', 'smooth', 'ambient', 'lounge'],
  dramatic: ['cinematic', 'dramatic', 'epic', 'orchestral', 'trailer'],
  peaceful: ['peaceful', 'calm', 'meditation', 'nature', 'acoustic'],
  playful: ['happy', 'fun', 'upbeat', 'comedy', 'quirky'],
  technical: ['electronic', 'tech', 'industrial', 'experimental', 'minimal'],
};

// Map energy levels to Jamendo speed parameter
const ENERGY_TO_SPEED: Record<EnergyLevel, string> = {
  high: 'veryhigh',
  medium: 'medium',
  low: 'verylow',
};

// Common video content types to tags
const CONTENT_TAGS: Record<string, string[]> = {
  fpv: ['electronic', 'energetic', 'driving', 'action', 'dubstep'],
  drone: ['cinematic', 'ambient', 'epic', 'inspiring', 'aerial'],
  sports: ['energetic', 'rock', 'action', 'powerful', 'upbeat'],
  nature: ['ambient', 'peaceful', 'nature', 'acoustic', 'relaxing'],
  funny: ['comedy', 'quirky', 'fun', 'happy', 'cartoon'],
  travel: ['world', 'adventure', 'inspiring', 'cinematic', 'acoustic'],
};

interface JamendoApiResponse {
  headers: {
    status: string;
    code: number;
    error_message?: string;
    results_count: number;
  };
  results: JamendoApiTrack[];
}

interface JamendoApiTrack {
  id: string;
  name: string;
  artist_name: string;
  album_name: string;
  duration: number;
  audio: string;
  audiodownload: string;
  image: string;
  shareurl: string;
  license_ccurl: string;
  musicinfo?: {
    tags?: { genres?: string[]; instruments?: string[]; vartags?: string[] };
    speed?: string;
  };
}

/**
 * Jamendo's API sometimes answers an identical, valid query with zero results and a success
 * code (measured: roughly one call in three). An empty answer is therefore retried before it
 * is believed. Delays are in milliseconds, one per retry.
 */
const EMPTY_RETRY_DELAYS_MS = [400, 900];

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export interface TrackSearchOptions {
  tags?: string[];
  speed?: string;
  limit?: number;
  offset?: number;
  order?: 'popularity_total' | 'releasedate' | 'downloads_total';
  /** Override the pauses between retries of an empty answer (tests pass zeros). */
  retryDelaysMs?: number[];
}

const requestTracks = async (clientId: string, options: TrackSearchOptions): Promise<JamendoTrack[]> => {
  const { tags = [], speed, limit = 10, offset = 0, order = 'popularity_total' } = options;

  const params = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    limit: String(limit),
    offset: String(offset),
    order,
    include: 'musicinfo',
    audioformat: 'mp32', // High quality streaming
  });

  // fuzzytags matches any of the tags (OR), so more tags widen the search
  if (tags.length > 0) params.append('fuzzytags', tags.join('+'));
  if (speed) params.append('speed', speed);

  const response = await fetch(`${JAMENDO_API_BASE}/tracks/?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Jamendo API error: ${response.status}`);
  }

  const data: JamendoApiResponse = await response.json();
  if (data.headers.code !== 0) {
    throw new Error(data.headers.error_message || 'Unknown Jamendo API error');
  }
  return data.results.map(mapApiTrackToJamendoTrack);
};

/**
 * Search for tracks on Jamendo. Retries an empty answer, and if the search is still empty
 * with a tempo filter, tries once more without the tempo so the tags alone can match.
 */
export async function searchTracks(clientId: string, options: TrackSearchOptions = {}): Promise<JamendoTrack[]> {
  const delays = options.retryDelaysMs ?? EMPTY_RETRY_DELAYS_MS;
  try {
    let tracks = await requestTracks(clientId, options);
    for (const delay of delays) {
      if (tracks.length > 0) break;
      await wait(delay);
      tracks = await requestTracks(clientId, options);
    }
    if (tracks.length === 0 && options.speed) {
      tracks = await requestTracks(clientId, { ...options, speed: undefined });
    }
    return tracks;
  } catch (error) {
    console.error('Jamendo search error:', error);
    throw error;
  }
}

/**
 * Map API response to our JamendoTrack type
 */
function mapApiTrackToJamendoTrack(track: JamendoApiTrack): JamendoTrack {
  const allTags = [
    ...(track.musicinfo?.tags?.genres || []),
    ...(track.musicinfo?.tags?.instruments || []),
    ...(track.musicinfo?.tags?.vartags || []),
  ];

  return {
    id: track.id,
    name: track.name,
    artist_name: track.artist_name,
    album_name: track.album_name,
    duration: track.duration,
    audio: track.audio,
    audiodownload: track.audiodownload,
    image: track.image,
    shareurl: track.shareurl,
    license_ccurl: track.license_ccurl,
    tags: allTags,
    speed: track.musicinfo?.speed,
  };
}

/**
 * Generate music suggestions based on clip analysis
 * This analyzes the clips and produces search parameters for Jamendo
 */
export function generateMusicSuggestion(clips: ClipSegment[]): MusicSuggestion {
  if (clips.length === 0) {
    return {
      searchTerms: ['cinematic', 'background'],
      genres: ['cinematic'],
      tempo: 'medium',
      mood: 'Neutral background music',
      reasoning: 'No clips to analyze - suggesting versatile background music.',
    };
  }

  // Analyze mood distribution
  const moodCounts: Record<string, number> = {};
  const energyCounts: Record<string, number> = {};
  let totalExcitement = 0;

  clips.forEach(clip => {
    if (clip.mood) {
      moodCounts[clip.mood] = (moodCounts[clip.mood] || 0) + 1;
    }
    if (clip.energyLevel) {
      energyCounts[clip.energyLevel] = (energyCounts[clip.energyLevel] || 0) + 1;
    }
    totalExcitement += clip.excitementScore || 5;
  });

  // Find dominant mood
  const dominantMood = Object.entries(moodCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] as ClipMood | undefined;

  // Find dominant energy
  const dominantEnergy = Object.entries(energyCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] as EnergyLevel | undefined;

  // Calculate average excitement
  const avgExcitement = totalExcitement / clips.length;

  // Build search terms based on analysis
  const searchTerms: string[] = [];
  const genres: string[] = [];

  // Add mood-based tags
  if (dominantMood && MOOD_TO_TAGS[dominantMood]) {
    searchTerms.push(...MOOD_TO_TAGS[dominantMood].slice(0, 3));
    genres.push(MOOD_TO_TAGS[dominantMood][0]);
  }

  // Add excitement-based tags
  if (avgExcitement >= 8) {
    searchTerms.push('epic', 'powerful');
    genres.push('epic');
  } else if (avgExcitement >= 6) {
    searchTerms.push('upbeat', 'energetic');
  } else if (avgExcitement <= 4) {
    searchTerms.push('calm', 'ambient');
    genres.push('ambient');
  }

  // Determine tempo based on energy and excitement
  let tempo: string;
  if (dominantEnergy) {
    tempo = ENERGY_TO_SPEED[dominantEnergy];
  } else if (avgExcitement >= 7) {
    tempo = 'high';
  } else if (avgExcitement <= 4) {
    tempo = 'low';
  } else {
    tempo = 'medium';
  }

  // Check for FPV-related content in descriptions
  const allDescriptions = clips.map(c => c.description.toLowerCase()).join(' ');
  const hasFPVContent = /drone|fpv|flying|aerial|dive|flip|roll|trick/i.test(allDescriptions);
  const hasNatureContent = /nature|landscape|sunset|sunrise|ocean|mountain|forest/i.test(allDescriptions);
  const hasSportsContent = /action|sport|race|speed|fast|jump/i.test(allDescriptions);

  if (hasFPVContent) {
    searchTerms.push('electronic', 'driving');
    genres.push('electronic');
  }
  if (hasNatureContent) {
    searchTerms.push('cinematic', 'inspiring');
  }
  if (hasSportsContent) {
    searchTerms.push('action', 'rock');
  }

  // Deduplicate
  const uniqueTerms = [...new Set(searchTerms)].slice(0, 6);
  const uniqueGenres = [...new Set(genres)].slice(0, 3);

  // Generate human-readable mood description
  const moodDescription = generateMoodDescription(dominantMood, avgExcitement, dominantEnergy);

  // Generate reasoning
  const reasoning = generateReasoning(clips.length, dominantMood, avgExcitement, dominantEnergy);

  return {
    searchTerms: uniqueTerms.length > 0 ? uniqueTerms : ['cinematic', 'background'],
    genres: uniqueGenres.length > 0 ? uniqueGenres : ['cinematic'],
    tempo,
    mood: moodDescription,
    reasoning,
  };
}

function generateMoodDescription(
  mood: ClipMood | undefined,
  excitement: number,
  energy: EnergyLevel | undefined
): string {
  const parts: string[] = [];

  if (excitement >= 8) parts.push('High-energy');
  else if (excitement >= 6) parts.push('Upbeat');
  else if (excitement <= 4) parts.push('Calm');
  else parts.push('Moderate');

  if (mood) {
    const moodLabels: Record<ClipMood, string> = {
      intense: 'intense',
      smooth: 'smooth',
      dramatic: 'dramatic',
      peaceful: 'peaceful',
      playful: 'playful',
      technical: 'technical',
    };
    parts.push(moodLabels[mood]);
  }

  if (energy === 'high') parts.push('with driving energy');
  else if (energy === 'low') parts.push('with relaxed vibes');

  return parts.join(' ') || 'Versatile background music';
}

function generateReasoning(
  clipCount: number,
  mood: ClipMood | undefined,
  excitement: number,
  energy: EnergyLevel | undefined
): string {
  const reasons: string[] = [];

  reasons.push(`Analyzed ${clipCount} clip${clipCount > 1 ? 's' : ''}`);

  if (mood) {
    reasons.push(`dominant mood is "${mood}"`);
  }

  if (excitement >= 8) {
    reasons.push('high excitement scores suggest epic/powerful music');
  } else if (excitement <= 4) {
    reasons.push('lower excitement suggests calmer background music');
  }

  if (energy === 'high') {
    reasons.push('high energy clips need driving beats');
  } else if (energy === 'low') {
    reasons.push('low energy clips suit ambient/relaxed music');
  }

  return reasons.join('; ') + '.';
}

/**
 * Search tracks based on clip analysis
 * Combines suggestion generation with Jamendo search
 */
export async function searchTracksForClips(
  clientId: string,
  clips: ClipSegment[],
  limit: number = 10
): Promise<{ suggestion: MusicSuggestion; tracks: JamendoTrack[] }> {
  const suggestion = generateMusicSuggestion(clips);

  const tracks = await searchTracks(clientId, {
    tags: suggestion.searchTerms,
    speed: suggestion.tempo,
    limit,
  });

  return { suggestion, tracks };
}

/**
 * Format duration in seconds to MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
