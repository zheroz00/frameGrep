import React, { useState } from 'react';
import { Plane, ChevronRight, ChevronDown, BookOpen } from 'lucide-react';
import { FPV_MOVES, FpvMove, FpvMoveCategory } from '../constants/fpvMoves';

const CATEGORY_LABELS: Record<FpvMoveCategory, string> = {
  rotation: 'Rotations',
  orbital: 'Orbits',
  gap: 'Gaps',
  proximity: 'Proximity',
  combo: 'Combos',
  vertical: 'Vertical',
  hover: 'Hover',
};

const CATEGORY_ORDER: FpvMoveCategory[] = [
  'rotation', 'orbital', 'gap', 'proximity', 'combo', 'vertical', 'hover',
];

const DIFFICULTY_DOT: Record<FpvMove['difficulty'], string> = {
  basic: 'bg-emerald-500',
  intermediate: 'bg-amber-500',
  advanced: 'bg-rose-500',
};

const FpvMoveDictionaryPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  const grouped = CATEGORY_ORDER
    .map(cat => ({ category: cat, moves: FPV_MOVES.filter(m => m.category === cat) }))
    .filter(g => g.moves.length > 0);

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-900/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
          <BookOpen size={14} />
          FPV Move Dictionary
          <span className="text-amber-500 normal-case font-medium tracking-normal">
            · {FPV_MOVES.length} canonical maneuvers
          </span>
        </div>
        {isOpen ? <ChevronDown size={16} className="text-zinc-500" /> : <ChevronRight size={16} className="text-zinc-500" />}
      </button>

      {!isOpen && (
        <p className="px-4 pb-4 text-[10px] text-zinc-600 italic">
          Auto-appended to your prompt at runtime so the model uses canonical FPV terms. Read-only — edit <code className="text-zinc-500">src/constants/fpvMoves.ts</code> to change definitions.
        </p>
      )}

      {isOpen && (
        <div className="border-t border-zinc-800">
          <p className="px-4 py-3 text-[10px] text-zinc-600 italic border-b border-zinc-800/50">
            This block is added to the instruction above every time an FPV preset runs. Sources cited in <code className="text-zinc-500">docs/fpv-move-research.md</code>.
          </p>
          <div className="max-h-96 overflow-y-auto px-4 py-3 space-y-5">
            {grouped.map(({ category, moves }) => (
              <div key={category} className="space-y-2">
                <div className="flex items-center gap-2 sticky top-0 bg-zinc-950 py-1">
                  <Plane size={11} className="text-zinc-600" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    {CATEGORY_LABELS[category]}
                  </span>
                  <span className="text-[10px] text-zinc-700">({moves.length})</span>
                </div>
                <div className="space-y-3">
                  {moves.map(move => (
                    <MoveCard key={move.id} move={move} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface MoveCardProps {
  move: FpvMove;
}

const MoveCard: React.FC<MoveCardProps> = ({ move }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-md p-3 text-xs">
      <button
        type="button"
        onClick={() => setExpanded(open => !open)}
        className="w-full flex items-start gap-2 text-left"
      >
        <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${DIFFICULTY_DOT[move.difficulty]}`} title={move.difficulty} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-amber-500 font-semibold uppercase tracking-wide">{move.name}</span>
            {move.aliases.length > 0 && (
              <span className="text-zinc-600 text-[10px] italic truncate">
                a.k.a. {move.aliases.join(', ')}
              </span>
            )}
          </div>
          <p className="text-zinc-300 mt-1 leading-relaxed">{move.definition}</p>
        </div>
        {expanded ? <ChevronDown size={14} className="text-zinc-600 mt-1 shrink-0" /> : <ChevronRight size={14} className="text-zinc-600 mt-1 shrink-0" />}
      </button>

      {expanded && (
        <div className="mt-3 ml-3.5 pl-3 border-l border-zinc-800 space-y-2 text-[11px]">
          <SignalList label="Visual" items={move.visualSignals} />
          <SignalList label="Audio" items={move.audioSignals} />
          {move.distinguishFrom && move.distinguishFrom.length > 0 && (
            <SignalList label="Distinguish from" items={move.distinguishFrom} />
          )}
        </div>
      )}
    </div>
  );
};

interface SignalListProps {
  label: string;
  items: string[];
}

const SignalList: React.FC<SignalListProps> = ({ label, items }) => (
  <div>
    <span className="text-zinc-500 font-medium">{label}:</span>
    <ul className="mt-1 space-y-0.5">
      {items.map((item, i) => (
        <li key={i} className="text-zinc-400 pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-zinc-600">
          {item}
        </li>
      ))}
    </ul>
  </div>
);

export default FpvMoveDictionaryPanel;
