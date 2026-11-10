import React, { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface WhyDisclosureProps {
  /** The model's explanation for picking the clip. Nothing renders without it. */
  reasoning?: string;
  /** Controlled open state. Leave undefined to let the component manage it. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
}

/** A chevron that opens and closes the model's reasoning for a clip. */
const WhyDisclosure: React.FC<WhyDisclosureProps> = ({ reasoning, open, onToggle }) => {
  const [localOpen, setLocalOpen] = useState(false);
  const panelId = useId();
  if (!reasoning) return null;

  const isOpen = open ?? localOpen;
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // the surrounding card plays the clip on click
    if (open === undefined) setLocalOpen(!isOpen);
    onToggle?.(!isOpen);
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        onMouseDown={e => e.preventDefault()}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 rounded transition-colors"
      >
        <ChevronRight size={14} className={`transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-90' : ''}`} />
        Why this clip
      </button>
      {isOpen && (
        <p id={panelId} className="mt-1.5 pl-[18px] text-xs text-zinc-400 leading-relaxed max-w-[75ch]">
          {reasoning}
        </p>
      )}
    </div>
  );
};

export default WhyDisclosure;
