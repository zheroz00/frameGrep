import React, { useRef, useEffect } from 'react';

interface VideoPlayerProps {
  src: string;
  startTime?: number; // in seconds
  endTime?: number; // in seconds
  autoPlay?: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, startTime, endTime, autoPlay }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Coordinated effect for segment playback (seek + auto-stop)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || startTime === undefined) return;

    const handleTimeUpdate = () => {
      if (endTime !== undefined && video.currentTime >= endTime) {
        video.pause();
      }
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
  }, [startTime, endTime, autoPlay]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-zinc-800 shadow-2xl">
      <video
        ref={videoRef}
        src={src}
        controls
        className="w-full h-full object-contain"
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default VideoPlayer;
