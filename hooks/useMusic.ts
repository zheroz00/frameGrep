/**
 * useMusic Hook
 * Manages music panel state, Jamendo searches, and audio preview playback.
 */

import { useState, useCallback, useRef } from 'react';
import { ClipSegment, JamendoTrack, MusicSuggestion, MusicSearchMode } from '../types';
import { searchTracksForClips, generateMusicSuggestion, searchTracks } from '../services/jamendoService';

export interface UseMusicReturn {
  // Panel state
  isOpen: boolean;
  openPanel: (mode: MusicSearchMode, clipIndex?: number) => void;
  closePanel: () => void;

  // Search state
  mode: MusicSearchMode;
  selectedClipIndex: number | null;
  suggestion: MusicSuggestion | null;
  tracks: JamendoTrack[];
  isLoading: boolean;
  error: string | null;

  // Actions
  searchMusic: (clientId: string, clips: ClipSegment[], clipIndex?: number) => Promise<void>;
  searchWithCustomTags: (clientId: string, tags: string[], speed?: string) => Promise<void>;
  clearResults: () => void;

  // Audio playback
  currentlyPlaying: string | null;
  playTrack: (trackId: string, audioUrl: string) => void;
  stopPlayback: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export function useMusic(): UseMusicReturn {
  // Panel state
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<MusicSearchMode>('all_clips');
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);

  // Search results
  const [suggestion, setSuggestion] = useState<MusicSuggestion | null>(null);
  const [tracks, setTracks] = useState<JamendoTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio playback
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const openPanel = useCallback((searchMode: MusicSearchMode, clipIndex?: number) => {
    setMode(searchMode);
    setSelectedClipIndex(clipIndex ?? null);
    setIsOpen(true);
    // Clear previous results when opening with new context
    setTracks([]);
    setSuggestion(null);
    setError(null);
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    stopPlayback();
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setCurrentlyPlaying(null);
  }, []);

  const playTrack = useCallback((trackId: string, audioUrl: string) => {
    // If clicking the same track, toggle playback
    if (currentlyPlaying === trackId) {
      stopPlayback();
      return;
    }

    // Stop any current playback
    stopPlayback();

    // Create audio element if needed
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('ended', () => {
        setCurrentlyPlaying(null);
      });
      audioRef.current.addEventListener('error', () => {
        console.error('Audio playback error');
        setCurrentlyPlaying(null);
      });
    }

    // Play new track
    audioRef.current.src = audioUrl;
    audioRef.current.play().catch(err => {
      console.error('Failed to play audio:', err);
      setCurrentlyPlaying(null);
    });
    setCurrentlyPlaying(trackId);
  }, [currentlyPlaying, stopPlayback]);

  const searchMusic = useCallback(async (
    clientId: string,
    clips: ClipSegment[],
    clipIndex?: number
  ) => {
    if (!clientId) {
      setError('Jamendo Client ID not configured. Please add it in Settings.');
      return;
    }

    setIsLoading(true);
    setError(null);
    stopPlayback();

    try {
      // Determine which clips to analyze
      const clipsToAnalyze = clipIndex !== undefined && clipIndex !== null
        ? [clips[clipIndex]]
        : clips;

      if (clipsToAnalyze.length === 0) {
        setError('No clips to analyze');
        setIsLoading(false);
        return;
      }

      const result = await searchTracksForClips(clientId, clipsToAnalyze, 12);
      setSuggestion(result.suggestion);
      setTracks(result.tracks);

      if (result.tracks.length === 0) {
        setError('No tracks found. Try different search terms.');
      }
    } catch (err) {
      console.error('Music search error:', err);
      setError(err instanceof Error ? err.message : 'Failed to search for music');
    } finally {
      setIsLoading(false);
    }
  }, [stopPlayback]);

  const searchWithCustomTags = useCallback(async (
    clientId: string,
    tags: string[],
    speed?: string
  ) => {
    if (!clientId) {
      setError('Jamendo Client ID not configured. Please add it in Settings.');
      return;
    }

    setIsLoading(true);
    setError(null);
    stopPlayback();

    try {
      const results = await searchTracks(clientId, {
        tags,
        speed,
        limit: 12,
      });

      // Update suggestion to reflect custom search
      setSuggestion({
        searchTerms: tags,
        genres: tags.slice(0, 2),
        tempo: speed || 'medium',
        mood: 'Custom search',
        reasoning: `Searching for: ${tags.join(', ')}`,
      });
      setTracks(results);

      if (results.length === 0) {
        setError('No tracks found. Try different search terms.');
      }
    } catch (err) {
      console.error('Custom music search error:', err);
      setError(err instanceof Error ? err.message : 'Failed to search for music');
    } finally {
      setIsLoading(false);
    }
  }, [stopPlayback]);

  const clearResults = useCallback(() => {
    setTracks([]);
    setSuggestion(null);
    setError(null);
    stopPlayback();
  }, [stopPlayback]);

  return {
    isOpen,
    openPanel,
    closePanel,
    mode,
    selectedClipIndex,
    suggestion,
    tracks,
    isLoading,
    error,
    searchMusic,
    searchWithCustomTags,
    clearResults,
    currentlyPlaying,
    playTrack,
    stopPlayback,
    audioRef,
  };
}
