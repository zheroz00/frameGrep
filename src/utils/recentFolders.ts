/** How many footage folders the DaVinci export remembers. */
export const MAX_RECENT_FOLDERS = 6;

/**
 * Put `folder` at the front of the recent list, without duplicates, capped at `max`.
 * Blank input returns the list unchanged.
 */
export const rememberFolder = (recent: string[], folder: string, max = MAX_RECENT_FOLDERS): string[] => {
  const cleaned = folder.trim();
  if (!cleaned) return recent;
  return [cleaned, ...recent.filter(item => item !== cleaned)].slice(0, max);
};
