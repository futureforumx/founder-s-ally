import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Search, X, Loader2, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { FirmLogo } from "@/components/ui/firm-logo";
import { InvestorPersonAvatar, investorPersonImageCandidates } from "@/components/ui/investor-person-avatar";
import type { VCFirm, VCPerson } from "@/hooks/useVCDirectory";

export interface InvestorTypeaheadResult {
  id: string;
  name: string;
  subtitle: string;
  type: "firm" | "person";
  logoUrl?: string | null;
  websiteUrl?: string | null;
  /** Partners & angels — `profile_image_url` / `avatar_url` */
  profileImageUrl?: string | null;
  profileImageUrls?: string[];
}

interface InvestorSearchOmniboxProps {
  value: string;
  onChange: (value: string) => void;
  onSelectFirm?: (firmId: string) => void;
  onSelectPerson?: (personId: string) => void;
  placeholder?: string;
  firms: VCFirm[];
  people: VCPerson[];
  firmMap: Map<string, VCFirm>;
}

const MIN_CHARS = 2;
const MAX_RESULTS_PER_GROUP = 5;

type SearchSelectionLead =
  | { kind: "firm"; name: string; logoUrl: string | null; websiteUrl: string | null }
  | { kind: "person"; name: string; profileImageUrl: string | null; profileImageUrls?: string[] }
  | null;

export function InvestorSearchOmnibox({
  value, onChange, onSelectFirm, onSelectPerson, placeholder, firms, people, firmMap,
}: InvestorSearchOmniboxProps) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [selectionLead, setSelectionLead] = useState<SearchSelectionLead>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const query = value.trim().toLowerCase();
  const showDropdown = open && query.length > MIN_CHARS;

  useEffect(() => {
    if (query.length <= MIN_CHARS) { setIsSearching(false); return; }
    setIsSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setIsSearching(false), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const { firmResults, personResults } = useMemo(() => {
    if (query.length <= MIN_CHARS) return { firmResults: [], personResults: [] };

    const fr: InvestorTypeaheadResult[] = firms
      .filter((f) => {
        if (f.name.toLowerCase().includes(query)) return true;
        if (f.aliases?.some((alias) => alias.toLowerCase().includes(query))) return true;
        return false;
      })
      .slice(0, MAX_RESULTS_PER_GROUP)
      .map((f) => ({
        id: f.id,
        name: f.name,
        subtitle: [f.stages?.slice(0, 2).join(", "), f.aum].filter(Boolean).join(" · ") || "Investor",
        type: "firm" as const,
        logoUrl: f.logo_url,
        websiteUrl: f.website_url,
      }));

    const pr: InvestorTypeaheadResult[] = people
      .filter((p) => p.full_name.toLowerCase().includes(query))
      .slice(0, MAX_RESULTS_PER_GROUP)
      .map((p) => {
        const firm = firmMap.get(p.firm_id);
        return {
          id: p.id,
          name: p.full_name,
          subtitle: [p.title, firm?.name].filter(Boolean).join(" at "),
          type: "person" as const,
          profileImageUrls: investorPersonImageCandidates({
            profile_image_url: p.profile_image_url,
            avatar_url: p.avatar_url,
            firmWebsiteUrl: firm?.website_url ?? null,
            title: p.title,
            role: p.role,
            investorType: p.investor_type,
            email: p.email,
            website_url: p.website_url,
            linkedin_url: p.linkedin_url,
            x_url: p.x_url,
            personal_website_url: p.personal_website_url,
            full_name: p.full_name,
          }),
          profileImageUrl: null,
        };
      });

    return { firmResults: fr, personResults: pr };
  }, [query, firms, people, firmMap]);

  const allResults = useMemo(() => [...firmResults, ...personResults], [firmResults, personResults]);
  const totalCount = allResults.length;

  const showSelectionLead =
    selectionLead != null &&
    value.trim().toLowerCase() === selectionLead.name.trim().toLowerCase();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setHighlightIdx(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!value.trim()) setSelectionLead(null);
  }, [value]);

  const selectItem = useCallback((result: InvestorTypeaheadResult) => {
    onChange(result.name);
    if (result.type === "firm") {
      setSelectionLead({
        kind: "firm",
        name: result.name,
        logoUrl: result.logoUrl ?? null,
        websiteUrl: result.websiteUrl ?? null,
      });
    } else {
      setSelectionLead({
        kind: "person",
        name: result.name,
        profileImageUrl: result.profileImageUrl ?? null,
        profileImageUrls: result.profileImageUrls,
      });
    }
    setOpen(false);
    setHighlightIdx(-1);
    inputRef.current?.blur();
    if (result.type === "firm") onSelectFirm?.(result.id);
    else onSelectPerson?.(result.id);
  }, [onChange, onSelectFirm, onSelectPerson]);

  const handleViewAll = useCallback(() => {
    setOpen(false); setHighlightIdx(-1);
  }, []);

  const handleClear = useCallback(() => {
    onChange("");
    setSelectionLead(null);
    setHighlightIdx(-1);
    inputRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((p) => (p < totalCount ? p + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((p) => (p > 0 ? p - 1 : totalCount));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < totalCount) {
        selectItem(allResults[highlightIdx]);
      } else {
        handleViewAll();
      }
    } else if (e.key === "Escape") {
      setOpen(false); setHighlightIdx(-1);
    }
  }, [showDropdown, highlightIdx, totalCount, allResults, selectItem, handleViewAll]);

  const inputId = "investor-search-omnibox-input";

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`relative flex h-14 w-full items-center gap-3 border border-border bg-card pl-3 pr-12 text-base shadow-sm ring-offset-background transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${
          showDropdown && (firmResults.length > 0 || personResults.length > 0 || isSearching)
            ? "rounded-t-2xl rounded-b-none border-b-0"
            : "rounded-2xl"
        }`}
      >
        <label
          htmlFor={inputId}
          className="flex h-8 w-8 shrink-0 cursor-text items-center justify-center"
        >
          {showSelectionLead ? (
            selectionLead.kind === "firm" ? (
              <FirmLogo
                firmName={selectionLead.name}
                logoUrl={selectionLead.logoUrl}
                websiteUrl={selectionLead.websiteUrl}
                size="sm"
                className="shrink-0"
              />
            ) : (
              <InvestorPersonAvatar
                imageUrl={selectionLead.profileImageUrl}
                imageUrls={selectionLead.profileImageUrls}
              />
            )
          ) : (
            <Search className="h-5 w-5 text-muted-foreground/70" aria-hidden />
          )}
        </label>
        {isSearching && query.length > MIN_CHARS && (
          <Loader2 className="pointer-events-none absolute right-12 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground/40" />
        )}
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v);
            setHighlightIdx(-1);
            if (
              !selectionLead ||
              v.trim().toLowerCase() !== selectionLead.name.trim().toLowerCase()
            ) {
              setSelectionLead(null);
            }
          }}
          onFocus={() => {
            setOpen(true);
            setHighlightIdx(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-full min-h-0 min-w-0 flex-1 border-0 bg-transparent py-2 pr-1 text-base shadow-none placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 z-50 rounded-b-xl border border-t-0 border-border bg-card shadow-xl overflow-hidden">
          {isSearching ? (
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
              {firmResults.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground/60 tracking-wider uppercase px-4 py-2 bg-secondary/50">
                    Firms
                  </div>
                  {firmResults.map((result, i) => (
                    <button
                      key={result.id}
                      onClick={() => selectItem(result)}
                      onMouseEnter={() => setHighlightIdx(i)}
                      className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        highlightIdx === i ? "bg-muted" : "hover:bg-muted/50"
                      }`}
                    >
                      <FirmLogo
                        firmName={result.name}
                        logoUrl={result.logoUrl}
                        websiteUrl={result.websiteUrl}
                        size="sm"
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{result.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {personResults.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground/60 tracking-wider uppercase px-4 py-2 bg-secondary/50">
                    Partners & Angels
                  </div>
                  {personResults.map((result, i) => {
                    const globalIdx = firmResults.length + i;
                    return (
                      <button
                        key={result.id}
                        onClick={() => selectItem(result)}
                        onMouseEnter={() => setHighlightIdx(globalIdx)}
                        className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          highlightIdx === globalIdx ? "bg-muted" : "hover:bg-muted/50"
                        }`}
                      >
                        <InvestorPersonAvatar
                          imageUrl={result.profileImageUrl}
                          imageUrls={result.profileImageUrls}
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{result.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                onClick={handleViewAll}
                onMouseEnter={() => setHighlightIdx(totalCount)}
                className={`w-full flex items-center justify-center gap-2 p-3 text-sm font-medium border-t border-border/60 transition-colors cursor-pointer ${
                  highlightIdx === totalCount ? "bg-accent/10 text-accent" : "text-accent/80 hover:bg-accent/5"
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
