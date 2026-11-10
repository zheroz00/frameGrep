import React from 'react';
import {
  Upload, Zap, AlertTriangle, Loader2, CloudUpload, Cpu, Sparkles, X,
  CheckCircle2, XCircle, Film, Settings, Link2, ExternalLink
} from 'lucide-react';
import { UseVideoAnalysisReturn } from '../hooks/useVideoAnalysis';
import { AnalysisProvider } from '../types';

type SourceAnalysis = Pick<
  UseVideoAnalysisReturn,
  | 'needsRelink'
  | 'missingVideos'
  | 'relinkVideos'
  | 'videoQueue'
  | 'handleFilesUpload'
  | 'isBusy'
  | 'clearQueue'
  | 'retryItem'
  | 'removeFromQueue'
  | 'uploadPhase'
  | 'queueProgress'
  | 'phaseDetail'
  | 'processingProgress'
  | 'elapsedTime'
  | 'cancelAnalysis'
  | 'error'
>;

interface SourcePanelProps {
  analysis: SourceAnalysis;
  provider: AnalysisProvider;
  onAnalyze: () => void;
}

const SourcePanel: React.FC<SourcePanelProps> = ({ analysis, provider, onAnalyze }) => (
  <>
    {/* Relink Banner - shown when project loaded but videos missing */}
    {analysis.needsRelink && (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <Link2 size={20} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-amber-300 mb-1">
              Videos need to be relinked
            </h4>
            <p className="text-xs text-zinc-400 mb-3">
              Project loaded successfully. Select the original video files to enable preview and playback.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {analysis.missingVideos.map((filename, i) => (
                <span key={i} className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-300 truncate max-w-[200px]">
                  {filename}
                </span>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-semibold rounded-lg cursor-pointer transition-colors">
              <Link2 size={16} />
              Relink Videos
              <input
                type="file"
                className="hidden"
                accept="video/*"
                multiple
                onChange={async (e) => {
                  if (e.target.files) {
                    const count = await analysis.relinkVideos(e.target.files);
                    if (count > 0) {
                      console.log(`Relinked ${count} video(s)`);
                    }
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      </div>
    )}

    {/* Upload & Analyze Controls */}
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-lg">
      <div className="flex flex-col gap-3">
        <label className="cursor-pointer">
          <div className="flex items-center gap-3 px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors">
            <Upload size={18} className="text-zinc-400" />
            <span className="text-sm font-medium truncate">
              {analysis.videoQueue.length > 0
                ? `${analysis.videoQueue.length} video${analysis.videoQueue.length > 1 ? 's' : ''} queued`
                : "Select videos"}
            </span>
          </div>
          <input
            type="file"
            className="hidden"
            accept="video/*"
            multiple
            onChange={analysis.handleFilesUpload}
          />
        </label>
        <button
          onClick={onAnalyze}
          disabled={analysis.videoQueue.length === 0 || analysis.isBusy}
          className={`w-full px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-all min-w-[140px] justify-center ${
            analysis.isBusy
              ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/20 border border-amber-500/30'
              : 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-lg shadow-amber-500/10'
          }`}
        >
          {analysis.isBusy ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} fill="currentColor" />}
          {analysis.isBusy ? "Processing" : "Analyze"}
        </button>
      </div>

      {/* Video Queue */}
      {analysis.videoQueue.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="font-medium">Queue</span>
            {!analysis.isBusy && (
              <button
                onClick={analysis.clearQueue}
                className="text-zinc-600 hover:text-red-400 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {analysis.videoQueue.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-950 rounded-lg text-xs"
              >
                <div className="flex-shrink-0">
                  {item.status === 'pending' && <div className="w-3 h-3 rounded-full bg-zinc-600" />}
                  {item.status === 'preparing' && <Settings size={12} className="text-emerald-400 animate-spin" />}
                  {item.status === 'uploading' && <CloudUpload size={12} className="text-cyan-400 animate-bounce" />}
                  {item.status === 'processing' && <Cpu size={12} className="text-amber-400 animate-pulse" />}
                  {item.status === 'analyzing' && <Sparkles size={12} className="text-purple-400 animate-pulse" />}
                  {item.status === 'complete' && item.url && <CheckCircle2 size={12} className="text-green-500" />}
                  {item.status === 'complete' && !item.url && <Link2 size={12} className="text-amber-400" />}
                  {item.status === 'error' && <XCircle size={12} className="text-red-500" />}
                  {item.status === 'cancelled' && <XCircle size={12} className="text-zinc-500" />}
                </div>
                <span className={`flex-1 truncate ${item.url ? 'text-zinc-400' : 'text-amber-400/70'}`}>{item.file.name}</span>
                {item.transcodedUrl && (
                  <a
                    href={item.transcodedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400/70 hover:text-amber-400 text-[10px] flex items-center gap-1 transition-colors shrink-0"
                    title={`Open the transcoded file sent to Gemini in a new tab. Source ${(item.file.size / 1_048_576).toFixed(0)} MB → uploaded ${((item.transcodedSize ?? 0) / 1_048_576).toFixed(0)} MB. Server downscales to 720p.`}
                  >
                    <ExternalLink size={10} /> sent
                  </a>
                )}
                {item.status === 'complete' && item.url && (
                  <span className="text-green-500/70">{item.clips.length} clips</span>
                )}
                {item.status === 'complete' && !item.url && (
                  <span className="text-amber-400/70 text-[10px]">needs relink</span>
                )}
                {item.status === 'error' && (
                  <span className="text-red-400 truncate max-w-[100px]" title={item.error}>
                    {item.error}
                  </span>
                )}
                {(item.status === 'error' || item.status === 'cancelled') && !analysis.isBusy && (
                  <button onClick={() => analysis.retryItem(item.id)} className="text-amber-400 hover:text-amber-300 text-[10px]">Retry</button>
                )}
                {!analysis.isBusy && item.status === 'pending' && (
                  <button
                    onClick={() => analysis.removeFromQueue(item.id)}
                    className="text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress Indicator */}
      {analysis.isBusy && (
        <div className="mt-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className={`flex items-start gap-2 min-w-0 text-sm font-medium [&>svg]:shrink-0 [&>svg]:mt-0.5 ${
              analysis.uploadPhase === 'preparing' ? 'text-emerald-400' :
              analysis.uploadPhase === 'uploading' ? 'text-cyan-400' :
              analysis.uploadPhase === 'processing' ? 'text-amber-400' :
              analysis.uploadPhase === 'extracting' ? 'text-orange-400' :
              'text-purple-400'
            }`}>
              {analysis.uploadPhase === 'preparing' && <Settings size={16} className="animate-spin" />}
              {analysis.uploadPhase === 'uploading' && <CloudUpload size={16} className="animate-bounce" />}
              {analysis.uploadPhase === 'processing' && <Cpu size={16} className="animate-pulse" />}
              {analysis.uploadPhase === 'extracting' && <Film size={16} className="animate-pulse" />}
              {analysis.uploadPhase === 'analyzing' && <Sparkles size={16} className="animate-pulse" />}
              <span>
                {analysis.queueProgress.total > 1 && (
                  <span className="text-zinc-500 mr-2">
                    [{analysis.queueProgress.current}/{analysis.queueProgress.total}]
                  </span>
                )}
                {analysis.phaseDetail || (
                  <>
                    {analysis.uploadPhase === 'preparing' && "Transcoding for analysis..."}
                    {analysis.uploadPhase === 'uploading' && "Uploading to Gemini Files API..."}
                    {analysis.uploadPhase === 'processing' && `Gemini processing video on Google servers (${analysis.processingProgress.attempt}/${analysis.processingProgress.maxAttempts} polls, ${analysis.processingProgress.attempt * 2}s elapsed)...`}
                    {analysis.uploadPhase === 'extracting' && "Extracting video frames..."}
                    {analysis.uploadPhase === 'analyzing' && "AI analyzing footage..."}
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`font-mono font-bold tabular-nums text-sm ${provider === 'custom' ? 'text-purple-500' : 'text-amber-500'}`}>
                {Math.floor(analysis.elapsedTime / 60)}:{String(analysis.elapsedTime % 60).padStart(2, '0')}
              </span>
              <button onClick={analysis.cancelAnalysis} className="text-[10px] text-red-400 hover:text-red-300 border border-red-500/30 rounded px-2 py-1">Cancel</button>
            </div>
          </div>
          {(analysis.uploadPhase === 'preparing' || analysis.uploadPhase === 'processing') && (
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  analysis.uploadPhase === 'preparing'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500'
                }`}
                style={{ width: `${Math.min((analysis.processingProgress.attempt / analysis.processingProgress.maxAttempts) * 100, 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {analysis.error && (
        <div className="mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle size={16} />
          {analysis.error}
        </div>
      )}
    </div>
  </>
);

export default SourcePanel;
