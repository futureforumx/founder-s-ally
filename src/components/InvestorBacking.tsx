import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, DollarSign, Loader2, RefreshCw, ChevronDown, Landmark, Sparkles, Radio, TrendingUp, Check, ExternalLink, Pencil, Inbox, X } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { InvestorDiscovery } from "./company-profile/InvestorDiscovery";
import { toast } from "sonner";
import { AreaChart, Area, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";

export interface ExtractedInvestor {
  investorName: string;
  entityType: string;
  instrument: string;
  amount: number;
  date?: string;
  source: "deck" | "web" | "exa";
  highlight?: string;
  sourceUrl?: string;
  domain?: string;
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
  _source?: "deck" | "web" | "exa";
  _verified?: boolean;
  _highlight?: string;
  _sourceUrl?: string;
  _domain?: string;
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
  companyName?: string;
}

const ENTITY_TYPES = ["Angel", "VC Firm", "Syndicate", "Accelerator", "CVC", "Family Office"];
const INSTRUMENTS = ["SAFE (Post-money)", "SAFE (Pre-money)", "Convertible Note", "Equity"];

const INSTRUMENT_COLORS: Record<string, string> = {
  "Equity": "bg-purple-500/15 text-purple-700 border-purple-500/25",
  "SAFE (Post-money)": "bg-amber-500/15 text-amber-700 border-amber-500/25",
  "SAFE (Pre-money)": "bg-amber-500/15 text-amber-700 border-amber-500/25",
  "Convertible Note": "bg-sky-500/15 text-sky-700 border-sky-500/25",
};

/** Strip protocol, www, and trailing paths from a URL or domain string */
function cleanDomain(raw: string): string {
  return raw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

function faviconUrl(domain: string) {
  const clean = cleanDomain(domain);
  return `https://www.google.com/s2/favicons?domain=${clean}&sz=128`;
}

function fallbackLogoUrl(name: string) {
  if (!name.trim()) return null;
  const domain = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
  return faviconUrl(domain);
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

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : n > 0 ? `$${n}` : "$0";

// ── Radar Discovery Animation ──
function DiscoveryRadar({ logs, companyName }: { logs: string[]; companyName?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-5">
      <div className="relative w-28 h-28">
        <div className="absolute inset-0 rounded-full border border-accent/20" />
        <div className="absolute inset-3 rounded-full border border-accent/15" />
        <div className="absolute inset-6 rounded-full border border-accent/10" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-3 w-3 rounded-full bg-accent animate-funding-pulse" />
        </div>
        <div className="absolute inset-0 animate-radar-spin" style={{ transformOrigin: "center" }}>
          <div
            className="absolute top-1/2 left-1/2 w-1/2 h-[2px]"
            style={{
              background: "linear-gradient(90deg, hsl(var(--accent)), transparent)",
              transformOrigin: "left center",
            }}
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border border-accent/40 animate-radar-ping" />
        </div>
      </div>
      <div className="space-y-1.5 text-center max-w-xs">
        <p className="text-xs font-medium text-accent">
          Exa AI is auditing global funding news{companyName ? ` for ${companyName}` : ""}...
        </p>
        {logs.map((log, i) => (
          <p key={i} className={`text-[11px] font-mono transition-opacity duration-500 ${i === logs.length - 1 ? "text-accent" : "text-muted-foreground/60"}`}>
            {log}
          </p>
        ))}
      </div>
    </div>
  );
}

// ── Interactive Funding Area Chart (recharts) ──
function FundingAreaChart({ rows }: { rows: CapRow[] }) {
  const chartData = useMemo(() => {
    const sorted = rows
      .filter(r => r.amount > 0 && r.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 2) return null;

    let cumulative = 0;
    return sorted.map(r => {
      cumulative += r.amount;
      return {
        date: r.date,
        total: cumulative,
        investor: r.investor_name,
        label: `${r.investor_name}: ${fmt(cumulative)}`,
      };
    });
  }, [rows]);

  if (!chartData) return null;

  return (
    <div className="w-full h-20">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="colorFundingGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis hide />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="px-2.5 py-1.5 rounded-lg bg-foreground text-background text-[10px] font-mono shadow-lg whitespace-nowrap">
                  <span className="font-semibold">{fmt(d.total)}</span>
                  <span className="text-background/60 ml-1">· {d.investor}</span>
                </div>
              );
            }}
            cursor={false}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="hsl(var(--accent))"
            strokeWidth={2}
            fill="url(#colorFundingGrad)"
            dot={false}
            activeDot={{ r: 3, fill: "hsl(var(--accent))", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Investor Logo with letter fallback ──
function InvestorLogo({ name, domain, size = "sm" }: { name: string; domain?: string; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const src = domain ? faviconUrl(domain) : fallbackLogoUrl(name);
  const letter = (name || "?").charAt(0).toUpperCase();
  const sizeClasses = size === "md" ? "h-10 w-10 rounded-xl" : "h-7 w-7 rounded-lg";
  const imgClasses = size === "md" ? "h-6 w-6" : "h-4 w-4";
  const textClass = size === "md" ? "text-sm" : "text-[11px]";

  if (failed || !src) {
    return (
      <div className={`flex items-center justify-center ${sizeClasses} bg-accent/10 text-accent font-semibold ${textClass} shrink-0`}>
        {letter}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center ${sizeClasses} bg-muted/50 shrink-0 overflow-hidden border border-border`}>
      <img src={src} alt="" className={`${imgClasses} object-contain`} onError={() => setFailed(true)} />
    </div>
  );
}

// ── Compact AI Suggestion Card (for horizontal carousel) ──
function CompactSuggestionCard({
  row,
  onApprove,
  onReject,
}: {
  row: CapRow;
  onApprove: () => void;
  onReject: () => void;
}) {
  const instrumentColor = INSTRUMENT_COLORS[row.instrument] || "bg-muted text-muted-foreground";

  return (
    <div className="min-w-[300px] max-w-[320px] snap-center shrink-0 rounded-xl border border-accent/15 bg-card p-4 relative group transition-all hover:border-accent/30">
      {/* Top row: Logo + Name + Amount */}
      <div className="flex items-center gap-2.5">
        <InvestorLogo name={row.investor_name} domain={row._domain} size="md" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground truncate">{row.investor_name || "Unknown Investor"}</h4>
          <div className="flex items-center gap-1 mt-0.5">
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border ${instrumentColor}`}>{row.instrument}</Badge>
            {row.date && <span className="text-[10px] text-muted-foreground font-mono">{row.date}</span>}
          </div>
        </div>
        <span className="text-lg font-bold text-foreground font-mono shrink-0">
          {row.amount > 0 ? fmt(row.amount) : "TBD"}
        </span>
      </div>

      {/* Highlight snippet — 2 lines max */}
      {row._highlight && (
        <p className="text-sm text-muted-foreground mt-2.5 leading-snug line-clamp-2 italic">
          "{row._highlight}"
        </p>
      )}

      {/* Bottom: source link + action buttons */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5 bg-accent/10 text-accent border-accent/20">
            <Sparkles className="h-2 w-2" /> AI Sourced
          </Badge>
          {row._sourceUrl && (
            <a
              href={row._sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[10px] text-accent hover:text-accent/80 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-2.5 w-2.5" /> Source
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5 relative z-10">
          <button
            onClick={(e) => { e.stopPropagation(); onReject(); }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive hover:bg-destructive/10 hover:scale-110 active:scale-95 transition-all cursor-pointer"
            title="Reject"
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onApprove(); }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-success/30 text-success bg-success/5 hover:bg-success/20 hover:border-success/60 hover:scale-110 active:scale-95 transition-all cursor-pointer"
            title="Approve"
            type="button"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Premium Ledger Row with Inline Editing ──
function VerifiedRow({ row, onUpdate, onDelete }: { row: CapRow; onUpdate: (id: string, field: keyof CapRow, value: string | number) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(row.investor_name);
  const [editAmount, setEditAmount] = useState(String(row.amount));
  const [editInstrument, setEditInstrument] = useState(row.instrument);
  const instrumentColor = INSTRUMENT_COLORS[row.instrument] || "bg-muted text-muted-foreground";

  const handleSave = () => {
    onUpdate(row.id, "investor_name", editName);
    onUpdate(row.id, "amount", Number(editAmount) || 0);
    onUpdate(row.id, "instrument", editInstrument);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2.5 px-4 animate-fade-in">
        <InvestorLogo name={editName} domain={row._domain} />
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="h-7 text-xs flex-1 min-w-0"
          placeholder="Investor name"
        />
        <select
          value={editInstrument}
          onChange={(e) => setEditInstrument(e.target.value)}
          className="h-7 text-[10px] rounded-md border border-input bg-background px-2 text-foreground"
        >
          {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <Input
          value={editAmount}
          onChange={(e) => setEditAmount(e.target.value)}
          className="h-7 text-xs w-24 font-mono"
          placeholder="Amount"
          type="number"
        />
        <Button size="sm" className="h-7 text-[10px] gap-1 px-2" onClick={handleSave}>
          <Save className="h-3 w-3" /> Save
        </Button>
        <button
          onClick={() => setEditing(false)}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2.5 px-4 hover:bg-muted/30 transition-colors group">
      <InvestorLogo name={row.investor_name} domain={row._domain} />
      <span className="text-sm font-semibold text-foreground truncate flex-1 min-w-0">{row.investor_name}</span>
      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border ${instrumentColor} hidden sm:inline-flex`}>
        {row.instrument}
      </Badge>
      {row.date && <span className="text-[10px] text-muted-foreground font-mono hidden md:block">{row.date}</span>}
      <span className="text-sm font-bold text-foreground font-mono min-w-[70px] text-right tabular-nums">
        {row.amount > 0 ? fmt(row.amount) : "—"}
      </span>
      {/* Hover-reveal actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-all cursor-pointer"
          title="Edit"
          type="button"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
          title="Delete"
          type="button"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}


export function InvestorBacking({ extractedInvestors, isScanning = false, companyName }: InvestorBackingProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<CapRow[]>([]);
  const [original, setOriginal] = useState<CapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingInvestor[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [radarLogs, setRadarLogs] = useState<string[]>([]);
  const [queueDismissed, setQueueDismissed] = useState(false);

  const dirty = useMemo(() => JSON.stringify(rows) !== JSON.stringify(original), [rows, original]);

  const pendingQueue = useMemo(() => rows.filter(r => r._source && !r._verified), [rows]);
  const verifiedRows = useMemo(() => rows.filter(r => !r._source || r._verified), [rows]);

  const totalRaised = useMemo(() => verifiedRows.reduce((s, r) => s + (r.amount || 0), 0) + pendingQueue.reduce((s, r) => s + (r.amount || 0), 0), [verifiedRows, pendingQueue]);
  const animatedTotal = useCountUp(totalRaised);

  // Radar log simulation
  useEffect(() => {
    if (!isScanning && !syncing) { setRadarLogs([]); return; }
    setRadarLogs(["Initializing Exa neural search..."]);
    const timers = [
      setTimeout(() => setRadarLogs(prev => [...prev, "Querying global funding databases..."]), 1500),
      setTimeout(() => setRadarLogs(prev => [...prev, "Scanning venture capital news sources..."]), 3000),
      setTimeout(() => setRadarLogs(prev => [...prev, "Cross-referencing SEC filings..."]), 4500),
      setTimeout(() => setRadarLogs(prev => [...prev, "Extracting investor profiles..."]), 6000),
      setTimeout(() => setRadarLogs(prev => [...prev, "Found matching backers."]), 7500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isScanning, syncing]);

  const fetchRows = useCallback(async () => {
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
      _verified: true,
    }));
    setRows(mapped);
    setOriginal(mapped);
    setLoading(false);
  }, [user]);

  const fetchPending = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("pending_investors")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setPending((data as PendingInvestor[]) || []);
  }, [user]);

  useEffect(() => { fetchRows(); fetchPending(); }, [fetchRows, fetchPending]);

  // Auto-populate from AI-extracted investors
  useEffect(() => {
    if (!extractedInvestors?.length) return;
    setQueueDismissed(false);
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
          _highlight: inv.highlight || "",
          _sourceUrl: inv.sourceUrl || "",
          _domain: inv.domain || "",
        });
      }
      if (newRows.length === 0) return prev;
      toast.success(`${newRows.length} investor(s) discovered — review below`);
      return [...prev, ...newRows];
    });
  }, [extractedInvestors]);

  const updateCell = (id: string, field: keyof CapRow, value: string | number) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
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

  const approveCard = async (row: CapRow) => {
    try {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("cap_table").insert({
        id: row.id,
        user_id: user.id,
        investor_name: row.investor_name,
        entity_type: row.entity_type,
        instrument: row.instrument,
        amount: row.amount,
        date: row.date || null,
        notes: row._highlight || null,
      });
      if (error) throw error;
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, _verified: true, _new: false, _source: undefined } : r));
      setOriginal(prev => [...prev, { ...row, _verified: true, _new: false, _source: undefined }]);
      toast.success(`${row.investor_name} added to cap table`);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
  };

  const rejectCard = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
    toast("Investor rejected");
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
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
    if (!user) return;
    const { error: insertErr } = await supabase.from("cap_table").insert({
      user_id: user.id, investor_name: p.investor_name, entity_type: p.entity_type,
      instrument: p.instrument, amount: p.amount, date: p.source_date || "", notes: `${p.source_type}: ${p.source_detail || ""}`.trim(),
    });
    if (insertErr) { toast.error("Failed to add investor"); return; }
    await supabase.from("pending_investors").update({ status: "accepted" }).eq("id", p.id);
    setPending(prev => prev.filter(x => x.id !== p.id));
    await fetchRows();
    toast.success(`${p.investor_name} added to your cap table`);
  };

  const dismissPending = async (id: string) => {
    await supabase.from("pending_investors").update({ status: "dismissed" }).eq("id", id);
    setPending(prev => prev.filter(x => x.id !== id));
    toast("Investor dismissed");
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      if (!user) throw new Error("Not authenticated");
      const { data: analyses } = await supabase
        .from("company_analyses")
        .select("id, company_name, website_url")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (!analyses) { toast.error("No company profile found."); return; }
      const domain = analyses.website_url ? analyses.website_url.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : "";
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

  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

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
                <p className="text-[10px] text-muted-foreground">Capital raised, investor backing &amp; Exa discovery</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(isScanning || syncing) && (
                <Badge variant="secondary" className="text-[9px] px-2 py-0.5 bg-accent/10 text-accent border-accent/20 animate-pulse gap-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" /> Scanning...
                </Badge>
              )}
              {pendingQueue.length > 0 && (
                <Badge variant="secondary" className="text-[9px] px-2 py-0.5 bg-warning/10 text-warning border-warning/20 gap-1">
                  <Sparkles className="h-2.5 w-2.5" /> {pendingQueue.length} to review
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

            {/* ══ Funding Pulse Header with Area Chart ══ */}
            <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-accent/5 to-primary/10 p-5 overflow-hidden relative">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 relative">
                    <DollarSign className="h-6 w-6 text-primary" />
                    {(isScanning || syncing) && (
                      <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-accent animate-funding-pulse" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Funding Pulse</p>
                      <TrendingUp className="h-3 w-3 text-success" />
                    </div>
                    <p className="text-3xl font-bold text-foreground tracking-tighter font-mono">{fmt(animatedTotal)}</p>
                    {rows.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {verifiedRows.length} verified · {pendingQueue.length} pending
                      </p>
                    )}
                  </div>
                </div>
                {/* Area chart on the right */}
                <div className="flex-1 max-w-[280px] min-w-[160px]">
                  <FundingAreaChart rows={verifiedRows} />
                </div>
              </div>
              {/* Deep Search button */}
              <div className="flex justify-end mt-3">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={triggerSync} disabled={syncing || isScanning}>
                  {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {syncing ? "Exa Searching..." : "Deep Search"}
                </Button>
              </div>
            </div>

            {/* ══ Discovery Radar — while scanning with no results ══ */}
            {(isScanning || syncing) && rows.length === 0 && (
              <DiscoveryRadar logs={radarLogs} companyName={companyName} />
            )}

            {/* ══ Investor Discovery — DB Pending Cards ══ */}
            <InvestorDiscovery pending={pending} onConfirm={acceptPending} onIgnore={dismissPending} />

            {/* ══ AI Suggestions — Horizontal Carousel ══ */}
            {pendingQueue.length > 0 && !queueDismissed && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">AI Suggestions</h4>
                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-accent/10 text-accent border-accent/20">
                    {pendingQueue.length} pending
                  </Badge>
                </div>

                {/* Horizontal scroll track */}
                <div
                  ref={scrollRef}
                  className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-3"
                  style={{
                    scrollbarWidth: "thin",
                    scrollbarColor: "hsl(var(--border)) transparent",
                  }}
                >
                  {pendingQueue.map(row => (
                    <CompactSuggestionCard
                      key={row.id}
                      row={row}
                      onApprove={() => approveCard(row)}
                      onReject={() => rejectCard(row.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ══ Inbox Zero ══ */}
            {pendingQueue.length === 0 && queueDismissed && (
              <div className="flex items-center gap-2 py-3 px-4 rounded-lg bg-success/5 border border-success/20">
                <Inbox className="h-4 w-4 text-success" />
                <p className="text-xs font-medium text-success">Inbox Zero: All AI suggestions reviewed.</p>
              </div>
            )}

            {/* Mark queue as dismissed when it empties */}
            {pendingQueue.length === 0 && !queueDismissed && rows.some(r => r._verified) && extractedInvestors && extractedInvestors.length > 0 && (() => { setTimeout(() => setQueueDismissed(true), 500); return null; })()}

            {/* ══ Confirmed Backers — Compact List ══ */}
            {verifiedRows.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-success" />
                    <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Confirmed Backers</h4>
                    <span className="text-[10px] text-muted-foreground">({verifiedRows.length})</span>
                  </div>
                  {dirty && (
                    <Button size="sm" className="gap-1.5 h-7 text-[11px]" onClick={saveChanges} disabled={saving}>
                      <Save className="h-3 w-3" />
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  )}
                </div>
                <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
                  {verifiedRows.map(row => (
                    <VerifiedRow
                      key={row.id}
                      row={row}
                      onUpdate={updateCell}
                      onDelete={() => deleteRow(row.id, row._new)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {rows.length === 0 && !loading && !isScanning && !syncing && (
              <div className="text-center py-8">
                <Radio className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-xs text-muted-foreground">No investors yet.</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Add manually or run analysis to discover backers via Exa AI.</p>
              </div>
            )}

            {/* Add Investor */}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" />
              Add Investor
            </Button>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
