import { useState, useRef, useEffect } from "react";
import { Lightbulb } from "lucide-react";

interface AISuggestionIconProps {
  aiValue: string;
  onApply: () => void;
}

export function AISuggestionIcon({ aiValue, onApply }: AISuggestionIconProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="ml-1 text-accent/70 hover:text-accent transition-colors"
        title="AI has a different suggestion"
      >
        <Lightbulb className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[200px] rounded-lg border border-border bg-popover p-3 shadow-lg animate-in fade-in slide-in-from-top-1">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">AI Suggestion</p>
          <p className="text-sm text-foreground mb-2 break-words">{aiValue}</p>
          <button
            onClick={() => { onApply(); setOpen(false); }}
            className="rounded-md bg-accent px-3 py-1 text-[11px] font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
