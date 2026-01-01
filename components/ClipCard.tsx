import React, { useState } from 'react';
import { Play, Copy, Check } from 'lucide-react';
import { ClipSegment } from '../types';

interface ClipCardProps {
  clip: ClipSegment;
  index: number;
  onPlay: (start: string, end: string) => void;
  isActive: boolean;
  filename: string;
}

const ClipCard: React.FC<ClipCardProps> = ({ clip, index, onPlay, isActive, filename }) => {
  const [copied, setCopied] = useState(false);

  const getScoreColor = (score: number) => {
    if (score >= 9) return 'text-purple-400 border-purple-500/50 bg-purple-500/10';
    if (score >= 7) return 'text-green-400 border-green-500/50 bg-green-500/10';
    return 'text-blue-400 border-blue-500/50 bg-blue-500/10';
  };

  const copyCommand = () => {
    const parts = clip.start_time.split(':').map(Number);
    const startSec = parts[0] * 60 + parts[1];
    const endParts = clip.end_time.split(':').map(Number);
    const dur = (endParts[0] * 60 + endParts[1]) - startSec;
    
    const cmd = `ffmpeg -ss ${startSec} -i "${filename}" -t ${dur} -c copy "highlight_${index + 1}.mp4"`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeClass = isActive ? 'border-amber-500 bg-amber-500/5' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900';

  return (
    <div className={`p-4 rounded-xl border transition-all duration-200 ${activeClass} flex flex-col gap-3 group`}>
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-500">#{String(index + 1).padStart(2, '0')}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getScoreColor(clip.excitement_score)}`}>
            SCORE: {clip.excitement_score}
          </span>
        </div>
        <div className="text-xs font-mono text-zinc-400">
          {clip.start_time} - {clip.end_time}
        </div>
      </div>
      
      <div className="flex-1">
        <p className="text-sm text-zinc-200 font-medium leading-relaxed">
          {clip.description}
        </p>
      </div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={() => onPlay(clip.start_time, clip.end_time)}
          className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-2 rounded-lg transition-colors"
        >
          <Play size={14} /> Preview
        </button>
        <button
          onClick={copyCommand}
          title="Copy FFmpeg Command"
          className="px-3 flex items-center justify-center gap-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white text-xs py-2 rounded-lg transition-all"
        >
          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
};

export default ClipCard;
