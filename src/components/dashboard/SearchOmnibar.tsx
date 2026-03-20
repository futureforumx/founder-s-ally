import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Search, Users, Briefcase, Building2, LayoutGrid, Sparkles, MapPin, Clock, X } from "lucide-react";

type EntityScope = "founders" | "investors" | "companies" | "all";

interface SearchOmnibarProps {
  value: string;
  onChange: (value: string) => void;
  onScopeChange?: (scope: EntityScope) => void;
  placeholder?: string;
}

const SCOPE_PILLS: { id: EntityScope; label: string; icon: typeof Users }[] = [
  { id: "founders", label: "Founders", icon: Users },
  { id: "investors", label: "Investors", icon: Briefcase },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "all", label: "All", icon: LayoutGrid },
];

// Mock results per scope for live filtering
const MOCK_RESULTS: Record<EntityScope, { name: string; subtitle: string; icon: typeof Users }[]> = {
  founders: [
    { name: "Constructiv AI", subtitle: "Construction & Real Estate · Seed · San Francisco, CA", icon: Users },
    { name: "GridShift Energy", subtitle: "Climate & Energy · Series A · Austin, TX", icon: Users },
    { name: "VaultMed", subtitle: "Health & Biotech · Pre-Seed · Boston, MA", icon: Users },
    { name: "Mosaic Retail", subtitle: "Consumer & Retail · Series B · New York, NY", icon: Users },
    { name: "DefenseKit", subtitle: "Defense & GovTech · Seed · Arlington, VA", icon: Users },
    { name: "QuantumForge", subtitle: "Deep Tech & Space · Series A · Boulder, CO", icon: Users },
  ],
  investors: [
    { name: "Sequoia Capital", subtitle: "Multi-stage · $1M–$50M · San Francisco, CA", icon: Briefcase },
    { name: "a16z", subtitle: "Seed to Growth · $500K–$100M · Menlo Park, CA", icon: Briefcase },
    { name: "Lux Capital", subtitle: "Deep Tech · $1M–$25M · New York, NY", icon: Briefcase },
    { name: "Founders Fund", subtitle: "Seed to Growth · $500K–$50M · San Francisco, CA", icon: Briefcase },
    { name: "First Round Capital", subtitle: "Seed · $500K–$3M · San Francisco, CA", icon: Briefcase },
  ],
  companies: [
    { name: "NovaBuild", subtitle: "PropTech · Series A · Denver, CO", icon: Building2 },
    { name: "ClearPath Logistics", subtitle: "Supply Chain · Seed · Chicago, IL", icon: Building2 },
    { name: "Synthara Bio", subtitle: "Health & Biotech · Series B · Cambridge, MA", icon: Building2 },
    { name: "Canopy Finance", subtitle: "Fintech · Seed · Miami, FL", icon: Building2 },
    { name: "AeroMind", subtitle: "Deep Tech & Space · Pre-Seed · Los Angeles, CA", icon: Building2 },
  ],
  all: [],
};

// Merge all for "all" scope
MOCK_RESULTS.all = [...MOCK_RESULTS.founders, ...MOCK_RESULTS.investors, ...MOCK_RESULTS.companies];

const DEFAULT_RECOMMENDATIONS = [
  "Seed stage B2B SaaS founders in New York",
  "Recently active Climate Tech investors",
  "Startups using similar tech stacks",
  "Series A AI / ML companies in California",
];

const SEARCH_HISTORY_KEY = "omnibar-search-history";
const MAX_HISTORY = 6;

function getSearchHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function addToSearchHistory(term: string) {
  const history = getSearchHistory().filter((h) => h !== term);
  history.unshift(term);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

export function SearchOmnibar({ value, onChange, onScopeChange, placeholder }: SearchOmnibarProps) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<EntityScope>("all");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isTyping = value.trim().length > 0;

  // Filter mock results based on query
  const filteredResults = useMemo(() => {
    if (!isTyping) return [];
    const q = value.toLowerCase();
    return MOCK_RESULTS[scope].filter(
      (r) => r.name.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [value, scope, isTyping]);

  // Build recommendations from history + defaults
  const recommendations = useMemo(() => {
    const history = getSearchHistory();
    if (history.length === 0) return DEFAULT_RECOMMENDATIONS;
    // Mix recent history with defaults, deduped
    const combined = [...history, ...DEFAULT_RECOMMENDATIONS.filter((d) => !history.includes(d))];
    return combined.slice(0, 5);
  }, [open, value]); // re-evaluate when dropdown opens or value clears

  const listItems = isTyping ? filteredResults : recommendations;
  const listCount = isTyping ? filteredResults.length : recommendations.length;

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

  const selectItem = useCallback(
    (text: string) => {
      addToSearchHistory(text);
      onChange(text);
      setOpen(false);
      setHighlightIdx(-1);
      inputRef.current?.blur();
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange("");
    setHighlightIdx(-1);
    inputRef.current?.focus();
  }, [onChange]);

  const handleScopeClick = useCallback(
    (id: EntityScope) => {
      setScope(id);
      onScopeChange?.(id);
      setHighlightIdx(-1);
    },
    [onScopeChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((prev) => (prev < listCount - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((prev) => (prev > 0 ? prev - 1 : listCount - 1));
      } else if (e.key === "Enter" && highlightIdx >= 0) {
        e.preventDefault();
        if (isTyping && filteredResults[highlightIdx]) {
          selectItem(filteredResults[highlightIdx].name);
        } else if (!isTyping && recommendations[highlightIdx]) {
          selectItem(recommendations[highlightIdx]);
        }
      } else if (e.key === "Escape") {
        setOpen(false);
        setHighlightIdx(-1);
      }
    },
    [open, highlightIdx, listCount, isTyping, filteredResults, recommendations, selectItem]
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); setHighlightIdx(-1); }}
          onFocus={() => { setOpen(true); setHighlightIdx(-1); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`flex h-14 w-full border border-border bg-card pl-12 pr-12 text-base shadow-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-shadow ${
            open ? "rounded-t-2xl rounded-b-none border-b-0" : "rounded-2xl"
          }`}
        />
        {isTyping && (
          <button
            onClick={handleClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-0 rounded-b-xl border border-t-0 border-border bg-card p-4 shadow-xl">
          {/* Section 1: Entity Scope */}
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            I'm searching for…
          </p>
          <div className="flex flex-wrap gap-2">
            {SCOPE_PILLS.map((pill) => {
              const Icon = pill.icon;
              const isActive = scope === pill.id;
              return (
                <button
                  key={pill.id}
                  onClick={() => handleScopeClick(pill.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-foreground text-background"
                      : "border border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {pill.label}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="border-t border-border/60 my-4" />

          {/* Section 2: Results or Recommendations */}
          {isTyping ? (
            <>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <Search className="h-3 w-3" />
                {scope === "all" ? "Results" : SCOPE_PILLS.find((p) => p.id === scope)?.label}
                <span className="text-muted-foreground/50 ml-1">{filteredResults.length}</span>
              </p>
              {filteredResults.length > 0 ? (
                <div className="space-y-0.5">
                  {filteredResults.map((result, i) => {
                    const RIcon = result.icon;
                    return (
                      <button
                        key={i}
                        onClick={() => selectItem(result.name)}
                        onMouseEnter={() => setHighlightIdx(i)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer flex items-center gap-3 ${
                          highlightIdx === i
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary shrink-0">
                          <RIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{result.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{result.subtitle}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60 px-3 py-4 text-center">
                  No matches for "{value}" in {scope === "all" ? "all categories" : scope}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-[10px] font-semibold text-accent uppercase tracking-wider mb-2 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Recommended for you
              </p>
              <div className="space-y-0.5">
                {recommendations.map((text, i) => {
                  const isFromHistory = getSearchHistory().includes(text);
                  return (
                    <button
                      key={i}
                      onClick={() => selectItem(text)}
                      onMouseEnter={() => setHighlightIdx(i)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
                        highlightIdx === i
                          ? "bg-muted text-accent"
                          : "text-muted-foreground hover:bg-muted hover:text-accent"
                      }`}
                    >
                      {isFromHistory ? (
                        <Clock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-accent/50 shrink-0" />
                      )}
                      {text}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
