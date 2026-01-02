import React, { useState } from 'react';
import { Play, Copy, Check, Film, Sun, Cloud, Sunset, Moon } from 'lucide-react';
import { ClipSegment, ClipMood, LightingCondition } from '../types';

// Mood badge styling
const MOOD_CONFIG: Record<ClipMood, { label: string; class: string }> = {
  intense: { label: 'Intense', class: 'bg-red-500/20 text-red-400 border-red-500/30' },
  smooth: { label: 'Smooth', class: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  dramatic: { label: 'Dramatic', class: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  peaceful: { label: 'Peaceful', class: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  playful: { label: 'Playful', class: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  technical: { label: 'Technical', class: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
};

// Lighting icons
const LIGHTING_ICONS: Record<LightingCondition, React.ReactNode> = {
  golden_hour: <Sunset size={10} className="text-orange-400" />,
  midday: <Sun size={10} className="text-yellow-300" />,
  overcast: <Cloud size={10} className="text-gray-400" />,
  shade: <Cloud size={10} className="text-zinc-500" />,
  indoor: <Moon size={10} className="text-zinc-400" />,
  mixed: <Sun size={10} className="text-zinc-400" />,
  low_light: <Moon size={10} className="text-indigo-400" />,
};

// Color dot styling (maps common color names to Tailwind classes)
const getColorDotClass = (color: string): string => {
  const colorMap: Record<string, string> = {
    red: 'bg-red-500', orange: 'bg-orange-500', yellow: 'bg-yellow-500',
    green: 'bg-green-500', blue: 'bg-blue-500', purple: 'bg-purple-500',
    pink: 'bg-pink-500', cyan: 'bg-cyan-500', gray: 'bg-gray-500',
    brown: 'bg-amber-700', white: 'bg-white', black: 'bg-zinc-900',
  };
  return colorMap[color.toLowerCase()] || 'bg-zinc-600';
};

interface ClipCardProps {
  clip: ClipSegment;
  index: number;
  onPlay: () => void;
  isActive: boolean;
  filename: string;
  showSource?: boolean;
}

// Escape shell special characters for safe command-line usage
const escapeShellFilename = (str: string): string => {
  return str.replace(/(["\$`\\])/g, '\\$1');
};

const ClipCard: React.FC<ClipCardProps> = ({ clip, index, onPlay, isActive, filename, showSource }) => {
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

    const safeFilename = escapeShellFilename(filename);
    const cmd = `ffmpeg -ss ${startSec} -i "${safeFilename}" -t ${dur} -c copy "highlight_${index + 1}.mp4"`;
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

      {/* Source file badge for multi-video */}
      {showSource && clip.sourceFile && (
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <Film size={10} />
          <span className="truncate">{clip.sourceFile}</span>
        </div>
      )}

      {/* Mood / Lighting / Colors row */}
      {(clip.mood || clip.lighting || clip.dominant_colors?.length) && (
        <div className="flex items-center gap-2 flex-wrap">
          {clip.mood && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${MOOD_CONFIG[clip.mood].class}`}>
              {MOOD_CONFIG[clip.mood].label}
            </span>
          )}
          {clip.lighting && (
            <span className="flex items-center gap-1 text-[10px] text-zinc-500" title={clip.lighting.replace('_', ' ')}>
              {LIGHTING_ICONS[clip.lighting]}
            </span>
          )}
          {clip.dominant_colors && clip.dominant_colors.length > 0 && (
            <div className="flex items-center gap-1" title={clip.dominant_colors.join(', ')}>
              {clip.dominant_colors.slice(0, 3).map((color, i) => (
                <span
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full border border-zinc-700 ${getColorDotClass(color)}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1">
        <p className="text-sm text-zinc-200 font-medium leading-relaxed">
          {clip.description}
        </p>
      </div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={onPlay}
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
