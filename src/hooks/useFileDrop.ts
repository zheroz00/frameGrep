import { useCallback, useRef, useState, type DragEvent } from 'react';

const VIDEO_EXTENSIONS = /\.(mp4|mov|mkv|avi|webm|m4v|mts|m2ts)$/i;

/** Browsers leave `type` empty for containers they do not know (often .mkv), so check the name too. */
export const isVideoFile = (file: Pick<File, 'name' | 'type'>): boolean =>
  file.type.startsWith('video/') || VIDEO_EXTENSIONS.test(file.name);

const carriesFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer.types).includes('Files');

/**
 * Drag-and-drop for video files. Spread `dropHandlers` on the element that should accept
 * the drop; `isDragging` is true while files are held over it.
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  // dragenter/dragleave fire for every child element; count them to know when the drag really left.
  const depth = useRef(0);

  const onDragEnter = useCallback((event: DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    setIsDragging(true);
  }, []);

  const onDragOver = useCallback((event: DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault(); // required, or the browser navigates to the file on drop
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((event: DragEvent) => {
    if (!carriesFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback((event: DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth.current = 0;
    setIsDragging(false);
    const videos = Array.from<File>(event.dataTransfer.files).filter(isVideoFile);
    if (videos.length > 0) onFiles(videos);
  }, [onFiles]);

  return { isDragging, dropHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
