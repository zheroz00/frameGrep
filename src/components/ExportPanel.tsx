import React from 'react';
import { Monitor, FileCode, Film, Music, Hash, FolderOpen, Terminal, Layers } from 'lucide-react';
import {
  generateEDLWithMode, generateFFmpegScriptWithMode, generateFCPXMLWithMode,
  filterClipsForExport, FCPXMLOptions, EDLCompatibility
} from '../utils/exportUtils';
import { generateReviewFCPXML } from '../utils/reviewTimeline';
import { downloadFile } from '../utils/downloadFile';
import { ClipSegment, ExportMode, SelectedMusicTrack, VideoMetadata, VideoSource } from '../types';

interface ExportPanelProps {
  clips: ClipSegment[];
  exportSources: VideoSource[];
  exportMode: ExportMode;
  setExportMode: (mode: ExportMode) => void;
  davinciMediaFolder: string | undefined;
  onDavinciMediaFolderChange: (folder: string) => void;
  /** Footage folders used before, most recent first. */
  recentFolders: string[];
  /** Called with the folder whenever a DaVinci export actually uses one. */
  onFolderUsed: (folder: string) => void;
  selectedMusic: SelectedMusicTrack | null;
  exportProjectName: string;
  exportFilename: string;
  firstVideoMetadata: VideoMetadata | undefined;
  hasMultipleSources: boolean;
  sourceFiles: string[];
  edlCompatibility: EDLCompatibility;
  exportIdentityIssue: string | undefined;
  onOpenCaptions: () => void;
}

const ExportPanel: React.FC<ExportPanelProps> = ({
  clips,
  exportSources,
  exportMode,
  setExportMode,
  davinciMediaFolder,
  onDavinciMediaFolderChange,
  recentFolders,
  onFolderUsed,
  selectedMusic,
  exportProjectName,
  exportFilename,
  firstVideoMetadata,
  hasMultipleSources,
  sourceFiles,
  edlCompatibility,
  exportIdentityIssue,
  onOpenCaptions,
}) => {
  const fcpxmlOptions = (): FCPXMLOptions => {
    if (davinciMediaFolder?.trim()) onFolderUsed(davinciMediaFolder);
    return { sources: exportSources, audioFilename: selectedMusic?.filename, mediaFolder: davinciMediaFolder };
  };
  const otherFolders = recentFolders.filter(folder => folder !== davinciMediaFolder?.trim());

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
      <div className="p-4 border-b border-zinc-800 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-zinc-300">Export</h3>
          {hasMultipleSources && (
            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] font-medium rounded">
              {sourceFiles.length} sources
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => downloadFile(generateEDLWithMode(clips, exportSources, exportMode), 'FPV_Supercut.edl')}
            disabled={!edlCompatibility.supported}
            title={edlCompatibility.reason ?? 'Export CMX 3600 EDL'}
            className="w-full justify-center px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 text-xs rounded flex items-center gap-2 transition-colors"
          >
            <Monitor size={12} /> EDL
          </button>
          <button
            onClick={() => downloadFile(generateFFmpegScriptWithMode(clips, exportSources, 'unix', exportMode), 'stitch.sh')}
            disabled={Boolean(exportIdentityIssue)}
            title={exportIdentityIssue ?? 'Export a frame-accurate FFmpeg script'}
            className="w-full justify-center px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 text-xs rounded flex items-center gap-2 transition-colors"
          >
            <FileCode size={12} /> FFmpeg
          </button>
          <button
            onClick={() => downloadFile(
              generateFCPXMLWithMode(exportProjectName, clips, exportMode, fcpxmlOptions()),
              exportFilename
            )}
            disabled={Boolean(exportIdentityIssue)}
            className="w-full justify-center px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-orange-400 text-xs rounded flex items-center gap-2 transition-colors"
            title={exportIdentityIssue ?? `Export as FCPXML for DaVinci Resolve${firstVideoMetadata ? ` (${firstVideoMetadata.frameRate.numerator}/${firstVideoMetadata.frameRate.denominator} ${firstVideoMetadata.width}x${firstVideoMetadata.height})` : ''}${selectedMusic ? ` with music: ${selectedMusic.track.name}` : ''}`}
          >
            <Film size={12} /> DaVinci {selectedMusic && <Music size={10} className="text-emerald-400" />}
          </button>
          <button
            onClick={onOpenCaptions}
            className="w-full justify-center px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-400 text-xs rounded flex items-center gap-2 transition-colors"
            title="Generate social media captions for all clips"
          >
            <Hash size={12} /> Captions
          </button>
          <button
            onClick={() => downloadFile(
              generateReviewFCPXML(exportProjectName, clips, exportMode, fcpxmlOptions()),
              exportFilename.replace(/\.fcpxml$/i, '') + '_review.fcpxml'
            )}
            disabled={Boolean(exportIdentityIssue)}
            className="col-span-2 w-full justify-center px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-orange-400 text-xs rounded flex items-center gap-2 transition-colors"
            title={exportIdentityIssue ?? 'Review timeline for DaVinci Resolve: the whole video in its original order, kept clips on V1 and everything that was cut on V2. Scrub V2 to check nothing good was dropped. To finish the cut, delete the V2 track, then Edit > Delete Gaps.'}
          >
            <Layers size={12} /> DaVinci + cut footage
          </button>
        </div>
        {/* Export Mode Toggle - show when Smart Edit data is present */}
        {clips.some(c => c.sectionType) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Mode:</span>
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
              <button
                onClick={() => setExportMode('highlights_only')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  exportMode === 'highlights_only'
                    ? 'bg-green-500 text-zinc-950'
                    : 'text-zinc-500 hover:text-white'
                }`}
              >
                Highlights only
              </button>
              <button
                onClick={() => setExportMode('full_edit')}
                title="Full edit: remove dead time"
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  exportMode === 'full_edit'
                    ? 'bg-amber-500 text-zinc-950'
                    : 'text-zinc-500 hover:text-white'
                }`}
              >
                Full edit
              </button>
            </div>
            <span className="text-[10px] text-zinc-600">
              {filterClipsForExport(clips, exportMode).length} clips
            </span>
          </div>
        )}
        {/* Optional source-video folder: FCPXML embeds absolute paths so DaVinci auto-links media (blank = relink in Resolve) */}
        <div className="flex items-center gap-2">
          <FolderOpen size={13} className="text-zinc-500 shrink-0" />
          <input
            type="text"
            value={davinciMediaFolder || ''}
            onChange={(e) => onDavinciMediaFolderChange(e.target.value)}
            placeholder="Footage folder, e.g. /media/fpv/day1"
            className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
            title="Paste the folder holding your source video(s), as DaVinci's computer sees it. FCPXML embeds absolute paths so Resolve links media automatically on import. Leave blank to relink in Resolve. A browser cannot read this from the file you picked."
          />
          {otherFolders.length > 0 && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) onDavinciMediaFolderChange(e.target.value); }}
              aria-label="Recent footage folders"
              title="Footage folders from earlier exports"
              className="shrink-0 w-[4.5rem] bg-zinc-950 border border-zinc-800 rounded px-1 py-1 text-[11px] text-zinc-400 focus:outline-none focus:border-orange-500/50"
            >
              <option value="">Recent</option>
              {otherFolders.map(folder => <option key={folder} value={folder}>{folder}</option>)}
            </select>
          )}
        </div>
      </div>
      <div className="p-4 bg-black/50">
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3 font-mono">
          <Terminal size={14} /> FFmpeg Commands
        </div>
        <pre className="text-[10px] font-mono text-zinc-400 overflow-x-auto whitespace-pre p-3 bg-black rounded border border-zinc-800 max-h-32">
          {exportIdentityIssue
            ? `# Export blocked: ${exportIdentityIssue}`
            : generateFFmpegScriptWithMode(clips, exportSources, 'unix', exportMode).split('\n').filter((l: string) => l.includes('ffmpeg')).slice(0, 5).join('\n')}
          {!exportIdentityIssue && filterClipsForExport(clips, exportMode).length > 5 && '\n# ... and more'}
        </pre>
      </div>
    </div>
  );
};

export default ExportPanel;
