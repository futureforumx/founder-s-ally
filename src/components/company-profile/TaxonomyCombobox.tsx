import { useState, useRef, useEffect, useCallback } from "react";
import { Search, ChevronDown, Sparkles, X, Check } from "lucide-react";
import { type TaxonomyOption, filterTaxonomyOptions } from "@/constants/taxonomy";

// ── Highlight helper ──

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-foreground">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

// ── Types ──

interface TaxonomyComboboxProps<T extends TaxonomyOption = TaxonomyOption> {
  options: T[];
  value: string;
  onChange: (value: string, option?: T) => void;
  placeholder?: string;
  allowCustom?: boolean;
  isAiDraft?: boolean;
  isAiApproved?: boolean;
  className?: string;
  /** Optional icon component to render at left */
  icon?: React.ReactNode;
}

export function TaxonomyCombobox<T extends TaxonomyOption>({
  options,
  value,
  onChange,
  placeholder = "Search...",
  allowCustom = true,
  isAiDraft = false,
  isAiApproved = false,
  className,
  icon,
}: TaxonomyComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const filtered = filterTaxonomyOptions(options, query);

  const hasExactMatch = options.some(
    o => o.label.toLowerCase() === query.trim().toLowerCase()
  );
  const showCustom = allowCustom && open && query.trim().length > 0 && !hasExactMatch;

  const totalItems = (showCustom ? 1 : 0) + filtered.length;

  const select = (val: string) => {
    const match = options.find(o => o.label === val);
    onChange(val, match as T | undefined);
    setQuery("");
    setOpen(false);
    setFocusIdx(-1);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setQuery("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setFocusIdx(i => Math.min(i + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (focusIdx >= 0) {
        const customOffset = showCustom ? 1 : 0;
        if (showCustom && focusIdx === 0) {
          select(query.trim());
        } else {
          const idx = focusIdx - customOffset;
          if (idx >= 0 && idx < filtered.length) select(filtered[idx].label);
        }
      } else if (showCustom) {
        select(query.trim());
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const displayValue = open ? query : value;

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <div className="relative">
        {icon ? (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">{icon}</span>
        ) : (
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          placeholder={placeholder}
          onFocus={() => { setOpen(true); setQuery(""); setFocusIdx(-1); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); setFocusIdx(-1); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          className={`w-full h-9 rounded-lg border pl-8 pr-16 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all ${
            value && isAiApproved
              ? "border-ai-approved/40 bg-ai-approved/10"
              : value && !isAiApproved
                ? "border-ai-pending/50 bg-ai-pending/15 animate-[ai-pulse_2s_ease-in-out_infinite]"
                : "border-input bg-background"
          }`}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <button type="button" onClick={clear} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X className="h-3 w-3" />
            </button>
          )}
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </div>
      </div>

      {open && totalItems > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg max-h-52 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Create custom option */}
          {showCustom && (
            <button
              type="button"
              onClick={() => select(query.trim())}
              onMouseEnter={() => setFocusIdx(0)}
              className={`w-full text-left px-3 py-2 text-xs flex items-center gap-1.5 transition-colors ${
                focusIdx === 0 ? "bg-accent/10 text-accent" : "text-foreground hover:bg-muted"
              }`}
            >
              <Sparkles className="h-3 w-3 text-accent shrink-0" />
              Create &ldquo;<span className="font-semibold text-accent">{query.trim()}</span>&rdquo;
            </button>
          )}

          {/* Options */}
          {filtered.map((opt, i) => {
            const idx = i + (showCustom ? 1 : 0);
            const isSelected = opt.label === value;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => select(opt.label)}
                onMouseEnter={() => setFocusIdx(idx)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                  focusIdx === idx
                    ? "bg-accent/10 text-foreground"
                    : isSelected
                    ? "bg-accent/5 text-foreground font-medium"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <div className="min-w-0">
                  <span className="font-medium">
                    <HighlightMatch text={opt.label} query={query} />
                  </span>
                  {opt.description && (
                    <span className="block text-[10px] text-muted-foreground mt-0.5 truncate">
                      {opt.description}
                    </span>
                  )}
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 text-accent shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {open && totalItems === 0 && query.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg p-3 text-xs text-muted-foreground animate-in fade-in duration-150">
          No matches found
        </div>
      )}
    </div>
  );
}
