/**
 * Unique ID for client-side entities (projects, queue items).
 *
 * `crypto.randomUUID` only exists in secure contexts (https or localhost). frameGrep is
 * routinely opened over plain http on the LAN, where the call throws, so fall back to a
 * timestamp + random suffix there.
 */
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
};
