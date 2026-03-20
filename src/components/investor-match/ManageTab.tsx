import { useState, useCallback, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Plus, Search, Settings2, DollarSign, UserPlus, Loader2, ChevronDown, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableHeader, TableBody, TableHead, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CapTableRow, type CapBacker } from "./CapTableRow";
import { InvestorEditSheet } from "./InvestorEditSheet";


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

// ── Cap Table Panel ──

function CapTablePanel({ confirmedBackers, formatCurrency }: Omit<ManageTabProps, "totalRaised">) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [optimisticBackers, setOptimisticBackers] = useState<CapBacker[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Partial<CapBacker>>>({});
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [editingBacker, setEditingBacker] = useState<CapBacker | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { results: nfxResults, loading: nfxLoading, source: searchSource } = useNFXSearch(searchQuery);

  const allBackers = [
    ...confirmedBackers.map(b => ({ ...b, ...overrides[b.id] })),
    ...optimisticBackers,
  ];

  const handleRowClick = useCallback((backer: CapBacker) => {
    setEditingBacker(backer);
    setSheetOpen(true);
  }, []);

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

  const filteredBackers = searchQuery && !showSuggestions
    ? allBackers.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allBackers;

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

  return (
    <div
      className="rounded-[32px] p-8 backdrop-blur-xl"
      style={{
        background: "hsla(0, 0%, 100%, 0.80)",
        border: "1px solid hsla(var(--border), 0.5)",
        boxShadow: "0 20px 50px hsla(var(--accent), 0.05)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-foreground">My Investors</h3>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border" style={{ borderColor: "hsla(var(--border), 0.6)" }}>
            Recent <ChevronDown className="h-3 w-3" />
          </button>
          <button className="inline-flex items-center justify-center h-8 w-8 rounded-lg border text-muted-foreground hover:text-foreground transition-colors" style={{ borderColor: "hsla(var(--border), 0.6)" }}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
          <Button
            size="sm"
            className="gap-1.5 text-xs h-8 rounded-lg"
            style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
          >
            <Plus className="h-3.5 w-3.5" /> Add Investor
          </Button>
        </div>
      </div>

      {/* Smart Search */}
      <div ref={searchRef} className="relative mb-6">
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: "hsla(var(--secondary), 0.5)",
            border: "1px solid hsla(var(--border), 0.5)",
          }}
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search global investor database..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
            className="pl-11 h-11 text-sm bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
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
                <button className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
                  <UserPlus className="h-3 w-3" />
                  Add them manually
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Read-Only Table */}
      <div className="overflow-hidden">
        <Table className="border-0 [&_tr]:border-0 table-fixed w-full">
          <TableHeader>
            <TableRow className="border-0 hover:bg-transparent">
              <TableHead className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground h-9 px-3 w-10"></TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground h-9 px-3">Investor</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground h-9 px-3">Type</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground h-9 px-3">Round</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground h-9 px-3">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-0">
            {filteredBackers.map((b, i) => (
              <CapTableRow
                key={b.id}
                backer={b}
                index={i}
                isHighlighted={b.id === highlightedId}
                onClick={() => handleRowClick(b)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {filteredBackers.length === 0 && !showSuggestions && (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl mb-3" style={{ background: "hsl(var(--secondary))" }}>
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">
            {searchQuery ? "No investors match your search." : "No investors added yet."}
          </p>
          {searchQuery && (
            <button className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline mt-1">
              <UserPlus className="h-3 w-3" /> Add manually
            </button>
          )}
        </div>
      )}

      {/* Slide-Over Edit Panel */}
      <InvestorEditSheet
        backer={editingBacker}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSave={handleSheetSave}
        onRemove={handleSheetRemove}
      />
    </div>
  );
}

// ── Round Settings Panel ──

function RoundSettingsPanel({ totalRaised, formatCurrency }: { totalRaised: number; formatCurrency: (n: number) => string }) {
  const [targetRaise] = useState(2_000_000);
  const [roundStage] = useState("Pre-Seed");
  const roundProgress = totalRaised > 0 ? Math.min((totalRaised / targetRaise) * 100, 100) : 0;

  return (
    <div className="space-y-5">
      <div
        className="rounded-[32px] p-8 backdrop-blur-xl"
        style={{
          background: "hsla(0, 0%, 100%, 0.80)",
          border: "1px solid hsla(var(--border), 0.5)",
          boxShadow: "0 20px 50px hsla(var(--accent), 0.05)",
        }}
      >
        <div className="flex items-center gap-2 mb-6">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground">Round Settings</h3>
        </div>
        <div className="space-y-5">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">Target Raise</label>
            <p className="text-2xl font-extrabold text-foreground mt-1" style={{ fontFamily: "'Geist Mono', monospace" }}>
              {formatCurrency(targetRaise)}
            </p>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">Round Stage</label>
            <div className="mt-1.5">
              <Badge className="border-0 text-xs font-medium" style={{ background: "hsla(var(--accent), 0.1)", color: "hsl(var(--accent))" }}>
                {roundStage}
              </Badge>
            </div>
          </div>
          <div className="pt-2">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
              <span className="font-semibold uppercase tracking-[0.15em]">Progress</span>
              <span className="font-medium text-foreground" style={{ fontFamily: "'Geist Mono', monospace" }}>
                {formatCurrency(totalRaised)} / {formatCurrency(targetRaise)}
              </span>
            </div>
            <Progress value={roundProgress} className="h-2 bg-secondary rounded-full" />
            <p className="text-[10px] text-muted-foreground mt-2">{Math.round(roundProgress)}% of target</p>
          </div>
        </div>
      </div>

      <div
        className="rounded-[32px] p-8 backdrop-blur-xl"
        style={{
          background: "hsla(0, 0%, 100%, 0.80)",
          border: "1px solid hsla(var(--border), 0.5)",
          boxShadow: "0 20px 50px hsla(var(--accent), 0.05)",
        }}
      >
        <div className="flex items-center gap-2 mb-5">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground">Summary</h3>
        </div>
        <div className="space-y-3.5">
          {[
            { label: "Total Raised", value: formatCurrency(totalRaised) },
            { label: "Investors", value: String(0) },
            { label: "Remaining", value: formatCurrency(Math.max(2_000_000 - totalRaised, 0)) },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span className="text-xs font-semibold text-foreground" style={{ fontFamily: "'Geist Mono', monospace" }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Export ──

export function ManageTab({ confirmedBackers, totalRaised, formatCurrency }: ManageTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <CapTablePanel confirmedBackers={confirmedBackers} formatCurrency={formatCurrency} />
      </div>
      <div className="lg:col-span-1">
        <RoundSettingsPanel totalRaised={totalRaised} formatCurrency={formatCurrency} />
      </div>
    </div>
  );
}
