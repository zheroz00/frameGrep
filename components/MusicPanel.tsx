/**
 * MusicPanel Component
 * Slide-in panel for AI-powered music suggestions from Jamendo.
 */

import React, { useState, useEffect } from 'react';
import {
  Music, X, Search, Play, Pause, ExternalLink, Loader2,
  Sparkles, Clock, Tag, Zap, AlertCircle, RefreshCw
} from 'lucide-react';
import { UseMusicReturn } from '../hooks/useMusic';
import { ClipSegment, JamendoTrack } from '../types';
import { formatDuration } from '../services/jamendoService';

interface MusicPanelProps {
  music: UseMusicReturn;
  clips: ClipSegment[];
  jamendoClientId: string | undefined;
}

const MusicPanel: React.FC<MusicPanelProps> = ({ music, clips, jamendoClientId }) => {
  const [customTags, setCustomTags] = useState('');

  const {
    isOpen,
    closePanel,
    mode,
    selectedClipIndex,
    suggestion,
    tracks,
    isLoading,
    error,
    searchMusic,
    searchWithCustomTags,
    currentlyPlaying,
    playTrack,
    stopPlayback,
  } = music;

  // Auto-search when panel opens with clips
  useEffect(() => {
    if (isOpen && jamendoClientId && clips.length > 0 && !suggestion && !isLoading) {
      searchMusic(jamendoClientId, clips, selectedClipIndex ?? undefined);
    }
  }, [isOpen, jamendoClientId, clips.length, selectedClipIndex]);

  const handleCustomSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTags.trim() || !jamendoClientId) return;

    const tags = customTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    searchWithCustomTags(jamendoClientId, tags);
  };

  const handleRefresh = () => {
    if (jamendoClientId && clips.length > 0) {
      searchMusic(jamendoClientId, clips, selectedClipIndex ?? undefined);
    }
  };

  // Determine context label
  const contextLabel = mode === 'single_clip' && selectedClipIndex !== null
    ? `Clip #${selectedClipIndex + 1}`
    : `All ${clips.length} Clips`;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closePanel}
      />

      {/* Slide-in Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-lg bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-4 bg-emerald-500/5 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-emerald-500">
            <Music size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">Music Suggestions</h3>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded">
              {contextLabel}
            </span>
            <button
              onClick={closePanel}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* No API Key Warning */}
          {!jamendoClientId && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-amber-400 mb-2">
                <AlertCircle size={16} />
                <span className="font-medium">Jamendo API Key Required</span>
              </div>
              <p className="text-xs text-zinc-400">
                Add your Jamendo Client ID in Settings to enable music suggestions.
              </p>
            </div>
          )}

          {/* No Clips Warning */}
          {clips.length === 0 && (
            <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg text-center">
              <Music size={32} className="mx-auto mb-2 text-zinc-600" />
              <p className="text-sm text-zinc-400">
                Analyze some video clips first, then come back for music suggestions!
              </p>
            </div>
          )}

          {/* AI Suggestion Section */}
          {suggestion && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Sparkles size={14} />
                  <span className="text-xs font-bold uppercase tracking-wider">AI Suggestion</span>
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={isLoading || !jamendoClientId}
                  className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Zap size={12} className="text-amber-400" />
                  <span className="text-sm text-zinc-200">{suggestion.mood}</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {suggestion.searchTerms.map((term, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] rounded"
                    >
                      {term}
                    </span>
                  ))}
                </div>

                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  {suggestion.reasoning}
                </p>
              </div>
            </div>
          )}

          {/* Custom Search */}
          <form onSubmit={handleCustomSearch} className="space-y-2">
            <label className="text-xs text-zinc-500 font-medium">Custom Search</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customTags}
                onChange={(e) => setCustomTags(e.target.value)}
                placeholder="e.g., electronic, epic, cinematic"
                className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={!customTags.trim() || !jamendoClientId || isLoading}
                className="px-3 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:cursor-not-allowed text-zinc-950 font-medium rounded-lg transition-colors"
              >
                <Search size={16} />
              </button>
            </div>
            <p className="text-[10px] text-zinc-600">
              Comma-separated tags: genres, moods, instruments
            </p>
          </form>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-emerald-500" />
              <span className="ml-2 text-sm text-zinc-400">Searching Jamendo...</span>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Track Results */}
          {tracks.length > 0 && !isLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                  Found {tracks.length} tracks
                </span>
              </div>

              <div className="space-y-2">
                {tracks.map((track) => (
                  <TrackCard
                    key={track.id}
                    track={track}
                    isPlaying={currentlyPlaying === track.id}
                    onPlay={() => playTrack(track.id, track.audio)}
                    onStop={stopPlayback}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Attribution */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950/50 shrink-0">
          <p className="text-[10px] text-zinc-600 text-center">
            Music powered by{' '}
            <a
              href="https://www.jamendo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-500 hover:underline"
            >
              Jamendo
            </a>
            {' '}• Free for personal use with attribution
          </p>
        </div>
      </div>
    </>
  );
};

// Track Card Component
interface TrackCardProps {
  track: JamendoTrack;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
}

const TrackCard: React.FC<TrackCardProps> = ({ track, isPlaying, onPlay, onStop }) => {
  return (
    <div className={`p-3 rounded-lg border transition-all ${
      isPlaying
        ? 'bg-emerald-500/10 border-emerald-500/50'
        : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
    }`}>
      <div className="flex gap-3">
        {/* Album Art */}
        <div className="w-14 h-14 rounded overflow-hidden bg-zinc-700 shrink-0">
          {track.image ? (
            <img
              src={track.image}
              alt={track.album_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music size={20} className="text-zinc-500" />
            </div>
          )}
        </div>

        {/* Track Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-zinc-200 truncate">{track.name}</h4>
          <p className="text-xs text-zinc-500 truncate">{track.artist_name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
              <Clock size={10} />
              {formatDuration(track.duration)}
            </span>
            {track.speed && (
              <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                <Zap size={10} />
                {track.speed}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={isPlaying ? onStop : onPlay}
            className={`p-2 rounded-lg transition-colors ${
              isPlaying
                ? 'bg-emerald-500 text-zinc-950'
                : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
            }`}
            title={isPlaying ? 'Stop' : 'Preview'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <a
            href={track.shareurl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
            title="Open on Jamendo"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {/* Tags */}
      {track.tags && track.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {track.tags.slice(0, 5).map((tag, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 bg-zinc-900 text-zinc-500 text-[9px] rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default MusicPanel;
