import React, { useEffect, useRef, useState } from 'react';
import { Play, Copy, Check, Film, Trash2, MessageCircle, Music } from 'lucide-react';
import { ClipSegment } from '../types';
import { formatTimestamp } from '../domain/media';
import { ClipBadges, ScoreBadge } from './clipBadges';
import WhyDisclosure from './WhyDisclosure';

interface ClipCardProps {
  clip: ClipSegment;
  index: number;
  onPlay: () => void;
  onCaption?: () => void;
  onMusic?: () => void;
  onRemove?: () => void;
  isActive: boolean;
  filename: string;
  showSource?: boolean;
}

// Escape shell special characters for safe command-line usage
const escapeShellFilename = (str: string): string => {
  return str.replace(/(["\$`\\])/g, '\\$1');
};

const iconButton = 'p-1.5 rounded-md text-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 transition-colors';

const ClipCard: React.FC<ClipCardProps> = ({ clip, index, onPlay, onCaption, onMusic, onRemove, isActive, filename, showSource }) => {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Keep the playing clip in view while stepping with the keyboard or Play all.
  useEffect(() => {
    if (!isActive) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    cardRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [isActive]);

  const copyCommand = () => {
    const safeFilename = escapeShellFilename(filename);
    const cmd = `ffmpeg -ss ${clip.startSeconds.toFixed(3)} -to ${clip.endSeconds.toFixed(3)} -i "${safeFilename}" -c:v libx264 -c:a aac "highlight_${index + 1}.mp4"`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const surface = isActive
    ? 'border-amber-500 bg-amber-500/5'
    : clip.sectionType === 'dead_time'
      ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50'
      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600';

  // Card actions must not also trigger the card's own play-on-click.
  const act = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn?.();
  };
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      aria-current={isActive ? 'true' : undefined}
      aria-label={`Clip ${index + 1}, score ${clip.excitementScore}. Press Enter to play.`}
      onClick={onPlay}
      onKeyDown={e => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onPlay();
      }}
      className={`px-3.5 py-3 rounded-xl border cursor-pointer transition-colors flex flex-col gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${surface}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 tabular-nums">{String(index + 1).padStart(2, '0')}</span>
        <ScoreBadge score={clip.excitementScore} />
        <span className="ml-auto text-xs text-zinc-400 tabular-nums">
          {formatTimestamp(clip.startSeconds)} to {formatTimestamp(clip.endSeconds)}
        </span>
      </div>

      <ClipBadges clip={clip} />

      {/* Source file for multi-video sessions */}
      {showSource && (
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 min-w-0">
          <Film size={11} className="shrink-0" />
          <span className="truncate">{filename}</span>
        </div>
      )}

      <p className={`text-sm text-zinc-200 leading-relaxed ${isActive ? '' : 'line-clamp-2'}`}>
        {clip.description}
      </p>

      {clip.transitionNote && (
        <p className={`text-xs text-zinc-500 italic ${isActive ? '' : 'line-clamp-1'}`}>{clip.transitionNote}</p>
      )}

      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 pt-1">
          <WhyDisclosure reasoning={clip.reasoning} />
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={act(onPlay)} onMouseDown={keepFocus} title="Play this clip" aria-label="Play this clip" className={`${iconButton} hover:text-white hover:bg-zinc-800`}>
            <Play size={14} />
          </button>
          {onMusic && (
            <button type="button" onClick={act(onMusic)} title="Find music for this clip" aria-label="Find music for this clip" className={`${iconButton} hover:text-emerald-400 hover:bg-emerald-500/10`}>
              <Music size={14} />
            </button>
          )}
          {onCaption && (
            <button type="button" onClick={act(onCaption)} title="Generate social media captions" aria-label="Generate social media captions" className={`${iconButton} hover:text-amber-400 hover:bg-amber-500/10`}>
              <MessageCircle size={14} />
            </button>
          )}
          <button type="button" onClick={act(copyCommand)} onMouseDown={keepFocus} title="Copy FFmpeg command" aria-label="Copy FFmpeg command" className={`${iconButton} hover:text-white hover:bg-zinc-800`}>
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
          {onRemove && (
            <button type="button" onClick={act(onRemove)} onMouseDown={keepFocus} title="Remove this clip" aria-label="Remove this clip" className={`${iconButton} hover:text-red-400 hover:bg-red-500/10`}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClipCard;
