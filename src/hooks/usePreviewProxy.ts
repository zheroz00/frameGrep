import { useCallback, useEffect, useRef, useState } from 'react';
import { VideoQueueItem } from '../types';
import { transcodeVideo } from '../services/transcodeService';

export type PreviewProxyState =
  | { status: 'idle' }
  | { status: 'building'; itemId: string; detail: string }
  | { status: 'failed'; itemId: string; message: string };

interface UsePreviewProxyArgs {
  /** The queue item whose video is in the player. */
  activeItem: VideoQueueItem | undefined;
  /** The URL the player is trying to play (the original or an existing proxy). */
  activeVideoUrl: string | null;
  /** Hand the finished H.264 copy back so the player can switch to it. */
  onReady: (itemId: string, proxy: File) => void;
}

const megabytes = (bytes: number): string => (bytes / 1_048_576).toFixed(0);

/**
 * Builds a playable preview copy when the browser cannot decode a video.
 *
 * Chromium-based browsers have no software HEVC decoder, so 10-bit HEVC straight off a DJI
 * camera often shows a blank player there. When the player reports that, the original is
 * sent through the server transcode endpoint (720p H.264) and the result replaces the
 * preview. The original file is never changed and is still what gets exported.
 */
export function usePreviewProxy({ activeItem, activeVideoUrl, onReady }: UsePreviewProxyArgs) {
  const [state, setState] = useState<PreviewProxyState>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const buildingRef = useRef<string | null>(null);

  const build = useCallback(async (item: VideoQueueItem) => {
    if (buildingRef.current === item.id) return; // already on it
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    buildingRef.current = item.id;
    setState({ status: 'building', itemId: item.id, detail: 'Starting' });
    try {
      const proxy = await transcodeVideo(item.file, progress => {
        if (controller.signal.aborted) return;
        setState({ status: 'building', itemId: item.id, detail: `${megabytes(progress.receivedBytes)} MB ready` });
      }, controller.signal);
      if (controller.signal.aborted) return;
      onReady(item.id, proxy);
      setState({ status: 'idle' });
    } catch (error) {
      if (controller.signal.aborted) return;
      const raw = error instanceof Error ? error.message : String(error);
      const message = raw.includes('429')
        ? 'Another video is being converted right now. Try again when it finishes.'
        : raw.includes('404')
          ? 'The preview converter is not available. It runs inside the dev server (npm run dev).'
          : raw;
      setState({ status: 'failed', itemId: item.id, message });
    } finally {
      if (buildingRef.current === item.id) buildingRef.current = null;
    }
  }, [onReady]);

  /** Call when the player could not decode the current video. */
  const reportUnplayable = useCallback(() => {
    if (!activeItem || activeItem.file.size === 0) return; // nothing to convert (project awaiting relink)
    if (activeItem.transcodedUrl && activeItem.transcodedUrl === activeVideoUrl) {
      setState({ status: 'failed', itemId: activeItem.id, message: 'The converted preview copy could not be played either.' });
      return;
    }
    void build(activeItem);
  }, [activeItem, activeVideoUrl, build]);

  const retry = useCallback(() => {
    if (activeItem && activeItem.file.size > 0) void build(activeItem);
  }, [activeItem, build]);

  // A different video in the player: any message about the previous one no longer applies.
  const activeId = activeItem?.id;
  useEffect(() => {
    setState(current => (current.status !== 'idle' && current.itemId !== activeId ? { status: 'idle' } : current));
  }, [activeId]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, reportUnplayable, retry };
}
