import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { createWriteStream, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Custom Vite middleware: POST /api/transcode → spawn NVENC ffmpeg child process.
 *
 * Reads raw video bytes from the request stream, pipes them into ffmpeg's stdin,
 * pipes ffmpeg's stdout back to the response. Output is fragmented MP4 because
 * pipe:1 is non-seekable (faststart can't rewrite the moov atom in place).
 *
 * Query params:
 *   audio=true|false   — when false, passes -an to drop audio
 *   maxHeight=720      — output height ceiling (preserves aspect via scale_cuda)
 */
function nvencTranscodeMiddleware(): Plugin {
  return {
    name: 'fpv-transcode-middleware',
    configureServer(server) {
      server.middlewares.use('/api/transcode', (req, res, next) => {
        if (req.method !== 'POST') return next();

        // Parse query params manually since this middleware receives the bare Node req.
        const url = new URL(req.url || '/', 'http://localhost');
        const includeAudio = (url.searchParams.get('audio') ?? 'true') !== 'false';
        const maxHeightRaw = url.searchParams.get('maxHeight') ?? '720';
        const maxHeight = Math.max(240, Math.min(2160, parseInt(maxHeightRaw, 10) || 720));

        // MP4 inputs require seekable streams (moov atom is typically at file end).
        // Stream the upload to a temp file first, then run ffmpeg with that as input.
        const tmpDir = mkdtempSync(join(tmpdir(), 'fpv-transcode-'));
        const tmpInput = join(tmpDir, 'input.bin');
        const cleanup = () => {
          try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        };

        const startedAt = Date.now();
        console.log('[transcode] receiving upload', { includeAudio, maxHeight, tmpInput });

        const fileStream = createWriteStream(tmpInput);
        let receivedBytes = 0;
        req.on('data', chunk => { receivedBytes += chunk.length; });
        req.on('error', err => {
          console.warn('[transcode] request stream error:', err.message);
          try { fileStream.destroy(); } catch { /* ignore */ }
          cleanup();
        });
        fileStream.on('error', err => {
          console.error('[transcode] temp file write error:', err.message);
          cleanup();
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'tmp-write-failed', message: err.message }));
          }
        });

        req.pipe(fileStream);

        fileStream.on('finish', () => {
          console.log(`[transcode] upload done: ${receivedBytes} bytes in ${Date.now() - startedAt}ms`);

          // CPU decode + NVENC encode (hybrid). Full-GPU pipeline with NVDEC choked
          // on real-world inputs like DJI 1080p100 with CUDA_ERROR_INVALID_VALUE,
          // because NVDEC profile/level support varies by GPU generation. CPU decode
          // of H.264 1080p is plenty fast (200-400 fps on modern hardware) and always
          // works; NVENC still does the heavy encode lift.
          const args: string[] = [
            '-hide_banner',
            '-loglevel', 'warning',
            '-i', tmpInput,
            '-vf', `scale=-2:'min(${maxHeight},ih)'`,
            '-c:v', 'h264_nvenc',
            '-preset', 'p4',
            '-cq', '28',
            // Pin to CUDA 1 (Quadro RTX 4000, Turing). Full NVENC H.264 support;
            // a generation older than the 4060 Ti but plenty for encode-only work.
            // Keeps GPU 0 (4060 Ti) free for llama-swap inference — no VRAM contention.
            '-gpu', '1',
          ];

          if (includeAudio) {
            args.push('-c:a', 'aac', '-b:a', '128k');
          } else {
            args.push('-an');
          }

          // pipe:1 is non-seekable. +faststart needs to rewrite the moov atom at the
          // start of the file, which requires a seekable output. Use fragmented MP4
          // instead: each fragment is self-describing, so the file is playable as it
          // streams. Gemini accepts fragmented MP4 just fine.
          args.push(
            '-movflags', '+frag_keyframe+empty_moov',
            '-f', 'mp4',
            'pipe:1'
          );

          const ffStartedAt = Date.now();
          console.log('[transcode] spawn ffmpeg', { argsTail: args.slice(-12) });

          const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

          let stderrBuf = '';
          ff.stderr.on('data', chunk => {
            stderrBuf += chunk.toString();
            if (stderrBuf.length > 32 * 1024) {
              stderrBuf = stderrBuf.slice(-32 * 1024);
            }
          });

          let headersSent = false;
          const ensureHeaders = () => {
            if (!headersSent) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'video/mp4');
              res.setHeader('Cache-Control', 'no-store');
              headersSent = true;
            }
          };

          ff.stdout.on('data', chunk => {
            ensureHeaders();
            res.write(chunk);
          });

          ff.on('error', err => {
            console.error('[transcode] failed to spawn ffmpeg:', err.message);
            cleanup();
            if (!headersSent) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'spawn-failed', message: err.message }));
            } else {
              try { res.end(); } catch { /* ignore */ }
            }
          });

          ff.on('exit', (code, signal) => {
            const elapsed = Date.now() - ffStartedAt;
            cleanup();
            if (code === 0) {
              console.log(`[transcode] ffmpeg exit 0 in ${elapsed}ms`);
              ensureHeaders();
              res.end();
            } else {
              console.error(
                `[transcode] ffmpeg failed code=${code} signal=${signal} elapsed=${elapsed}ms\nstderr tail:\n${stderrBuf.slice(-2000)}`
              );
              if (!headersSent) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'ffmpeg-failed', code, signal, stderr: stderrBuf.slice(-2000) }));
              } else {
                try { res.end(); } catch { /* ignore */ }
              }
            }
          });
        });
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

const HF_CACHE_DIR = process.env.HF_HUB_CACHE || '/mnt/gamesSSD/models/huggingface/hub';
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
  return {
    server: {
      port: 3007,
      host: '0.0.0.0',
      allowedHosts: ['fpv.r3belmind.dev', 'localhost', '.devtunnels.ms'],
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
    plugins: [react(), nvencTranscodeMiddleware(), vllmModelManagerMiddleware()],
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
