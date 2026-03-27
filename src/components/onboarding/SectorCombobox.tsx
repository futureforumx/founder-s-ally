import { useState, useRef, useEffect } from "react";
import { Search, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { PredictiveBadge } from "./PredictiveBadge";
import { AI_SUGGESTED_TEXT_CLASS } from "./SmartSelect";

const SECTORS = [
  "SaaS / B2B Software", "Fintech", "Health Tech", "Consumer / D2C",
  "AI / ML", "Climate Tech", "Marketplace", "Developer Tools", "Edtech",
  "Cybersecurity", "E-commerce", "CleanTech", "Logistics", "Proptech",
  "Enterprise Software", "Other",
];

interface SectorComboboxProps {
  value: string;
  onChange: (val: string) => void;
  predictedValue?: string;
  highlightAi?: boolean;
  onAiAutofill?: () => void;
  /** Called when the user picks a sector or types in the search box (not when AI auto-fills) */
  onUserEdited?: () => void;
}

export function SectorCombobox({
  value,
  onChange,
  predictedValue,
  highlightAi = false,
  onAiAutofill,
  onUserEdited,
}: SectorComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [isPredicted, setIsPredicted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autofillFired = useRef(false);

  // Apply predicted value once
  useEffect(() => {
    if (predictedValue && !value) {
      onChange(predictedValue);
      setIsPredicted(true);
      if (!autofillFired.current) {
        autofillFired.current = true;
        onAiAutofill?.();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange is stable setState from parent
  }, [predictedValue, value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const sanitized = (value ?? "").replace(/^null$/i, "");
  const searchTerm = open ? query : sanitized;

  const filtered = SECTORS.filter(s =>
    s.toLowerCase().includes((query || "").toLowerCase())
  );

  const hasExactMatch = SECTORS.some(s => s.toLowerCase() === (query || "").toLowerCase());
  const showCustom = open && query.trim().length > 0 && !hasExactMatch;
  const totalItems = (showCustom ? 1 : 0) + filtered.length;

  const select = (val: string) => {
    onUserEdited?.();
    onChange(val);
    setQuery("");
    setOpen(false);
    setFocusedIdx(-1);
    setIsPredicted(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setFocusedIdx(i => Math.min(i + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (focusedIdx >= 0) {
        const customOffset = showCustom ? 1 : 0;
        if (showCustom && focusedIdx === 0) {
          select(query.trim());
        } else {
          select(filtered[focusedIdx - customOffset]);
        }
      } else if (showCustom) {
        select(query.trim());
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        Sector <span className="text-destructive">*</span>
        {(isPredicted || highlightAi) && sanitized && <PredictiveBadge />}
      </label>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={open ? query : sanitized}
          placeholder="Search or enter sector..."
          onFocus={() => { setOpen(true); setQuery(""); setFocusedIdx(-1); }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setFocusedIdx(-1);
            setIsPredicted(false);
            onUserEdited?.();
          }}
          onKeyDown={handleKeyDown}
          className={`w-full rounded-lg border border-input bg-background pl-9 pr-16 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 ${
            !open && highlightAi && sanitized ? AI_SUGGESTED_TEXT_CLASS : "text-foreground"
          }`}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>

        {open && totalItems > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-popover shadow-xl max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
            {showCustom && (
              <button
                type="button"
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${focusedIdx === 0 ? "bg-accent/10 text-accent-foreground font-medium" : "text-foreground hover:bg-muted"}`}
                onMouseEnter={() => setFocusedIdx(0)}
                onClick={() => select(query.trim())}
              >
                Use "<span className="font-medium">{query.trim()}</span>" as custom sector
              </button>
            )}
            {filtered.map((s, i) => {
              const idx = i + (showCustom ? 1 : 0);
              return (
                <button
                  key={s}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${focusedIdx === idx ? "bg-accent/10 text-accent-foreground font-medium" : "text-foreground hover:bg-muted"}`}
                  onMouseEnter={() => setFocusedIdx(idx)}
                  onClick={() => select(s)}
                >
                  {s}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
