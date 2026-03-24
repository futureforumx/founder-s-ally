import { useState, useCallback, useRef, useEffect, useMemo, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FirmLogo } from "@/components/ui/firm-logo";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Users, Plus, Search, UserPlus, Loader2, ChevronDown, SlidersHorizontal, ChevronRight, X, MapPin, Briefcase, Calendar, DollarSign, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatCompactCurrency } from "./InlineAmountInput";
import { type CapBacker } from "./CapTableRow";
import { InvestorEditDialog } from "./InvestorEditDialog";
import type { EnrichResult } from "@/hooks/useInvestorEnrich";

interface NFXResult {
  name: string;
  location: string;
  logoUrl: string;
  stage?: string;
  verticals?: string[];
}

interface ManageTabProps {
  confirmedBackers: CapBacker[];
  totalRaised: number;
  formatCurrency: (n: number) => string;
  enrichCache?: Record<string, EnrichResult>;
}

// ── Debounce Hook ──

function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ── NFX Search Hook ──

function useNFXSearch(query: string) {
  const [results, setResults] = useState<NFXResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"none" | "nfx" | "global" | "error">("none");
  const abortRef = useRef<AbortController>();
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setSource("none");
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchResults = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("nfx-search", {
          body: { query: debouncedQuery.trim() },
        });
        if (controller.signal.aborted) return;
        if (error) {
          console.error("NFX search error:", error);
          toast.error("Failed to search investors. Please try again.");
          setResults([]);
          setSource("error");
        } else {
          setResults(data?.results || []);
          setSource(data?.source || "global");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("NFX search fetch error:", err);
        toast.error("Failed to load investors. Please try again.");
        setResults([]);
        setSource("error");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchResults();
    return () => { controller.abort(); };
  }, [debouncedQuery]);

  const isTyping = query.length >= 2 && query !== debouncedQuery;
  return { results, loading: loading || isTyping, source };
}

// ── Main Export ──

type SortKey = "newest" | "oldest" | "amount-desc" | "name-asc";

function parseDateString(d: string | undefined | null): number {
  if (!d) return 0;
  const parsed = new Date(d);
  if (!isNaN(parsed.getTime())) return parsed.getTime();
  // Handle "Mon YYYY" format like "Mar 2026"
  const monthYear = new Date(Date.parse(d + " 1"));
  return isNaN(monthYear.getTime()) ? 0 : monthYear.getTime();
}

export function ManageTab({ confirmedBackers, totalRaised, formatCurrency, enrichCache = {} }: ManageTabProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 9;
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [optimisticBackers, setOptimisticBackers] = useState<CapBacker[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Partial<CapBacker>>>({});
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [editingBacker, setEditingBacker] = useState<CapBacker | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Sort & Filter state
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  const [filterMinAmount, setFilterMinAmount] = useState<string>("");
  const [filterOpen, setFilterOpen] = useState(false);

  const { results: nfxResults, loading: nfxLoading, source: searchSource } = useNFXSearch(searchQuery);

  const allBackers = [
    ...confirmedBackers.map(b => ({ ...b, ...overrides[b.id] })),
    ...optimisticBackers,
  ];

  // Unique instrument types for filter checkboxes
  const uniqueTypes = useMemo(() => {
    const types = new Set<string>();
    allBackers.forEach(b => { if (b.instrument) types.add(b.instrument); });
    return Array.from(types).sort();
  }, [allBackers]);

  // Search → Filter → Sort pipeline
  const filteredBackers = useMemo(() => {
    let result = allBackers;

    // 1. Search by name or slogan
    if (searchQuery && !showSuggestions) {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => {
        const key = b.name.toLowerCase().trim();
        const enriched = enrichCache[key];
        const slogan = b.slogan || enriched?.profile?.currentThesis || "";
        return b.name.toLowerCase().includes(q) || slogan.toLowerCase().includes(q);
      });
    }

    // 2. Filter by type
    if (filterTypes.size > 0) {
      result = result.filter(b => b.instrument && filterTypes.has(b.instrument));
    }

    // 3. Filter by min amount
    const minAmt = parseFloat(filterMinAmount);
    if (!isNaN(minAmt) && minAmt > 0) {
      result = result.filter(b => b.amount >= minAmt);
    }

    // 4. Sort
    const sorted = [...result];
    switch (sortKey) {
      case "newest":
        sorted.sort((a, b) => parseDateString(b.date) - parseDateString(a.date));
        break;
      case "oldest":
        sorted.sort((a, b) => parseDateString(a.date) - parseDateString(b.date));
        break;
      case "amount-desc":
        sorted.sort((a, b) => b.amount - a.amount);
        break;
      case "name-asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return sorted;
  }, [allBackers, searchQuery, showSuggestions, filterTypes, filterMinAmount, sortKey, enrichCache]);

  const totalPages = Math.ceil(filteredBackers.length / PAGE_SIZE);
  const paginatedBackers = filteredBackers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const hasActiveFilters = filterTypes.size > 0 || (parseFloat(filterMinAmount) > 0);
  const sortLabels: Record<SortKey, string> = { newest: "Newest First", oldest: "Oldest First", "amount-desc": "Amount (High-Low)", "name-asc": "Name (A-Z)" };

  const clearAllFilters = useCallback(() => {
    setSearchQuery("");
    setFilterTypes(new Set());
    setFilterMinAmount("");
    setSortKey("newest");
    setCurrentPage(1);
  }, []);

  const toggleFilterType = useCallback((type: string) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
    setCurrentPage(1);
  }, []);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, sortKey, filterTypes, filterMinAmount]);

  const handleRowClick = useCallback((backer: CapBacker) => {
    const key = backer.name.toLowerCase().trim();
    const enriched = enrichCache[key];
    const enrichedBacker = enriched
      ? {
          ...backer,
          slogan: backer.slogan || enriched.profile.currentThesis || undefined,
          website: backer.website || (enriched.profile.logoUrl && enriched.profile.logoUrl.startsWith("http") ? enriched.profile.logoUrl.replace(/\/favicon\.ico$/, "") : undefined),
          logoUrl: backer.logoUrl || enriched.profile.logoUrl || undefined,
        }
      : backer;
    setEditingBacker(enrichedBacker);
    setSheetOpen(true);
  }, [enrichCache]);

  const handleSheetSave = useCallback((id: string, patch: Partial<CapBacker>) => {
    setOptimisticBackers(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
    setOverrides(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const handleSheetRemove = useCallback((id: string) => {
    setOptimisticBackers(prev => prev.filter(b => b.id !== id));
    setOverrides(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Click-outside to close suggestions
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Clear highlight after animation
  useEffect(() => {
    if (!highlightedId) return;
    const timer = setTimeout(() => setHighlightedId(null), 1500);
    return () => clearTimeout(timer);
  }, [highlightedId]);

  const handleSelectInvestor = useCallback(async (result: NFXResult) => {
    setSearchQuery("");
    setShowSuggestions(false);

    if (!user) {
      toast.error("Please sign in to add investors.");
      return;
    }

    const tempId = crypto.randomUUID();
    const now = new Date();
    const dateLabel = now.toLocaleDateString("en-US", { month: "short", year: "numeric" });

    const optimisticBacker: CapBacker = {
      id: tempId,
      name: result.name,
      amount: 0,
      amountLabel: "$0",
      instrument: "SAFE (Post-money)",
      logoLetter: result.name.charAt(0).toUpperCase(),
      date: dateLabel,
      logoUrl: result.logoUrl || undefined,
      ownershipPct: 0,
    };

    setOptimisticBackers(prev => [...prev, optimisticBacker]);
    setHighlightedId(tempId);

    try {
      const { data, error } = await supabase
        .from("cap_table")
        .insert({
          user_id: user.id,
          investor_name: result.name,
          amount: 0,
          instrument: "SAFE (Post-money)",
          entity_type: result.stage || "Angel",
          date: dateLabel,
        })
        .select()
        .single();

      if (error) throw error;

      setOptimisticBackers(prev =>
        prev.map(b => b.id === tempId ? { ...b, id: data.id } : b)
      );
    } catch (err) {
      console.error("Failed to insert cap table entry:", err);
      setOptimisticBackers(prev => prev.filter(b => b.id !== tempId));
      toast.error("Failed to add investor. Please try again.");
    }
  }, [user]);

  const handleManualAdd = useCallback(async (name?: string) => {
    const investorName = (name || searchQuery).trim();
    setSearchQuery("");
    setShowSuggestions(false);
    if (!investorName || !user) {
      if (!user) toast.error("Please sign in to add investors.");
      return;
    }

    const tempId = crypto.randomUUID();
    const now = new Date();
    const dateLabel = now.toLocaleDateString("en-US", { month: "short", year: "numeric" });

    const optimisticBacker: CapBacker = {
      id: tempId,
      name: investorName,
      amount: 0,
      amountLabel: "$0",
      instrument: "SAFE (Post-money)",
      logoLetter: investorName.charAt(0).toUpperCase(),
      date: dateLabel,
      ownershipPct: 0,
    };

    setOptimisticBackers(prev => [...prev, optimisticBacker]);
    setHighlightedId(tempId);

    try {
      const { data, error } = await supabase
        .from("cap_table")
        .insert({
          user_id: user.id,
          investor_name: investorName,
          amount: 0,
          instrument: "SAFE (Post-money)",
          entity_type: "Angel",
          date: dateLabel,
        })
        .select()
        .single();

      if (error) throw error;

      const finalBacker = { ...optimisticBacker, id: data.id };
      setOptimisticBackers(prev =>
        prev.map(b => b.id === tempId ? finalBacker : b)
      );
      setEditingBacker(finalBacker);
      setSheetOpen(true);
      toast.success(`${investorName} added — fill in the details`);
    } catch (err) {
      console.error("Failed to insert cap table entry:", err);
      setOptimisticBackers(prev => prev.filter(b => b.id !== tempId));
      toast.error("Failed to add investor. Please try again.");
    }
  }, [user, searchQuery]);

  return (
    <div
      className="rounded-[32px] p-8 backdrop-blur-xl"
      style={{
        background: "hsla(0, 0%, 100%, 0.80)",
        border: "1px solid hsla(var(--border), 0.5)",
        boxShadow: "0 20px 50px hsla(var(--accent), 0.05)",
      }}
    >

      {/* Search + Filters Row */}
      <div className="flex items-center gap-2 mb-6">
        <div ref={searchRef} className="relative flex-1">
          <div
            className="relative rounded-2xl overflow-hidden border border-border"
            style={{
              background: "hsla(var(--secondary), 0.3)",
            }}
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search investors..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
              className="pl-11 h-9 text-sm bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {nfxLoading && (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
            )}
          </div>

          {/* Live Suggestions Dropdown */}
          {showSuggestions && searchQuery.length >= 2 && (
            <div
              className="absolute top-full left-0 right-0 mt-2 rounded-2xl overflow-hidden z-20"
              style={{
                background: "hsla(0, 0%, 100%, 0.95)",
                border: "1px solid hsla(var(--border), 0.5)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 16px 48px hsla(var(--primary), 0.08)",
              }}
            >
              <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "hsla(var(--border), 0.5)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  {nfxLoading ? "Searching…" : "Live Suggestions"}
                </p>
                {!nfxLoading && searchSource !== "none" && (
                  <span
                    className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                    style={
                      searchSource === "nfx"
                        ? { background: "hsla(152, 60%, 92%, 1)", color: "hsl(152, 60%, 35%)" }
                        : searchSource === "global"
                        ? { background: "hsla(210, 60%, 92%, 1)", color: "hsl(210, 60%, 35%)" }
                        : { background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }
                    }
                  >
                    {searchSource === "nfx" ? "NFX Network" : searchSource === "global" ? "Global Database" : "Search"}
                  </span>
                )}
              </div>

              {nfxResults.length > 0 ? (
                <div className="max-h-64 overflow-y-auto">
                  {nfxResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectInvestor(r)}
                      className="flex items-center gap-3 w-full px-4 py-3 text-left transition-colors hover:bg-secondary/60"
                    >
                      <Avatar className="h-9 w-9 shrink-0">
                        {r.logoUrl ? <AvatarImage src={r.logoUrl} alt={r.name} /> : null}
                        <AvatarFallback
                          className="text-xs font-semibold"
                          style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}
                        >
                          {r.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.location}
                          {r.stage ? ` · ${r.stage}` : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : !nfxLoading ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-muted-foreground mb-2">
                    No investors found matching "{searchQuery}"
                  </p>
                  <button onClick={() => handleManualAdd()} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
                    <UserPlus className="h-3 w-3" />
                    Add "{searchQuery}" manually
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Sort Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 h-9 rounded-lg border shrink-0" style={{ borderColor: "hsla(var(--border), 0.6)" }}>
              {sortLabels[sortKey]} <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            {(Object.entries(sortLabels) as [SortKey, string][]).map(([key, label]) => (
              <DropdownMenuItem
                key={key}
                onClick={() => setSortKey(key)}
                className={sortKey === key ? "font-semibold text-primary" : ""}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Filter Popover */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <button className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border text-muted-foreground hover:text-foreground transition-colors shrink-0 ${hasActiveFilters ? "border-primary text-primary" : ""}`} style={!hasActiveFilters ? { borderColor: "hsla(var(--border), 0.6)" } : {}}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-4">
            <div className="space-y-4">
              {/* Type filter */}
              {uniqueTypes.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">Type</p>
                  <div className="space-y-2">
                    {uniqueTypes.map(type => (
                      <label key={type} className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                        <Checkbox
                          checked={filterTypes.has(type)}
                          onCheckedChange={() => toggleFilterType(type)}
                          className="h-3.5 w-3.5"
                        />
                        {type}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {/* Min Amount */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">Min Amount ($)</p>
                <Input
                  type="number"
                  placeholder="e.g. 50000"
                  value={filterMinAmount}
                  onChange={e => setFilterMinAmount(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              {hasActiveFilters && (
                <button
                  onClick={() => { setFilterTypes(new Set()); setFilterMinAmount(""); }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          size="sm"
          className="gap-1.5 text-xs h-9 rounded-lg shrink-0"
          style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
          onClick={() => handleManualAdd("New Investor")}
        >
          <Plus className="h-3.5 w-3.5" /> Add Investor
        </Button>
      </div>

      {/* Investor Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        {paginatedBackers.map((b) => {
          const key = b.name.toLowerCase().trim();
          const enriched = enrichCache?.[key];
          const slogan = b.slogan || enriched?.profile?.currentThesis || null;
          const location = enriched?.profile?.geography || null;
          const firmWebsite = b.website || enriched?.profile?.logoUrl?.replace(/\/favicon\.ico$/, "") || null;
          const websiteForFavicon = firmWebsite || (b.name.toLowerCase().replace(/\s+/g, "") + ".com");

          return (
            <Popover key={b.id}>
              <PopoverTrigger asChild>
                <button
                  className={`relative border border-border rounded-2xl p-5 transition-all duration-200 hover:shadow-lg text-left w-full cursor-pointer ${
                    b.id === highlightedId ? "ring-2 ring-accent" : ""
                  }`}
                  style={{
                    background: "hsl(var(--background))",
                    boxShadow: "0 1px 4px hsla(var(--foreground), 0.06)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <FirmLogo
                      firmName={b.name}
                      logoUrl={b.logoUrl}
                      websiteUrl={websiteForFavicon}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground truncate">{b.name}</p>
                      {slogan && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{slogan}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {b.instrument && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Instrument</span>
                        <span className="text-[11px] font-medium text-foreground">{b.instrument.split("(")[0].trim()}</span>
                      </div>
                    )}
                    {b.date && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Date</span>
                        <span className="text-[11px] font-medium text-foreground">{b.date}</span>
                      </div>
                    )}
                  </div>
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="center"
                sideOffset={8}
                className="w-80 rounded-2xl border border-border p-0 shadow-xl overflow-hidden"
                style={{ background: "hsl(var(--card))" }}
              >
                {/* Popover Hero */}
                <div
                  className="relative h-16 w-full"
                  style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--accent) / 0.12))" }}
                />
                <div className="px-5 -mt-8">
                  <FirmLogo
                    firmName={b.name}
                    logoUrl={b.logoUrl}
                    websiteUrl={websiteForFavicon}
                    size="lg"
                    className="border-2 border-card shadow-lg"
                  />
                </div>

                <div className="px-5 pt-2 pb-5 space-y-4">
                  {/* Name + Edit */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-foreground truncate">{b.name}</p>
                      {slogan && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">{slogan}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRowClick(b); }}
                      className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors shrink-0 mt-1"
                    >
                      Edit
                    </button>
                  </div>

                  {/* Detail Grid */}
                  <div className="space-y-2.5 rounded-xl border border-border bg-secondary/20 p-3.5">
                    {b.amount > 0 && (
                      <div className="flex items-center gap-2.5">
                        <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-muted-foreground flex-1">Amount</span>
                        <span className="text-[11px] font-bold text-foreground" style={{ fontFamily: "'Geist Mono', monospace" }}>
                          {formatCompactCurrency(b.amount)}
                        </span>
                      </div>
                    )}
                    {b.instrument && (
                      <div className="flex items-center gap-2.5">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-muted-foreground flex-1">Instrument</span>
                        <span className="text-[11px] font-medium text-foreground">{b.instrument}</span>
                      </div>
                    )}
                    {b.date && (
                      <div className="flex items-center gap-2.5">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-muted-foreground flex-1">Date</span>
                        <span className="text-[11px] font-medium text-foreground">{b.date}</span>
                      </div>
                    )}
                    {location && (
                      <div className="flex items-center gap-2.5">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-muted-foreground flex-1">Location</span>
                        <span className="text-[11px] font-medium text-foreground">{location}</span>
                      </div>
                    )}
                    {firmWebsite && (
                      <div className="flex items-center gap-2.5">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-muted-foreground flex-1">Website</span>
                        <a
                          href={firmWebsite.startsWith("http") ? firmWebsite : `https://${firmWebsite}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-medium text-primary hover:underline truncate max-w-[120px]"
                          onClick={e => e.stopPropagation()}
                        >
                          {firmWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                        </a>
                      </div>
                    )}
                    {!b.amount && !b.instrument && !b.date && !location && !firmWebsite && (
                      <p className="text-[11px] text-muted-foreground italic text-center py-1">No details yet.</p>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor: "hsla(var(--border), 0.5)" }}>
          <p className="text-xs text-muted-foreground">
            {filteredBackers.length} results • Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`h-8 w-8 text-xs font-medium rounded-lg transition-colors ${
                  page === currentPage
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {filteredBackers.length === 0 && !showSuggestions && (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl mb-3" style={{ background: "hsl(var(--secondary))" }}>
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">
            {(searchQuery || hasActiveFilters)
              ? "No investors match your current filters."
              : "No investors added yet."}
          </p>
          {(searchQuery || hasActiveFilters) && (
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline mt-1"
            >
              <X className="h-3 w-3" /> Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <InvestorEditDialog
        backer={editingBacker}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSave={handleSheetSave}
        onRemove={handleSheetRemove}
      />
    </div>
  );
}
