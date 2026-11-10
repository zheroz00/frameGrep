import React, { useEffect, useRef } from 'react';
import { ClipSegment } from '../types';
import { formatTimestamp } from '../domain/media';
import { ClipTone, TimelineSegment, playheadPct } from '../domain/review';

interface ClipTimelineProps {
  /** Blocks for the video in the player, from `buildTimelineSegments`. */
  segments: TimelineSegment[];
  /** The full clip list the segment indexes point into. */
  clips: ClipSegment[];
  /** Seconds the strip covers, from `timelineSpan`. */
  span: number;
  activeIndex: number | null;
  /** Reads the player position. Must be stable; it is polled every animation frame. */
  getTime: () => number | null;
  onSelect: (index: number) => void;
}

const TONE_CLASS: Record<ClipTone, string> = {
  highlight: 'bg-green-500/70 hover:bg-green-400',
  flow: 'bg-blue-500/60 hover:bg-blue-400',
  transition: 'bg-yellow-500/60 hover:bg-yellow-400',
  dead: 'bg-red-500/35 hover:bg-red-400/70',
  top: 'bg-purple-500/75 hover:bg-purple-400',
  strong: 'bg-green-500/70 hover:bg-green-400',
  standard: 'bg-blue-500/60 hover:bg-blue-400',
};

/**
 * Read-only map of where the clips sit in the video. Block height is the score, color is
 * the clip type. Clicking a block plays that clip. There is deliberately no trimming here.
 */
const ClipTimeline: React.FC<ClipTimelineProps> = ({ segments, clips, span, activeIndex, getTime, onSelect }) => {
  const playheadRef = useRef<HTMLDivElement>(null);

  // Move the playhead by writing its style directly: polling at frame rate through
  // React state would re-render the whole desk sixty times a second.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const el = playheadRef.current;
      if (el) {
        const pct = playheadPct(getTime(), span);
        el.style.opacity = pct === null ? '0' : '1';
        if (pct !== null) el.style.left = `${pct}%`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getTime, span]);

  return (
    <div className="shrink-0">
      <div
        role="group"
        aria-label="Clip map"
        className="relative h-14 rounded-lg bg-zinc-900/70 border border-zinc-800 overflow-hidden"
      >
        {segments.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600">
            Analyze a video to see where its clips fall.
          </p>
        )}
        {segments.map(segment => {
          const clip = clips[segment.index];
          if (!clip) return null;
          const isActive = segment.index === activeIndex;
          const label = `Clip ${segment.index + 1}, score ${clip.excitementScore}, ${formatTimestamp(clip.startSeconds)} to ${formatTimestamp(clip.endSeconds)}`;
          return (
            <button
              key={segment.clipId}
              type="button"
              title={label}
              aria-label={`Play ${label}`}
              aria-current={isActive ? 'true' : undefined}
              onMouseDown={e => e.preventDefault()}
              onClick={() => onSelect(segment.index)}
              className={`absolute bottom-0 min-w-[4px] rounded-t-sm border-x border-zinc-950/60 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
                isActive ? 'bg-amber-400 z-10' : TONE_CLASS[segment.tone]
              }`}
              style={{ left: `${segment.leftPct}%`, width: `${segment.widthPct}%`, height: `${segment.heightPct}%` }}
            />
          );
        })}
        <div
          ref={playheadRef}
          aria-hidden="true"
          className="absolute top-0 bottom-0 w-px bg-white/90 z-20 pointer-events-none opacity-0"
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-zinc-500 tabular-nums">
        <span>00:00</span>
        {span > 0 && <span>{formatTimestamp(Math.round(span))}</span>}
      </div>
    </div>
  );
};

export default ClipTimeline;
