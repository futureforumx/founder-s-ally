/**
 * AdminFreshCapital
 *
 * Browse and full-edit fi_deals_canonical records.
 * Click any row to open a slide-in edit panel with all fields.
 * All reads + writes go through the admin-market-intel edge function (entity=deals).
 */

import { useState, useEffect, useCallback } from "react";
import {
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  AlertCircle, ExternalLink, CheckCircle2, XCircle, Flag, X, Save,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabaseBearerForFunctions } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;
const COL = "2fr 1fr 1fr 1fr 1.5fr 0.7fr 0.6fr 0.6fr 0.5fr";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const ROUND_TYPES = ["pre_seed","seed","series_a","series_b","series_c","growth","debt","grant","other"];

// ── Types ──────────────────────────────────────────────────────────────────────

type DealRow = {
  id: string;
  company_name: string;
  company_domain: string | null;
  company_logo_url: string | null;
  sector_normalized: string | null;
  round_type_normalized: string | null;
  amount_minor_units: number | null;
  currency: string;
  announced_date: string | null;
  lead_investor_normalized: string | null;
  co_investors: string[] | null;
  extracted_summary: string | null;
  needs_review: boolean;
  review_reason: string | null;
  is_rumor: boolean;
  confidence_score: number;
  source_count: number;
  primary_source_url: string | null;
  primary_press_url: string | null;
  created_at: string;
  updated_at: string | null;
};

// ── Auth helper ────────────────────────────────────────────────────────────────

async function adminHeaders(): Promise<Record<string, string>> {
  const jwt = await getSupabaseBearerForFunctions();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SUPABASE_ANON_KEY ?? ""}`,
    "X-User-Auth": jwt ?? "",
  };
}

// ── API ────────────────────────────────────────────────────────────────────────

async function fetchDeals(opts: {
  page: number;
  search: string;
  needsReview: string;
  roundType: string;
}): Promise<{ rows: DealRow[]; total: number; error?: string }> {
  if (!SUPABASE_URL) return { rows: [], total: 0, error: "SUPABASE_URL not set" };
  const params = new URLSearchParams({
    entity: "deals",
    page:   String(opts.page),
    limit:  String(PAGE_SIZE),
  });
  if (opts.search)      params.set("search",       opts.search);
  if (opts.needsReview && opts.needsReview !== "all") params.set("needs_review", opts.needsReview);
  if (opts.roundType   && opts.roundType   !== "all") params.set("round_type",   opts.roundType);

  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-market-intel?${params}`,
      { headers: await adminHeaders() },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { rows: [], total: 0, error: json.error ?? `HTTP ${res.status}` };
    return { rows: json.rows ?? [], total: json.total ?? 0 };
  } catch (e: unknown) {
    return { rows: [], total: 0, error: String(e) };
  }
}

async function patchDeal(id: string, patch: Record<string, unknown>): Promise<{ row?: DealRow; error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=deals&id=${encodeURIComponent(id)}`,
      { method: "PATCH", headers: await adminHeaders(), body: JSON.stringify(patch) },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { row: json.row };
  } catch (e: unknown) {
    return { error: String(e) };
  }
}

// ── Shared field-component styles ──────────────────────────────────────────────

const IC = "w-full rounded px-3 py-1.5 text-[12px] text-white/80 focus:outline-none transition-colors";
const IS: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" };
const IF: React.CSSProperties = { ...IS, borderColor: "rgba(46,230,166,0.4)" };

function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function TF({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string | null; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <FL label={label}>
      <input
        className={IC} style={IS} type={type} placeholder={placeholder}
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        onFocus={e => Object.assign(e.currentTarget.style, IF)}
        onBlur={e  => Object.assign(e.currentTarget.style, IS)}
      />
    </FL>
  );
}

function NF({ label, value, onChange, step = 1 }: {
  label: string; value: number | null; onChange: (v: number | null) => void; step?: number;
}) {
  return (
    <FL label={label}>
      <input
        className={IC} style={IS} type="number" step={step}
        value={value ?? ""}
        onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
        onFocus={e => Object.assign(e.currentTarget.style, IF)}
        onBlur={e  => Object.assign(e.currentTarget.style, IS)}
      />
    </FL>
  );
}

function TA({ label, value, onChange, rows = 3 }: {
  label: string; value: string | null; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <FL label={label}>
      <textarea
        className={IC} style={{ ...IS, resize: "vertical" }} rows={rows}
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        onFocus={e => Object.assign(e.currentTarget.style, { ...IF, resize: "vertical" })}
        onBlur={e  => Object.assign(e.currentTarget.style, { ...IS, resize: "vertical" })}
      />
    </FL>
  );
}

function BF({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <FL label={label}>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="flex items-center gap-2 rounded px-3 py-1.5 text-[12px] font-medium transition-colors"
        style={{
          background: value ? "rgba(46,230,166,0.12)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${value ? "rgba(46,230,166,0.35)" : "rgba(255,255,255,0.09)"}`,
          color: value ? "#2EE6A6" : "rgba(255,255,255,0.45)",
        }}
      >
        {value ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        {value ? "Yes" : "No"}
      </button>
    </FL>
  );
}

function SFld({ label, value, onChange, options }: {
  label: string; value: string | null; onChange: (v: string) => void; options: string[];
}) {
  return (
    <FL label={label}>
      <select
        className={IC} style={IS}
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        onFocus={e => Object.assign(e.currentTarget.style, IF)}
        onBlur={e  => Object.assign(e.currentTarget.style, IS)}
      >
        <option value="">— none —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </FL>
  );
}

function TagF({ label, value, onChange }: { label: string; value: string[] | null; onChange: (v: string[]) => void }) {
  const str = (value ?? []).join(", ");
  return (
    <FL label={`${label} (comma-separated)`}>
      <input
        className={IC} style={IS}
        value={str}
        onChange={e => onChange(e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
        onFocus={e => Object.assign(e.currentTarget.style, IF)}
        onBlur={e  => Object.assign(e.currentTarget.style, IS)}
      />
    </FL>
  );
}

function Sect({ title }: { title: string }) {
  return (
    <div className="mt-4 mb-1">
      <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#2EE6A6" }}>{title}</span>
      <div className="mt-1 h-px" style={{ background: "rgba(46,230,166,0.15)" }} />
    </div>
  );
}

// ── Edit Panel ─────────────────────────────────────────────────────────────────

function DealEditPanel({
  row,
  onClose,
  onSaved,
}: {
  row: DealRow;
  onClose: () => void;
  onSaved: (updated: DealRow) => void;
}) {
  const [draft, setDraft] = useState<DealRow>({ ...row });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof DealRow>(k: K, v: DealRow[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  // Amount display: stored as minor units (cents), show as dollars
  const amountDollars = draft.amount_minor_units != null ? draft.amount_minor_units / 100 : null;
  const setAmountDollars = (v: number | null) => set("amount_minor_units", v != null ? Math.round(v * 100) : null);

  // Confidence display: stored as 0-1, show as 0-100
  const confidencePct = draft.confidence_score != null ? Math.round(draft.confidence_score * 100) : 0;
  const setConfidencePct = (v: number | null) => set("confidence_score", v != null ? v / 100 : 0);

  const handleSave = async () => {
    setSaving(true);
    const { id, created_at, updated_at, company_logo_url, source_count, primary_source_url, primary_press_url, ...rest } = draft;
    const { row: updated, error } = await patchDeal(row.id, rest);
    setSaving(false);
    if (error || !updated) {
      toast.error(`Save failed: ${error ?? "no data returned"}`);
      return;
    }
    toast.success("Deal saved");
    onSaved(updated);
  };

  return (
    <div
      style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: 440,
        zIndex: 50, background: "#0c0c0c",
        borderLeft: "1px solid rgba(255,255,255,0.07)",
        display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.6)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div>
          <p className="text-[11px] font-mono uppercase tracking-widest" style={{ color: "#2EE6A6" }}>Edit Deal</p>
          <p className="text-[13px] font-semibold text-white/80 mt-0.5 truncate max-w-[320px]">{row.company_name}</p>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/05 transition-colors">
          <X className="h-4 w-4" style={{ color: "rgba(255,255,255,0.4)" }} />
        </button>
      </div>

      {/* Scrollable fields */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">

        <Sect title="Company" />
        <TF label="Company Name" value={draft.company_name} onChange={v => set("company_name", v)} />
        <TF label="Company Domain" value={draft.company_domain} onChange={v => set("company_domain", v)} placeholder="example.com" />
        <TF label="Sector" value={draft.sector_normalized} onChange={v => set("sector_normalized", v)} />

        <Sect title="Round Details" />
        <SFld
          label="Round Type"
          value={draft.round_type_normalized}
          onChange={v => set("round_type_normalized", v)}
          options={ROUND_TYPES}
        />
        <div className="grid grid-cols-2 gap-3">
          <NF label="Amount (USD)" value={amountDollars} onChange={setAmountDollars} step={1000} />
          <TF label="Currency" value={draft.currency} onChange={v => set("currency", v)} />
        </div>
        <TF label="Announced Date" value={draft.announced_date} onChange={v => set("announced_date", v)} type="date" />

        <Sect title="Investors" />
        <TF label="Lead Investor" value={draft.lead_investor_normalized} onChange={v => set("lead_investor_normalized", v)} />
        <TagF label="Co-Investors" value={draft.co_investors} onChange={v => set("co_investors", v)} />

        <Sect title="Summary" />
        <TA label="Extracted Summary" value={draft.extracted_summary} onChange={v => set("extracted_summary", v)} rows={5} />

        <Sect title="Review & Quality" />
        <BF label="Needs Review" value={draft.needs_review} onChange={v => set("needs_review", v)} />
        <TA label="Review Reason" value={draft.review_reason} onChange={v => set("review_reason", v)} rows={2} />
        <BF label="Is Rumor" value={draft.is_rumor} onChange={v => set("is_rumor", v)} />
        <NF label="Confidence Score (0–100)" value={confidencePct} onChange={setConfidencePct} step={1} />

      </div>

      {/* Footer */}
      <div
        className="flex items-center gap-3 px-5 py-4 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-[12px] font-semibold transition-colors"
          style={{ background: "#2EE6A6", color: "#050505" }}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-4 py-2 text-[12px] font-medium transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtAmount(minor: number | null, currency = "USD"): string {
  if (minor == null) return "—";
  const amount = minor / 100;
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000)     return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000)         return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const HDR: React.CSSProperties = {
  fontSize: 10, fontFamily: "monospace", letterSpacing: "0.15em",
  textTransform: "uppercase", color: "rgba(255,255,255,0.3)", padding: "6px 12px",
};
const CELL: React.CSSProperties = { padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.75)" };

// ── Main Component ─────────────────────────────────────────────────────────────

export function AdminFreshCapital() {
  const [rows,       setRows]       = useState<DealRow[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(0);
  const [search,     setSearch]     = useState("");
  const [needsReview,setNeedsReview]= useState("all");
  const [roundFilter,setRoundFilter]= useState("all");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [selected,   setSelected]   = useState<DealRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { rows: r, total: t, error: e } = await fetchDeals({
      page, search, needsReview, roundType: roundFilter,
    });
    setLoading(false);
    if (e) { setError(e); return; }
    setRows(r);
    setTotal(t);
  }, [page, search, needsReview, roundFilter]);

  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSaved = (updated: DealRow) => {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
    setSelected(updated);
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white/90">Fresh Capital Feed</h1>
          <p className="mt-0.5 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Raw funding intelligence from fi_deals_canonical — click any row to edit.
          </p>
        </div>
        <button
          onClick={() => { setPage(0); void load(); }}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input
            placeholder="Search company or investor…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 text-[12px] h-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)" }}
          />
        </div>
        <Select value={needsReview} onValueChange={v => { setNeedsReview(v); setPage(0); }}>
          <SelectTrigger className="w-[150px] h-8 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Records</SelectItem>
            <SelectItem value="true">Needs Review</SelectItem>
            <SelectItem value="false">Reviewed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roundFilter} onValueChange={v => { setRoundFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[150px] h-8 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Rounds</SelectItem>
            {ROUND_TYPES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4">
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          {total.toLocaleString()} deals total
        </span>
        {needsReview === "true" && (
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "#f59e0b" }}>
            <Flag className="h-3 w-3" />
            Showing flagged only
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border px-4 py-3"
          style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)" }}>
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />
          <span className="text-[12px]" style={{ color: "#ef4444" }}>{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: COL, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {["Company","Sector","Round","Amount","Lead Investor","Date","Review","Rumor","Conf"].map(h => (
            <div key={h} style={HDR}>{h}</div>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
          </div>
        )}

        {!loading && rows.length === 0 && !error && (
          <div className="flex items-center justify-center py-16 text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            No deals found
          </div>
        )}

        {!loading && rows.map(row => {
          const isSelected = selected?.id === row.id;
          return (
            <div
              key={row.id}
              onClick={() => setSelected(isSelected ? null : row)}
              style={{
                display: "grid", gridTemplateColumns: COL,
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                cursor: "pointer",
                background: isSelected ? "rgba(46,230,166,0.06)" : undefined,
                transition: "background 0.15s",
              }}
              className="hover:bg-white/[0.02]"
            >
              <div style={CELL}>
                <div className="font-medium truncate">{row.company_name}</div>
                {row.company_domain && (
                  <div className="text-[10px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {row.company_domain}
                  </div>
                )}
              </div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.5)" }}>{row.sector_normalized ?? "—"}</div>
              <div style={CELL}>
                {row.round_type_normalized ? (
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-mono"
                    style={{ background: "rgba(46,230,166,0.1)", color: "#2EE6A6" }}>
                    {row.round_type_normalized}
                  </span>
                ) : "—"}
              </div>
              <div style={{ ...CELL, fontFamily: "monospace" }}>{fmtAmount(row.amount_minor_units, row.currency)}</div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.6)" }} className="truncate">
                {row.lead_investor_normalized ?? "—"}
              </div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{fmtDate(row.announced_date)}</div>
              <div style={CELL} className="flex items-center">
                {row.needs_review
                  ? <Flag className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} />
                  : <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.2)" }} />}
              </div>
              <div style={CELL} className="flex items-center">
                {row.is_rumor
                  ? <AlertCircle className="h-3.5 w-3.5" style={{ color: "#f87171" }} />
                  : <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>—</span>}
              </div>
              <div style={{ ...CELL, fontFamily: "monospace", fontSize: 11 }}>
                {Math.round(row.confidence_score * 100)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          Page {page + 1} of {Math.max(1, totalPages)}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 rounded border px-2.5 py-1.5 text-[11px] transition-colors disabled:opacity-30"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 rounded border px-2.5 py-1.5 text-[11px] transition-colors disabled:opacity-30"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Slide-in edit panel */}
      {selected && (
        <DealEditPanel
          row={selected}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
