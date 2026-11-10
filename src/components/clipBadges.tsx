import React from 'react';
import { Sun, Cloud, Sunset, Moon, Sparkles, Waves, ArrowRight, Trash2, Zap, Activity, Battery } from 'lucide-react';
import { ClipSegment, ClipMood, LightingCondition, SectionType, EnergyLevel, EditRecommendation } from '../types';

/** Shared badge vocabulary for a clip, used by the clip cards and the now-playing bar. */

const MOOD_CONFIG: Record<ClipMood, { label: string; class: string }> = {
  intense: { label: 'Intense', class: 'bg-red-500/20 text-red-400 border-red-500/30' },
  smooth: { label: 'Smooth', class: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  dramatic: { label: 'Dramatic', class: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  peaceful: { label: 'Peaceful', class: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  playful: { label: 'Playful', class: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  technical: { label: 'Technical', class: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
};

const LIGHTING_ICONS: Record<LightingCondition, React.ReactNode> = {
  golden_hour: <Sunset size={11} className="text-orange-400" />,
  midday: <Sun size={11} className="text-yellow-300" />,
  overcast: <Cloud size={11} className="text-gray-400" />,
  shade: <Cloud size={11} className="text-zinc-500" />,
  indoor: <Moon size={11} className="text-zinc-400" />,
  mixed: <Sun size={11} className="text-zinc-400" />,
  low_light: <Moon size={11} className="text-indigo-400" />,
};

const SECTION_TYPE_CONFIG: Record<SectionType, { label: string; class: string; icon: React.ReactNode }> = {
  highlight: { label: 'Highlight', class: 'bg-green-500/20 text-green-400 border-green-500/30', icon: <Sparkles size={10} /> },
  flow: { label: 'Flow', class: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: <Waves size={10} /> },
  transition: { label: 'Transition', class: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: <ArrowRight size={10} /> },
  dead_time: { label: 'Dead time', class: 'bg-red-500/20 text-red-400 border-red-500/30', icon: <Trash2 size={10} /> },
};

const ENERGY_ICONS: Record<EnergyLevel, React.ReactNode> = {
  high: <Zap size={10} className="text-orange-400" />,
  medium: <Activity size={10} className="text-zinc-400" />,
  low: <Battery size={10} className="text-blue-400" />,
};

const RECOMMENDATION_CONFIG: Record<EditRecommendation, { label: string; class: string }> = {
  keep: { label: 'Keep', class: 'bg-green-500/10 text-green-400 border-green-500/20' },
  trim: { label: 'Trim', class: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  review: { label: 'Review', class: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
};

const COLOR_DOT: Record<string, string> = {
  red: 'bg-red-500', orange: 'bg-orange-500', yellow: 'bg-yellow-500',
  green: 'bg-green-500', blue: 'bg-blue-500', purple: 'bg-purple-500',
  pink: 'bg-pink-500', cyan: 'bg-cyan-500', gray: 'bg-gray-500',
  brown: 'bg-amber-700', white: 'bg-white', black: 'bg-zinc-900',
};

const scoreClass = (score: number): string => {
  if (score >= 9) return 'text-purple-300 border-purple-500/50 bg-purple-500/10';
  if (score >= 7) return 'text-green-300 border-green-500/50 bg-green-500/10';
  return 'text-blue-300 border-blue-500/50 bg-blue-500/10';
};

export const ScoreBadge: React.FC<{ score: number }> = ({ score }) => (
  <span
    className={`inline-flex items-center justify-center min-w-[1.75rem] px-1.5 py-0.5 rounded border text-xs font-bold tabular-nums ${scoreClass(score)}`}
    title={`Score ${score} out of 10`}
  >
    <span className="sr-only">Score </span>{score}
  </span>
);

const chip = 'inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border';

/** Section type, energy, recommendation, mood, lighting and colors, in one wrapping row. */
export const ClipBadges: React.FC<{ clip: ClipSegment }> = ({ clip }) => {
  const hasAny = clip.sectionType || clip.energyLevel || clip.recommendation || clip.mood || clip.lighting || clip.dominantColors?.length;
  if (!hasAny) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {clip.sectionType && (
        <span className={`${chip} font-medium ${SECTION_TYPE_CONFIG[clip.sectionType].class}`}>
          {SECTION_TYPE_CONFIG[clip.sectionType].icon}
          {SECTION_TYPE_CONFIG[clip.sectionType].label}
        </span>
      )}
      {clip.recommendation && (
        <span className={`${chip} ${RECOMMENDATION_CONFIG[clip.recommendation].class}`}>
          {RECOMMENDATION_CONFIG[clip.recommendation].label}
        </span>
      )}
      {clip.mood && (
        <span className={`${chip} ${MOOD_CONFIG[clip.mood].class}`}>{MOOD_CONFIG[clip.mood].label}</span>
      )}
      {clip.energyLevel && (
        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400" title={`Energy: ${clip.energyLevel}`}>
          {ENERGY_ICONS[clip.energyLevel]}
          <span className="capitalize">{clip.energyLevel}</span>
        </span>
      )}
      {clip.lighting && (
        <span className="inline-flex items-center" title={`Lighting: ${clip.lighting.replace(/_/g, ' ')}`}>
          {LIGHTING_ICONS[clip.lighting]}
        </span>
      )}
      {clip.dominantColors && clip.dominantColors.length > 0 && (
        <span className="inline-flex items-center gap-1" title={`Colors: ${clip.dominantColors.join(', ')}`}>
          {clip.dominantColors.slice(0, 3).map((color, i) => (
            <span key={i} className={`w-2.5 h-2.5 rounded-full border border-zinc-700 ${COLOR_DOT[color.toLowerCase()] || 'bg-zinc-600'}`} />
          ))}
        </span>
      )}
    </div>
  );
};
