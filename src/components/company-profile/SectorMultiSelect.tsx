import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, CornerDownLeft, Plus, Search, Sparkles, X } from "lucide-react";
import { SECTOR_OPTIONS, SUGGESTED_SECTOR_OPTIONS, filterTaxonomyOptions } from "@/constants/taxonomy";
import { cn } from "@/lib/utils";

const SUGGESTION_COUNT = 4;

interface SectorMultiSelectProps {
  /** Ranked selection — the first entry is the primary sector. */
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  /** Sectors that were pre-filled from the AI description pass. */
  aiSuggested?: string[];
  /** True once the user has approved the section, which settles the AI-pending state. */
  approved?: boolean;
  inputId?: string;
  className?: string;
}

interface Row {
  label: string;
  description?: string;
  selected: boolean;
  disabled: boolean;
  isCustom: boolean;
}

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

export function SectorMultiSelect({
  value,
  onChange,
  max = 3,
  aiSuggested = [],
  approved = false,
  inputId,
  className,
}: SectorMultiSelectProps) {
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const listboxId = `${generatedId}-sector-list`;

  const trimmed = query.trim();
  const capReached = value.length >= max;
  const listOpen = trimmed.length > 0 || browsing;

  const rows = useMemo<Row[]>(() => {
    const matches = filterTaxonomyOptions(SECTOR_OPTIONS, query);
    const optionRows: Row[] = matches.map((opt) => {
      const selected = value.includes(opt.label);
      return {
        label: opt.label,
        description: opt.description,
        selected,
        disabled: capReached && !selected,
        isCustom: false,
      };
    });

    const isKnown = SECTOR_OPTIONS.some((opt) => opt.label.toLowerCase() === trimmed.toLowerCase());
    const isSelected = value.some((sector) => sector.toLowerCase() === trimmed.toLowerCase());
    if (trimmed && !isKnown && !isSelected) {
      optionRows.push({ label: trimmed, selected: false, disabled: capReached, isCustom: true });
    }

    return optionRows;
  }, [capReached, query, trimmed, value]);

  const firstEnabledIndex = rows.findIndex((row) => !row.disabled);

  useEffect(() => {
    setActiveIndex(firstEnabledIndex === -1 ? 0 : firstEnabledIndex);
  }, [firstEnabledIndex, query]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setBrowsing(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const add = useCallback(
    (sector: string) => {
      if (value.includes(sector) || value.length >= max) return;
      onChange([...value, sector]);
      setQuery("");
    },
    [max, onChange, value],
  );

  const remove = useCallback(
    (sector: string) => {
      onChange(value.filter((item) => item !== sector));
    },
    [onChange, value],
  );

  const commitRow = useCallback(
    (row: Row) => {
      if (row.disabled) return;
      if (row.selected) {
        remove(row.label);
      } else {
        add(row.label);
      }
      inputRef.current?.focus();
    },
    [add, remove],
  );

  const moveActive = (delta: number) => {
    if (rows.length === 0) return;
    let next = activeIndex;
    for (let step = 0; step < rows.length; step += 1) {
      next = (next + delta + rows.length) % rows.length;
      if (!rows[next].disabled) break;
    }
    setActiveIndex(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!listOpen) {
        setBrowsing(true);
        return;
      }
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!listOpen) return;
      moveActive(-1);
      return;
    }
    if (event.key === "Enter") {
      if (!listOpen) return;
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) commitRow(row);
      return;
    }
    if (event.key === "Escape") {
      if (trimmed) {
        setQuery("");
        return;
      }
      setBrowsing(false);
      return;
    }
    if (event.key === "Backspace" && !query && value.length > 0) {
      remove(value[value.length - 1]);
    }
  };

  const suggestions = SUGGESTED_SECTOR_OPTIONS.slice(0, SUGGESTION_COUNT);
  // Quick picks are a cold-start affordance: once something is chosen the chip row takes over,
  // so the control never spends two rows on selection state.
  const showSuggestions = !trimmed && value.length === 0;
  const hasAiSuggestions = aiSuggested.length > 0;

  return (
    <div ref={containerRef} className={cn("space-y-1.5", className)}>
      {hasAiSuggestions && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-accent" aria-hidden />
          Pre-selected based on your description — adjust freely.
        </p>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60"
          aria-hidden
        />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listboxId : undefined}
          aria-activedescendant={listOpen && rows[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          placeholder="Search or enter a sector…"
          onChange={(event) => {
            setQuery(event.target.value);
            setBrowsing(false);
          }}
          onKeyDown={handleKeyDown}
          className="h-9 w-full rounded-lg border border-input bg-background/60 pl-8 pr-16 text-sm text-foreground transition-colors placeholder:text-muted-foreground/50 hover:border-border focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-ring/25"
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {value.length > 0 && (
            <span className="text-[10px] font-semibold tabular-nums text-muted-foreground/70">
              {value.length}/{max}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setBrowsing((prev) => !prev);
              inputRef.current?.focus();
            }}
            aria-label={listOpen ? "Hide sector list" : "Show all sectors"}
            className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform duration-200", listOpen && "rotate-180")}
              aria-hidden
            />
          </button>
        </div>

        {listOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border/70 bg-popover shadow-lg shadow-black/30 animate-in fade-in-0 slide-in-from-top-1 duration-150">
            <div id={listboxId} role="listbox" aria-label="Sectors" className="max-h-56 overflow-y-auto p-1">
              {rows.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">No sector matches “{trimmed}”.</p>
              ) : (
                rows.map((row, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <div
                      key={`${row.isCustom ? "custom" : "option"}-${row.label}`}
                      id={`${listboxId}-${index}`}
                      role="option"
                      aria-selected={row.selected}
                      aria-disabled={row.disabled || undefined}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => !row.disabled && setActiveIndex(index)}
                      onClick={() => commitRow(row)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors",
                        isActive && !row.disabled && "bg-accent/10",
                        row.selected && "text-foreground",
                        row.disabled && "cursor-not-allowed opacity-40",
                      )}
                    >
                      {row.isCustom && <Plus className="h-3 w-3 shrink-0 text-accent" aria-hidden />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">
                          {row.isCustom ? `Add “${row.label}”` : <HighlightMatch text={row.label} query={query} />}
                        </p>
                        {row.description && (
                          <p className="truncate text-[10px] text-muted-foreground/80">{row.description}</p>
                        )}
                      </div>
                      {row.selected ? (
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.12em] text-accent">
                          Added
                        </span>
                      ) : (
                        isActive &&
                        !row.disabled && (
                          <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden />
                        )
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {capReached && (
              <p className="border-t border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground/80">
                Limit {max} sectors — remove one to add another.
              </p>
            )}
          </div>
        )}
      </div>

      {value.length > 0 && (
        <ul aria-label="Selected sectors" className="flex flex-wrap gap-1.5">
          {value.map((sector) => {
            const isAiPending = aiSuggested.includes(sector) && !approved;
            return (
              <li
                key={sector}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border py-0.5 pl-2 pr-1 text-xs font-medium",
                  isAiPending
                    ? "border-ai-pending/50 bg-ai-pending/25 text-ai-pending-foreground animate-[ai-pulse_2s_ease-in-out_infinite] motion-reduce:animate-none"
                    : "border-accent/35 bg-accent/15 text-foreground",
                )}
              >
                {aiSuggested.includes(sector) && (
                  <Sparkles className="h-2.5 w-2.5 shrink-0 text-accent" aria-hidden />
                )}
                {sector}
                <button
                  type="button"
                  onClick={() => remove(sector)}
                  aria-label={`Remove ${sector}`}
                  className="rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showSuggestions && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
            Suggested
          </span>
          {suggestions.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => add(opt.label)}
              className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
