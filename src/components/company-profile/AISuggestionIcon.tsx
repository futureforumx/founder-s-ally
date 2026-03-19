import { useState, useRef, useEffect } from "react";

function PhosphorLightbulb({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" stroke="none">
      <path d="M172,232a4,4,0,0,1-4,4H88a4,4,0,0,1,0-8h80A4,4,0,0,1,172,232Zm40-128a83.56,83.56,0,0,1-30.94,64.91A12.06,12.06,0,0,0,176,178v6a12,12,0,0,1-12,12H92a12,12,0,0,1-12-12v-6a12,12,0,0,0-5-9.65A83.44,83.44,0,0,1,44,104.86C43.53,59.36,80.26,21.52,125.75,20A84,84,0,0,1,212,104Zm-8,0a76,76,0,0,0-78.06-76C83.83,29.38,51.49,62.65,52,104.78A75.48,75.48,0,0,0,82.86,163a20,20,0,0,1,5.78,9H128V115.31l-25.76-25.75a4,4,0,0,1,5.66-5.66L128,104l20.1-20.1a4,4,0,0,1,5.66,5.66L128,115.31V172h39.36a20,20,0,0,1,5.78-9A75.56,75.56,0,0,0,204,104Z"/>
    </svg>
  );
}

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
        <PhosphorLightbulb className="h-3.5 w-3.5" />
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
