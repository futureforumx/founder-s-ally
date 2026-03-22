import { useState, useRef, useEffect, useCallback, useMemo, forwardRef } from "react";
import { Search, Users, Briefcase, Building2, Sparkles, Clock, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isRateLimited } from "@/lib/rateLimit";

export type EntityScope = "founders" | "investors" | "companies" | "operators" | "all";

export interface SearchResult {
  name: string;
  subtitle: string;
  category: "founder" | "investor" | "company" | "operator";
  matchReason: string;
}

interface SearchOmnibarProps {
  value: string;
  onChange: (value: string) => void;
  scope: EntityScope;
  placeholder?: string;
}

const CATEGORY_ICONS: Record<string, typeof Users> = {
  founder: Users,
  investor: Briefcase,
  company: Building2,
  operator: Users,
};

const SCOPE_RECOMMENDATIONS: Record<EntityScope, string[]> = {
  all: [
    "Seed stage B2B SaaS founders in New York",
    "Recently active Climate Tech investors",
    "Startups using similar tech stacks",
    "Series A AI / ML companies in California",
  ],
  founders: [
    "Technical co-founders in NYC",
    "Solo founders with enterprise traction",
    "Second-time founders in Climate Tech",
    "YC alumni building in healthcare",
  ],
  operators: [
    "VP Engineering with B2B SaaS experience",
    "Fractional CFOs for Seed-stage startups",
    "Growth leads from fintech backgrounds",
    "Operators who've scaled to Series B",
  ],
  investors: [
    "Active Pre-Seed climate funds",
    "Investors who lead Seed rounds in SaaS",
    "Angels investing in deep tech",
    "VCs with recent AI portfolio exits",
  ],
  companies: [
    "B2B SaaS with $1M+ ARR",
    "Pre-revenue AI startups in SF",
    "Series A construction tech companies",
    "Climate startups with government contracts",
  ],
};

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

export const SearchOmnibar = forwardRef<HTMLDivElement, SearchOmnibarProps>(function SearchOmnibar({ value, onChange, scope, placeholder }, _ref) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [aiResults, setAiResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const isTyping = value.trim().length > 0;

  // Debounced semantic search
  useEffect(() => {
    if (!isTyping) {
      setAiResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { data, error } = await supabase.functions.invoke("semantic-search", {
          body: { query: value.trim(), scope },
        });

        if (controller.signal.aborted) return;

        if (error) {
          console.error("Semantic search error:", error);
          setAiResults([]);
        } else if (data?.results) {
          setAiResults(data.results);
        } else if (data?.error) {
          if (data.error.includes("Rate limit")) {
            toast.error("Search rate limited. Please wait a moment.");
          } else if (data.error.includes("Credits")) {
            toast.error("AI credits exhausted. Add funds in Settings > Workspace > Usage.");
          }
          setAiResults([]);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          console.error("Search failed:", e);
          setAiResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [value, scope, isTyping]);

  // Scope-aware recommendations
  const recommendations = useMemo(() => {
    const defaults = SCOPE_RECOMMENDATIONS[scope];
    const history = getSearchHistory();
    if (history.length === 0) return defaults;
    const combined = [...history.slice(0, 2), ...defaults.filter((d) => !history.includes(d))];
    return combined.slice(0, 5);
  }, [open, value, scope]);

  const listCount = isTyping ? aiResults.length : recommendations.length;

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
    setAiResults([]);
    inputRef.current?.focus();
  }, [onChange]);

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
        if (isTyping && aiResults[highlightIdx]) {
          selectItem(aiResults[highlightIdx].name);
        } else if (!isTyping && recommendations[highlightIdx]) {
          selectItem(recommendations[highlightIdx]);
        }
      } else if (e.key === "Escape") {
        setOpen(false);
        setHighlightIdx(-1);
      }
    },
    [open, highlightIdx, listCount, isTyping, aiResults, recommendations, selectItem]
  );

  const scopeLabel = scope === "all" ? "Results" : scope.charAt(0).toUpperCase() + scope.slice(1);

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
          {/* Results or Recommendations */}
          {isTyping ? (
            <>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                {isSearching ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 text-accent" />
                )}
                {isSearching ? "Searching…" : scopeLabel}
                {!isSearching && (
                  <span className="text-muted-foreground/50 ml-1">{aiResults.length}</span>
                )}
              </p>

              {isSearching && aiResults.length === 0 ? (
                <div className="space-y-2 py-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
                      <div className="h-8 w-8 rounded-lg bg-muted" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-1/3 rounded bg-muted" />
                        <div className="h-3 w-2/3 rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : aiResults.length > 0 ? (
                <div className="space-y-0.5">
                  {aiResults.map((result, i) => {
                    const CatIcon = CATEGORY_ICONS[result.category] || Building2;
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
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary shrink-0">
                          <CatIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground truncate">{result.name}</p>
                            <span className="text-[9px] font-medium text-muted-foreground/60 bg-secondary rounded px-1.5 py-0.5 capitalize shrink-0">
                              {result.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{result.subtitle}</p>
                          {result.matchReason && (
                            <p className="text-[10px] text-accent mt-0.5 flex items-center gap-1 truncate">
                              <Sparkles className="h-2.5 w-2.5 shrink-0" />
                              {result.matchReason}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : !isSearching ? (
                <p className="text-sm text-muted-foreground/60 px-3 py-4 text-center">
                  No matches for "{value}" in {scope === "all" ? "all categories" : scope}
                </p>
              ) : null}
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
});
