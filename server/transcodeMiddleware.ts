import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createReadStream, createWriteStream, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Plugin } from 'vite';

export type TranscodeEncoder = 'h264_nvenc' | 'libx264';

export interface TranscodeOptions {
  includeAudio: boolean;
  maxHeight: number;
  fpsCap: number;
}

export class TranscodeCoordinator {
  private active = false;

  acquire(): (() => void) | null {
    if (this.active) return null;
    this.active = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = false;
    };
  }
}

export const buildTranscodeArgs = (
  input: string,
  output: string,
  options: TranscodeOptions,
  encoder: TranscodeEncoder,
): string[] => {
  const filters = `${options.fpsCap ? `fps=${options.fpsCap},` : ''}scale=-2:'min(${options.maxHeight},ih)',format=yuv420p`;
  const args = ['-hide_banner', '-loglevel', 'warning', '-i', input, '-vf', filters, '-c:v', encoder];
  if (encoder === 'h264_nvenc') {
    args.push('-preset', 'p4', '-cq', '28', '-gpu', process.env.NVENC_GPU || '0');
  } else {
    args.push('-preset', 'veryfast', '-crf', '28');
  }
  if (options.includeAudio) args.push('-c:a', 'aac', '-b:a', '128k');
  else args.push('-an');
  args.push('-movflags', '+faststart', '-y', output);
  return args;
};

const run = (command: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stderr: string }> => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-32 * 1024); });
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('exit', code => { clearTimeout(timer); resolve({ code, stderr }); });
});

let nvencProbe: Promise<boolean> | null = null;
const probeNvenc = (): Promise<boolean> => {
  nvencProbe ??= run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=size=64x64:rate=1',
    '-frames:v', '1', '-c:v', 'h264_nvenc', '-f', 'null', '-',
  ], 10_000).then(result => result.code === 0).catch(() => false);
  return nvencProbe;
};

export const chooseEncoder = async (
  override = process.env.FRAMEGREP_TRANSCODE_ENCODER ?? 'auto',
  probe: () => Promise<boolean> = probeNvenc,
): Promise<TranscodeEncoder> => {
  const normalized = override.toLowerCase();
  if (normalized === 'cpu' || normalized === 'libx264') return 'libx264';
  if (normalized === 'nvenc' || normalized === 'h264_nvenc') {
    if (!await probe()) throw new Error('FRAMEGREP_TRANSCODE_ENCODER requires NVENC, but the encoder probe failed.');
    return 'h264_nvenc';
  }
  return await probe() ? 'h264_nvenc' : 'libx264';
};

const sendJson = (res: import('node:http').ServerResponse, status: number, payload: unknown): void => {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const waitForExit = (child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }> => new Promise((resolve, reject) => {
  let stderr = '';
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-32 * 1024); });
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stderr }); });
});

export const transcodeMiddleware = (): Plugin => {
  const coordinator = new TranscodeCoordinator();
  const maxBytes = Number(process.env.FRAMEGREP_TRANSCODE_MAX_BYTES) || 2 * 1024 * 1024 * 1024;
  const timeoutMs = Number(process.env.FRAMEGREP_TRANSCODE_TIMEOUT_MS) || 15 * 60 * 1000;

  return {
    name: 'framegrep-transcode-middleware',
    configureServer(server) {
      server.middlewares.use('/api/transcode', (req, res, next) => {
        if (req.method !== 'POST') return next();
        const release = coordinator.acquire();
        if (!release) return sendJson(res, 429, { error: 'transcode-busy', message: 'Another transcode is already running.' });
        const contentLength = Number(req.headers['content-length'] ?? 0);
        if (contentLength > maxBytes) {
          release();
          return sendJson(res, 413, { error: 'request-too-large', maxBytes });
        }

        const requestUrl = new URL(req.url || '/', 'http://localhost');
        const options: TranscodeOptions = {
          includeAudio: (requestUrl.searchParams.get('audio') ?? 'true') !== 'false',
          maxHeight: Math.max(240, Math.min(2160, Number(requestUrl.searchParams.get('maxHeight')) || 720)),
          fpsCap: Math.max(0, Math.min(120, Number(requestUrl.searchParams.get('fps')) || 0)),
        };
        const directory = mkdtempSync(join(tmpdir(), 'framegrep-transcode-'));
        const input = join(directory, 'input.bin');
        const output = join(directory, 'output.mp4');
        let child: ChildProcessWithoutNullStreams | null = null;
        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          child?.kill('SIGKILL');
          rmSync(directory, { recursive: true, force: true });
          release();
        };
        req.once('aborted', cleanup);
        res.once('close', () => { if (!res.writableEnded) cleanup(); });

        void (async () => {
          try {
            let received = 0;
            const limiter = new Transform({
              transform(chunk, _encoding, callback) {
                received += chunk.length;
                callback(received > maxBytes ? Object.assign(new Error('Request body exceeds the configured limit.'), { statusCode: 413 }) : null, chunk);
              },
            });
            await pipeline(req, limiter, createWriteStream(input));
            if (received === 0) throw Object.assign(new Error('Request body is empty.'), { statusCode: 400 });
            const encoder = await chooseEncoder();
            child = spawn('ffmpeg', buildTranscodeArgs(input, output, options, encoder), { stdio: ['ignore', 'ignore', 'pipe'] });
            const result = await waitForExit(child, timeoutMs);
            child = null;
            if (result.code !== 0) throw Object.assign(new Error(`FFmpeg failed (${result.code ?? result.signal}): ${result.stderr.slice(-2000)}`), { statusCode: 500 });
            if (!statSync(output).size) throw Object.assign(new Error('FFmpeg produced an empty output.'), { statusCode: 500 });
            const validation = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', output], 15_000);
            if (validation.code !== 0) throw Object.assign(new Error(`Output validation failed: ${validation.stderr.slice(-1000)}`), { statusCode: 500 });

            res.statusCode = 200;
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Length', String(statSync(output).size));
            res.setHeader('Cache-Control', 'no-store');
            const stream = createReadStream(output);
            stream.once('error', error => { if (!res.headersSent) sendJson(res, 500, { error: 'output-read-failed', message: error.message }); else res.destroy(error); cleanup(); });
            stream.once('close', cleanup);
            stream.pipe(res);
          } catch (error) {
            const status = Number((error as { statusCode?: number }).statusCode) || 500;
            sendJson(res, status, { error: status === 413 ? 'request-too-large' : 'transcode-failed', message: error instanceof Error ? error.message : String(error) });
            cleanup();
          }
        })();
      });
    },
  };
};
