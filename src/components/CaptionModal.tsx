import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  RefreshCw,
  Instagram,
  Twitter,
  Youtube,
  Hash,
  Plus,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { ClipSegment, SocialCaptions, CaptionMode } from '../types';
import { generateClipCaption, generateVideoCaption } from '../services/captionService';

// TikTok icon (not in lucide)
const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
  </svg>
);

// Platform configuration with brand-inspired styling
const PLATFORMS = {
  instagram: {
    name: 'Instagram',
    icon: Instagram,
    color: 'text-pink-400',
    bgColor: 'bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-orange-500/10',
    borderColor: 'border-pink-500/40',
    accentGradient: 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500',
    limit: 2200,
    optimal: 150,
  },
  tiktok: {
    name: 'TikTok',
    icon: TikTokIcon,
    color: 'text-white',
    bgColor: 'bg-zinc-950',
    borderColor: 'border-zinc-700',
    accentGradient: 'bg-gradient-to-r from-cyan-400 to-pink-500',
    limit: 2200,
    optimal: 150,
  },
  youtube: {
    name: 'YouTube',
    icon: Youtube,
    color: 'text-red-500',
    bgColor: 'bg-red-500/5',
    borderColor: 'border-red-500/30',
    accentGradient: 'bg-red-600',
    titleLimit: 100,
    descLimit: 5000,
  },
  twitter: {
    name: 'Twitter/X',
    icon: Twitter,
    color: 'text-zinc-100',
    bgColor: 'bg-zinc-950',
    borderColor: 'border-zinc-700',
    accentGradient: 'bg-zinc-100',
    limit: 280,
  },
} as const;

interface CaptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  clip?: ClipSegment;
  clips?: ClipSegment[];
  initialMode?: CaptionMode;
  videoFilename?: string;
}

export default function CaptionModal({
  isOpen,
  onClose,
  apiKey,
  clip,
  clips,
  initialMode = 'clip',
  videoFilename,
}: CaptionModalProps) {
  const [mode, setMode] = useState<CaptionMode>(initialMode);
  // Store captions separately for each mode so switching tabs doesn't lose data
  const [clipCaptions, setClipCaptions] = useState<SocialCaptions | null>(null);
  const [videoCaptions, setVideoCaptions] = useState<SocialCaptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [clipHashtags, setClipHashtags] = useState<string[]>([]);
  const [videoHashtags, setVideoHashtags] = useState<string[]>([]);
  const [newHashtag, setNewHashtag] = useState('');

  // Get current captions and hashtags based on mode
  const captions = mode === 'clip' ? clipCaptions : videoCaptions;
  const editedHashtags = mode === 'clip' ? clipHashtags : videoHashtags;
  const setEditedHashtags = mode === 'clip' ? setClipHashtags : setVideoHashtags;

  // Determine if we can show both modes
  const canShowClipMode = !!clip;
  const canShowVideoMode = !!clips && clips.length > 0;
  const showTabs = canShowClipMode && canShowVideoMode;

  // Auto-generate on open or mode change (only if no captions for current mode)
  useEffect(() => {
    if (isOpen && !captions && !loading) {
      generateCaptions();
    }
  }, [isOpen, mode]);

  // Sync hashtags when clip captions change
  useEffect(() => {
    if (clipCaptions?.hashtags && clipHashtags.length === 0) {
      setClipHashtags([...clipCaptions.hashtags]);
    }
  }, [clipCaptions]);

  // Sync hashtags when video captions change
  useEffect(() => {
    if (videoCaptions?.hashtags && videoHashtags.length === 0) {
      setVideoHashtags([...videoCaptions.hashtags]);
    }
  }, [videoCaptions]);

  const generateCaptions = async () => {
    if (!apiKey) {
      setError('API key required. Configure in Settings.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let result: SocialCaptions;
      if (mode === 'clip' && clip) {
        result = await generateClipCaption(apiKey, clip, videoFilename);
        setClipCaptions(result);
      } else if (mode === 'video' && clips) {
        result = await generateVideoCaption(apiKey, clips, videoFilename);
        setVideoCaptions(result);
      } else {
        throw new Error('Invalid mode or missing data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate captions');
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = (newMode: CaptionMode) => {
    setMode(newMode);
    setError(null);
    // Don't clear captions - they're stored separately per mode
  };

  const copyToClipboard = (text: string, platform: string) => {
    // Append hashtags for non-YouTube platforms
    let finalText = text;
    if (platform !== 'youtube' && editedHashtags.length > 0) {
      finalText = `${text}\n\n${editedHashtags.map((h) => `#${h}`).join(' ')}`;
    }
    navigator.clipboard.writeText(finalText);
    setCopied(platform);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyYouTube = () => {
    if (!captions) return;
    const text = `${captions.youtube.title}\n\n${captions.youtube.description}\n\n${editedHashtags.map((h) => `#${h}`).join(' ')}`;
    navigator.clipboard.writeText(text);
    setCopied('youtube');
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAll = () => {
    if (!captions) return;
    const hashtagStr = editedHashtags.map((h) => `#${h}`).join(' ');
    const text = `=== INSTAGRAM ===\n${captions.instagram}\n${hashtagStr}\n\n=== TIKTOK ===\n${captions.tiktok}\n${hashtagStr}\n\n=== YOUTUBE ===\nTitle: ${captions.youtube.title}\n${captions.youtube.description}\n${hashtagStr}\n\n=== TWITTER/X ===\n${captions.twitter}`;
    navigator.clipboard.writeText(text);
    setCopied('all');
    setTimeout(() => setCopied(null), 2000);
  };

  const removeHashtag = (index: number) => {
    setEditedHashtags((prev) => prev.filter((_, i) => i !== index));
  };

  const addHashtag = () => {
    const tag = newHashtag.trim().replace(/^#/, '');
    if (tag && !editedHashtags.includes(tag)) {
      setEditedHashtags((prev) => [...prev, tag]);
      setNewHashtag('');
    }
  };

  const getCharCountColor = (length: number, limit: number) => {
    if (length > limit) return 'text-red-400';
    if (length > limit * 0.9) return 'text-yellow-400';
    return 'text-zinc-500';
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200"
      onClick={(e) => e.stopPropagation()} // Prevent accidental closes
    >
      <div
        className="bg-zinc-900 rounded-xl shadow-2xl max-w-3xl w-full mx-4 border border-zinc-800 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <Hash className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-white">Social Media Captions</h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        {showTabs && (
          <div className="flex border-b border-zinc-800 shrink-0">
            <button
              onClick={() => handleModeChange('clip')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                mode === 'clip'
                  ? 'text-amber-400 border-b-2 border-amber-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              This Clip
            </button>
            <button
              onClick={() => handleModeChange('video')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                mode === 'video'
                  ? 'text-amber-400 border-b-2 border-amber-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Full Video Summary
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p>Generating captions...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Captions */}
          {captions && !loading && (
            <>
              {/* Platform cards - 2x2 grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Row 1: Instagram & TikTok */}
                <PlatformCard
                  platform="instagram"
                  config={PLATFORMS.instagram}
                  text={captions.instagram}
                  onCopy={() => copyToClipboard(captions.instagram, 'instagram')}
                  copied={copied === 'instagram'}
                />
                <PlatformCard
                  platform="tiktok"
                  config={PLATFORMS.tiktok}
                  text={captions.tiktok}
                  onCopy={() => copyToClipboard(captions.tiktok, 'tiktok')}
                  copied={copied === 'tiktok'}
                />

                {/* Row 2: Twitter & YouTube */}
                <PlatformCard
                  platform="twitter"
                  config={PLATFORMS.twitter}
                  text={captions.twitter}
                  onCopy={() => copyToClipboard(captions.twitter, 'twitter')}
                  copied={copied === 'twitter'}
                />
                <div
                  className={`relative overflow-hidden rounded-lg border ${PLATFORMS.youtube.borderColor} ${PLATFORMS.youtube.bgColor}`}
                >
                  {/* YouTube red accent bar */}
                  <div className={`h-1 ${PLATFORMS.youtube.accentGradient}`} />
                  <div className="p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Youtube className={`w-4 h-4 ${PLATFORMS.youtube.color}`} />
                        <span className={`text-sm font-medium ${PLATFORMS.youtube.color}`}>
                          YouTube
                        </span>
                      </div>
                      <button
                        onClick={copyYouTube}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-zinc-800/80 hover:bg-zinc-700 rounded transition-colors"
                      >
                        {copied === 'youtube' ? (
                          <Check size={12} className="text-green-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                        Copy
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      <div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-0.5">
                          <span>Title</span>
                          <span
                            className={getCharCountColor(
                              captions.youtube.title.length,
                              PLATFORMS.youtube.titleLimit
                            )}
                          >
                            {captions.youtube.title.length}/{PLATFORMS.youtube.titleLimit}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-200 bg-zinc-950/50 p-1.5 rounded">
                          {captions.youtube.title}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-0.5">
                          <span>Description</span>
                          <span
                            className={getCharCountColor(
                              captions.youtube.description.length,
                              PLATFORMS.youtube.descLimit
                            )}
                          >
                            {captions.youtube.description.length}/{PLATFORMS.youtube.descLimit}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-200 bg-zinc-950/50 p-1.5 rounded whitespace-pre-wrap line-clamp-3">
                          {captions.youtube.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hashtags */}
              <div className="p-3 bg-amber-500/5 rounded-lg border border-amber-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-amber-300">Hashtags</span>
                  <span className="text-xs text-zinc-500">
                    (auto-added when copying, except Twitter)
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {editedHashtags.map((tag, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 px-2 py-1 bg-zinc-800 rounded-full text-xs text-zinc-300 group"
                    >
                      #{tag}
                      <button
                        onClick={() => removeHashtag(i)}
                        className="text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newHashtag}
                    onChange={(e) => setNewHashtag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addHashtag()}
                    placeholder="Add hashtag..."
                    className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
                  />
                  <button
                    onClick={addHashtag}
                    disabled={!newHashtag.trim()}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 flex justify-between gap-3 shrink-0">
          <button
            onClick={generateCaptions}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Regenerate
          </button>
          <div className="flex gap-3">
            <button
              onClick={copyAll}
              disabled={!captions || loading}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200 rounded-lg transition-colors"
            >
              {copied === 'all' ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              Copy All
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reusable platform card component
interface PlatformCardProps {
  platform: string;
  config: {
    name: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    borderColor: string;
    accentGradient?: string;
    limit?: number;
    optimal?: number;
  };
  text: string;
  onCopy: () => void;
  copied: boolean;
}

function PlatformCard({ config, text, onCopy, copied }: PlatformCardProps) {
  const Icon = config.icon;
  const limit = config.limit || 2200;

  return (
    <div className={`relative overflow-hidden rounded-lg border ${config.borderColor} ${config.bgColor} flex flex-col`}>
      {/* Accent bar at top */}
      <div className={`h-1 shrink-0 ${config.accentGradient || 'bg-zinc-700'}`} />
      <div className="p-2.5 flex flex-col flex-1">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${config.color}`} />
            <span className={`text-sm font-medium ${config.color}`}>{config.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] ${
                text.length > limit
                  ? 'text-red-400'
                  : text.length > limit * 0.9
                    ? 'text-yellow-400'
                    : 'text-zinc-500'
              }`}
            >
              {text.length}/{limit}
            </span>
            <button
              onClick={onCopy}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-zinc-800/80 hover:bg-zinc-700 rounded transition-colors"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              Copy
            </button>
          </div>
        </div>
        <p className="text-xs text-zinc-200 whitespace-pre-wrap flex-1">{text}</p>
      </div>
    </div>
  );
}
