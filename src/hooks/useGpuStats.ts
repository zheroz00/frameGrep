import { useEffect, useRef, useState } from 'react';

export interface GpuStat {
  index: number;
  util: number;        // GPU utilization %
  memUsedMB: number;
  memTotalMB: number;
}

const POLL_INTERVAL_MS = 2000;

/**
 * Polls the dev server's `GET /api/gpu` endpoint for live per-GPU utilization + VRAM.
 *
 * Only polls while `enabled` is true AND the browser tab is visible — so it never
 * spawns nvidia-smi in the background or during cloud (Gemini) runs. On endpoint
 * failure it surfaces `error` but keeps polling, recovering automatically.
 */
export function useGpuStats(enabled: boolean) {
  const [gpus, setGpus] = useState<GpuStat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setGpus([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (document.hidden) return; // paused while tab is backgrounded
      try {
        setLoading(true);
        const res = await fetch('/api/gpu', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || `HTTP ${res.status}`);
        } else {
          setGpus(Array.isArray(data.gpus) ? data.gpus : []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message || 'fetch failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const start = () => {
      if (timerRef.current) return;
      poll();
      timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };

    // Poll immediately when the tab becomes visible again; stop timer when hidden.
    const onVisibility = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) start();

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);

  return { gpus, error, loading };
}
