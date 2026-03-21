import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Search, Building2, User, X, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export interface InvestorTypeaheadResult {
  name: string;
  subtitle: string;
  type: "firm" | "person";
}

interface InvestorSearchOmniboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** All entries to search against for instant typeahead */
  entries: { name: string; sector: string; stage: string; description: string; category: string }[];
}

// Mock partner/angel data for typeahead
const PARTNER_DATA: InvestorTypeaheadResult[] = [
  { name: "Alfred Lin", subtitle: "Partner at Sequoia Capital", type: "person" },
  { name: "Kirsten Green", subtitle: "Founder & Managing Partner at Forerunner Ventures", type: "person" },
  { name: "Bill Gurley", subtitle: "General Partner at Benchmark", type: "person" },
  { name: "Sarah Tavel", subtitle: "General Partner at Benchmark", type: "person" },
  { name: "Josh Kopelman", subtitle: "Partner at First Round Capital", type: "person" },
  { name: "Vinod Khosla", subtitle: "Founder at Khosla Ventures", type: "person" },
  { name: "Mary Meeker", subtitle: "General Partner at Bond Capital", type: "person" },
  { name: "Marc Andreessen", subtitle: "Co-founder at a16z", type: "person" },
  { name: "Peter Thiel", subtitle: "Founder at Founders Fund", type: "person" },
  { name: "Elad Gil", subtitle: "Angel Investor & Advisor", type: "person" },
  { name: "Naval Ravikant", subtitle: "Angel Investor & AngelList Co-founder", type: "person" },
  { name: "Cyan Banister", subtitle: "Angel Investor", type: "person" },
];

const MIN_CHARS = 2;
const MAX_RESULTS_PER_GROUP = 4;

export function InvestorSearchOmnibox({ value, onChange, placeholder, entries }: InvestorSearchOmniboxProps) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const query = value.trim().toLowerCase();
  const showDropdown = open && query.length > MIN_CHARS;

  // Simulate async search with debounce
  useEffect(() => {
    if (query.length <= MIN_CHARS) {
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setIsSearching(false), 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Build categorized results
  const { firms, partners } = useMemo(() => {
    if (query.length <= MIN_CHARS) return { firms: [], partners: [] };

    const firmResults: InvestorTypeaheadResult[] = entries
      .filter((e) => e.category === "investor")
      .filter((e) =>
        e.name.toLowerCase().includes(query) ||
        e.sector.toLowerCase().includes(query) ||
        e.stage.toLowerCase().includes(query)
      )
      .slice(0, MAX_RESULTS_PER_GROUP)
      .map((e) => ({
        name: e.name,
        subtitle: `${e.stage} · ${e.sector}`,
        type: "firm" as const,
      }));

    const partnerResults = PARTNER_DATA
      .filter((p) =>
        p.name.toLowerCase().includes(query) ||
        p.subtitle.toLowerCase().includes(query)
      )
      .slice(0, MAX_RESULTS_PER_GROUP);

    return { firms: firmResults, partners: partnerResults };
  }, [query, entries]);

  const allResults = useMemo(() => [...firms, ...partners], [firms, partners]);
  const totalCount = allResults.length;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlightIdx(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectItem = useCallback((name: string) => {
    onChange(name);
    setOpen(false);
    setHighlightIdx(-1);
    inputRef.current?.blur();
  }, [onChange]);

  const handleViewAll = useCallback(() => {
    setOpen(false);
    setHighlightIdx(-1);
    // value is already set — the parent will filter the grid
  }, []);

  const handleClear = useCallback(() => {
    onChange("");
    setHighlightIdx(-1);
    inputRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((p) => (p < totalCount ? p + 1 : 0)); // totalCount = view-all row
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((p) => (p > 0 ? p - 1 : totalCount));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < totalCount) {
        selectItem(allResults[highlightIdx].name);
      } else {
        handleViewAll();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightIdx(-1);
    }
  }, [showDropdown, highlightIdx, totalCount, allResults, selectItem, handleViewAll]);

  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
        {isSearching && query.length > MIN_CHARS && (
          <Loader2 className="absolute right-12 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground/40" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); setHighlightIdx(-1); }}
          onFocus={() => { setOpen(true); setHighlightIdx(-1); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`flex h-14 w-full border border-border bg-card pl-12 pr-12 text-base shadow-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-shadow ${
            showDropdown && (firms.length > 0 || partners.length > 0 || isSearching)
              ? "rounded-t-2xl rounded-b-none border-b-0"
              : "rounded-2xl"
          }`}
        />
        {value.length > 0 && (
          <button
            onClick={handleClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Floating typeahead dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 z-50 rounded-b-xl border border-t-0 border-border bg-card shadow-xl overflow-hidden">
          {isSearching ? (
            /* Skeleton loading */
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 animate-pulse">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : totalCount === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">No firms or partners match "<span className="font-medium text-foreground">{value}</span>"</p>
            </div>
          ) : (
            <>
              {/* FIRMS group */}
              {firms.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground/60 tracking-wider uppercase px-4 py-2 bg-secondary/50">
                    Firms
                  </div>
                  {firms.map((result, i) => {
                    const globalIdx = i;
                    return (
                      <button
                        key={`firm-${i}`}
                        onClick={() => selectItem(result.name)}
                        onMouseEnter={() => setHighlightIdx(globalIdx)}
                        className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer ${
                          highlightIdx === globalIdx
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary shrink-0">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{result.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* PARTNERS & ANGELS group */}
              {partners.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground/60 tracking-wider uppercase px-4 py-2 bg-secondary/50">
                    Partners & Angels
                  </div>
                  {partners.map((result, i) => {
                    const globalIdx = firms.length + i;
                    return (
                      <button
                        key={`partner-${i}`}
                        onClick={() => selectItem(result.name)}
                        onMouseEnter={() => setHighlightIdx(globalIdx)}
                        className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer ${
                          highlightIdx === globalIdx
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary shrink-0">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{result.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* View All footer */}
              <button
                onClick={handleViewAll}
                onMouseEnter={() => setHighlightIdx(totalCount)}
                className={`w-full flex items-center justify-center gap-2 p-3 text-sm font-medium border-t border-border/60 transition-colors cursor-pointer ${
                  highlightIdx === totalCount
                    ? "bg-accent/10 text-accent"
                    : "text-accent/80 hover:bg-accent/5"
                }`}
              >
                See all results for "{value}" <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
