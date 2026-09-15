import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { transcodeMiddleware } from './server/transcodeMiddleware';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface GpuStat {
  index: number;
  util: number;       // GPU utilization %
  memUsedMB: number;
  memTotalMB: number;
}

/**
 * Run `nvidia-smi` once and parse per-GPU utilization + VRAM.
 * Rejects if nvidia-smi is missing, exits non-zero, or hangs past the timeout.
 */
function runNvidiaSmi(): Promise<GpuStat[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn('nvidia-smi', [
      '--query-gpu=index,utilization.gpu,memory.used,memory.total',
      '--format=csv,noheader,nounits',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } }, 3000);

    proc.stdout.on('data', c => { stdout += c.toString(); });
    proc.stderr.on('data', c => { stderr += c.toString(); });
    proc.on('error', err => { clearTimeout(timer); reject(err); });
    proc.on('exit', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`nvidia-smi exited ${code}: ${stderr.slice(-200)}`));
      const gpus = stdout.trim().split('\n').filter(Boolean).map(line => {
        const [index, util, memUsed, memTotal] = line.split(',').map(s => parseInt(s.trim(), 10));
        return { index, util, memUsedMB: memUsed, memTotalMB: memTotal };
      }).filter(g => Number.isFinite(g.index));
      resolve(gpus);
    });
  });
}

/**
 * GET /api/gpu — live per-GPU utilization + VRAM for the in-app activity widget.
 * Result is cached ~1s so rapid polling (or multiple clients) doesn't spam nvidia-smi.
 * Returns 503 { error } if nvidia-smi is unavailable (widget shows "GPU n/a").
 */
function gpuStatsMiddleware(): Plugin {
  let cache: { ts: number; gpus: GpuStat[] } | null = null;
  const TTL_MS = 1000;
  return {
    name: 'fpv-gpu-stats',
    configureServer(server) {
      server.middlewares.use('/api/gpu', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        try {
          if (!cache || Date.now() - cache.ts > TTL_MS) {
            cache = { ts: Date.now(), gpus: await runNvidiaSmi() };
          }
          res.statusCode = 200;
          res.end(JSON.stringify({ gpus: cache.gpus }));
        } catch (err) {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: (err as Error).message || 'nvidia-smi unavailable' }));
        }
      });
    },
  };
}

// Architectures we recognize as vision-capable Qwen/InternVL/MiniCPM/LLaVA models.
// Add to this list if you start downloading other VLM families.
const VISION_ARCHITECTURES = new Set([
  'qwen3_vl',
  'qwen3_vl_moe',
  'qwen2_vl',
  'qwen2_5_vl',
  'internvl_chat',
  'minicpmv',
  'llava',
  'llava_next',
  'llava_next_video',
  'llava_onevision',
]);

// HuggingFace hub cache. Defaults to HF's own standard location; override with
// HF_HUB_CACHE in .env.local if your models live on a different drive.
const HF_CACHE_DIR = process.env.HF_HUB_CACHE || join(homedir(), '.cache/huggingface/hub');
const VLLM_PORT = parseInt(process.env.VLLM_PORT || '8002', 10);
const REPO_ROOT = __dirname;

interface DiscoveredModel {
  id: string;
  architecture: string;
  quantization?: string;
  maxModelLen?: number;
  sizeBytes: number;
}

/**
 * Walk the HuggingFace cache dir and return every vision-capable VLM available.
 *
 * HF cache layout:
 *   <cache>/models--<owner>--<name>/snapshots/<sha>/config.json
 * Some shards may be missing on disk if a download is partial — we skip silently.
 */
function discoverLocalVLMs(cacheDir: string): DiscoveredModel[] {
  let entries: string[];
  try {
    entries = readdirSync(cacheDir);
  } catch {
    return [];
  }

  const out: DiscoveredModel[] = [];
  for (const entry of entries) {
    if (!entry.startsWith('models--')) continue;
    // Reconstruct HF id: "models--owner--name" → "owner/name". Note: HF replaces
    // any '--' inside owner or name with '/', but in practice both are simple.
    const modelId = entry.slice('models--'.length).split('--').join('/');
    const snapshotsDir = join(cacheDir, entry, 'snapshots');

    let configPath: string | null = null;
    try {
      const snapshots = readdirSync(snapshotsDir);
      for (const snap of snapshots) {
        const candidate = join(snapshotsDir, snap, 'config.json');
        try {
          statSync(candidate);
          configPath = candidate;
          break;
        } catch { /* try next */ }
      }
    } catch { continue; }

    if (!configPath) continue;

    let cfg: Record<string, unknown>;
    try {
      cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch { continue; }

    const arches = Array.isArray(cfg.architectures) ? cfg.architectures as string[] : [];
    const modelType = typeof cfg.model_type === 'string' ? cfg.model_type : '';
    const archMatch = arches.find(a => VISION_ARCHITECTURES.has(a.toLowerCase()))
      || (VISION_ARCHITECTURES.has(modelType.toLowerCase()) ? modelType : null);
    if (!archMatch) continue;

    const qcfg = cfg.quantization_config as Record<string, unknown> | undefined;
    const quantization = qcfg ? (qcfg.quant_method as string | undefined) || 'unknown' : undefined;
    const maxModelLen = typeof cfg.max_position_embeddings === 'number'
      ? cfg.max_position_embeddings : undefined;

    let sizeBytes = 0;
    try {
      const blobs = readdirSync(join(cacheDir, entry, 'blobs'));
      for (const b of blobs) {
        try { sizeBytes += statSync(join(cacheDir, entry, 'blobs', b)).size; } catch { /* skip */ }
      }
    } catch { /* skip sizing */ }

    out.push({ id: modelId, architecture: archMatch, quantization, maxModelLen, sizeBytes });
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Ask vLLM what's currently loaded. Returns null if the server is down or
 * doesn't respond in time.
 */
async function queryCurrentlyLoaded(): Promise<{ id: string; maxModelLen: number } | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 1500);
    const r = await fetch(`http://localhost:${VLLM_PORT}/v1/models`, { signal: controller.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json() as { data?: Array<{ id?: string; max_model_len?: number }> };
    const m = j.data?.[0];
    if (!m?.id) return null;
    return { id: m.id, maxModelLen: m.max_model_len || 0 };
  } catch {
    return null;
  }
}

/**
 * GET /api/local-vlm/models — list all VLMs in the local HF cache + which is loaded.
 * POST /api/local-vlm/swap        — body {model, maxModelLen?} → kill+restart vLLM.
 * GET /api/local-vlm/swap-status  — quick check whether the server is responding.
 */
function vllmModelManagerMiddleware(): Plugin {
  return {
    name: 'fpv-vllm-model-manager',
    configureServer(server) {
      server.middlewares.use('/api/local-vlm/models', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        const models = discoverLocalVLMs(HF_CACHE_DIR);
        const current = await queryCurrentlyLoaded();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          cacheDir: HF_CACHE_DIR,
          models,
          currentlyLoaded: current?.id || null,
          currentMaxModelLen: current?.maxModelLen || null,
        }));
      });

      server.middlewares.use('/api/local-vlm/swap-status', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        const current = await queryCurrentlyLoaded();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          ready: !!current,
          currentlyLoaded: current?.id || null,
        }));
      });

      server.middlewares.use('/api/local-vlm/swap', (req, res, next) => {
        if (req.method !== 'POST') return next();
        // RETIRED: vLLM now runs under PM2 as 'vllm-server'. Kill+relaunch from here
        // would fight PM2's autorestart (it would just respawn the old model), so the
        // in-app swap is intentionally disabled. Model selection is manual + single-
        // sourced: set VLLM_MODEL in .env.local, then `pm2 restart vllm-server`.
        res.statusCode = 410;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: 'vLLM model switching is now manual — set VLLM_MODEL in .env.local, then run: pm2 restart vllm-server --update-env',
        }));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const rawFrameGrepPort = process.env.FRAMEGREP_PORT || env.FRAMEGREP_PORT || '3008';
  const frameGrepPort = Number(rawFrameGrepPort);
  if (!Number.isInteger(frameGrepPort) || frameGrepPort < 1 || frameGrepPort > 65535) {
    throw new Error(`FRAMEGREP_PORT must be an integer from 1 to 65535; received "${rawFrameGrepPort}"`);
  }
  // 127.0.0.1 keeps the dev server private; set FRAMEGREP_HOST=0.0.0.0 to expose it
  // on the LAN (e.g. behind a reverse proxy on another machine).
  const frameGrepHost = process.env.FRAMEGREP_HOST || env.FRAMEGREP_HOST || '127.0.0.1';
  // ALLOWED_HOST accepts a comma-separated list of extra hostnames.
  const extraAllowedHosts = (process.env.ALLOWED_HOST || env.ALLOWED_HOST || '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

  return {
    server: {
      port: frameGrepPort,
      strictPort: true,
      host: frameGrepHost,
      // localhost for local dev; .devtunnels.ms covers VS Code dev tunnels.
      // Set ALLOWED_HOST in .env.local (comma-separated) to serve your own domain(s).
      allowedHosts: ['localhost', '.devtunnels.ms', ...extraAllowedHosts],
      proxy: {
        // Proxy Jamendo API to avoid CORS/Origin issues
        '/api/jamendo': {
          target: 'https://api.jamendo.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/jamendo/, ''),
        },
        // Proxy local llama-swap (HTTP) so the HTTPS-served app avoids mixed-content blocks.
        // Use endpoint "/api/llama/v1" in Settings.
        '/api/llama': {
          target: 'http://localhost:7744',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/llama/, ''),
        },
        // Proxy local vLLM (HTTP) for native video analysis.
        // Use endpoint "/api/vllm/v1" in Settings.
        '/api/vllm': {
          target: 'http://localhost:8002',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/vllm/, ''),
        },
        // Proxy the local Marlin-2B analysis server (scripts/marlin-server.sh on :8003).
        // Avoids CORS + mixed-content; the 'marlin' provider posts video to /api/marlin/analyze.
        '/api/marlin': {
          target: 'http://localhost:8003',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/marlin/, ''),
          // caption() can take ~20-45s; don't let the proxy time out mid-analysis.
          timeout: 300000,
          proxyTimeout: 300000,
        },
      },
    },
    plugins: [react(), transcodeMiddleware(), vllmModelManagerMiddleware(), gpuStatsMiddleware()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      }
    }
  };
});
