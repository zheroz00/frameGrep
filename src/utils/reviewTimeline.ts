import type { ClipSegment, ExportMode, VideoSource } from '../types';
import { formatTimestamp } from '../domain/media';
import {
  buildFCPXMLResources,
  filterClipsForExport,
  frameDuration,
  getSourceIdentityIssue,
  rationalFrames,
  rationalSeconds,
  toFrames,
  xml,
  type FCPXMLOptions,
} from './exportCore';

/**
 * Review timeline for DaVinci Resolve: the whole source video in its original order, split
 * over two tracks. V1 holds the clips the export keeps, V2 holds everything that was cut,
 * each piece sitting where it happened. Scrub V2 to check nothing good was dropped; to get
 * the finished cut, delete the V2 track and close the gaps on V1.
 */

export interface TimeRange { start: number; end: number }

/** Cut pieces shorter than this are left as empty space: too short to judge, pure clutter. */
export const MIN_CUT_SECONDS = 0.25;

/** Sort, clamp to [0, duration] and merge ranges that overlap or touch. */
export const mergeRanges = (ranges: TimeRange[], duration: number): TimeRange[] => {
  const merged: TimeRange[] = [];
  const sorted = ranges
    .map(range => ({ start: Math.max(0, range.start), end: Math.min(duration, range.end) }))
    .filter(range => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
};

/** Everything in [0, duration] that `kept` (already merged) does not cover. */
export const cutRanges = (kept: TimeRange[], duration: number): TimeRange[] => {
  const cuts: TimeRange[] = [];
  let cursor = 0;
  for (const range of kept) {
    if (range.start > cursor) cuts.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }
  if (duration > cursor) cuts.push({ start: cursor, end: duration });
  return cuts;
};

/** Clock label to a tenth of a second, e.g. "00:52.5". */
const clock = (seconds: number): string => formatTimestamp(Math.round(seconds * 10) / 10);

const marker = (indent: string, seconds: number, source: VideoSource, sequenceSource: VideoSource, text: string): string =>
  `${indent}<marker start="${rationalSeconds(seconds, source.metadata.frameRate)}" duration="${frameDuration(sequenceSource.metadata.frameRate)}" value="${xml(text)}"/>`;

/** One element, self-closed when it has no children. */
const element = (indent: string, open: string, children: string[]): string[] => children.length
  ? [`${indent}<${open}>`, ...children, `${indent}</${open.split(' ')[0]}>`]
  : [`${indent}<${open}/>`];

export const generateReviewFCPXML = (
  projectName: string,
  clips: ClipSegment[],
  mode: ExportMode,
  options: FCPXMLOptions,
): string => {
  const sourceIds = new Set(clips.map(clip => clip.sourceId));
  const sources = options.sources.filter(source => sourceIds.has(source.id));
  if (!sources.length) throw new Error('FCPXML export requires at least one linked source.');
  const identityIssue = getSourceIdentityIssue(sources);
  if (identityIssue) throw new Error(identityIssue);

  const sequenceSource = sources[0];
  const sequenceRate = sequenceSource.metadata.frameRate;
  // Music is laid against the tight supercut, not against original timing, so it is left out here.
  const { lines: resources, formatIds, assetIds } = buildFCPXMLResources(sources, clips, { ...options, audioFilename: undefined });
  const keptIds = new Set(filterClipsForExport(clips, mode).map(clip => clip.id));
  // Clip numbers match the Clips list in the app, whatever the export mode hides.
  const numbered = clips.map((clip, index) => ({ clip, number: index + 1 }));

  const spine: string[] = [];
  let baseFrames = 0; // where the current source starts on the timeline, in sequence frames

  for (const source of sources) {
    const own = numbered.filter(({ clip }) => clip.sourceId === source.id && clip.endSeconds > clip.startSeconds);
    const duration = source.metadata.duration || Math.max(...own.map(({ clip }) => clip.endSeconds), 0);
    if (!(duration > 0)) continue;

    const keptClips = own.filter(({ clip }) => keptIds.has(clip.id)).sort((x, y) => x.clip.startSeconds - y.clip.startSeconds);
    const dropped = own.filter(({ clip }) => !keptIds.has(clip.id));
    const covered = mergeRanges(keptClips.map(({ clip }) => ({ start: clip.startSeconds, end: clip.endSeconds })), duration);

    // Positions are worked out in whole sequence frames from shared boundaries, so
    // neighbouring pieces can never overlap or leave a one-frame hole.
    const at = (seconds: number): number => baseFrames + toFrames(seconds, sequenceRate);
    const span = (range: TimeRange): string =>
      `offset="${rationalFrames(at(range.start), sequenceRate)}" start="${rationalSeconds(range.start, source.metadata.frameRate)}" duration="${rationalFrames(at(range.end) - at(range.start), sequenceRate)}"`;
    const ref = `ref="${assetIds.get(source.id)}"`;
    const format = `format="${formatIds.get(source.id)}" tcFormat="NDF"`;

    // V1: each kept clip where it happened. A clip that overlaps the one before it starts
    // where that one ends, since two clips cannot share the same stretch of one track.
    const pieces: { range: TimeRange; lines: string[] }[] = [];
    let keptUntil = 0;
    for (const { clip, number } of keptClips) {
      const range = { start: Math.max(clip.startSeconds, keptUntil), end: Math.min(clip.endSeconds, duration) };
      keptUntil = Math.max(keptUntil, range.end);
      if (at(range.end) <= at(range.start)) continue;
      pieces.push({
        range,
        lines: element('          ', `asset-clip ${ref} ${span(range)} name="Clip ${number}" ${format}`, [
          marker('            ', range.start, source, sequenceSource, `Clip ${number}: ${clip.description}`),
        ]),
      });
    }

    // V2: a gap keeps V1 empty for each cut stretch, and the cut footage rides above it on lane 1.
    for (const range of cutRanges(covered, duration)) {
      if (at(range.end) <= at(range.start)) continue;
      const length = rationalFrames(at(range.end) - at(range.start), sequenceRate);
      const gap = `gap name="Gap" offset="${rationalFrames(at(range.start), sequenceRate)}" start="0s" duration="${length}"`;
      // Clips the export mode dropped (dead time, transitions) are labelled so the junk explains itself.
      const notes = dropped
        .filter(({ clip }) => clip.startSeconds >= range.start && clip.startSeconds < range.end)
        .map(({ clip, number }) => marker('              ', clip.startSeconds, source, sequenceSource, `Cut clip ${number}: ${clip.description}`));
      const footage = range.end - range.start >= MIN_CUT_SECONDS
        ? element('            ', `asset-clip ${ref} lane="1" offset="0s" start="${rationalSeconds(range.start, source.metadata.frameRate)}" duration="${length}" name="${xml(`Cut ${clock(range.start)} to ${clock(range.end)}`)}" ${format}`, notes)
        : [];
      pieces.push({ range, lines: element('          ', gap, footage) });
    }

    pieces.sort((x, y) => x.range.start - y.range.start).forEach(piece => spine.push(...piece.lines));
    baseFrames = at(duration);
  }

  if (!spine.length) throw new Error('Nothing to export: the sources have no known duration and no clips.');
  const totalDuration = rationalFrames(baseFrames, sequenceRate);
  const name = xml(`${projectName} (review)`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.8">\n  <resources>\n${resources.join('\n')}\n  </resources>\n  <library>\n    <event name="${name}">\n      <project name="${name}">\n        <sequence format="${formatIds.get(sequenceSource.id)}" duration="${totalDuration}" tcStart="0s" tcFormat="NDF">\n          <spine>\n${spine.join('\n')}\n          </spine>\n        </sequence>\n      </project>\n    </event>\n  </library>\n</fcpxml>`;
};
