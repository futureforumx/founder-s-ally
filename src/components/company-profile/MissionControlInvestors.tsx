import { useState, useEffect, useRef, useCallback } from "react";
import { Search, UserPlus, Loader2, Sparkles, ChevronDown, Check, CheckCircle2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatCompactCurrency } from "@/components/investor-match/InlineAmountInput";
import { InvestorEditSheet } from "@/components/investor-match/InvestorEditSheet";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import type { CapBacker } from "@/components/investor-match/CapTableRow";
import type { AnalysisResult } from "@/components/company-profile/types";

// Phosphor-thin Handshake icon to match section header style
function PhosphorHandshake({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" stroke="none">
      <path d="M252.31,121.31l-28-28A4,4,0,0,0,221.49,92H198.83l-27.42-27.41a4,4,0,0,0-5.65,0L141.49,88.85,116.83,64.18a12,12,0,0,0-17,0L72.69,91.34a4,4,0,0,0,0,5.66L97.17,121.49,76,142.66a4,4,0,0,0,0,5.66l30.34,30.34a4,4,0,0,0,5.66,0L133.17,157.49,155.34,179.66a12,12,0,0,0,17,0l27.14-27.14a4,4,0,0,0,5.66,0l2.83-2.83h13.52a4,4,0,0,0,2.83-1.17l28-28A4,4,0,0,0,252.31,121.31ZM109,170.34,84.66,146l21.17-21.17a4,4,0,0,0,0-5.66L81.34,94.66l24-24a4,4,0,0,1,5.66,0l24.66,24.66a4,4,0,0,0,5.66,0l24.27-24.26L188,94.34V96a4,4,0,0,0,1.17,2.83L214.34,124,192,146.34l-25.17-25.17a4,4,0,0,0-5.66,0Zm58.31,4a4,4,0,0,1-5.66,0L139.49,152.17l-25.17,25.17L92.66,155.66l25.17-25.17L139.49,152.17ZM244.69,124.69,217.52,151.86H204.48l-2.83,2.83L183.49,136.51l25.17-25.17a4,4,0,0,0,0-5.66L185.17,82.2A4,4,0,0,0,182.34,81H168.48l-2.83-2.83ZM220.69,144H208a4,4,0,0,0-2.83,1.17L204,146.34Z"/>
    </svg>
  );
}

interface NFXResult {
  name: string;
  location: string;
  logoUrl: string;
  stage?: string;
  verticals?: string[];
}

function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

interface MissionControlInvestorsProps {
  backers: CapBacker[];
  totalRaised: number;
  formatCurrency: (n: number) => string;
  addInvestor: (name: string, opts?: { entityType?: string; instrument?: string; amount?: number; date?: string }) => Promise<any>;
  onNavigateInvestors: () => void;
  analysisResult?: AnalysisResult | null;
  companyData?: { stage?: string; sector?: string } | null;
}

export function MissionControlInvestors({
  backers,
  totalRaised,
  formatCurrency,
  addInvestor,
  onNavigateInvestors,
  analysisResult,
  companyData,
}: MissionControlInvestorsProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [nfxResults, setNfxResults] = useState<NFXResult[]>([]);
  const [nfxLoading, setNfxLoading] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [editingBacker, setEditingBacker] = useState<CapBacker | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Partial<CapBacker>>>({});
  const [isOpen, setIsOpen] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController>();
  const debouncedQuery = useDebounce(searchQuery, 300);

  // Recommended investors from investor_database
  const [recommendations, setRecommendations] = useState<{ firm_name: string; location: string | null; preferred_stage: string | null; thesis_verticals: string[] }[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);

  // Fetch AI recommendations based on company profile
  useEffect(() => {
    if (!companyData?.sector || backers.length > 0) return;
    const fetchRecs = async () => {
      setRecsLoading(true);
      try {
        const sectorKeywords = [companyData.sector || ""];
        const { data, error } = await supabase
          .from("investor_database")
          .select("firm_name, location, preferred_stage, thesis_verticals")
          .overlaps("thesis_verticals", sectorKeywords)
          .limit(5);
        if (!error && data) setRecommendations(data);
      } catch { /* ignore */ }
      setRecsLoading(false);
    };
    fetchRecs();
  }, [companyData?.sector, backers.length]);

  // NFX search
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setNfxResults([]);
      setNfxLoading(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const fetchResults = async () => {
      setNfxLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("nfx-search", {
          body: { query: debouncedQuery.trim() },
        });
        if (controller.signal.aborted) return;
        if (!error) setNfxResults(data?.results || []);
      } catch { /* ignore */ }
      if (!controller.signal.aborted) setNfxLoading(false);
    };
    fetchResults();
    return () => controller.abort();
  }, [debouncedQuery]);

  const isTyping = searchQuery.length >= 2 && searchQuery !== debouncedQuery;

  // Click outside to close suggestions
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!highlightedId) return;
    const timer = setTimeout(() => setHighlightedId(null), 1500);
    return () => clearTimeout(timer);
  }, [highlightedId]);

  const handleSelectInvestor = useCallback(async (name: string, logoUrl?: string, stage?: string) => {
    setSearchQuery("");
    setShowSuggestions(false);
    const result = await addInvestor(name, { entityType: stage || "Angel" });
    if (result) {
      setHighlightedId(result.id);
      toast.success(`${name} added to your investors`);
    }
  }, [addInvestor]);

  const handleManualAdd = useCallback(() => {
    const name = searchQuery.trim();
    setSearchQuery("");
    setShowSuggestions(false);
    if (!name) return;
    // Open the edit sheet with a new backer stub after adding
    addInvestor(name, { entityType: "Angel" }).then((result) => {
      if (result) {
        setHighlightedId(result.id);
        setEditingBacker(result);
        setSheetOpen(true);
        toast.success(`${name} added — fill in the details`);
      }
    });
  }, [addInvestor, searchQuery]);

  const handleSheetSave = useCallback((id: string, patch: Partial<CapBacker>) => {
    setOverrides(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const handleSheetRemove = useCallback((_id: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[_id];
      return next;
    });
  }, []);

  // Revoke confirmed status when backers change
  const backersKey = backers.map(b => b.id).join(",");
  useEffect(() => {
    setConfirmed(false);
  }, [backersKey]);

  // Status dot logic: empty (red), has data (yellow pulse), confirmed (green pulse)
  const isEmpty = backers.length === 0;
  const renderStatusDot = () => {
    if (isEmpty) {
      return <span className="inline-flex rounded-full h-2 w-2 bg-destructive/40" />;
    }
    if (confirmed) {
      return (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
        </span>
      );
    }
    return (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
      </span>
    );
  };

  const handleConfirm = () => {
    if (isEmpty) {
      toast.error("Add at least one investor before confirming.");
      return;
    }
    setConfirmed(true);
    setIsOpen(false);
    toast.success("Investors confirmed and saved.");
  };

  // Extracted investors from analysis
  const extractedInvestors = analysisResult?.extractedInvestors || [];
  const existingNames = new Set(backers.map(b => b.name.toLowerCase()));
  const pendingExtracted = extractedInvestors.filter(e => !existingNames.has(e.investorName.toLowerCase()));

  const allBackers = backers.map(b => ({ ...b, ...overrides[b.id] }));

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="rounded-xl border border-border bg-card">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between p-6 text-left">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <PhosphorHandshake className="h-3.5 w-3.5 text-accent" /> Investors
            {renderStatusDot()}
          </h3>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>

      <div className="p-5 space-y-4">
        {/* Search */}
        <div ref={searchRef} className="relative">
          <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search & add investors..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
              onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
              className="pl-9 h-8 text-xs bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {(nfxLoading || isTyping) && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
            )}
          </div>

          {showSuggestions && searchQuery.length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-20 bg-card border border-border shadow-lg">
              {nfxResults.length > 0 ? (
                <div className="max-h-48 overflow-y-auto">
                  {nfxResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectInvestor(r.name, r.logoUrl, r.stage)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors hover:bg-secondary/60"
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        {r.logoUrl ? <AvatarImage src={r.logoUrl} alt={r.name} /> : null}
                        <AvatarFallback className="text-[10px] font-semibold bg-secondary text-foreground">
                          {r.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{r.name}</p>
                        <p className="text-[10px] text-muted-foreground">{r.location}{r.stage ? ` · ${r.stage}` : ""}</p>
                      </div>
                      <UserPlus className="h-3 w-3 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              ) : !(nfxLoading || isTyping) ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-[10px] text-muted-foreground">No results for "{searchQuery}"</p>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* AI-Extracted Investors from Deck */}
        {pendingExtracted.length > 0 && (
          <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-accent" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">Detected from Analysis</span>
            </div>
            <div className="space-y-1">
              {pendingExtracted.slice(0, 5).map((inv, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarFallback className="text-[9px] font-semibold bg-accent/10 text-accent">
                        {inv.investorName.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{inv.investorName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {inv.entityType}{inv.amount > 0 ? ` · ${formatCurrency(inv.amount)}` : ""}
                        {inv.source === "deck" ? " · from deck" : " · from web"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSelectInvestor(inv.investorName, undefined, inv.entityType)}
                    className="text-[10px] font-medium text-accent hover:text-accent/80 px-2 py-1 rounded-md hover:bg-accent/10 transition-colors shrink-0"
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Recommendations (shown when no investors yet) */}
        {backers.length === 0 && recommendations.length > 0 && pendingExtracted.length === 0 && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Recommended for {companyData?.sector}</span>
            </div>
            <div className="space-y-1">
              {recommendations.map((rec, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">
                        {rec.firm_name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{rec.firm_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {rec.location || "—"}{rec.preferred_stage ? ` · ${rec.preferred_stage}` : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSelectInvestor(rec.firm_name)}
                    className="text-[10px] font-medium text-primary hover:text-primary/80 px-2 py-1 rounded-md hover:bg-primary/10 transition-colors shrink-0"
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Investor Grid */}
        {allBackers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {allBackers.slice(0, 6).map((b) => (
              <div
                key={b.id}
                onClick={() => { setEditingBacker(b); setSheetOpen(true); }}
                className={`relative border border-border rounded-xl p-3 transition-all duration-200 hover:shadow-md cursor-pointer group ${
                  b.id === highlightedId ? "ring-2 ring-accent" : ""
                }`}
                style={{ background: "hsl(var(--background))" }}
              >
                <div className="flex items-center gap-2.5">
                  <Avatar className="h-9 w-9 shrink-0 rounded-lg border border-border">
                    {b.logoUrl ? <AvatarImage src={b.logoUrl} alt={b.name} className="object-cover" /> : null}
                    <AvatarFallback className="text-xs font-bold rounded-lg bg-secondary text-foreground">
                      {b.logoLetter}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">{b.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {b.instrument && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                          {b.instrument.split("(")[0].trim()}
                        </span>
                      )}
                      <span className="text-[10px] font-mono font-bold text-foreground">
                        {b.amount > 0 ? formatCompactCurrency(b.amount) : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : pendingExtracted.length === 0 && recommendations.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary mb-2">
                <PhosphorHandshake className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mb-1">No investors added yet</p>
              <p className="text-[10px] text-muted-foreground">Search above or run an analysis to detect investors from your deck</p>
            </div>
          ) : null}

          {/* Show more link */}
          {allBackers.length > 6 && (
            <button
              onClick={onNavigateInvestors}
              className="w-full text-center text-[11px] font-medium text-accent hover:text-accent/80 py-2 transition-colors"
            >
              + {allBackers.length - 6} more investors
            </button>
          )}

          {/* Confirm / Approved */}
          <div className="flex justify-end pt-2">
            {confirmed ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Approved</span>
            ) : (
              <button onClick={handleConfirm}
                className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-4 py-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                <Check className="h-3.5 w-3.5" /> Confirm Investors
              </button>
            )}
          </div>
        </div>
      </CollapsibleContent>

      <InvestorEditSheet
        backer={editingBacker}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSave={handleSheetSave}
        onRemove={handleSheetRemove}
      />
    </Collapsible>
  );
}
