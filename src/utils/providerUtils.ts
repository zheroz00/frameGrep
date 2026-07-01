import { AppSettings } from '../types';

/**
 * Does a custom-provider endpoint point at a machine-local server (vs a cloud API
 * like OpenRouter)? Matches the app's own proxy prefixes (/api/vllm, /api/llama,
 * /api/marlin), loopback hosts, and private LAN ranges.
 */
export function isLocalEndpoint(endpoint: string | undefined): boolean {
  if (!endpoint) return false;
  const e = endpoint.trim().toLowerCase();
  if (/^\/api\/(vllm|llama|marlin)\b/.test(e)) return true;
  return /(localhost|127\.0\.0\.1|::1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)/.test(e);
}

/**
 * Is the active analysis provider running on the local GPU? True for Marlin (always
 * local) and for a Custom provider whose endpoint is local. Used to gate the GPU
 * activity widget so it only shows/polls when a local model is in play.
 */
export function isLocalProvider(settings: AppSettings): boolean {
  if (settings.provider === 'marlin') return true;
  if (settings.provider === 'custom') return isLocalEndpoint(settings.customConfig?.endpoint);
  return false;
}
