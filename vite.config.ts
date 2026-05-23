import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { createWriteStream, mkdtempSync, rmSync } from 'node:fs';
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3006,
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
      },
    },
    plugins: [react(), nvencTranscodeMiddleware()],
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
