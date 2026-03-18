import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, DollarSign, CheckCircle2, Loader2, RefreshCw, ChevronDown, Landmark, FileText, Globe, Sparkles, Radio, TrendingUp, Check } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { InvestorDiscovery } from "./company-profile/InvestorDiscovery";
import { toast } from "sonner";

export interface ExtractedInvestor {
  investorName: string;
  entityType: string;
  instrument: string;
  amount: number;
  date?: string;
  source: "deck" | "web";
}

interface CapRow {
  id: string;
  investor_name: string;
  entity_type: string;
  instrument: string;
  amount: number;
  date: string;
  notes: string;
  _new?: boolean;
  _source?: "deck" | "web";
  _verified?: boolean;
}

interface PendingInvestor {
  id: string;
  investor_name: string;
  entity_type: string;
  instrument: string;
  amount: number;
  round_name: string | null;
  source_type: string;
  source_detail: string | null;
  source_date: string | null;
  status: string;
}

interface InvestorBackingProps {
  extractedInvestors?: ExtractedInvestor[];
  isScanning?: boolean;
}

const ENTITY_TYPES = ["Angel", "VC Firm", "Syndicate", "Accelerator", "CVC", "Family Office"];
const INSTRUMENTS = ["SAFE (Post-money)", "SAFE (Pre-money)", "Convertible Note", "Equity"];

const INSTRUMENT_COLORS: Record<string, string> = {
  "Equity": "bg-purple-500/15 text-purple-700 border-purple-500/25",
  "SAFE (Post-money)": "bg-amber-500/15 text-amber-700 border-amber-500/25",
  "SAFE (Pre-money)": "bg-amber-500/15 text-amber-700 border-amber-500/25",
  "Convertible Note": "bg-sky-500/15 text-sky-700 border-sky-500/25",
};

function logoUrl(name: string) {
  if (!name.trim()) return null;
  const domain = name.trim().toLowerCase().replace(/\s+/g, "") + ".com";
  return `https://logo.clearbit.com/${domain}`;
}

function useCountUp(target: number, duration = 1200) {
  const [display, setDisplay] = useState(0);
  const prevTarget = useRef(0);
  useEffect(() => {
    if (target === prevTarget.current) return;
    const start = prevTarget.current;
    prevTarget.current = target;
    const diff = target - start;
    if (diff === 0) { setDisplay(target); return; }
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return display;
}

// ── Radar Discovery Animation ──
function DiscoveryRadar({ logs }: { logs: string[] }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-5">
      {/* Radar visual */}
      <div className="relative w-28 h-28">
        {/* Rings */}
        <div className="absolute inset-0 rounded-full border border-accent/20" />
        <div className="absolute inset-3 rounded-full border border-accent/15" />
        <div className="absolute inset-6 rounded-full border border-accent/10" />
        {/* Center dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-3 w-3 rounded-full bg-accent animate-funding-pulse" />
        </div>
        {/* Sweep */}
        <div className="absolute inset-0 animate-radar-spin" style={{ transformOrigin: "center" }}>
          <div
            className="absolute top-1/2 left-1/2 w-1/2 h-[2px]"
            style={{
              background: "linear-gradient(90deg, hsl(var(--accent)), transparent)",
              transformOrigin: "left center",
            }}
          />
        </div>
        {/* Ping rings */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border border-accent/40 animate-radar-ping" />
        </div>
      </div>
      {/* Log lines */}
      <div className="space-y-1.5 text-center max-w-xs">
        {logs.map((log, i) => (
          <p key={i} className={`text-[11px] font-mono transition-opacity duration-500 ${i === logs.length - 1 ? "text-accent" : "text-muted-foreground/60"}`}>
            {log}
          </p>
        ))}
      </div>
    </div>
  );
}

// ── Mini Funding Timeline Chart ──
function FundingTimeline({ rows }: { rows: CapRow[] }) {
  const sorted = useMemo(() => {
    return rows
      .filter(r => r.amount > 0 && r.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  if (sorted.length < 2) return null;

  const cumulative = sorted.reduce<{ date: string; total: number }[]>((acc, r) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].total : 0;
    acc.push({ date: r.date, total: prev + r.amount });
    return acc;
  }, []);

  const maxVal = cumulative[cumulative.length - 1]?.total || 1;
  const points = cumulative.map((p, i) => {
    const x = (i / (cumulative.length - 1)) * 100;
    const y = 100 - (p.total / maxVal) * 80;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="h-12 w-full max-w-[200px]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        <polyline
          points={points}
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Area fill */}
        <polygon
          points={`0,100 ${points} 100,100`}
          fill="hsl(var(--accent) / 0.1)"
        />
      </svg>
    </div>
  );
}

// ── Investor Profile Card ──
function InvestorCard({
  row,
  onUpdate,
  onDelete,
  saving,
}: {
  row: CapRow;
  onUpdate: (field: keyof CapRow, value: string | number) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const instrumentColor = INSTRUMENT_COLORS[row.instrument] || "bg-muted text-muted-foreground";
  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : n > 0 ? `$${n}` : "";

  return (
    <div
      className={`group rounded-xl border border-border bg-card p-4 hover:shadow-surface-md transition-all duration-200 ${row._source ? "animate-spring-pop" : ""}`}
    >
      <div className="flex items-start gap-3">
        {/* Logo */}
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted shrink-0 overflow-hidden">
          {row.investor_name ? (
            <img
              src={logoUrl(row.investor_name)!}
              alt=""
              className="h-full w-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
              }}
            />
          ) : null}
          <Landmark className="h-5 w-5 text-muted-foreground hidden" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {editing ? (
              <Input
                value={row.investor_name}
                onChange={(e) => onUpdate("investor_name", e.target.value)}
                onBlur={() => setEditing(false)}
                autoFocus
                className="h-7 text-sm font-medium border-accent/30"
              />
            ) : (
              <span
                className="text-sm font-semibold text-foreground truncate cursor-pointer hover:text-accent transition-colors"
                onClick={() => setEditing(true)}
              >
                {row.investor_name || "Untitled Investor"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {/* Entity type */}
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
              {row.entity_type}
            </Badge>
            {/* Instrument — colored tag */}
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border ${instrumentColor}`}>
              {row.instrument}
            </Badge>
            {/* Source badges */}
            {row._source === "deck" && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5 bg-accent/10 text-accent-foreground border-accent/20">
                <FileText className="h-2.5 w-2.5" /> Deck
              </Badge>
            )}
            {row._source === "web" && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5 bg-primary/10 text-primary border-primary/20">
                <Globe className="h-2.5 w-2.5" /> Web
              </Badge>
            )}
            {/* Verification Status */}
            {row._source && !row._verified && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5 bg-accent/10 text-accent border-accent/20">
                <Sparkles className="h-2.5 w-2.5" /> AI Found
              </Badge>
            )}
            {row._verified && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5 bg-success/10 text-success border-success/20">
                <Check className="h-2.5 w-2.5" /> Verified
              </Badge>
            )}
          </div>

          {/* Date */}
          {row.date && (
            <p className="text-[10px] text-muted-foreground mt-1 font-mono">{row.date}</p>
          )}
        </div>

        {/* Amount + Actions */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {row.amount > 0 ? (
            <span className="text-base font-bold text-foreground font-mono">{fmt(row.amount)}</span>
          ) : row._source ? (
            <span className="text-[10px] text-muted-foreground/50 italic">Suggesting $...</span>
          ) : (
            <Input
              type="number"
              value={row.amount || ""}
              onChange={(e) => onUpdate("amount", parseInt(e.target.value) || 0)}
              className="h-7 w-24 text-xs text-right"
              placeholder="$0"
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function InvestorBacking({ extractedInvestors, isScanning = false }: InvestorBackingProps) {
  const [rows, setRows] = useState<CapRow[]>([]);
  const [original, setOriginal] = useState<CapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingInvestor[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [radarLogs, setRadarLogs] = useState<string[]>([]);

  const dirty = useMemo(() => JSON.stringify(rows) !== JSON.stringify(original), [rows, original]);
  const totalRaised = useMemo(() => rows.reduce((s, r) => s + (r.amount || 0), 0), [rows]);
  const animatedTotal = useCountUp(totalRaised);

  // Radar log simulation when scanning
  useEffect(() => {
    if (!isScanning && !syncing) {
      setRadarLogs([]);
      return;
    }
    setRadarLogs(["Initializing deep search..."]);
    const timers = [
      setTimeout(() => setRadarLogs(prev => [...prev, "Checking SEC filings..."]), 1500),
      setTimeout(() => setRadarLogs(prev => [...prev, "Scanned 12 investment news sources..."]), 3500),
      setTimeout(() => setRadarLogs(prev => [...prev, "Cross-referencing Firecrawl results..."]), 5500),
      setTimeout(() => setRadarLogs(prev => [...prev, "Found matching backers."]), 7000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isScanning, syncing]);

  const fetchRows = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("cap_table")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    const mapped = (data || []).map((r: any) => ({
      id: r.id,
      investor_name: r.investor_name,
      entity_type: r.entity_type,
      instrument: r.instrument,
      amount: r.amount,
      date: r.date || "",
      notes: r.notes || "",
      _verified: true, // Existing DB rows are founder-verified
    }));
    setRows(mapped);
    setOriginal(mapped);
    setLoading(false);
  }, []);

  const fetchPending = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("pending_investors")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setPending((data as PendingInvestor[]) || []);
  }, []);

  useEffect(() => { fetchRows(); fetchPending(); }, [fetchRows, fetchPending]);

  // Auto-populate from AI-extracted investors
  useEffect(() => {
    if (!extractedInvestors?.length) return;
    setRows(prev => {
      const existingNames = new Set(prev.map(r => r.investor_name.toLowerCase().trim()));
      const newRows: CapRow[] = [];
      for (const inv of extractedInvestors) {
        const name = inv.investorName.trim();
        if (!name || existingNames.has(name.toLowerCase())) continue;
        existingNames.add(name.toLowerCase());
        newRows.push({
          id: crypto.randomUUID(),
          investor_name: name,
          entity_type: ENTITY_TYPES.includes(inv.entityType) ? inv.entityType : "VC Firm",
          instrument: INSTRUMENTS.includes(inv.instrument) ? inv.instrument : "Equity",
          amount: inv.amount || 0,
          date: inv.date || "",
          notes: "",
          _new: true,
          _source: inv.source,
        });
      }
      if (newRows.length === 0) return prev;
      toast.success(`${newRows.length} investor(s) auto-populated from analysis`);
      return [...prev, ...newRows];
    });
  }, [extractedInvestors]);

  const updateCell = (id: string, field: keyof CapRow, value: string | number) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
  };

  const verifyRow = (id: string) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, _verified: true } : r));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), investor_name: "", entity_type: "Angel", instrument: "SAFE (Post-money)", amount: 0, date: "", notes: "", _new: true, _verified: true },
    ]);
  };

  const deleteRow = async (id: string, isNew?: boolean) => {
    if (!isNew) {
      const { error } = await supabase.from("cap_table").delete().eq("id", id);
      if (error) { toast.error("Delete failed"); return; }
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    setOriginal((prev) => prev.filter((r) => r.id !== id));
    toast.success("Investor removed");
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      for (const row of rows) {
        const payload = {
          user_id: user.id, investor_name: row.investor_name, entity_type: row.entity_type,
          instrument: row.instrument, amount: row.amount, date: row.date || null, notes: row.notes || null,
        };
        if (row._new) {
          const { error } = await supabase.from("cap_table").insert({ ...payload, id: row.id });
          if (error) throw error;
        } else {
          const orig = original.find((o) => o.id === row.id);
          if (JSON.stringify(orig) !== JSON.stringify(row)) {
            const { error } = await supabase.from("cap_table").update(payload).eq("id", row.id);
            if (error) throw error;
          }
        }
      }
      toast.success("Changes saved");
      await fetchRows();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const acceptPending = async (p: PendingInvestor) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error: insertErr } = await supabase.from("cap_table").insert({
      user_id: user.id,
      investor_name: p.investor_name,
      entity_type: p.entity_type,
      instrument: p.instrument,
      amount: p.amount,
      date: p.source_date || "",
      notes: `${p.source_type}: ${p.source_detail || ""}`.trim(),
    });
    if (insertErr) { toast.error("Failed to add investor"); return; }
    const { error: updateErr } = await supabase.from("pending_investors").update({ status: "accepted" }).eq("id", p.id);
    if (updateErr) console.error(updateErr);
    setPending((prev) => prev.filter((x) => x.id !== p.id));
    await fetchRows();
    toast.success(`${p.investor_name} added to your cap table`);
  };

  const dismissPending = async (id: string) => {
    await supabase.from("pending_investors").update({ status: "dismissed" }).eq("id", id);
    setPending((prev) => prev.filter((x) => x.id !== id));
    toast("Investor dismissed");
  };

  const acceptAll = async () => {
    for (const p of pending) { await acceptPending(p); }
    setShowReview(false);
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: analyses } = await supabase
        .from("company_analyses")
        .select("id, company_name, website_url")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (!analyses) { toast.error("No company profile found."); return; }
      const domain = analyses.website_url
        ? analyses.website_url.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
        : "";
      const { data, error } = await supabase.functions.invoke("sync-investor-data", {
        body: { company_id: analyses.id, company_domain: domain, user_id: user.id, company_name: analyses.company_name },
      });
      if (error) throw error;
      toast.success(`Sync complete — ${data?.newInvestorsFound || 0} new investor(s) found`);
      await fetchPending();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n}`;

  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="surface-card border border-border">
        <CollapsibleTrigger asChild>
          <button className="w-full p-5 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Landmark className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold text-foreground">Funding Hub</h3>
                <p className="text-[10px] text-muted-foreground">Capital raised, investor backing &amp; discovery</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(isScanning || syncing) && (
                <Badge variant="secondary" className="text-[9px] px-2 py-0.5 bg-accent/10 text-accent border-accent/20 animate-pulse gap-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" /> Scanning...
                </Badge>
              )}
              {totalRaised > 0 && (
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                  {fmt(totalRaised)} raised
                </Badge>
              )}
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-5 pb-5 space-y-4">

            {/* ══ Funding Pulse Header ══ */}
            <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-accent/5 to-primary/10 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 relative">
                    <DollarSign className="h-7 w-7 text-primary" />
                    {(isScanning || syncing) && (
                      <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-accent animate-funding-pulse" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Funding Pulse</p>
                      <TrendingUp className="h-3 w-3 text-success" />
                    </div>
                    <p className="text-4xl font-bold text-foreground tracking-tighter mt-0.5 font-mono">{fmt(animatedTotal)}</p>
                    {rows.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {rows.length} investor{rows.length !== 1 ? "s" : ""} · {rows.filter(r => r._verified).length} verified
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <FundingTimeline rows={rows} />
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={triggerSync} disabled={syncing || isScanning}>
                    {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {syncing ? "Deep Searching..." : "Deep Search"}
                  </Button>
                </div>
              </div>
            </div>

            {/* ══ Discovery Radar — while scanning with no results ══ */}
            {(isScanning || syncing) && rows.length === 0 && (
              <DiscoveryRadar logs={radarLogs} />
            )}

            {/* ══ Investor Discovery — Pending Cards ══ */}
            <InvestorDiscovery
              pending={pending}
              onConfirm={acceptPending}
              onIgnore={dismissPending}
            />

            {/* ══ Investor Profile Cards ══ */}
            {rows.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Investor Backing</h4>
                  <div className="flex items-center gap-2">
                    {dirty && (
                      <Button size="sm" className="gap-1.5 h-7 text-[11px]" onClick={saveChanges} disabled={saving}>
                        <Save className="h-3 w-3" />
                        {saving ? "Saving..." : "Save"}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {rows.map((row) => (
                    <InvestorCard
                      key={row.id}
                      row={row}
                      onUpdate={(field, value) => updateCell(row.id, field, value)}
                      onDelete={() => deleteRow(row.id, row._new)}
                      saving={saving}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state (no scanning) */}
            {rows.length === 0 && !loading && !isScanning && !syncing && (
              <div className="text-center py-8">
                <Radio className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-xs text-muted-foreground">No investors yet.</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Add manually or run Deep Search to discover backers.</p>
              </div>
            )}

            {/* Add Investor */}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" />
              Add Investor
            </Button>

            {/* Review Modal */}
            <Dialog open={showReview} onOpenChange={setShowReview}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Review Discovered Investors</DialogTitle>
                  <DialogDescription>
                    These investors were found from public data sources. Accept to add them to your cap table.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {pending.map((p) => (
                    <Card key={p.id} className="border">
                      <CardContent className="flex items-center justify-between py-3 px-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {p.investor_name && (
                            <img
                              src={logoUrl(p.investor_name)!}
                              alt=""
                              className="h-8 w-8 rounded object-contain shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{p.investor_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{p.entity_type}</Badge>
                              {p.round_name && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{p.round_name}</Badge>}
                              {p.amount > 0 && <span className="text-xs text-muted-foreground font-mono">{fmt(p.amount)}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-3">
                          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => dismissPending(p.id)}>Dismiss</Button>
                          <Button size="sm" className="text-xs gap-1" onClick={() => acceptPending(p)}>
                            <CheckCircle2 className="h-3 w-3" /> Accept
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {pending.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No pending investors.</p>}
                </div>
                {pending.length > 1 && (
                  <div className="flex justify-end pt-2 border-t">
                    <Button className="gap-1.5" onClick={acceptAll}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Accept All ({pending.length})
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
