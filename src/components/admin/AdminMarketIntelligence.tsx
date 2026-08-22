/**
 * AdminMarketIntelligence
 *
 * Browse and full-edit Companies, Founders, and Operators.
 * Click any row to open a slide-in edit panel with all fields.
 * All reads + writes go through the admin-market-intel edge function.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  AlertCircle, ExternalLink, CheckCircle2, XCircle, X, Save,
  Building2, Users, Briefcase,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabaseBearerForFunctions } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCanonicalHqLine, resolveFirmDisplayLocation } from "@/lib/formatCanonicalHqLine";

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const ENRICHMENT_STATUSES = ["pending","in_progress","enriched","failed","skipped"];

/** Display HQ when `startups` has no single `hq` column — City, ST or City, Country. */
function formatStartupHq(r: Pick<CompanyRow, "location" | "hq_city" | "hq_state" | "hq_country">): string {
  return (
    resolveFirmDisplayLocation({
      hq_city: r.hq_city,
      hq_state: r.hq_state,
      hq_country: r.hq_country,
      legacyLocation: r.location,
    }) ?? ""
  );
}
const COMPANY_STAGES      = ["pre_seed","seed","series_a","series_b","series_c","growth","public","acquired","unknown"];
const COMPANY_STATUSES    = ["active","stealth","acquired","shutdown","unknown"];
const FOUNDER_ARCHETYPES  = ["technical","commercial","operator","domain_expert","unknown"];

type TabKey = "companies" | "founders" | "operators";

// ── Types ──────────────────────────────────────────────────────────────────────

type CompanyRow = {
  id: string;
  company_name: string;
  company_url: string | null;
  logo_url: string | null;
  description_short: string | null;
  description_long: string | null;
  sector: string | null;
  stage: string | null;
  status: string | null;
  /** Free-text HQ line (matches `startups.location`). */
  location: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  total_raised_usd: number | null;
  headcount: number | null;
  yc_batch: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  founded_year: number | null;
  updated_at: string | null;
  created_at: string;
};

type FounderRow = {
  id: string;
  full_name: string;
  role: string | null;
  location: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  avatar_url: string | null;
  email: string | null;
  founder_archetype: string | null;
  is_repeat_founder: boolean;
  has_prior_exit: boolean;
  operator_to_founder: boolean;
  domain_expertise: string[] | null;
  prior_companies: string[] | null;
  updated_at: string | null;
  created_at: string;
};

type OperatorRow = {
  id: string;
  full_name: string;
  title: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  website_url: string | null;
  avatar_url: string | null;
  email: string | null;
  stage_focus: string[] | null;
  is_available: boolean;
  enrichment_status: string;
  completeness_score: number | null;
  expertise: string[] | null;
  sector_focus: string[] | null;
  prior_companies: string[] | null;
  ready_for_live: boolean;
  updated_at: string | null;
  created_at: string;
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

// ── Generic fetch/patch ────────────────────────────────────────────────────────

async function fetchRows<T>(
  entity: string,
  opts: { page: number; search: string; filter?: Record<string, string>; limit?: number },
): Promise<{ rows: T[]; total: number; error?: string }> {
  if (!SUPABASE_URL) return { rows: [], total: 0, error: "SUPABASE_URL not set" };
  const limit = Math.max(1, Math.min(100, opts.limit ?? PAGE_SIZE));
  const params = new URLSearchParams({
    entity,
    page:  String(opts.page),
    limit: String(limit),
  });
  if (opts.search) params.set("search", opts.search);
  if (opts.filter) {
    for (const [k, v] of Object.entries(opts.filter)) {
      if (v && v !== "all") params.set(k, v);
    }
  }
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

async function fetchAllRows<T>(
  entity: string,
  filter?: Record<string, string>,
): Promise<{ rows: T[]; total: number; error?: string }> {
  const metricsPageSize = 100;
  const first = await fetchRows<T>(entity, { page: 0, search: "", filter, limit: metricsPageSize });
  if (first.error) return first;
  const total = first.total ?? 0;
  if (total <= first.rows.length) return first;

  const pages = Math.ceil(total / metricsPageSize);
  const allRows = [...first.rows];

  const remainingPages = Array.from({ length: pages - 1 }, (_, i) => i + 1);
  const remainingResults = await Promise.all(
    remainingPages.map((page) => fetchRows<T>(entity, { page, search: "", filter, limit: metricsPageSize })),
  );

  for (const result of remainingResults) {
    if (result.error) return { rows: allRows, total, error: result.error };
    allRows.push(...result.rows);
  }
  return { rows: allRows, total };
}

async function patchRow<T>(entity: string, id: string, patch: Record<string, unknown>): Promise<{ row?: T; error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=${entity}&id=${encodeURIComponent(id)}`,
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

function NF({ label, value, onChange }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
}) {
  return (
    <FL label={label}>
      <input
        className={IC} style={IS} type="number"
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
  return (
    <FL label={`${label} (comma-sep)`}>
      <input
        className={IC} style={IS}
        value={(value ?? []).join(", ")}
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

// ── Panel shell ────────────────────────────────────────────────────────────────

function PanelShell({
  title, subtitle, saving, onClose, onSave, children,
}: {
  title: string; subtitle: string; saving: boolean;
  onClose: () => void; onSave: () => void; children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: 440, zIndex: 50,
        background: "#0c0c0c", borderLeft: "1px solid rgba(255,255,255,0.07)",
        display: "flex", flexDirection: "column", boxShadow: "-8px 0 32px rgba(0,0,0,0.6)",
      }}
    >
      <div className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div>
          <p className="text-[11px] font-mono uppercase tracking-widest" style={{ color: "#2EE6A6" }}>{title}</p>
          <p className="text-[13px] font-semibold text-white/80 mt-0.5 truncate max-w-[320px]">{subtitle}</p>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/05 transition-colors">
          <X className="h-4 w-4" style={{ color: "rgba(255,255,255,0.4)" }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {children}
      </div>

      <div className="flex items-center gap-3 px-5 py-4 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <button
          type="button" onClick={onSave} disabled={saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-[12px] font-semibold transition-colors"
          style={{ background: "#2EE6A6", color: "#050505" }}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button
          type="button" onClick={onClose}
          className="rounded-md px-4 py-2 text-[12px] font-medium transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Company Edit Panel ─────────────────────────────────────────────────────────

function CompanyEditPanel({ row, onClose, onSaved }: {
  row: CompanyRow; onClose: () => void; onSaved: (u: CompanyRow) => void;
}) {
  const [d, setD] = useState<CompanyRow>({ ...row });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof CompanyRow>(k: K, v: CompanyRow[K]) => setD(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const { id, created_at, updated_at, logo_url, ...patch } = d;
    const { row: u, error } = await patchRow<CompanyRow>("companies", row.id, patch);
    setSaving(false);
    if (error || !u) { toast.error(`Save failed: ${error ?? "no data"}`); return; }
    toast.success("Company saved");
    onSaved(u);
  };

  return (
    <PanelShell title="Edit Company" subtitle={row.company_name} saving={saving} onClose={onClose} onSave={handleSave}>
      <Sect title="Basic Info" />
      <TF label="Company Name"      value={d.company_name}      onChange={v => set("company_name", v)} />
      <TF label="Website URL"       value={d.company_url}       onChange={v => set("company_url", v)} placeholder="https://" />
      <TF label="LinkedIn URL"      value={d.linkedin_url}      onChange={v => set("linkedin_url", v)} />
      <TF label="X URL"             value={d.x_url}           onChange={v => set("x_url", v)} placeholder="https://x.com/…" />
      <TA label="Short Description" value={d.description_short} onChange={v => set("description_short", v)} rows={2} />
      <TA label="Long Description"  value={d.description_long}  onChange={v => set("description_long", v)} rows={4} />

      <Sect title="Classification" />
      <TF   label="Sector" value={d.sector}  onChange={v => set("sector", v)} />
      <SFld label="Stage"  value={d.stage}   onChange={v => set("stage", v)}   options={COMPANY_STAGES} />
      <SFld label="Status" value={d.status}  onChange={v => set("status", v)}  options={COMPANY_STATUSES} />
      <TF   label="HQ / Location" value={d.location} onChange={v => set("location", v)} placeholder="City, State, Country" />
      <div className="grid grid-cols-3 gap-2">
        <TF label="HQ City" value={d.hq_city} onChange={v => set("hq_city", v)} />
        <TF label="HQ State" value={d.hq_state} onChange={v => set("hq_state", v)} />
        <TF label="HQ Country" value={d.hq_country} onChange={v => set("hq_country", v)} />
      </div>
      <TF   label="YC Batch" value={d.yc_batch} onChange={v => set("yc_batch", v)} placeholder="W24" />

      <Sect title="Metrics" />
      <div className="grid grid-cols-2 gap-3">
        <NF label="Total Raised (USD)" value={d.total_raised_usd} onChange={v => set("total_raised_usd", v)} />
        <NF label="Headcount"          value={d.headcount}        onChange={v => set("headcount", v)} />
        <NF label="Founded Year"       value={d.founded_year}     onChange={v => set("founded_year", v)} />
      </div>

    </PanelShell>
  );
}

// ── Founder Edit Panel ─────────────────────────────────────────────────────────

function FounderEditPanel({ row, onClose, onSaved }: {
  row: FounderRow; onClose: () => void; onSaved: (u: FounderRow) => void;
}) {
  const [d, setD] = useState<FounderRow>({ ...row });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof FounderRow>(k: K, v: FounderRow[K]) => setD(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const { id, created_at, updated_at, ...patch } = d;
    const { row: u, error } = await patchRow<FounderRow>("founders", row.id, patch);
    setSaving(false);
    if (error || !u) { toast.error(`Save failed: ${error ?? "no data"}`); return; }
    toast.success("Founder saved");
    onSaved(u);
  };

  return (
    <PanelShell title="Edit Founder" subtitle={row.full_name} saving={saving} onClose={onClose} onSave={handleSave}>
      <Sect title="Identity" />
      <TF label="Full Name"    value={d.full_name} onChange={v => set("full_name", v)} />
      <TF label="Role / Title" value={d.role}      onChange={v => set("role", v)} />
      <TF label="Location"     value={d.location}  onChange={v => set("location", v)} />

      <Sect title="Contact" />
      <TF label="LinkedIn URL" value={d.linkedin_url} onChange={v => set("linkedin_url", v)} />
      <TF label="X URL"        value={d.x_url}        onChange={v => set("x_url", v)} />
      <TF label="Email"        value={d.email}        onChange={v => set("email", v)} type="email" />
      <TF label="Headshot URL" value={d.avatar_url}   onChange={v => set("avatar_url", v)} placeholder="Direct image URL from LinkedIn/company site/X" />

      <Sect title="Founder Profile" />
      <SFld label="Archetype"          value={d.founder_archetype}  onChange={v => set("founder_archetype", v)}  options={FOUNDER_ARCHETYPES} />
      <BF   label="Repeat Founder"     value={d.is_repeat_founder}  onChange={v => set("is_repeat_founder", v)} />
      <BF   label="Prior Exit"         value={d.has_prior_exit}     onChange={v => set("has_prior_exit", v)} />
      <BF   label="Operator → Founder" value={d.operator_to_founder} onChange={v => set("operator_to_founder", v)} />
      <TagF label="Domain Expertise"   value={d.domain_expertise}   onChange={v => set("domain_expertise", v)} />
      <TagF label="Prior Companies"    value={d.prior_companies}    onChange={v => set("prior_companies", v)} />

    </PanelShell>
  );
}

// ── Operator Edit Panel ────────────────────────────────────────────────────────

function OperatorEditPanel({ row, onClose, onSaved }: {
  row: OperatorRow; onClose: () => void; onSaved: (u: OperatorRow) => void;
}) {
  const [d, setD] = useState<OperatorRow>({ ...row });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof OperatorRow>(k: K, v: OperatorRow[K]) => setD(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const { id, created_at, updated_at, ...patch } = d;
    const { row: u, error } = await patchRow<OperatorRow>("operators", row.id, patch);
    setSaving(false);
    if (error || !u) { toast.error(`Save failed: ${error ?? "no data"}`); return; }
    toast.success("Operator saved");
    onSaved(u);
  };

  return (
    <PanelShell title="Edit Operator" subtitle={row.full_name} saving={saving} onClose={onClose} onSave={handleSave}>
      <Sect title="Identity" />
      <TF label="Full Name" value={d.full_name} onChange={v => set("full_name", v)} />
      <TF label="Title"     value={d.title}     onChange={v => set("title", v)} />

      <Sect title="Location" />
      <div className="grid grid-cols-3 gap-2">
        <TF label="City"    value={d.city}    onChange={v => set("city", v)} />
        <TF label="State"   value={d.state}   onChange={v => set("state", v)} />
        <TF label="Country" value={d.country} onChange={v => set("country", v)} />
      </div>

      <Sect title="Contact" />
      <TF label="LinkedIn URL" value={d.linkedin_url} onChange={v => set("linkedin_url", v)} />
      <TF label="X URL"        value={d.x_url}        onChange={v => set("x_url", v)} />
      <TF label="Website URL"  value={d.website_url}  onChange={v => set("website_url", v)} placeholder="https://…" />
      <TF label="Email"        value={d.email}        onChange={v => set("email", v)} type="email" />
      <TF label="Headshot URL" value={d.avatar_url}   onChange={v => set("avatar_url", v)} placeholder="Direct image URL from LinkedIn/company site/X" />

      <Sect title="Operator Profile" />
      <TagF label="Stage Focus"     value={d.stage_focus}    onChange={v => set("stage_focus", v)} />
      <TagF label="Sector Focus"    value={d.sector_focus}   onChange={v => set("sector_focus", v)} />
      <TagF label="Expertise"       value={d.expertise}      onChange={v => set("expertise", v)} />
      <TagF label="Prior Companies" value={d.prior_companies} onChange={v => set("prior_companies", v)} />
      <BF   label="Is Available"    value={d.is_available}   onChange={v => set("is_available", v)} />

      <Sect title="Enrichment" />
      <SFld label="Enrichment Status" value={d.enrichment_status} onChange={v => set("enrichment_status", v)} options={ENRICHMENT_STATUSES} />
    </PanelShell>
  );
}

// ── Table helpers ──────────────────────────────────────────────────────────────

const HDR: React.CSSProperties = {
  fontSize: 10, fontFamily: "monospace", letterSpacing: "0.15em",
  textTransform: "uppercase", color: "rgba(255,255,255,0.3)", padding: "6px 12px",
};
const CELL: React.CSSProperties = { padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.75)" };

function Pill({ text, color = "#2EE6A6" }: { text: string; color?: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-mono"
      style={{ background: `${color}18`, color }}>
      {text}
    </span>
  );
}

function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function MetricsTiles({
  totalLabel,
  liveLabel,
  totalValue,
  liveValue,
  avgCompleteness,
  lastUpdateAt,
  loading,
}: {
  totalLabel: string;
  liveLabel: string;
  totalValue: number | null;
  liveValue: number | null;
  avgCompleteness: number | null;
  lastUpdateAt: string | null;
  loading: boolean;
}) {
  const cards = [
    {
      label: totalLabel,
      value: totalValue == null ? "—" : totalValue.toLocaleString(),
      accent: "rgba(46,230,166,0.32)",
    },
    {
      label: liveLabel,
      value: liveValue == null ? "—" : liveValue.toLocaleString(),
      accent: "rgba(46,230,166,0.32)",
    },
    {
      label: "Avg. profile completeness",
      value: avgCompleteness == null ? "—" : `${Math.round(avgCompleteness)}%`,
      accent: "rgba(91,92,255,0.32)",
    },
    {
      label: "Last update",
      value: lastUpdateAt
        ? new Date(lastUpdateAt).toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "—",
      accent: "rgba(46,230,166,0.2)",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border px-4 py-3"
          style={{
            borderColor: "rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.02)",
            boxShadow: `inset 0 0 0 1px ${card.accent}`,
          }}
        >
          <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.38)" }}>
            {card.label}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "#2EE6A6" }} /> : null}
            <p className="text-lg font-semibold text-white/90">{card.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Companies Tab ──────────────────────────────────────────────────────────────

function CompaniesTab() {
  const COL = "2fr 1fr 1fr 1fr 1fr 1fr";
  const [rows, setRows]         = useState<CompanyRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [totalCompanies, setTotalCompanies] = useState<number | null>(null);
  const [liveCompanies, setLiveCompanies] = useState<number | null>(null);
  const [avgCompleteness, setAvgCompleteness] = useState<number | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [page, setPage]         = useState(0);
  const [search, setSearch]     = useState("");
  const [stage, setStage]       = useState("all");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<CompanyRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { rows: r, total: t, error: e } = await fetchRows<CompanyRow>("companies", {
      page, search, filter: { stage },
    });
    setLoading(false);
    if (e) { setError(e); return; }
    setRows(r); setTotal(t);
  }, [page, search, stage]);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const { rows: allRows, total: totalCount, error: metricsErr } = await fetchAllRows<CompanyRow>("companies", {
        stage: "all",
      });
      if (metricsErr) throw new Error(metricsErr);

      setTotalCompanies(totalCount ?? 0);
      setLiveCompanies(allRows.filter((row) => row.status === "active").length);

      let completenessSum = 0;
      let rowCount = 0;
      let maxUpdatedAt: string | null = null;
      let maxUpdatedMs = -Infinity;

      for (const row of allRows) {
        const hasHq = hasValue(row.location) || hasValue(row.hq_city) || hasValue(row.hq_state) || hasValue(row.hq_country);
        const scoreFields = [
          hasValue(row.company_url),
          hasValue(row.description_short),
          hasValue(row.description_long),
          hasValue(row.sector),
          hasValue(row.stage),
          hasValue(row.status),
          hasHq,
          row.total_raised_usd != null,
          row.headcount != null,
          hasValue(row.yc_batch),
          hasValue(row.linkedin_url),
          hasValue(row.x_url),
          row.founded_year != null,
        ];
        const score = (scoreFields.filter(Boolean).length / scoreFields.length) * 100;
        completenessSum += score;
        rowCount += 1;

        const updatedMs = parseIsoMs(row.updated_at);
        if (updatedMs != null && updatedMs > maxUpdatedMs) {
          maxUpdatedMs = updatedMs;
          maxUpdatedAt = row.updated_at;
        }
      }

      setAvgCompleteness(rowCount ? completenessSum / rowCount : 0);
      setLastUpdateAt(maxUpdatedAt);
    } catch (metricsErr) {
      console.warn("[AdminMarketIntelligence] Companies metrics load failed:", metricsErr);
      setTotalCompanies(null);
      setLiveCompanies(null);
      setAvgCompleteness(null);
      setLastUpdateAt(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadMetrics(); }, [loadMetrics]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4 h-full">
      <MetricsTiles
        totalLabel="Total companies"
        liveLabel="Live companies"
        totalValue={totalCompanies}
        liveValue={liveCompanies}
        avgCompleteness={avgCompleteness}
        lastUpdateAt={lastUpdateAt}
        loading={metricsLoading}
      />

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input placeholder="Search companies…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 text-[12px] h-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
        </div>
        <Select value={stage} onValueChange={v => { setStage(v); setPage(0); }}>
          <SelectTrigger className="w-[140px] h-8 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {COMPANY_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <button onClick={() => { void load(); void loadMetrics(); }} className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-[11px]"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{total.toLocaleString()} companies — click any row to edit</p>

      {error && (
        <div className="flex items-center gap-2 rounded border px-4 py-3"
          style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)" }}>
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />
          <span className="text-[12px]" style={{ color: "#ef4444" }}>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-auto rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div style={{ display: "grid", gridTemplateColumns: COL, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {["Company","Sector","Stage","Status","HQ","Raised"].map(h => <div key={h} style={HDR}>{h}</div>)}
        </div>
        {loading && <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} /></div>}
        {!loading && rows.length === 0 && !error && <div className="flex items-center justify-center py-12 text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>No companies found</div>}
        {!loading && rows.map(row => {
          const isSel = selected?.id === row.id;
          return (
            <div key={row.id} onClick={() => setSelected(isSel ? null : row)}
              style={{ display: "grid", gridTemplateColumns: COL, borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", background: isSel ? "rgba(46,230,166,0.06)" : undefined, transition: "background 0.15s" }}
              className="hover:bg-white/[0.02]">
              <div style={CELL}>
                <div className="font-medium truncate">{row.company_name}</div>
                {row.company_url && <div className="text-[10px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.35)" }}>{row.company_url}</div>}
              </div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.5)" }}>{row.sector ?? "—"}</div>
              <div style={CELL}>{row.stage ? <Pill text={row.stage} /> : "—"}</div>
              <div style={CELL}>{row.status ? <Pill text={row.status} color="#a78bfa" /> : "—"}</div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{formatStartupHq(row) || "—"}</div>
              <div style={{ ...CELL, fontFamily: "monospace", fontSize: 11 }}>
                {row.total_raised_usd != null ? `$${(row.total_raised_usd / 1_000_000).toFixed(1)}M` : "—"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Page {page + 1} of {Math.max(1, totalPages)}</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="flex items-center gap-1 rounded border px-2.5 py-1.5 text-[11px] disabled:opacity-30"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="flex items-center gap-1 rounded border px-2.5 py-1.5 text-[11px] disabled:opacity-30"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {selected && (
        <CompanyEditPanel
          row={selected}
          onClose={() => setSelected(null)}
          onSaved={u => { setRows(prev => prev.map(r => r.id === u.id ? u : r)); setSelected(u); void loadMetrics(); }}
        />
      )}
    </div>
  );
}

// ── Founders Tab ───────────────────────────────────────────────────────────────

function FoundersTab() {
  const COL = "2fr 1fr 1fr 1fr 1fr";
  const [rows, setRows]         = useState<FounderRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [totalFounders, setTotalFounders] = useState<number | null>(null);
  const [liveFounders, setLiveFounders] = useState<number | null>(null);
  const [avgCompleteness, setAvgCompleteness] = useState<number | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [page, setPage]         = useState(0);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<FounderRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { rows: r, total: t, error: e } = await fetchRows<FounderRow>("founders", { page, search });
    setLoading(false);
    if (e) { setError(e); return; }
    setRows(r); setTotal(t);
  }, [page, search]);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const { rows: allRows, total: totalCount, error: metricsErr } = await fetchAllRows<FounderRow>("founders");
      if (metricsErr) throw new Error(metricsErr);
      setTotalFounders(totalCount ?? 0);

      let liveCount = 0;
      let completenessSum = 0;
      let rowCount = 0;
      let maxUpdatedAt: string | null = null;
      let maxUpdatedMs = -Infinity;

      for (const row of allRows) {
        const live = hasValue(row.linkedin_url) || hasValue(row.email) || hasValue(row.role);
        if (live) liveCount += 1;

        const scoreFields = [
          hasValue(row.role),
          hasValue(row.location),
          hasValue(row.linkedin_url),
          hasValue(row.email),
          hasValue(row.founder_archetype),
          hasValue(row.domain_expertise),
          hasValue(row.prior_companies),
        ];
        const score = (scoreFields.filter(Boolean).length / scoreFields.length) * 100;
        completenessSum += score;
        rowCount += 1;

        const updatedMs = parseIsoMs(row.updated_at);
        if (updatedMs != null && updatedMs > maxUpdatedMs) {
          maxUpdatedMs = updatedMs;
          maxUpdatedAt = row.updated_at;
        }
      }

      setLiveFounders(liveCount);
      setAvgCompleteness(rowCount ? completenessSum / rowCount : 0);
      setLastUpdateAt(maxUpdatedAt);
    } catch (metricsErr) {
      console.warn("[AdminMarketIntelligence] Founders metrics load failed:", metricsErr);
      setTotalFounders(null);
      setLiveFounders(null);
      setAvgCompleteness(null);
      setLastUpdateAt(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadMetrics(); }, [loadMetrics]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4 h-full">
      <MetricsTiles
        totalLabel="Total founders"
        liveLabel="Live founders"
        totalValue={totalFounders}
        liveValue={liveFounders}
        avgCompleteness={avgCompleteness}
        lastUpdateAt={lastUpdateAt}
        loading={metricsLoading}
      />

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input placeholder="Search founders…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 text-[12px] h-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
        </div>
        <button onClick={() => { void load(); void loadMetrics(); }} className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-[11px]"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{total.toLocaleString()} founders — click any row to edit</p>

      {error && (
        <div className="flex items-center gap-2 rounded border px-4 py-3"
          style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)" }}>
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />
          <span className="text-[12px]" style={{ color: "#ef4444" }}>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-auto rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div style={{ display: "grid", gridTemplateColumns: COL, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {["Name","Role","Location","Archetype","Flags"].map(h => <div key={h} style={HDR}>{h}</div>)}
        </div>
        {loading && <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} /></div>}
        {!loading && rows.length === 0 && !error && <div className="flex items-center justify-center py-12 text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>No founders found</div>}
        {!loading && rows.map(row => {
          const isSel = selected?.id === row.id;
          return (
            <div key={row.id} onClick={() => setSelected(isSel ? null : row)}
              style={{ display: "grid", gridTemplateColumns: COL, borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", background: isSel ? "rgba(46,230,166,0.06)" : undefined, transition: "background 0.15s" }}
              className="hover:bg-white/[0.02]">
              <div style={CELL}>
                <div className="font-medium truncate">{row.full_name}</div>
                {row.linkedin_url && (
                  <a href={row.linkedin_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    className="text-[10px] mt-0.5 inline-flex items-center gap-0.5 hover:underline"
                    style={{ color: "rgba(255,255,255,0.35)" }}>
                    LinkedIn <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.5)" }}>{row.role ?? "—"}</div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{row.location ?? "—"}</div>
              <div style={CELL}>{row.founder_archetype ? <Pill text={row.founder_archetype} color="#a78bfa" /> : "—"}</div>
              <div style={CELL} className="flex items-center gap-1.5 flex-wrap">
                {row.is_repeat_founder   && <Pill text="repeat" color="#f59e0b" />}
                {row.has_prior_exit      && <Pill text="exit"   color="#34d399" />}
                {row.operator_to_founder && <Pill text="op→f"   color="#60a5fa" />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Page {page + 1} of {Math.max(1, totalPages)}</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="flex items-center gap-1 rounded border px-2.5 py-1.5 text-[11px] disabled:opacity-30"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="flex items-center gap-1 rounded border px-2.5 py-1.5 text-[11px] disabled:opacity-30"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {selected && (
        <FounderEditPanel
          row={selected}
          onClose={() => setSelected(null)}
          onSaved={u => { setRows(prev => prev.map(r => r.id === u.id ? u : r)); setSelected(u); void loadMetrics(); }}
        />
      )}
    </div>
  );
}

// ── Operators Tab ──────────────────────────────────────────────────────────────

function OperatorsTab() {
  const COL = "2fr 1fr 1fr 1fr 1fr";
  const [rows, setRows]         = useState<OperatorRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [totalOperators, setTotalOperators] = useState<number | null>(null);
  const [liveOperators, setLiveOperators] = useState<number | null>(null);
  const [avgCompleteness, setAvgCompleteness] = useState<number | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [page, setPage]         = useState(0);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<OperatorRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { rows: r, total: t, error: e } = await fetchRows<OperatorRow>("operators", { page, search });
    setLoading(false);
    if (e) { setError(e); return; }
    setRows(r); setTotal(t);
  }, [page, search]);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const { rows: allRows, total: totalCount, error: metricsErr } = await fetchAllRows<OperatorRow>("operators");
      if (metricsErr) throw new Error(metricsErr);

      setTotalOperators(totalCount ?? 0);
      setLiveOperators(allRows.filter((row) => row.ready_for_live === true).length);

      let scoreSum = 0;
      let scoreCount = 0;
      let maxUpdatedAt: string | null = null;
      let maxUpdatedMs = -Infinity;

      for (const row of allRows) {
        const score = Number(row.completeness_score ?? 0);
        if (Number.isFinite(score)) {
          scoreSum += score;
          scoreCount += 1;
        }
        const updatedMs = parseIsoMs(row.updated_at);
        if (updatedMs != null && updatedMs > maxUpdatedMs) {
          maxUpdatedMs = updatedMs;
          maxUpdatedAt = row.updated_at;
        }
      }

      setAvgCompleteness(scoreCount ? scoreSum / scoreCount : 0);
      setLastUpdateAt(maxUpdatedAt);
    } catch (metricsErr) {
      console.warn("[AdminMarketIntelligence] Operators metrics load failed:", metricsErr);
      setTotalOperators(null);
      setLiveOperators(null);
      setAvgCompleteness(null);
      setLastUpdateAt(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadMetrics(); }, [loadMetrics]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4 h-full">
      <MetricsTiles
        totalLabel="Total operators"
        liveLabel="Live operators"
        totalValue={totalOperators}
        liveValue={liveOperators}
        avgCompleteness={avgCompleteness}
        lastUpdateAt={lastUpdateAt}
        loading={metricsLoading}
      />

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input placeholder="Search operators…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 text-[12px] h-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
        </div>
        <button onClick={() => { void load(); void loadMetrics(); }} className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-[11px]"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{total.toLocaleString()} operators — click any row to edit</p>

      {error && (
        <div className="flex items-center gap-2 rounded border px-4 py-3"
          style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)" }}>
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />
          <span className="text-[12px]" style={{ color: "#ef4444" }}>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-auto rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div style={{ display: "grid", gridTemplateColumns: COL, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {["Name","Title","Location","Expertise","Status"].map(h => <div key={h} style={HDR}>{h}</div>)}
        </div>
        {loading && <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} /></div>}
        {!loading && rows.length === 0 && !error && <div className="flex items-center justify-center py-12 text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>No operators found</div>}
        {!loading && rows.map(row => {
          const isSel = selected?.id === row.id;
          const location = formatCanonicalHqLine(row.city, row.state, row.country) ?? "";
          return (
            <div key={row.id} onClick={() => setSelected(isSel ? null : row)}
              style={{ display: "grid", gridTemplateColumns: COL, borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", background: isSel ? "rgba(46,230,166,0.06)" : undefined, transition: "background 0.15s" }}
              className="hover:bg-white/[0.02]">
              <div style={CELL}>
                <div className="font-medium truncate">{row.full_name}</div>
                {row.linkedin_url && (
                  <a href={row.linkedin_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    className="text-[10px] mt-0.5 inline-flex items-center gap-0.5 hover:underline"
                    style={{ color: "rgba(255,255,255,0.35)" }}>
                    LinkedIn <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{row.title ?? "—"}</div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{location || "—"}</div>
              <div style={CELL} className="flex flex-wrap gap-1">
                {(row.expertise ?? []).slice(0, 2).map(e => <Pill key={e} text={e} color="#60a5fa" />)}
                {(row.expertise ?? []).length > 2 && (
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>+{(row.expertise ?? []).length - 2}</span>
                )}
              </div>
              <div style={CELL}>
                {row.is_available
                  ? <Pill text="available" color="#34d399" />
                  : <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>unavailable</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Page {page + 1} of {Math.max(1, totalPages)}</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="flex items-center gap-1 rounded border px-2.5 py-1.5 text-[11px] disabled:opacity-30"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="flex items-center gap-1 rounded border px-2.5 py-1.5 text-[11px] disabled:opacity-30"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {selected && (
        <OperatorEditPanel
          row={selected}
          onClose={() => setSelected(null)}
          onSaved={u => { setRows(prev => prev.map(r => r.id === u.id ? u : r)); setSelected(u); void loadMetrics(); }}
        />
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "companies", label: "Companies", icon: Building2 },
  { key: "founders",  label: "Founders",  icon: Users     },
  { key: "operators", label: "Operators", icon: Briefcase },
];

export function AdminMarketIntelligence() {
  const [tab, setTab] = useState<TabKey>("companies");

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-white/90">Market Intelligence</h1>
        <p className="mt-0.5 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
          Companies, founders, and operators — click any row to open the full edit panel.
        </p>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 rounded-lg p-1" style={{ background: "rgba(255,255,255,0.04)", width: "fit-content" }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-2 rounded-md px-4 py-1.5 text-[12px] font-medium transition-colors"
            style={{
              background: tab === t.key ? "rgba(46,230,166,0.1)" : "transparent",
              color: tab === t.key ? "#2EE6A6" : "rgba(255,255,255,0.4)",
              border: tab === t.key ? "1px solid rgba(46,230,166,0.2)" : "1px solid transparent",
            }}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {tab === "companies" && <CompaniesTab />}
        {tab === "founders"  && <FoundersTab />}
        {tab === "operators" && <OperatorsTab />}
      </div>
    </div>
  );
}
