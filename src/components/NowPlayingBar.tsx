import React, { useState } from 'react';
import { ListVideo, SkipBack, SkipForward } from 'lucide-react';
import { ClipSegment } from '../types';
import { formatTimestamp } from '../domain/media';
import { ClipBadges, ScoreBadge } from './clipBadges';
import WhyDisclosure from './WhyDisclosure';

interface NowPlayingBarProps {
  clip: ClipSegment | null;
  /** Position of `clip` in the clip list, or null when nothing is selected. */
  index: number | null;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  playAll: boolean;
  onTogglePlayAll: () => void;
  /** Clips Play all will run through under the current export mode. */
  playableCount: number;
}

const stepButton = 'p-2 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 hover:text-white hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 transition-colors';

/** Details of the clip in the player, with the stepping controls. */
const NowPlayingBar: React.FC<NowPlayingBarProps> = ({
  clip, index, total, canPrev, canNext, onPrev, onNext, playAll, onTogglePlayAll, playableCount,
}) => {
  // Kept here rather than per clip, so the "why" stays open while stepping through.
  const [whyOpen, setWhyOpen] = useState(false);
  // Buttons keep focus off themselves on mouse click so Space still pauses the video.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 xl:max-h-56 xl:overflow-y-auto">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 min-h-[34px] flex items-center gap-2 flex-wrap">
          {clip && index !== null ? (
            <>
              <span className="text-sm font-semibold text-white tabular-nums">Clip {index + 1} of {total}</span>
              <ScoreBadge score={clip.excitementScore} />
              <span className="text-xs text-zinc-400 tabular-nums">
                {formatTimestamp(clip.startSeconds)} to {formatTimestamp(clip.endSeconds)}
              </span>
              <ClipBadges clip={clip} />
            </>
          ) : (
            <p className="text-sm text-zinc-500 leading-relaxed">
              {total > 0
                ? 'Pick a clip to play it here. Up and Down step through clips, Space pauses, Delete removes the current clip.'
                : 'Clips you play show up here with their details.'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onTogglePlayAll}
            onMouseDown={keepFocus}
            disabled={playableCount === 0}
            aria-pressed={playAll}
            title={playAll ? 'Stop after the current clip' : `Play ${playableCount} clips back to back, as the export would cut them`}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 transition-colors ${
              playAll
                ? 'bg-amber-500 border-amber-400 text-zinc-950'
                : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-600'
            }`}
          >
            <ListVideo size={14} />
            {playAll ? 'Playing all' : 'Play all'}
          </button>
          <button type="button" onClick={onPrev} onMouseDown={keepFocus} disabled={!canPrev} title="Previous clip (Up or K)" aria-label="Previous clip" className={stepButton}>
            <SkipBack size={14} />
          </button>
          <button type="button" onClick={onNext} onMouseDown={keepFocus} disabled={!canNext} title="Next clip (Down or J)" aria-label="Next clip" className={stepButton}>
            <SkipForward size={14} />
          </button>
        </div>
      </div>

      {clip && (
        <>
          <p className="mt-2 text-sm text-zinc-200 leading-relaxed max-w-[90ch]">{clip.description}</p>
          {clip.transitionNote && (
            <p className="mt-1 text-xs text-zinc-500 italic max-w-[90ch]">{clip.transitionNote}</p>
          )}
          <div className="mt-2">
            <WhyDisclosure reasoning={clip.reasoning} open={whyOpen} onToggle={setWhyOpen} />
          </div>
        </>
      )}
    </div>
  );
};

export default NowPlayingBar;
