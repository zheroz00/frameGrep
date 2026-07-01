import React from 'react';
import { Cpu } from 'lucide-react';
import { useGpuStats, GpuStat } from '../hooks/useGpuStats';

/** Util % → bar color. Green idle, amber busy, red hot. */
function utilColor(util: number): string {
  if (util >= 80) return 'bg-red-500';
  if (util >= 40) return 'bg-amber-500';
  return 'bg-emerald-500';
}

const gb = (mb: number) => (mb / 1024).toFixed(1);

const GpuPill: React.FC<{ gpu: GpuStat }> = ({ gpu }) => {
  const util = Number.isFinite(gpu.util) ? gpu.util : 0;
  const memPct = gpu.memTotalMB > 0 ? Math.min(100, (gpu.memUsedMB / gpu.memTotalMB) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px] leading-none text-zinc-400">
      <span className="text-zinc-500">GPU{gpu.index}</span>
      {/* utilization bar */}
      <div className="w-10 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full ${utilColor(util)} transition-all duration-500`} style={{ width: `${util}%` }} />
      </div>
      <span className="tabular-nums text-zinc-300 w-8 text-right">{util}%</span>
      <span className="text-zinc-600" title={`${memPct.toFixed(0)}% VRAM`}>
        {gb(gpu.memUsedMB)}/{gb(gpu.memTotalMB)}<span className="text-zinc-700"> GB</span>
      </span>
    </div>
  );
}

/**
 * Live GPU activity readout for the header. Renders only when `enabled` (a local
 * provider is active). Shows one pill per GPU; muted "GPU n/a" when nvidia-smi
 * is unavailable.
 */
export default function GpuWidget({ enabled }: { enabled: boolean }) {
  const { gpus, error } = useGpuStats(enabled);
  if (!enabled) return null;

  return (
    <div
      className="hidden md:flex items-center gap-3 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800"
      title="Live GPU utilization + VRAM (host-wide)"
    >
      <Cpu size={13} className="text-zinc-600 shrink-0" />
      {error || gpus.length === 0 ? (
        <span className="font-mono text-[11px] text-zinc-600">GPU n/a</span>
      ) : (
        gpus.map(g => <GpuPill key={g.index} gpu={g} />)
      )}
    </div>
  );
}
