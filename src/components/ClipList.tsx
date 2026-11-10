import React from 'react';
import { Undo2 } from 'lucide-react';
import ClipCard from './ClipCard';
import { ClipSegment, ExportMode, VideoSource } from '../types';
import { formatTimestamp } from '../domain/media';
import type { KeptCutSummary } from '../utils/reviewTimeline';

interface ClipListProps {
  clips: ClipSegment[];
  /** Used to look up each clip's source filename. */
  sources: VideoSource[];
  isBusy: boolean;
  activeClipIndex: number | null;
  hasMultipleSources: boolean;
  sourceCount: number;
  onPlay: (clip: ClipSegment) => void;
  onCaption: (clip: ClipSegment) => void;
  onMusic: (idx: number) => void;
  onRemove: (idx: number) => void;
  /** Footage kept and cut under the current export mode, or null before there is anything to measure. */
  keptCut: KeptCutSummary | null;
  exportMode: ExportMode;
  /** The clip that can still be restored, if one was just removed. */
  lastRemovedClip: ClipSegment | null;
  onUndoRemove: () => void;
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

const ClipList: React.FC<ClipListProps> = ({
  clips,
  sources,
  isBusy,
  activeClipIndex,
  hasMultipleSources,
  sourceCount,
  onPlay,
  onCaption,
  onMusic,
  onRemove,
  keptCut,
  exportMode,
  lastRemovedClip,
  onUndoRemove,
}) => {
  const count = (type: ClipSegment['sectionType']) => clips.filter(c => c.sectionType === type).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-lg font-bold text-white">Clips</h2>
        {clips.length > 0 && (
          clips.some(c => c.sectionType) ? (
            // Section type breakdown when the preset classifies sections
            <div className="flex items-center gap-2 text-[11px] tabular-nums">
              <span className="text-green-400">{plural(count('highlight'), 'highlight')}</span>
              <span className="text-blue-400">{count('flow')} flow</span>
              <span className="text-yellow-400">{plural(count('transition'), 'transition')}</span>
              <span className="text-red-400">{count('dead_time')} dead</span>
            </div>
          ) : (
            <span className="text-xs text-zinc-500 tabular-nums">
              {plural(clips.length, 'clip')}
              {hasMultipleSources && ` from ${plural(sourceCount, 'video')}`}
            </span>
          )
        )}
      </div>

      {keptCut && clips.length > 0 && (
        <div
          className="mb-3"
          title={`${exportMode === 'full_edit' ? 'Full edit' : 'Highlights only'} keeps ${formatTimestamp(Math.round(keptCut.keptSeconds))} of ${formatTimestamp(Math.round(keptCut.totalSeconds))} of footage. Change the mode in the Export panel.`}
        >
          <div
            role="img"
            aria-label={`${Math.round(keptCut.keptFraction * 100)} percent of the footage is kept`}
            className="h-1.5 rounded-full bg-zinc-800 overflow-hidden"
          >
            <div className="h-full bg-green-500" style={{ width: `${keptCut.keptFraction * 100}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs tabular-nums">
            <span className="text-green-400">
              Kept {formatTimestamp(Math.round(keptCut.keptSeconds))}
              <span className="text-zinc-500"> ({Math.round(keptCut.keptFraction * 100)}%)</span>
            </span>
            <span className="text-zinc-400">Cut {formatTimestamp(Math.round(keptCut.cutSeconds))}</span>
          </div>
        </div>
      )}

      {lastRemovedClip && (
        <div role="status" className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
          <span className="truncate">Removed "{lastRemovedClip.description}"</span>
          <button
            type="button"
            onClick={onUndoRemove}
            title="Restore the removed clip (Ctrl+Z)"
            className="inline-flex items-center gap-1.5 shrink-0 font-semibold text-amber-400 hover:text-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 rounded"
          >
            <Undo2 size={13} /> Undo
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-2.5 pb-4">
        {clips.length === 0 && !isBusy ? (
          <div className="h-full flex items-center justify-center border-2 border-dashed border-zinc-800 rounded-xl p-8 bg-zinc-900/20">
            <p className="text-center text-sm text-zinc-500 leading-relaxed">
              No clips yet.<br />Add a video and press Analyze.
            </p>
          </div>
        ) : (
          clips.map((clip, idx) => (
            <ClipCard
              key={clip.id}
              index={idx}
              clip={clip}
              filename={sources.find(source => source.id === clip.sourceId)?.filename || 'video.mp4'}
              onPlay={() => onPlay(clip)}
              onCaption={() => onCaption(clip)}
              onMusic={() => onMusic(idx)}
              onRemove={() => onRemove(idx)}
              isActive={activeClipIndex === idx}
              showSource={hasMultipleSources}
            />
          ))
        )}
        {isBusy && (
          <div className="space-y-2.5 animate-pulse motion-reduce:animate-none">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-24 bg-zinc-900/50 rounded-xl border border-zinc-800" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClipList;
