import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipSegment, ExportMode } from '../types';
import { filterClipsForExport } from '../utils/exportUtils';
import { indexAfterRemoval, nextPlayableIndex, stepClipIndex } from '../domain/review';

interface UseClipReviewArgs {
  clips: ClipSegment[];
  activeIndex: number | null;
  /** Play all follows the export mode, so the preview matches what gets exported. */
  exportMode: ExportMode;
  /** False while a modal or drawer is open, so shortcuts do not fire underneath it. */
  enabled: boolean;
  onPlay: (clip: ClipSegment) => void;
  onRemove: (index: number) => void;
  canUndo: boolean;
  onUndo: () => void;
  togglePlay: () => void;
}

export interface UseClipReviewReturn {
  canPrev: boolean;
  canNext: boolean;
  goPrev: () => void;
  goNext: () => void;
  playAll: boolean;
  togglePlayAll: () => void;
  /** How many clips Play all will run through under the current export mode. */
  playableCount: number;
  /** Wire to the player's segment-end event. */
  handleSegmentEnd: () => void;
}

const isTextField = (el: Element | null): boolean =>
  el instanceof HTMLElement
  && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Elements that already do something with Space; let them. */
const handlesSpace = (el: Element | null): boolean =>
  el instanceof HTMLElement
  && (['BUTTON', 'A', 'SUMMARY', 'VIDEO'].includes(el.tagName) || el.getAttribute('role') === 'button');

/**
 * Stepping through clips: prev/next, Play all, and the keyboard shortcuts.
 * Down or J: next clip. Up or K: previous. Space: play/pause. Delete: remove the
 * current clip and move on. Ctrl/Cmd+Z: restore the last removed clip.
 */
export function useClipReview({
  clips, activeIndex, exportMode, enabled, onPlay, onRemove, canUndo, onUndo, togglePlay,
}: UseClipReviewArgs): UseClipReviewReturn {
  const [playAll, setPlayAll] = useState(false);

  const playableIds = useMemo(
    () => new Set(filterClipsForExport(clips, exportMode).map(clip => clip.id)),
    [clips, exportMode],
  );

  const step = useCallback((direction: 1 | -1) => {
    const target = stepClipIndex(clips.length, activeIndex, direction);
    if (target !== null && target !== activeIndex) onPlay(clips[target]);
  }, [clips, activeIndex, onPlay]);

  const goNext = useCallback(() => step(1), [step]);
  const goPrev = useCallback(() => step(-1), [step]);

  const removeActive = useCallback(() => {
    if (activeIndex === null) return;
    const remaining = clips.filter((_, index) => index !== activeIndex);
    const target = indexAfterRemoval(clips.length, activeIndex);
    onRemove(activeIndex);
    if (target !== null) onPlay(remaining[target]);
  }, [clips, activeIndex, onRemove, onPlay]);

  const togglePlayAll = useCallback(() => {
    if (playAll) {
      setPlayAll(false);
      return;
    }
    // Start from the current clip when it is part of the run, else from the next one that is.
    const current = activeIndex !== null && playableIds.has(clips[activeIndex]?.id) ? activeIndex : null;
    const start = current ?? nextPlayableIndex(clips, activeIndex, playableIds) ?? nextPlayableIndex(clips, null, playableIds);
    if (start === null) return;
    setPlayAll(true);
    onPlay(clips[start]);
  }, [playAll, clips, activeIndex, playableIds, onPlay]);

  const handleSegmentEnd = useCallback(() => {
    if (!playAll) return;
    const next = nextPlayableIndex(clips, activeIndex, playableIds);
    if (next === null) setPlayAll(false);
    else onPlay(clips[next]);
  }, [playAll, clips, activeIndex, playableIds, onPlay]);

  // Nothing left to run through: drop out of Play all rather than leave the toggle lit.
  useEffect(() => {
    if (playAll && playableIds.size === 0) setPlayAll(false);
  }, [playAll, playableIds]);

  // One stable listener; the handlers it calls are read fresh from a ref.
  const actions = useRef({ goNext, goPrev, removeActive, togglePlay, onUndo, canUndo });
  useEffect(() => {
    actions.current = { goNext, goPrev, removeActive, togglePlay, onUndo, canUndo };
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = document.activeElement;
      if (event.defaultPrevented || event.altKey || isTextField(target)) return;

      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 'z' && !event.shiftKey && actions.current.canUndo) {
          event.preventDefault();
          actions.current.onUndo();
        }
        return;
      }

      switch (event.key) {
        case 'ArrowDown':
        case 'j':
        case 'J':
          event.preventDefault();
          actions.current.goNext();
          break;
        case 'ArrowUp':
        case 'k':
        case 'K':
          event.preventDefault();
          actions.current.goPrev();
          break;
        case ' ':
          if (handlesSpace(target)) return;
          event.preventDefault();
          actions.current.togglePlay();
          break;
        case 'Delete':
          event.preventDefault();
          actions.current.removeActive();
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  return {
    canPrev: clips.length > 0 && (activeIndex === null || activeIndex > 0),
    canNext: clips.length > 0 && (activeIndex === null || activeIndex < clips.length - 1),
    goPrev,
    goNext,
    playAll,
    togglePlayAll,
    playableCount: playableIds.size,
    handleSegmentEnd,
  };
}
