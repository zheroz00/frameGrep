import React, { useEffect, useImperativeHandle, useRef } from 'react';

/** Imperative controls the review desk needs without re-rendering on every frame. */
export interface VideoPlayerHandle {
  togglePlay: () => void;
  /** Current playback position in seconds, or null before the video is ready. */
  getCurrentTime: () => number | null;
}

interface VideoPlayerProps {
  src: string;
  startTime?: number; // in seconds
  endTime?: number; // in seconds
  autoPlay?: boolean;
  /** Changes on every play request, so asking for the same span again seeks again. */
  playToken?: number;
  /** Fired once when playback reaches `endTime`. */
  onSegmentEnd?: () => void;
  /** Fired when the browser knows the video's real duration. */
  onDuration?: (seconds: number) => void;
  ref?: React.Ref<VideoPlayerHandle>;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, startTime, endTime, autoPlay, playToken, onSegmentEnd, onDuration, ref }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Latest callbacks in refs so a new function identity does not restart the segment.
  const onSegmentEndRef = useRef(onSegmentEnd);
  const onDurationRef = useRef(onDuration);
  useEffect(() => {
    onSegmentEndRef.current = onSegmentEnd;
    onDurationRef.current = onDuration;
  });

  useImperativeHandle(ref, () => ({
    togglePlay: () => {
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) video.play().catch(e => console.warn('Play blocked', e));
      else video.pause();
    },
    getCurrentTime: () => {
      const video = videoRef.current;
      return video && video.readyState > 0 ? video.currentTime : null;
    },
  }), []);

  // Coordinated effect for segment playback (seek + auto-stop)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || startTime === undefined) return;

    // Stop once at the end of the segment. After that the viewer is free to press
    // play and keep watching past the clip without being paused again.
    let ended = false;
    const handleTimeUpdate = () => {
      if (ended || endTime === undefined || video.currentTime < endTime) return;
      ended = true;
      video.pause();
      onSegmentEndRef.current?.();
    };

    // Attach listener before seeking to avoid race condition
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.currentTime = startTime;

    if (autoPlay) {
      video.play().catch(e => console.warn("Autoplay blocked", e));
    }

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [src, startTime, endTime, autoPlay, playToken]);

  return (
    <div className="relative w-full aspect-video xl:aspect-auto xl:h-full bg-black rounded-lg overflow-hidden border border-zinc-800 shadow-2xl">
      <video
        ref={videoRef}
        src={src}
        controls
        onLoadedMetadata={e => {
          const duration = e.currentTarget.duration;
          if (Number.isFinite(duration) && duration > 0) onDurationRef.current?.(duration);
        }}
        className="w-full h-full object-contain"
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default VideoPlayer;
