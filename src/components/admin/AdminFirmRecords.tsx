import { useState, useEffect, useCallback } from "react";
import {
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  AlertCircle, Building2, ExternalLink, X, CheckCircle2, XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabaseBearerForFunctions } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;
const COL = "2.5fr 1fr 1.5fr 1.5fr 0.8fr 0.8fr 0.7fr 0.7fr";
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// ── Types ──────────────────────────────────────────────────────────────────────

type FirmRow = {
  id: string; firm_name: string; slug: string | null;
  tagline: string | null; elevator_pitch: string | null; description: string | null;
  hq_city: string | null; hq_state: string | null; hq_country: string | null;
  website_url: string | null; logo_url: string | null; linkedin_url: string | null;
  email: string | null; phone: string | null;
  aum_usd: number | null; founded_year: number | null;
  current_fund_name: string | null; lead_or_follow: string | null;
  stage_focus: string[] | null; thesis_verticals: string[] | null;
  enrichment_status: string; completeness_score: number;
  needs_review: boolean; ready_for_live: boolean;
  manual_review_status: string | null; updated_at: string | null;
};

// ── API ────────────────────────────────────────────────────────────────────────

async function adminHeaders(): Promise<Record<string, string>> {
  const tok = await getSupabaseBearerForFunctions();
  const anon = SUPABASE_ANON_KEY ?? "";
  const h: Record<string, string> = { Authorization: `Bearer ${anon}`, "Content-Type": "application/json" };
  if (tok && tok !== anon) h["X-User-Auth"] = `Bearer ${tok}`;
  return h;
}

async function fetchFirms(params: Record<string, string>): Promise<{ rows: FirmRow[]; total: number; error?: string }> {
  if (!SUPABASE_URL) return { rows: [], total: 0, error: "Supabase not configured" };
  const qs = new URLSearchParams({ ...params, entity: "firms" }).toString();
  try {
    const res  = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${qs}`, { headers: await adminHeaders() });
    const json = await res.json().catch(() => ({})) as { rows?: FirmRow[]; total?: number; error?: string };
    if (!res.ok) return { rows: [], total: 0, error: json.error ?? `HTTP ${res.status}` };
    return { rows: json.rows ?? [], total: json.total ?? 0 };
  } catch (e: unknown) { return { rows: [], total: 0, error: (e as Error)?.message }; }
}

async function patchFirm(id: string, patch: Record<string, unknown>): Promise<{ row?: FirmRow; error?: string }> {
  if (!SUPABASE_URL) return { error: "Supabase not configured" };
  const url = `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=firms&id=${encodeURIComponent(id)}`;
  try {
    const res  = await fetch(url, { method: "PATCH", headers: await adminHeaders(), body: JSON.stringify(patch) });
    const json = await res.json().catch(() => ({})) as { row?: FirmRow; error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { row: json.row };
  } catch (e: unknown) { return { error: (e as Error)?.message }; }
}

// ── Shared edit-panel helpers ──────────────────────────────────────────────────

const IC = "w-full rounded px-3 py-1.5 text-[12px] text-white/80 focus:outline-none transition-colors";
const IS = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" } as const;
const IF = { ...IS, borderColor: "rgba(46,230,166,0.4)" } as const;

function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</label>
      {children}
    </div>
  );
}
function TF({ label, value, onChange, type = "text", placeholder }: { label: string; value: string | null | undefined; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return <FL label={label}><input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={IC} style={IS} onFocus={e => Object.assign(e.target.style, IF)} onBlur={e => Object.assign(e.target.style, IS)} /></FL>;
}
function NF({ label, value, onChange, placeholder }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string }) {
  return <FL label={label}><input type="number" value={value ?? ""} onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))} placeholder={placeholder} className={IC} style={IS} onFocus={e => Object.assign(e.target.style, IF)} onBlur={e => Object.assign(e.target.style, IS)} /></FL>;
}
function TA({ label, value, onChange, rows = 3 }: { label: string; value: string | null | undefined; onChange: (v: string) => void; rows?: number }) {
  return <FL label={label}><textarea value={value ?? ""} onChange={e => onChange(e.target.value)} rows={rows} className={`${IC} resize-none`} style={IS} onFocus={e => Object.assign(e.target.style, IF)} onBlur={e => Object.assign(e.target.style, IS)} /></FL>;
}
function BF({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (v: boolean) => void }) {
  const on = value === true;
  return (
    <FL label={label}>
      <button onClick={() => onChange(!on)} className="flex items-center gap-2 rounded px-3 py-1.5 text-[12px] transition-colors w-full" style={{ background: on ? "rgba(46,230,166,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${on ? "rgba(46,230,166,0.3)" : "rgba(255,255,255,0.08)"}`, color: on ? "#2EE6A6" : "rgba(255,255,255,0.4)" }}>
        {on ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        {on ? "Yes" : "No"}
      </button>
    </FL>
  );
}
function SF({ label, value, onChange, options }: { label: string; value: string | null | undefined; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <FL label={label}>
      <select value={value ?? ""} onChange={e => onChange(e.target.value)} className={IC} style={IS}>
        <option value="">— not set —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FL>
  );
}
function TagF({ label, value, onChange }: { label: string; value: string[] | null | undefined; onChange: (v: string[]) => void }) {
  return <FL label={`${label} (comma-separated)`}><input type="text" value={(value ?? []).join(", ")} onChange={e => onChange(e.target.value.split(",").map(s => s.trim()).filter(Boolean))} className={IC} style={IS} onFocus={e => Object.assign(e.target.style, IF)} onBlur={e => Object.assign(e.target.style, IS)} /></FL>;
}
function Sect({ title }: { title: string }) {
  return <div className="pt-1"><p className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: "#2EE6A6" }}>{title}</p><div className="h-px mb-3" style={{ background: "rgba(46,230,166,0.15)" }} /></div>;
}

function fmtAum(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}
function scoreColor(n: number): string {
  return n >= 70 ? "#2EE6A6" : n >= 40 ? "#f59e0b" : "#ef4444";
}
function enrichColor(s: string): string {
  return s === "enriched" ? "#2EE6A6" : s === "partial" ? "#f59e0b" : s === "failed" ? "#ef4444" : "rgba(255,255,255,0.3)";
}
function TagChips({ items, max = 3 }: { items: string[] | null | undefined; max?: number }) {
  if (!items?.length) return <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>;
  const rest = items.length - max;
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, max).map(t => <span key={t} className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase" style={{ background: "rgba(46,230,166,0.08)", color: "#2EE6A6" }}>{t}</span>)}
      {rest > 0 && <span className="font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>+{rest}</span>}
    </div>
  );
}

// ── Edit panel ─────────────────────────────────────────────────────────────────

function FirmEditPanel({ row, onClose, onSaved }: { row: FirmRow; onClose: () => void; onSaved: (r: FirmRow) => void }) {
  const [draft, setDraft] = useState<FirmRow>({ ...row });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FirmRow>(k: K) { return (v: FirmRow[K]) => setDraft(d => ({ ...d, [k]: v })); }

  const handleSave = async () => {
    setSaving(true);
    const { id, created_at, deleted_at, sector_embedding, updated_at, ...patch } = draft as FirmRow & { created_at?: unknown; deleted_at?: unknown; sector_embedding?: unknown };
    const { row: updated, error } = await patchFirm(row.id, patch as Record<string, unknown>);
    if (error) { toast.error("Save failed", { description: error }); }
    else { toast.success("Saved"); if (updated) onSaved(updated); }
    setSaving(false);
  };

  return (
    <div className="fixed right-0 top-0 bottom-0 z-50 flex flex-col" style={{ width: 420, background: "#0c0c0c", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
      {/* header */}
      <div className="flex items-center gap-3 px-5 py-3.5 shrink-0 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        {draft.logo_url && <img src={draft.logo_url} alt="" className="h-5 w-5 rounded object-contain shrink-0" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
        <span className="flex-1 truncate text-[13px] font-semibold text-white/90">{draft.firm_name || "Firm Record"}</span>
        <button onClick={onClose} className="opacity-40 hover:opacity-80 transition-opacity"><X className="h-4 w-4" /></button>
      </div>
      {/* body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
        <Sect title="Basic Info" />
        <TF label="Firm Name" value={draft.firm_name} onChange={set("firm_name")} />
        <TF label="Tagline" value={draft.tagline} onChange={set("tagline")} />
        <TA label="Elevator Pitch" value={draft.elevator_pitch} onChange={set("elevator_pitch")} rows={3} />
        <TA label="Description" value={draft.description} onChange={set("description")} rows={3} />

        <Sect title="Contact & Web" />
        <TF label="Website URL" value={draft.website_url} onChange={set("website_url")} type="url" />
        <TF label="LinkedIn URL" value={draft.linkedin_url} onChange={set("linkedin_url")} type="url" />
        <TF label="Email" value={draft.email} onChange={set("email")} type="email" />
        <TF label="Phone" value={draft.phone} onChange={set("phone")} />

        <Sect title="Location" />
        <div className="grid grid-cols-3 gap-2">
          <TF label="City" value={draft.hq_city} onChange={set("hq_city")} />
          <TF label="State" value={draft.hq_state} onChange={set("hq_state")} />
          <TF label="Country" value={draft.hq_country} onChange={set("hq_country")} />
        </div>

        <Sect title="Investment Profile" />
        <NF label="AUM (USD)" value={draft.aum_usd} onChange={set("aum_usd")} placeholder="e.g. 500000000" />
        <NF label="Founded Year" value={draft.founded_year} onChange={set("founded_year")} placeholder="e.g. 2012" />
        <TF label="Current Fund Name" value={draft.current_fund_name} onChange={set("current_fund_name")} />
        <SF label="Lead or Follow" value={draft.lead_or_follow} onChange={set("lead_or_follow")} options={[
          { value: "lead", label: "Lead" },
          { value: "follow", label: "Follow" },
          { value: "either", label: "Either" },
        ]} />
        <TagF label="Stage Focus" value={draft.stage_focus} onChange={set("stage_focus")} />
        <TagF label="Thesis Verticals" value={draft.thesis_verticals} onChange={set("thesis_verticals")} />

        <Sect title="Admin Status" />
        <SF label="Enrichment Status" value={draft.enrichment_status} onChange={set("enrichment_status")} options={[
          { value: "enriched", label: "Enriched" },
          { value: "partial", label: "Partial" },
          { value: "pending", label: "Pending" },
          { value: "failed", label: "Failed" },
        ]} />
        <TF label="Manual Review Status" value={draft.manual_review_status} onChange={set("manual_review_status")} />
        <div className="grid grid-cols-2 gap-3">
          <BF label="Needs Review" value={draft.needs_review} onChange={set("needs_review")} />
          <BF label="Ready for Live" value={draft.ready_for_live} onChange={set("ready_for_live")} />
        </div>
      </div>
      {/* footer */}
      <div className="flex gap-2 px-5 py-3.5 shrink-0 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <button onClick={handleSave} disabled={saving} className="flex-1 rounded py-2 text-[12px] font-semibold disabled:opacity-50 transition-opacity flex items-center justify-center gap-2" style={{ background: "#2EE6A6", color: "#000" }}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button onClick={onClose} className="rounded px-4 py-2 text-[12px]" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AdminFirmRecords() {
  const [rows, setRows]           = useState<FirmRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [dSearch, setDSearch]     = useState("");
  const [filterEnrich, setFilterEnrich] = useState("all");
  const [filterReview, setFilterReview] = useState("all");
  const [filterLive, setFilterLive]     = useState("all");
  const [page, setPage]           = useState(0);
  const [selected, setSelected]   = useState<FirmRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDSearch(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadRows = useCallback(async () => {
    setLoading(true); setError(null);
    const params: Record<string, string> = { limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) };
    if (dSearch)               params.search         = dSearch;
    if (filterEnrich !== "all") params.enrichment    = filterEnrich;
    if (filterReview === "yes") params.needs_review  = "true";
    if (filterReview === "no")  params.needs_review  = "false";
    if (filterLive   === "yes") params.ready_for_live = "true";
    if (filterLive   === "no")  params.ready_for_live = "false";
    const { rows: data, total: cnt, error: e } = await fetchFirms(params);
    if (e) setError(e); else { setRows(data); setTotal(cnt); }
    setLoading(false);
  }, [dSearch, filterEnrich, filterReview, filterLive, page]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const handleSaved = (updated: FirmRow) => {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
    setSelected(updated);
  };

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white/90">Firm Records</h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>Click any row to view and edit all fields</p>
        </div>
        <Building2 className="h-5 w-5 shrink-0 mt-1" style={{ color: "#2EE6A6" }} />
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input placeholder="Search firms…" value={search} onChange={e => setSearch(e.target.value)}
            className="h-8 pl-8 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }} />
        </div>
        <Select value={filterEnrich} onValueChange={v => { setFilterEnrich(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-36 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All enrichment</SelectItem>
            <SelectItem value="enriched">Enriched</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterReview} onValueChange={v => { setFilterReview(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-36 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any review</SelectItem>
            <SelectItem value="yes">Needs review</SelectItem>
            <SelectItem value="no">Reviewed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterLive} onValueChange={v => { setFilterLive(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-28 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any live</SelectItem>
            <SelectItem value="yes">Live</SelectItem>
            <SelectItem value="no">Not live</SelectItem>
          </SelectContent>
        </Select>
        <button onClick={loadRows} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px]" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
        <span className="ml-auto font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{total.toLocaleString()} firms</span>
      </div>

      {/* table */}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="grid px-4 py-2 text-[10px] font-semibold uppercase tracking-widest"
          style={{ gridTemplateColumns: COL, background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.35)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span>Firm</span><span>Location</span><span>Stage Focus</span><span>Verticals</span><span>AUM</span><span>Score</span><span>Review</span><span>Live</span>
        </div>

        {loading && <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} /></div>}
        {!loading && error && <div className="flex items-center gap-2 px-4 py-10 text-[13px]" style={{ color: "#ef4444" }}><AlertCircle className="h-4 w-4" /> {error}</div>}
        {!loading && !error && rows.length === 0 && <div className="py-14 text-center text-[13px]" style={{ color: "rgba(255,255,255,0.3)" }}>No firm records found</div>}

        {!loading && !error && rows.map(row => {
          const isSelected = selected?.id === row.id;
          return (
            <div key={row.id}
              onClick={() => setSelected(isSelected ? null : row)}
              className="grid items-center gap-x-3 border-b px-4 py-3 cursor-pointer transition-colors"
              style={{ gridTemplateColumns: COL, borderColor: "rgba(255,255,255,0.05)", background: isSelected ? "rgba(46,230,166,0.06)" : undefined }}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate">
                  {row.logo_url && <img src={row.logo_url} alt="" className="h-4 w-4 rounded object-contain shrink-0" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
                  <span className="truncate text-[13px] font-medium text-white/90">{row.firm_name}</span>
                  {row.website_url && <a href={row.website_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="shrink-0 opacity-30 hover:opacity-70"><ExternalLink className="h-3 w-3" style={{ color: "#2EE6A6" }} /></a>}
                </div>
                <span className="font-mono text-[9px] uppercase" style={{ color: enrichColor(row.enrichment_status) }}>{row.enrichment_status}</span>
              </div>
              <span className="truncate text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>{[row.hq_city, row.hq_state ?? row.hq_country].filter(Boolean).join(", ") || "—"}</span>
              <TagChips items={row.stage_focus} max={3} />
              <TagChips items={row.thesis_verticals} max={2} />
              <span className="font-mono text-[12px]" style={{ color: row.aum_usd ? "#e0e0e0" : "rgba(255,255,255,0.2)" }}>{fmtAum(row.aum_usd)}</span>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-8 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                  <div className="h-full rounded-full" style={{ width: `${row.completeness_score}%`, background: scoreColor(row.completeness_score) }} />
                </div>
                <span className="font-mono text-[10px]" style={{ color: scoreColor(row.completeness_score) }}>{row.completeness_score}</span>
              </div>
              <div className="flex items-center">{row.needs_review ? <span className="rounded px-1 py-0.5 font-mono text-[9px] font-bold" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>review</span> : <span className="font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}</div>
              <div className="flex items-center">{row.ready_for_live ? <CheckCircle2 className="h-4 w-4" style={{ color: "#2EE6A6" }} /> : <XCircle className="h-4 w-4" style={{ color: "rgba(255,255,255,0.15)" }} />}</div>
            </div>
          );
        })}
      </div>

      {/* pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[12px] disabled:opacity-30" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
          <span className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage(p => Math.min(pages - 1, p + 1))} className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[12px] disabled:opacity-30" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}>Next <ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* slide-in edit panel */}
      {selected && <FirmEditPanel row={selected} onClose={() => setSelected(null)} onSaved={handleSaved} />}
    </div>
  );
}
