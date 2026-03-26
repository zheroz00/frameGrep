/**
 * useMusic Hook
 * Manages music panel state, Jamendo searches, audio preview playback, and track selection/download.
 */

import { useState, useCallback, useRef } from 'react';
import { ClipSegment, JamendoTrack, MusicSuggestion, MusicSearchMode, SelectedMusicTrack } from '../types';
import { searchTracksForClips, searchTracks } from '../services/jamendoService';

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

  // Track selection & download
  selectedTrack: SelectedMusicTrack | null;
  isDownloading: boolean;
  downloadProgress: number; // 0-100
  selectTrack: (track: JamendoTrack, directoryHandle: FileSystemDirectoryHandle | null) => Promise<SelectedMusicTrack | null>;
  clearSelectedTrack: () => void;
  setSelectedTrack: (track: SelectedMusicTrack | null) => void;
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

  // Track selection & download
  const [selectedTrack, setSelectedTrack] = useState<SelectedMusicTrack | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const openPanel = useCallback((searchMode: MusicSearchMode, clipIndex?: number) => {
    setMode(searchMode);
    setSelectedClipIndex(clipIndex ?? null);
    setIsOpen(true);
    // Clear previous results when opening with new context
    setTracks([]);
    setSuggestion(null);
    setError(null);
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setCurrentlyPlaying(null);
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    stopPlayback();
  }, [stopPlayback]);

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

  const clearSelectedTrack = useCallback(() => {
    setSelectedTrack(null);
  }, []);

  /**
   * Select a track: download it to the linked folder and save the selection
   */
  const selectTrack = useCallback(async (
    track: JamendoTrack,
    directoryHandle: FileSystemDirectoryHandle | null
  ): Promise<SelectedMusicTrack | null> => {
    if (!directoryHandle) {
      setError('No folder linked. Please link a folder in Settings → Data Backup first.');
      return null;
    }

    setIsDownloading(true);
    setDownloadProgress(0);
    setError(null);
    stopPlayback();

    try {
      // Generate filename: sanitize track name + ID for uniqueness
      const sanitizedName = track.name.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 30);
      const filename = `music_${sanitizedName}_${track.id}.mp3`;

      // Fetch the audio file from Jamendo
      // Note: audiodownload URL requires the client_id parameter to work
      // The audio preview URL (track.audio) works for streaming
      // We'll use the download URL which gives full quality
      const downloadUrl = track.audiodownload;

      console.log('Downloading track from:', downloadUrl);

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
      }

      // Get content length for progress tracking
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      // Read the response as a stream for progress tracking
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to read download stream');
      }

      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        received += value.length;

        if (total > 0) {
          setDownloadProgress(Math.round((received / total) * 100));
        }
      }

      // Combine chunks into a single blob
      const blob = new Blob(chunks, { type: 'audio/mpeg' });

      // Write to the linked folder
      const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      console.log('Track saved to folder:', filename);

      // Create the selected track record
      const selected: SelectedMusicTrack = {
        track,
        filename,
        downloadedAt: new Date().toISOString(),
      };

      setSelectedTrack(selected);
      setDownloadProgress(100);

      return selected;
    } catch (err) {
      console.error('Track download error:', err);
      setError(err instanceof Error ? err.message : 'Failed to download track');
      return null;
    } finally {
      setIsDownloading(false);
    }
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
    // Track selection & download
    selectedTrack,
    isDownloading,
    downloadProgress,
    selectTrack,
    clearSelectedTrack,
    setSelectedTrack,
  };
}
