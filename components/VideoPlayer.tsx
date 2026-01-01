import React, { useRef, useEffect } from 'react';

interface VideoPlayerProps {
  src: string;
  startTime?: number; // in seconds
  endTime?: number; // in seconds
  autoPlay?: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, startTime, endTime, autoPlay }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Handle seeking when startTime changes
  useEffect(() => {
    if (videoRef.current && startTime !== undefined) {
      videoRef.current.currentTime = startTime;
      if (autoPlay) {
        videoRef.current.play().catch(e => console.warn("Autoplay blocked", e));
      }
    }
  }, [startTime, autoPlay]);

  // Handle stopping at endTime
  useEffect(() => {
    const video = videoRef.current;
    if (!video || endTime === undefined) return;

    const handleTimeUpdate = () => {
      if (video.currentTime >= endTime) {
        video.pause();
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [endTime]);

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
