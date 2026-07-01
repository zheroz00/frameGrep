import React, { useState } from 'react';
import { Search, Loader2, ChevronRight, ChevronDown, Sliders, Play, AlertTriangle, Film, Plus, Check } from 'lucide-react';
import { MarlinFindResult, MarlinFindOptions } from '../services/marlinService';

/**
 * Marlin Mode 2 — interactive footage search.
 *
 * The user types a natural-language query; Marlin's find mode resolves it to a single
 * (start, end) span that auto-previews in the player above. find ALWAYS returns a span
 * (it never reports "not present"), so the user is the verifier — they preview to confirm.
 */

// Marlin's canonical grounding prompt. An override MUST keep the "From <start> to <end>"
// structure or the server's span parser fails (format_ok=false).
const DEFAULT_PROMPT_TEMPLATE =
  'Identify the timestamps during which "{event}" takes place. Output the time range as "From <start> to <end>."';
const REQUIRED_STRUCTURE = 'From <start> to <end>';

const secondsToMmss = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

interface MarlinSearchPanelProps {
  targetVideoName: string | null;
  isSearching: boolean;
  result: MarlinFindResult | null;
  error: string | null;
  added: boolean;
  onSearch: (query: string, opts: MarlinFindOptions) => void;
  onReplay: () => void;
  onAdd: () => void;
}

const MarlinSearchPanel: React.FC<MarlinSearchPanelProps> = ({
  targetVideoName,
  isSearching,
  result,
  error,
  added,
  onSearch,
  onReplay,
  onAdd,
}) => {
  const [query, setQuery] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT_TEMPLATE);
  const [temperature, setTemperature] = useState(0);
  const [maxTokens, setMaxTokens] = useState(128);

  const templateValid = promptTemplate.includes(REQUIRED_STRUCTURE);
  const canSearch = query.trim().length > 0 && !isSearching && templateValid;

  const submit = () => {
    if (!canSearch) return;
    const opts: MarlinFindOptions = {
      temperature,
      maxNewTokens: maxTokens,
    };
    // Only send a template override when it differs from the canonical one.
    if (promptTemplate.trim() && promptTemplate !== DEFAULT_PROMPT_TEMPLATE) {
      opts.promptTemplate = promptTemplate;
    }
    onSearch(query, opts);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          <Search size={14} className="text-sky-400" />
          Marlin Search
          <span className="text-sky-400 normal-case font-medium tracking-normal">· find a moment</span>
        </div>
        {targetVideoName && (
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 max-w-[180px] truncate" title={targetVideoName}>
            <Film size={11} />
            {targetVideoName}
          </span>
        )}
      </div>

      {/* Search input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder='e.g. "backflip between the trees"'
          className="flex-1 px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-sky-500/50"
        />
        <button
          onClick={submit}
          disabled={!canSearch}
          className={`px-4 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-colors min-w-[110px] justify-center ${
            canSearch
              ? 'bg-sky-500 hover:bg-sky-400 text-white'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          {isSearching ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
          {isSearching ? 'Searching' : 'Search'}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="mt-4 bg-zinc-950 border border-zinc-800 rounded-lg p-4">
          {result.span ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-lg text-sky-400">
                  {secondsToMmss(result.span[0])} – {secondsToMmss(result.span[1])}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onReplay}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-md transition-colors"
                  >
                    <Play size={12} fill="currentColor" /> Replay span
                  </button>
                  <button
                    onClick={onAdd}
                    disabled={added}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      added
                        ? 'bg-emerald-500/15 text-emerald-400 cursor-default'
                        : 'bg-sky-500 hover:bg-sky-400 text-white'
                    }`}
                  >
                    {added ? <><Check size={12} /> Added</> : <><Plus size={12} /> Add to clips</>}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-amber-400/90 flex items-start gap-1.5">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                Marlin always returns a span — preview above to confirm it actually matches your query.
              </p>
              {result.raw && (
                <p className="mt-2 text-[11px] text-zinc-600 font-mono truncate" title={result.raw}>
                  raw: {result.raw}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-400 flex items-start gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
              Couldn't parse a span from Marlin's output{result.raw ? ` (raw: "${result.raw}")` : ''}. Try rephrasing the query.
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mt-3 text-xs text-rose-400 flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {/* Advanced */}
      <div className="mt-4 border-t border-zinc-800/70 pt-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Sliders size={12} />
          Advanced
          {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {advancedOpen && (
          <div className="mt-3 space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Prompt template
              </label>
              <textarea
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                rows={3}
                className={`w-full px-3 py-2 bg-zinc-950 border rounded-lg text-xs font-mono text-zinc-200 resize-y focus:outline-none ${
                  templateValid ? 'border-zinc-800 focus:border-sky-500/50' : 'border-rose-500/60'
                }`}
              />
              {!templateValid ? (
                <p className="mt-1 text-[11px] text-rose-400 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  Template must contain the literal <code className="text-rose-300">{REQUIRED_STRUCTURE}</code> or the span parser will fail.
                </p>
              ) : (
                <p className="mt-1 text-[10px] text-zinc-600">
                  Use <code className="text-zinc-500">{'{event}'}</code> for the query. Keep the <code className="text-zinc-500">From &lt;start&gt; to &lt;end&gt;</code> output structure.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                  Temperature
                </label>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500/50"
                />
                <p className="mt-1 text-[10px] text-zinc-600">0 = greedy / reproducible</p>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                  Max tokens
                </label>
                <input
                  type="number"
                  min={16}
                  max={2048}
                  step={16}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Math.max(16, Number(e.target.value) || 128))}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500/50"
                />
                <p className="mt-1 text-[10px] text-zinc-600">find is a one-line answer</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarlinSearchPanel;
