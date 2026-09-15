import type { ClipSegment, ExportMode, FrameRate, VideoSource } from '../types';

const xml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : Math.abs(a) || 1;

const rationalSeconds = (seconds: number, rate: FrameRate): string => {
  const frames = Math.round(seconds * rate.numerator / rate.denominator);
  const numerator = frames * rate.denominator;
  const divisor = gcd(numerator, rate.numerator);
  return `${numerator / divisor}/${rate.numerator / divisor}s`;
};

const frameDuration = (rate: FrameRate): string => `${rate.denominator}/${rate.numerator}s`;
const rateKey = (rate: FrameRate): string => `${rate.numerator}/${rate.denominator}`;

export const filterClipsForExport = (clips: ClipSegment[], mode: ExportMode): ClipSegment[] => mode === 'highlights_only'
  ? clips.filter(clip => !clip.sectionType || clip.sectionType === 'highlight' || clip.sectionType === 'flow')
  : clips.filter(clip => clip.sectionType !== 'dead_time');

const usedSources = (clips: ClipSegment[], sources: VideoSource[]): VideoSource[] => {
  const ids = new Set(clips.map(clip => clip.sourceId));
  return sources.filter(source => ids.has(source.id));
};

export const getSourceIdentityIssue = (sources: VideoSource[]): string | undefined => {
  const filenames = new Set<string>();
  for (const source of sources) {
    const key = source.filename.toLocaleLowerCase();
    if (filenames.has(key)) return `Multiple sources are named "${source.filename}". Rename or relink them with unique filenames before export so an editor cannot select the wrong file.`;
    filenames.add(key);
  }
  return undefined;
};

const mediaSrc = (filename: string, folder?: string): string => {
  if (!folder?.trim()) return xml(`file:///${encodeURIComponent(filename)}`);
  const clean = folder.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const absolute = clean.startsWith('/') ? clean : `/${clean}`;
  return xml(`file://${absolute.split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(filename)}`);
};

export interface FCPXMLOptions {
  sources: VideoSource[];
  audioFilename?: string;
  mediaFolder?: string;
}

export const generateFCPXML = (projectName: string, clips: ClipSegment[], options: FCPXMLOptions): string => {
  const sources = usedSources(clips, options.sources);
  if (!sources.length) throw new Error('FCPXML export requires at least one linked source.');
  const identityIssue = getSourceIdentityIssue(sources);
  if (identityIssue) throw new Error(identityIssue);
  const sequenceSource = sources[0];
  const formatIds = new Map(sources.map((source, index) => [source.id, `r${index + 1}`]));
  const assetOffset = sources.length + 1;
  const assetIds = new Map(sources.map((source, index) => [source.id, `r${assetOffset + index}`]));
  const audioId = options.audioFilename ? `r${assetOffset + sources.length}` : null;
  const resources: string[] = [];
  sources.forEach(source => {
    const { frameRate, width, height } = source.metadata;
    resources.push(`    <format id="${formatIds.get(source.id)}" name="FFVideoFormat${height}p${frameRate.nominal}" frameDuration="${frameDuration(frameRate)}" width="${width}" height="${height}"/>`);
  });
  sources.forEach(source => {
    resources.push(`    <asset id="${assetIds.get(source.id)}" name="${xml(source.filename)}" start="0s" duration="${rationalSeconds(source.metadata.duration || Math.max(...clips.filter(clip => clip.sourceId === source.id).map(clip => clip.endSeconds), 1), source.metadata.frameRate)}" hasVideo="1" hasAudio="1" format="${formatIds.get(source.id)}">`);
    resources.push(`      <media-rep kind="original-media" src="${mediaSrc(source.filename, options.mediaFolder)}"/>`);
    resources.push('    </asset>');
  });
  if (audioId && options.audioFilename) {
    resources.push(`    <asset id="${audioId}" name="${xml(options.audioFilename)}" start="0s" duration="86400s" hasVideo="0" hasAudio="1">`);
    resources.push(`      <media-rep kind="original-media" src="${mediaSrc(options.audioFilename)}"/>`);
    resources.push('    </asset>');
  }

  let cursor = 0;
  const spine: string[] = [];
  clips.forEach((clip, index) => {
    const source = sources.find(item => item.id === clip.sourceId);
    if (!source || clip.endSeconds <= clip.startSeconds) return;
    const duration = clip.endSeconds - clip.startSeconds;
    spine.push(`          <asset-clip ref="${assetIds.get(source.id)}" offset="${rationalSeconds(cursor, sequenceSource.metadata.frameRate)}" name="Clip ${index + 1}" start="${rationalSeconds(clip.startSeconds, source.metadata.frameRate)}" duration="${rationalSeconds(duration, sequenceSource.metadata.frameRate)}" format="${formatIds.get(source.id)}" tcFormat="NDF"${options.audioFilename ? ' srcEnable="video"' : ''}>`);
    spine.push(`            <marker start="0s" duration="${frameDuration(sequenceSource.metadata.frameRate)}" value="${xml(clip.description)}"/>`);
    spine.push('          </asset-clip>');
    cursor += duration;
  });
  const totalDuration = rationalSeconds(cursor, sequenceSource.metadata.frameRate);
  const audio = audioId && options.audioFilename
    ? `\n          <audio-clip ref="${audioId}" lane="-1" offset="0s" name="${xml(options.audioFilename)}" start="0s" duration="${totalDuration}"/>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.8">\n  <resources>\n${resources.join('\n')}\n  </resources>\n  <library>\n    <event name="${xml(projectName)}">\n      <project name="${xml(projectName)}">\n        <sequence format="${formatIds.get(sequenceSource.id)}" duration="${totalDuration}" tcStart="0s" tcFormat="NDF">\n          <spine>\n${spine.join('\n')}\n          </spine>${audio}\n        </sequence>\n      </project>\n    </event>\n  </library>\n</fcpxml>`;
};

export interface EDLCompatibility { supported: boolean; reason?: string; frameRate?: FrameRate }

export const getEDLCompatibility = (sources: VideoSource[]): EDLCompatibility => {
  if (!sources.length) return { supported: false, reason: 'EDL requires at least one source.' };
  const identityIssue = getSourceIdentityIssue(sources);
  if (identityIssue) return { supported: false, reason: identityIssue };
  if (sources.some(source => source.metadata.frameRate.mode !== 'constant')) {
    return { supported: false, reason: 'EDL requires constant-frame-rate sources. Use FCPXML or FFmpeg for variable-rate media.' };
  }
  const expected = rateKey(sources[0].metadata.frameRate);
  if (sources.some(source => rateKey(source.metadata.frameRate) !== expected)) {
    return { supported: false, reason: 'EDL requires every source to share the same exact timebase. Use FCPXML or FFmpeg for mixed rates.' };
  }
  return { supported: true, frameRate: sources[0].metadata.frameRate };
};

const smpte = (seconds: number, rate: FrameRate): string => {
  const totalFrames = Math.round(seconds * rate.numerator / rate.denominator);
  const frames = totalFrames % rate.nominal;
  const totalSeconds = Math.floor(totalFrames / rate.nominal);
  return [Math.floor(totalSeconds / 3600), Math.floor(totalSeconds / 60) % 60, totalSeconds % 60, frames].map(value => String(value).padStart(2, '0')).join(':');
};

export const generateEDL = (clips: ClipSegment[], sources: VideoSource[]): string => {
  const relevant = usedSources(clips, sources);
  const compatibility = getEDLCompatibility(relevant);
  if (!compatibility.supported || !compatibility.frameRate) throw new Error(compatibility.reason);
  let cursor = 0;
  const lines = ['TITLE: FRAMEGREP_SUPERCUT', 'FCM: NON-DROP FRAME', ''];
  clips.forEach((clip, index) => {
    const source = relevant.find(item => item.id === clip.sourceId);
    if (!source) return;
    const duration = clip.endSeconds - clip.startSeconds;
    lines.push(`${String(index + 1).padStart(3, '0')}  AX       V     C        ${smpte(clip.startSeconds, compatibility.frameRate!)} ${smpte(clip.endSeconds, compatibility.frameRate!)} ${smpte(cursor, compatibility.frameRate!)} ${smpte(cursor + duration, compatibility.frameRate!)}`);
    lines.push(`* FROM CLIP NAME: ${source.filename}`, `* COMMENT: ${clip.description}`, '');
    cursor += duration;
  });
  return lines.join('\n');
};

const quote = (value: string, platform: 'win' | 'unix'): string => platform === 'win'
  ? `"${value.replace(/([&|<>^%])/g, '^$1').replace(/"/g, '\\"')}"`
  : `'${value.replace(/'/g, `'"'"'`)}'`;

export const generateFFmpegScript = (clips: ClipSegment[], sources: VideoSource[], platform: 'win' | 'unix'): string => {
  if (!sources.length) throw new Error('FFmpeg export requires at least one source.');
  const identityIssue = getSourceIdentityIssue(usedSources(clips, sources));
  if (identityIssue) throw new Error(identityIssue);
  const profile = sources[0].metadata;
  const rate = rateKey(profile.frameRate);
  const separator = platform === 'win' ? '\\' : '/';
  const lines = platform === 'win' ? ['@echo off', 'if not exist segments mkdir segments', 'del /q filelist.txt 2>nul'] : ['#!/usr/bin/env bash', 'set -euo pipefail', 'mkdir -p segments', 'rm -f filelist.txt'];
  clips.forEach((clip, index) => {
    const source = sources.find(item => item.id === clip.sourceId);
    if (!source || clip.endSeconds <= clip.startSeconds) return;
    const output = `segments${separator}clip_${String(index).padStart(3, '0')}.mp4`;
    const filter = `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${rate},format=yuv420p`;
    lines.push(`ffmpeg -ss ${clip.startSeconds.toFixed(6)} -to ${clip.endSeconds.toFixed(6)} -i ${quote(source.filename, platform)} -map 0:v:0 -map 0:a? -vf ${quote(filter, platform)} -c:v libx264 -preset medium -crf 18 -c:a aac -ar 48000 -ac 2 -movflags +faststart ${quote(output, platform)} -y`);
    lines.push(platform === 'win' ? `echo file '${output.replace(/\\/g, '/')}' >> filelist.txt` : `printf "%s\\n" ${quote(`file '${output}'`, platform)} >> filelist.txt`);
  });
  lines.push(`ffmpeg -f concat -safe 0 -i filelist.txt -c copy ${quote('supercut.mp4', platform)} -y`);
  return `${lines.join('\n')}\n`;
};
