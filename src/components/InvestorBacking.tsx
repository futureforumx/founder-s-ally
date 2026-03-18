import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, DollarSign, CheckCircle2, Loader2, RefreshCw, ChevronDown, Landmark, FileText, Globe, Sparkles, Radio, TrendingUp, Check, ExternalLink, XCircle, MoreHorizontal, Pencil, Inbox } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InvestorDiscovery } from "./company-profile/InvestorDiscovery";
import { toast } from "sonner";

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

function faviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
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

// ── Interactive Funding Area Chart ──
function FundingAreaChart({ rows }: { rows: CapRow[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const sorted = useMemo(() => {
    return rows.filter(r => r.amount > 0 && r.date).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  if (sorted.length < 2) return null;

  const cumulative = sorted.reduce<{ date: string; total: number; label: string }[]>((acc, r) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].total : 0;
    acc.push({ date: r.date, total: prev + r.amount, label: r.investor_name });
    return acc;
  }, []);

  const maxVal = cumulative[cumulative.length - 1]?.total || 1;
  const width = 280;
  const height = 80;
  const padX = 0;
  const padY = 8;

  const points = cumulative.map((p, i) => {
    const x = padX + (i / (cumulative.length - 1)) * (width - padX * 2);
    const y = height - padY - ((p.total / maxVal) * (height - padY * 2));
    return { x, y, ...p };
  });

  const pathD = points.map((p, i) => {
    if (i === 0) return `M${p.x},${p.y}`;
    const prev = points[i - 1];
    const cpx = (prev.x + p.x) / 2;
    return `C${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`;
  }).join(" ");

  const areaD = `${pathD} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;

  return (
    <div className="w-full max-w-[280px] relative">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-20">
        <defs>
          <linearGradient id="colorFunding" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#colorFunding)" />
        <path d={pathD} fill="none" stroke="hsl(var(--accent))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="8" fill="transparent" className="cursor-pointer" onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} />
            <circle cx={p.x} cy={p.y} r={hoverIdx === i ? 4 : 2.5} fill={hoverIdx === i ? "hsl(var(--accent))" : "hsl(var(--background))"} stroke="hsl(var(--accent))" strokeWidth="1.5" className="transition-all duration-150" />
          </g>
        ))}
      </svg>
      {hoverIdx !== null && points[hoverIdx] && (
        <div
          className="absolute -top-10 px-2.5 py-1.5 rounded-lg bg-foreground text-background text-[10px] font-mono shadow-lg pointer-events-none whitespace-nowrap z-10"
          style={{ left: `${(points[hoverIdx].x / width) * 100}%`, transform: "translateX(-50%)" }}
        >
          <span className="font-semibold">{fmt(points[hoverIdx].total)}</span>
          <span className="text-background/60 ml-1">· {points[hoverIdx].label}</span>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-foreground" />
        </div>
      )}
    </div>
  );
}

// ── Focus Review Card (Large, single card in carousel) ──
function FocusReviewCard({
  row,
  onApprove,
  onReject,
  swipeDirection,
}: {
  row: CapRow;
  onApprove: () => void;
  onReject: () => void;
  swipeDirection: "left" | "right" | null;
}) {
  const instrumentColor = INSTRUMENT_COLORS[row.instrument] || "bg-muted text-muted-foreground";
  const logoSrc = row._domain ? faviconUrl(row._domain) : fallbackLogoUrl(row.investor_name);

  const animClass = swipeDirection === "right"
    ? "animate-swipe-out-right"
    : swipeDirection === "left"
    ? "animate-swipe-out-left"
    : "animate-slide-in-from-right";

  return (
    <div className={`relative rounded-2xl border border-accent/20 bg-gradient-to-br from-card via-card to-accent/5 p-6 shadow-surface-lg ${animClass}`}>
      {/* Accent glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl -translate-y-8 translate-x-8 pointer-events-none" />

      <div className="flex items-start gap-4 relative">
        {/* Logo */}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 shrink-0 overflow-hidden border border-border">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="h-9 w-9 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : null}
          <Landmark className="h-6 w-6 text-muted-foreground hidden" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-bold text-foreground">{row.investor_name || "Unknown Investor"}</h4>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{row.entity_type}</Badge>
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 border ${instrumentColor}`}>{row.instrument}</Badge>
            <Badge variant="secondary" className="text-[10px] px-2 py-0.5 gap-0.5 bg-accent/10 text-accent border-accent/20">
              <Sparkles className="h-2.5 w-2.5" /> AI Sourced
            </Badge>
          </div>

          {/* Highlight */}
          {row._highlight && (
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed italic border-l-2 border-accent/30 pl-3">
              "{row._highlight}"
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-3">
            {row.date && <span className="text-[11px] text-muted-foreground font-mono">{row.date}</span>}
            {row._sourceUrl && (
              <a href={row._sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[11px] text-accent hover:text-accent/80 transition-colors">
                <ExternalLink className="h-3 w-3" /> Source
              </a>
            )}
          </div>
        </div>

        {/* Amount */}
        <div className="text-right shrink-0">
          {row.amount > 0 ? (
            <span className="text-2xl font-bold text-foreground font-mono">{fmt(row.amount)}</span>
          ) : (
            <span className="text-sm text-muted-foreground/50 italic">Amount TBD</span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-border/50">
        <button
          onClick={onReject}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-destructive/5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200 text-sm font-medium"
        >
          <XCircle className="h-4 w-4" /> Reject
        </button>
        <button
          onClick={onApprove}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-success/10 text-success hover:bg-success/20 transition-all duration-200 text-sm font-semibold shadow-sm"
        >
          <CheckCircle2 className="h-4 w-4" /> Approve
        </button>
      </div>
    </div>
  );
}

// ── Compact Verified Row ──
function VerifiedRow({ row, onEdit, onDelete }: { row: CapRow; onEdit: () => void; onDelete: () => void }) {
  const instrumentColor = INSTRUMENT_COLORS[row.instrument] || "bg-muted text-muted-foreground";
  const logoSrc = row._domain ? faviconUrl(row._domain) : fallbackLogoUrl(row.investor_name);

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors group animate-drop-in">
      {/* Logo */}
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 shrink-0 overflow-hidden border border-border">
        {logoSrc ? (
          <img src={logoSrc} alt="" className="h-5 w-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : null}
        <Landmark className="h-4 w-4 text-muted-foreground hidden" />
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground truncate block">{row.investor_name}</span>
      </div>

      {/* Tags */}
      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border ${instrumentColor} hidden sm:inline-flex`}>{row.instrument}</Badge>
      {row.date && <span className="text-[10px] text-muted-foreground font-mono hidden md:block">{row.date}</span>}

      {/* Amount */}
      <span className="text-sm font-bold text-foreground font-mono min-w-[70px] text-right">{row.amount > 0 ? fmt(row.amount) : "—"}</span>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 opacity-0 group-hover:opacity-100 transition-all">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem onClick={onEdit} className="gap-2 text-xs">
            <Pencil className="h-3 w-3" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="gap-2 text-xs text-destructive">
            <Trash2 className="h-3 w-3" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}


export function InvestorBacking({ extractedInvestors, isScanning = false, companyName }: InvestorBackingProps) {
  const [rows, setRows] = useState<CapRow[]>([]);
  const [original, setOriginal] = useState<CapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingInvestor[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [radarLogs, setRadarLogs] = useState<string[]>([]);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const [queueDismissed, setQueueDismissed] = useState(false);

  const dirty = useMemo(() => JSON.stringify(rows) !== JSON.stringify(original), [rows, original]);

  // Split rows into pending queue and verified list
  const pendingQueue = useMemo(() => rows.filter(r => r._source && !r._verified), [rows]);
  const verifiedRows = useMemo(() => rows.filter(r => !r._source || r._verified), [rows]);

  const totalRaised = useMemo(() => verifiedRows.reduce((s, r) => s + (r.amount || 0), 0) + pendingQueue.reduce((s, r) => s + (r.amount || 0), 0), [verifiedRows, pendingQueue]);
  const animatedTotal = useCountUp(totalRaised);

  // Current focus card index
  const [focusIndex, setFocusIndex] = useState(0);
  const currentPending = pendingQueue[focusIndex] || null;

  // Reset focus when queue changes
  useEffect(() => {
    if (focusIndex >= pendingQueue.length) {
      setFocusIndex(Math.max(0, pendingQueue.length - 1));
    }
  }, [pendingQueue.length, focusIndex]);

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
      _verified: true,
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

  // ── Approve: swipe right, persist to cap_table ──
  const approveCurrentCard = async () => {
    if (!currentPending) return;
    setSwipeDirection("right");
    setTimeout(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { error } = await supabase.from("cap_table").insert({
          id: currentPending.id,
          user_id: user.id,
          investor_name: currentPending.investor_name,
          entity_type: currentPending.entity_type,
          instrument: currentPending.instrument,
          amount: currentPending.amount,
          date: currentPending.date || null,
          notes: currentPending._highlight || null,
        });
        if (error) throw error;
        setRows(prev => prev.map(r => r.id === currentPending.id ? { ...r, _verified: true, _new: false, _source: undefined } : r));
        setOriginal(prev => [...prev, { ...currentPending, _verified: true, _new: false, _source: undefined }]);
        toast.success(`${currentPending.investor_name} added to cap table`);
      } catch (e: any) {
        toast.error(e.message || "Failed to save");
      }
      setSwipeDirection(null);
    }, 400);
  };

  // ── Reject: swipe left, remove from UI ──
  const rejectCurrentCard = () => {
    if (!currentPending) return;
    setSwipeDirection("left");
    setTimeout(() => {
      setRows(prev => prev.filter(r => r.id !== currentPending.id));
      setSwipeDirection(null);
      toast("Investor rejected");
    }, 400);
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
      const { data: { user } } = await supabase.auth.getUser();
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
                        {verifiedRows.length} verified · {pendingQueue.length} pending
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <FundingAreaChart rows={verifiedRows} />
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={triggerSync} disabled={syncing || isScanning}>
                    {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {syncing ? "Exa Searching..." : "Deep Search"}
                  </Button>
                </div>
              </div>
            </div>

            {/* ══ Discovery Radar — while scanning with no results ══ */}
            {(isScanning || syncing) && rows.length === 0 && (
              <DiscoveryRadar logs={radarLogs} companyName={companyName} />
            )}

            {/* ══ Investor Discovery — DB Pending Cards ══ */}
            <InvestorDiscovery pending={pending} onConfirm={acceptPending} onIgnore={dismissPending} />

            {/* ══ AI Review Queue — Focus Carousel ══ */}
            {pendingQueue.length > 0 && !queueDismissed && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">AI Suggestions</h4>
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-accent/10 text-accent border-accent/20">
                      {pendingQueue.length} pending review
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {Math.min(focusIndex + 1, pendingQueue.length)} / {pendingQueue.length}
                  </span>
                </div>

                {/* Focus Card */}
                {currentPending && (
                  <FocusReviewCard
                    key={currentPending.id}
                    row={currentPending}
                    onApprove={approveCurrentCard}
                    onReject={rejectCurrentCard}
                    swipeDirection={swipeDirection}
                  />
                )}

                {/* Peek indicator for next card */}
                {pendingQueue.length > 1 && focusIndex < pendingQueue.length - 1 && (
                  <div className="flex justify-center gap-1.5 pt-1">
                    {pendingQueue.map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          i === focusIndex ? "w-6 bg-accent" : i < focusIndex ? "w-1.5 bg-success/40" : "w-1.5 bg-muted-foreground/20"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══ Inbox Zero ══ */}
            {pendingQueue.length === 0 && queueDismissed && (
              <div className="flex items-center gap-2 py-3 px-4 rounded-lg bg-success/5 border border-success/20 animate-fade-in">
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
                      onEdit={() => {
                        const newName = prompt("Investor name:", row.investor_name);
                        if (newName !== null) updateCell(row.id, "investor_name", newName);
                      }}
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
