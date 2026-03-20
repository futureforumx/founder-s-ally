import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Users, Briefcase, Building2, LayoutGrid, Sparkles } from "lucide-react";

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

const RECOMMENDED_SEARCHES = [
  "Seed stage B2B SaaS founders in New York",
  "Recently active Climate Tech investors",
  "Startups using similar tech stacks",
  "Series A AI / ML companies in California",
];

export function SearchOmnibar({ value, onChange, onScopeChange, placeholder }: SearchOmnibarProps) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<EntityScope>("all");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const selectRecommendation = useCallback(
    (text: string) => {
      onChange(text);
      setOpen(false);
      setHighlightIdx(-1);
      inputRef.current?.blur();
    },
    [onChange]
  );

  const handleScopeClick = useCallback(
    (id: EntityScope) => {
      setScope(id);
      onScopeChange?.(id);
    },
    [onScopeChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((prev) => (prev < RECOMMENDED_SEARCHES.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((prev) => (prev > 0 ? prev - 1 : RECOMMENDED_SEARCHES.length - 1));
      } else if (e.key === "Enter" && highlightIdx >= 0) {
        e.preventDefault();
        selectRecommendation(RECOMMENDED_SEARCHES[highlightIdx]);
      } else if (e.key === "Escape") {
        setOpen(false);
        setHighlightIdx(-1);
      }
    },
    [open, highlightIdx, selectRecommendation]
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
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => { setOpen(true); setHighlightIdx(-1); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`flex h-14 w-full border border-border bg-card pl-12 pr-4 text-base shadow-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-shadow ${
            open ? "rounded-t-2xl rounded-b-none border-b-0" : "rounded-2xl"
          }`}
        />
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

          {/* Section 2: AI Recommended Searches */}
          <p className="text-[10px] font-semibold text-accent uppercase tracking-wider mb-2 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Recommended for you
          </p>
          <div className="space-y-0.5">
            {RECOMMENDED_SEARCHES.map((text, i) => (
              <button
                key={i}
                onClick={() => selectRecommendation(text)}
                onMouseEnter={() => setHighlightIdx(i)}
                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
                  highlightIdx === i
                    ? "bg-muted text-accent"
                    : "text-muted-foreground hover:bg-muted hover:text-accent"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
