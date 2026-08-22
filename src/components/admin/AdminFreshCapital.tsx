/**
 * AdminFreshCapital
 *
 * Browse and full-edit fi_deals_canonical records.
 * Click any row to open a slide-in edit panel with all fields.
 * All reads + writes go through the admin-market-intel edge function.
 * Enrichment tab: fi_sources + sync/fetch run telemetry (see entity=… in that function).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  AlertCircle, ExternalLink, CheckCircle2, XCircle, Flag, X, Save,
  Plus, Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabaseBearerForFunctions } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FreshCapitalEnrichmentAdmin } from "./FreshCapitalEnrichmentAdmin";
import { FreshCapitalPublicPathsAdmin } from "./FreshCapitalPublicPathsAdmin";
import { EXTERNAL_SOURCE_LINK_ATTRS, formatOutboundUrl } from "@/lib/utils/formatOutboundUrl";

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;
const COL = "2fr 1fr 1fr 1fr 1.5fr 0.7fr 0.6fr 0.6fr 0.5fr";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const ROUND_TYPES = [
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "series_c",
  "series_d",
  "series_e",
  "growth",
  "strategic",
  "debt",
  "grant",
  "unknown",
  "other",
];
const SOURCE_TYPES = ["news", "curated_feed", "rumor", "api"];
/** Matches `public.vc_fund_status_enum` on vc_funds (admin create + patch). */
const VC_FUND_STATUSES = [
  "announced",
  "target",
  "first_close",
  "final_close",
  "inferred_active",
  "historical",
] as const;
const STAGE_FOCUS_OPTIONS = ["Pre-Seed", "Seed", "Series A", "Series B+", "Growth"];
const DEFAULT_SECTOR_OPTIONS = [
  "AI / ML",
  "Aerospace",
  "Biotech",
  "Climate",
  "Consumer",
  "Crypto",
  "Cybersecurity",
  "Data Infrastructure",
  "Design",
  "DevTools",
  "E-commerce",
  "Education",
  "Energy",
  "Enterprise",
  "Fintech",
  "Gaming",
  "GovTech",
  "Healthcare",
  "Industrial Tech",
  "Insurtech",
  "LegalTech",
  "Marketplace",
  "Manufacturing",
  "Media",
  "Mobility",
  "Productivity",
  "PropTech",
  "Robotics",
  "SaaS",
  "Security",
  "Transportation",
];

// ── Types ──────────────────────────────────────────────────────────────────────

type DealRow = {
  id: string;
  company_name: string;
  company_domain: string | null;
  company_website: string | null;
  company_logo_url: string | null;
  company_linkedin_url: string | null;
  company_location: string | null;
  sector_raw: string | null;
  sector_normalized: string | null;
  round_type_raw: string | null;
  round_type_normalized: string | null;
  amount_raw: string | null;
  amount_minor_units: number | null;
  currency: string;
  announced_date: string | null;
  lead_investor: string | null;
  lead_investor_normalized: string | null;
  co_investors: string[] | null;
  extracted_summary: string | null;
  needs_review: boolean;
  review_reason: string | null;
  is_rumor: boolean;
  confidence_score: number;
  source_count: number;
  primary_source_name: string | null;
  primary_source_url: string | null;
  primary_press_url: string | null;
  source_type: string;
  extraction_method: string;
  created_at: string;
  updated_at: string | null;
};

type FreshFundRow = {
  id: string;
  firm_record_id: string;
  firm_name: string | null;
  firm_website_url: string | null;
  firm_logo_url: string | null;
  firm_domain: string | null;
  firm_location: string | null;
  firm_hq_city: string | null;
  firm_hq_state: string | null;
  firm_hq_country: string | null;
  firm_aum: string | null;
  firm_aum_usd: number | null;
  has_fresh_capital: boolean | null;
  fresh_capital_priority_score: number | null;
  fund_name: string;
  fund_type: string | null;
  fund_sequence_number: number | null;
  vintage_year: number | null;
  announced_date: string | null;
  close_date: string | null;
  target_size_usd: number | null;
  final_size_usd: number | null;
  currency: string;
  status: string | null;
  source_confidence: number | null;
  source_count: number | null;
  announcement_url: string | null;
  announcement_title: string | null;
  stage_focus: string[] | null;
  sector_focus: string[] | null;
  geography_focus: string[] | null;
  likely_actively_deploying: boolean | null;
  active_deployment_window_start: string | null;
  active_deployment_window_end: string | null;
  manually_verified: boolean | null;
  verification_status: string | null;
  estimated_check_min_usd: number | null;
  estimated_check_max_usd: number | null;
  created_at: string;
  updated_at: string | null;
};

// ── Auth helper ────────────────────────────────────────────────────────────────

async function adminHeaders(): Promise<Record<string, string>> {
  const jwt = await getSupabaseBearerForFunctions();
  const anon = SUPABASE_ANON_KEY ?? "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${anon}`,
    /** Supabase Edge gateway expects `apikey` alongside `Authorization` for invoke/billing/CORS paths */
    apikey: anon,
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

async function fetchFreshFunds(opts: {
  page: number;
  search: string;
  stage: string;
}): Promise<{ rows: FreshFundRow[]; total: number; error?: string }> {
  if (!SUPABASE_URL) return { rows: [], total: 0, error: "SUPABASE_URL not set" };
  const params = new URLSearchParams({
    entity: "fresh-funds",
    page: String(opts.page),
    limit: String(PAGE_SIZE),
  });
  if (opts.search) params.set("search", opts.search);
  if (opts.stage && opts.stage !== "all") params.set("stage", opts.stage);

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

async function patchFreshFund(id: string, patch: Record<string, unknown>): Promise<{ row?: FreshFundRow; error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=fresh-funds&id=${encodeURIComponent(id)}`,
      { method: "PATCH", headers: await adminHeaders(), body: JSON.stringify(patch) },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { row: json.row };
  } catch (e: unknown) {
    return { error: String(e) };
  }
}

async function deleteFreshFund(id: string): Promise<{ error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const qs = new URLSearchParams({
      entity: "fresh-funds",
      id,
      action: "delete",
    });
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${qs}`, {
      method: "POST",
      headers: await adminHeaders(),
      body: "{}",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return {};
  } catch (e: unknown) {
    return { error: String(e) };
  }
}

async function deleteDeal(id: string): Promise<{ error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const qs = new URLSearchParams({
      entity: "deals",
      id,
      action: "delete",
    });
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${qs}`, {
      method: "POST",
      headers: await adminHeaders(),
      body: "{}",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return {};
  } catch (e: unknown) {
    return { error: String(e) };
  }
}

async function createFreshFund(payload: Record<string, unknown>): Promise<{ row?: FreshFundRow; error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=fresh-funds`,
      { method: "POST", headers: await adminHeaders(), body: JSON.stringify(payload) },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { row: json.row };
  } catch (e: unknown) {
    return { error: String(e) };
  }
}

async function createDealRecord(payload: Record<string, unknown>): Promise<{ row?: DealRow; error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=deals`,
      { method: "POST", headers: await adminHeaders(), body: JSON.stringify(payload) },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { row: json.row };
  } catch (e: unknown) {
    return { error: String(e) };
  }
}

// ── Sector helpers ────────────────────────────────────────────────────────────

function cleanSectorTag(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sectorTagKey(value: string): string {
  return cleanSectorTag(value).toLowerCase();
}

function splitSectorTags(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(value ?? "").split(/[;,|]/)) {
    const tag = cleanSectorTag(part);
    if (!tag) continue;
    const key = sectorTagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function serializeSectorTags(tags: string[]): string | null {
  const cleaned = splitSectorTags(tags.join(", "));
  return cleaned.length ? cleaned.join(", ") : null;
}

function buildSectorOptions(values: Array<string | null | undefined>): string[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    for (const tag of splitSectorTags(value)) {
      const key = sectorTagKey(tag);
      if (!byKey.has(key)) byKey.set(key, tag);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
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

function LinkField({ label, value, onChange, placeholder }: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const rawHref = value?.trim();
  const href = rawHref ? (/^https?:\/\//i.test(rawHref) ? rawHref : `https://${rawHref}`) : "";
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <TF label={label} value={value} onChange={onChange} placeholder={placeholder ?? "https://"} />
      </div>
      {href ? (
        <a
          href={formatOutboundUrl(href, "admin")}
          {...EXTERNAL_SOURCE_LINK_ATTRS}
          className="mb-px inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded border transition-colors hover:bg-white/10"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.45)" }}
          aria-label={`Open ${label}`}
          title={`Open ${label}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  );
}

function LogoPreview({ src, initial }: { src: string | null; initial: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border text-lg font-semibold uppercase"
      style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)" }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-contain"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        initial
      )}
    </div>
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

function SFld({ label, value, onChange, options, allowEmpty = true }: {
  label: string; value: string | null; onChange: (v: string) => void; options: string[]; allowEmpty?: boolean;
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
        {allowEmpty ? <option value="">— none —</option> : null}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </FL>
  );
}

function TagF({ label, value, onChange }: { label: string; value: string[] | null; onChange: (v: string[]) => void }) {
  const canonical = (value ?? []).join("\n");
  const [text, setText] = useState(canonical);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setText(canonical);
  }, [canonical]);

  return (
    <FL label={`${label} (one per line)`}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onFocus={e => {
          focusedRef.current = true;
          Object.assign(e.target.style, { ...IF, resize: "vertical" });
        }}
        onBlur={e => {
          focusedRef.current = false;
          Object.assign(e.target.style, { ...IS, resize: "vertical" });
          const next = text
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
          onChange(next);
        }}
        rows={4}
        spellCheck={false}
        placeholder="One entry per line — commas allowed within a line"
        className={`${IC} min-h-[88px] resize-y font-mono`}
        style={{ ...IS, resize: "vertical" }}
      />
    </FL>
  );
}

function SectorMultiSelect({ label, value, onChange, options }: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: string[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = splitSectorTags(value);
  const allOptions = buildSectorOptions([...DEFAULT_SECTOR_OPTIONS, ...options, ...selected]);
  const q = cleanSectorTag(query);
  const qKey = sectorTagKey(q);
  const exactOption = q ? allOptions.find(option => sectorTagKey(option) === qKey) : null;
  const canAddCustom = Boolean(q) && !exactOption;
  const filteredOptions = allOptions.filter(option => {
    if (!q) return true;
    return option.toLowerCase().includes(q.toLowerCase());
  });

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const addSector = (sector: string) => {
    const tag = cleanSectorTag(sector);
    if (!tag) return;
    onChange(serializeSectorTags([...selected, tag]));
    setQuery("");
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const removeSector = (sector: string) => {
    const key = sectorTagKey(sector);
    onChange(serializeSectorTags(selected.filter(tag => sectorTagKey(tag) !== key)));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const toggleSector = (sector: string) => {
    const key = sectorTagKey(sector);
    if (selected.some(tag => sectorTagKey(tag) === key)) {
      removeSector(sector);
    } else {
      addSector(sector);
    }
  };

  return (
    <FL label={label}>
      <div ref={rootRef} className="relative">
        <div
          className={`${IC} flex min-h-[36px] cursor-text flex-wrap items-center gap-1.5`}
          style={open ? IF : IS}
          onClick={() => {
            setOpen(true);
            inputRef.current?.focus();
          }}
        >
          {selected.map(sector => (
            <span
              key={sector}
              className="inline-flex max-w-full items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium"
              style={{ borderColor: "rgba(46,230,166,0.3)", background: "rgba(46,230,166,0.1)", color: "#2EE6A6" }}
            >
              <span className="truncate">{sector}</span>
              <button
                type="button"
                className="rounded p-0.5 hover:bg-white/10"
                onClick={(event) => {
                  event.stopPropagation();
                  removeSector(sector);
                }}
                aria-label={`Remove ${sector}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            className="min-w-[130px] flex-1 bg-transparent text-[12px] text-white/80 placeholder:text-white/25 focus:outline-none"
            value={query}
            placeholder={selected.length ? "Add sector..." : "Search or add sectors..."}
            onFocus={() => setOpen(true)}
            onChange={event => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={event => {
              if (event.key === "Escape") {
                setOpen(false);
                return;
              }
              if (event.key === "Backspace" && !query && selected.length) {
                event.preventDefault();
                removeSector(selected[selected.length - 1]);
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (exactOption) {
                  toggleSector(exactOption);
                } else if (q) {
                  addSector(q);
                }
              }
            }}
          />
        </div>

        {open && (
          <div
            className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded border p-1 shadow-xl"
            style={{ background: "#111", borderColor: "rgba(255,255,255,0.1)" }}
          >
            {canAddCustom ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-[12px] transition-colors hover:bg-white/10"
                style={{ color: "#2EE6A6" }}
                onClick={() => addSector(q)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add “{q}” to dropdown
              </button>
            ) : null}

            {filteredOptions.length ? (
              filteredOptions.map(option => {
                const active = selected.some(sector => sectorTagKey(sector) === sectorTagKey(option));
                return (
                  <button
                    key={option}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-[12px] transition-colors hover:bg-white/10"
                    style={{ color: active ? "#2EE6A6" : "rgba(255,255,255,0.72)" }}
                    onClick={() => toggleSector(option)}
                  >
                    <span className="truncate">{option}</span>
                    {active ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : null}
                  </button>
                );
              })
            ) : (
              <p className="px-2 py-2 text-[12px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                No sectors found
              </p>
            )}
          </div>
        )}
      </div>
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
  sectorOptions,
  onClose,
  onSaved,
  onDeleted,
}: {
  row: DealRow;
  sectorOptions: string[];
  onClose: () => void;
  onSaved: (updated: DealRow) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState<DealRow>({ ...row });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    const { id, created_at, updated_at, source_count, ...rest } = draft;
    const { row: updated, error } = await patchDeal(row.id, rest);
    setSaving(false);
    if (error || !updated) {
      toast.error(`Save failed: ${error ?? "no data returned"}`);
      return;
    }
    toast.success("Deal saved");
    onSaved(updated);
  };

  const handleDelete = async () => {
    const name = draft.company_name?.trim() || row.company_name || "this company";
    if (
      !window.confirm(
        `Permanently delete this funding round?\n\n${name}\n\nThis removes the row from fi_deals_canonical and cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    const { error } = await deleteDeal(row.id);
    setDeleting(false);
    if (error) {
      toast.error(`Delete failed: ${error}`);
      return;
    }
    toast.success("Funding round deleted");
    onDeleted(row.id);
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
        <div className="flex items-end gap-3">
          <LogoPreview
            src={draft.company_logo_url}
            initial={(draft.company_name?.trim().charAt(0) || "?").toUpperCase()}
          />
          <div className="min-w-0 flex-1">
            <LinkField
              label="Company Logo URL"
              value={draft.company_logo_url}
              onChange={v => set("company_logo_url", v)}
              placeholder="https://company.com/logo.png"
            />
          </div>
        </div>
        <LinkField label="Company Website" value={draft.company_website} onChange={v => set("company_website", v)} placeholder="https://company.com" />
        <TF label="Company Domain" value={draft.company_domain} onChange={v => set("company_domain", v)} placeholder="example.com" />
        <LinkField label="Company LinkedIn URL" value={draft.company_linkedin_url} onChange={v => set("company_linkedin_url", v)} />
        <TF label="Company Location" value={draft.company_location} onChange={v => set("company_location", v)} />
        <SectorMultiSelect
          label="Sectors"
          value={draft.sector_normalized}
          onChange={v => set("sector_normalized", v)}
          options={sectorOptions}
        />
        <TF label="Sector Raw" value={draft.sector_raw} onChange={v => set("sector_raw", v)} />

        <Sect title="Round Details" />
        <SFld
          label="Round Type"
          value={draft.round_type_normalized}
          onChange={v => set("round_type_normalized", v)}
          options={ROUND_TYPES}
        />
        <TF label="Round Type Raw" value={draft.round_type_raw} onChange={v => set("round_type_raw", v)} />
        <div className="grid grid-cols-2 gap-3">
          <NF label="Amount (USD)" value={amountDollars} onChange={setAmountDollars} step={1000} />
          <TF label="Currency" value={draft.currency} onChange={v => set("currency", v)} />
        </div>
        <TF label="Amount Label" value={draft.amount_raw} onChange={v => set("amount_raw", v)} placeholder="$12M" />
        <TF label="Announced Date" value={draft.announced_date} onChange={v => set("announced_date", v)} type="date" />

        <Sect title="Investors" />
        <TF label="Lead Investor" value={draft.lead_investor} onChange={v => set("lead_investor", v)} />
        <TF label="Lead Investor Normalized" value={draft.lead_investor_normalized} onChange={v => set("lead_investor_normalized", v)} />
        <TagF label="Co-Investors" value={draft.co_investors} onChange={v => set("co_investors", v)} />

        <Sect title="Announcement Source" />
        <LinkField label="Announcement Link" value={draft.primary_press_url} onChange={v => set("primary_press_url", v)} />
        <LinkField label="Source URL (fallback)" value={draft.primary_source_url} onChange={v => set("primary_source_url", v)} />
        <div className="grid grid-cols-2 gap-3">
          <TF label="Source Name" value={draft.primary_source_name} onChange={v => set("primary_source_name", v)} />
          <SFld label="Source Type" value={draft.source_type} onChange={v => set("source_type", v)} options={SOURCE_TYPES} allowEmpty={false} />
        </div>
        <TF label="Extraction Method" value={draft.extraction_method} onChange={v => set("extraction_method", v)} />

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
        className="flex flex-col gap-2 px-5 py-4 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-[12px] font-semibold transition-colors disabled:opacity-40"
            style={{ background: "#2EE6A6", color: "#050505" }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-md px-4 py-2 text-[12px] font-medium transition-colors disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
          >
            Cancel
          </button>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving || deleting}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-red-500/35 bg-red-500/10 py-2 text-[12px] font-semibold text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-40"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          {deleting ? "Deleting…" : "Delete funding round"}
        </button>
      </div>
    </div>
  );
}

function FreshFundEditPanel({
  row,
  onClose,
  onSaved,
  onDeleted,
  onNavigate,
}: {
  row: FreshFundRow;
  onClose: () => void;
  onSaved: (updated: FreshFundRow) => void;
  onDeleted: (id: string) => void;
  onNavigate?: (view: string) => void;
}) {
  const [draft, setDraft] = useState<FreshFundRow>({ ...row });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = <K extends keyof FreshFundRow>(k: K, v: FreshFundRow[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  const confidencePct = draft.source_confidence != null ? Math.round(draft.source_confidence * 100) : null;
  const setConfidencePct = (v: number | null) => set("source_confidence", v != null ? v / 100 : null);

  const handleSave = async () => {
    setSaving(true);
    const ws = draft.firm_website_url?.trim() ?? "";
    const dom = draft.firm_domain?.trim() ?? "";
    const websiteUrlFromDomain =
      dom && !ws
        ? (/^https?:\/\//i.test(dom) ? dom : `https://${dom.replace(/^www\./i, "")}`)
        : draft.firm_website_url;
    const patch = {
      name: draft.fund_name,
      fund_type: draft.fund_type,
      fund_sequence_number: draft.fund_sequence_number,
      vintage_year: draft.vintage_year,
      announced_date: draft.announced_date,
      close_date: draft.close_date,
      target_size_usd: draft.target_size_usd,
      final_size_usd: draft.final_size_usd,
      currency: draft.currency,
      status: draft.status,
      source_confidence: draft.source_confidence,
      source_count: draft.source_count,
      announcement_url: draft.announcement_url,
      announcement_title: draft.announcement_title,
      stage_focus: draft.stage_focus ?? [],
      sector_focus: draft.sector_focus ?? [],
      geography_focus: draft.geography_focus ?? [],
      likely_actively_deploying: draft.likely_actively_deploying,
      active_deployment_window_start: draft.active_deployment_window_start,
      active_deployment_window_end: draft.active_deployment_window_end,
      manually_verified: draft.manually_verified,
      verification_status: draft.verification_status,
      estimated_check_min_usd: draft.estimated_check_min_usd,
      estimated_check_max_usd: draft.estimated_check_max_usd,
      firm_name: draft.firm_name,
      website_url: websiteUrlFromDomain,
      logo_url: draft.firm_logo_url,
      location: draft.firm_location,
      hq_city: draft.firm_hq_city,
      hq_state: draft.firm_hq_state,
      hq_country: draft.firm_hq_country,
      aum: draft.firm_aum,
      aum_usd: draft.firm_aum_usd,
      has_fresh_capital: draft.has_fresh_capital,
      fresh_capital_priority_score: draft.fresh_capital_priority_score,
    };
    const { row: updated, error } = await patchFreshFund(row.id, patch);
    setSaving(false);
    if (error || !updated) {
      toast.error(`Save failed: ${error ?? "no data returned"}`);
      return;
    }
    toast.success("Fresh Capital fund saved");
    onSaved(updated);
  };

  const handleDelete = async () => {
    const label = draft.fund_name?.trim() || row.fund_name || "this fund";
    if (
      !window.confirm(
        `Remove this fund from New Funds?\n\n${label}\n\nThe vehicle is soft-deleted (vc_funds.deleted_at). It will disappear from the public feed.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    const { error } = await deleteFreshFund(row.id);
    setDeleting(false);
    if (error) {
      toast.error(`Delete failed: ${error}`);
      return;
    }
    toast.success("Fund removed from New Funds");
    onDeleted(row.id);
  };

  return (
    <div
      style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: 480,
        zIndex: 50, background: "#0c0c0c",
        borderLeft: "1px solid rgba(255,255,255,0.07)",
        display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.6)",
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div>
          <p className="text-[11px] font-mono uppercase tracking-widest" style={{ color: "#2EE6A6" }}>Edit New Funds Row</p>
          <p className="text-[13px] font-semibold text-white/80 mt-0.5 truncate max-w-[350px]">
            {draft.firm_name ?? "Unknown firm"} · {draft.fund_name}
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/05 transition-colors">
          <X className="h-4 w-4" style={{ color: "rgba(255,255,255,0.4)" }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        <Sect title="Firm / Company" />
        {/* Firm record ID + navigation */}
        <div className="rounded-lg border px-3 py-2.5 flex items-center justify-between gap-3"
          style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Linked Firm ID</p>
            <p className="font-mono text-[11px] truncate" style={{ color: "rgba(255,255,255,0.55)" }}>{draft.firm_record_id}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              title="Copy firm ID"
              onClick={() => { navigator.clipboard.writeText(draft.firm_record_id); toast.success("Firm ID copied"); }}
              className="rounded border px-2 py-1 font-mono text-[10px] transition-colors hover:bg-white/[0.06]"
              style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}
            >Copy</button>
            {onNavigate && (
              <button
                type="button"
                onClick={() => { onNavigate("firm-records"); toast.info("Firm ID copied — paste it in the search box", { duration: 4000 }); navigator.clipboard.writeText(draft.firm_record_id); }}
                className="rounded border px-2 py-1 text-[10px] font-semibold transition-colors hover:bg-emerald-500/10"
                style={{ borderColor: "rgba(46,230,166,0.35)", color: "#2EE6A6" }}
              >View in Firm Records ↗</button>
            )}
          </div>
        </div>
        <TF label="Firm Name" value={draft.firm_name} onChange={v => set("firm_name", v)} />
        <div className="flex items-end gap-3">
          <LogoPreview
            src={draft.firm_logo_url}
            initial={(draft.firm_name?.trim().charAt(0) || "?").toUpperCase()}
          />
          <div className="min-w-0 flex-1">
            <LinkField
              label="Company Logo URL"
              value={draft.firm_logo_url}
              onChange={v => set("firm_logo_url", v)}
              placeholder="https://firm.com/logo.svg"
            />
          </div>
        </div>
        <LinkField label="Company Website" value={draft.firm_website_url} onChange={v => set("firm_website_url", v)} placeholder="https://firm.com" />
        <TF label="Domain" value={draft.firm_domain} onChange={v => set("firm_domain", v)} placeholder="firm.com" />
        <TF label="Location Display" value={draft.firm_location} onChange={v => set("firm_location", v)} />
        <div className="grid grid-cols-3 gap-3">
          <TF label="HQ City" value={draft.firm_hq_city} onChange={v => set("firm_hq_city", v)} />
          <TF label="HQ State" value={draft.firm_hq_state} onChange={v => set("firm_hq_state", v)} />
          <TF label="HQ Country" value={draft.firm_hq_country} onChange={v => set("firm_hq_country", v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TF label="AUM Raw" value={draft.firm_aum} onChange={v => set("firm_aum", v)} placeholder="7000000000" />
          <NF label="AUM USD" value={draft.firm_aum_usd} onChange={v => set("firm_aum_usd", v)} step={1000000} />
        </div>

        <Sect title="Fund" />
        <TF label="Fund Name" value={draft.fund_name} onChange={v => set("fund_name", v)} />
        <div className="grid grid-cols-2 gap-3">
          <TF label="Fund Type" value={draft.fund_type} onChange={v => set("fund_type", v)} />
          <SFld label="Status" value={draft.status} onChange={v => set("status", v)} options={[...VC_FUND_STATUSES]} allowEmpty={false} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NF label="Target Size USD" value={draft.target_size_usd} onChange={v => set("target_size_usd", v)} step={1000000} />
          <NF label="Final Size USD" value={draft.final_size_usd} onChange={v => set("final_size_usd", v)} step={1000000} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NF label="Est. Check Min (USD)" value={draft.estimated_check_min_usd} onChange={v => set("estimated_check_min_usd", v)} step={25000} />
          <NF label="Est. Check Max (USD)" value={draft.estimated_check_max_usd} onChange={v => set("estimated_check_max_usd", v)} step={25000} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <NF label="Fund #" value={draft.fund_sequence_number} onChange={v => set("fund_sequence_number", v)} />
          <NF label="Vintage" value={draft.vintage_year} onChange={v => set("vintage_year", v)} />
          <TF label="Currency" value={draft.currency} onChange={v => set("currency", v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TF label="Announced Date" value={draft.announced_date} onChange={v => set("announced_date", v)} type="date" />
          <TF label="Close Date" value={draft.close_date} onChange={v => set("close_date", v)} type="date" />
        </div>

        <Sect title="Public Feed Tags" />
        <TagF label="Stage Focus" value={draft.stage_focus} onChange={v => set("stage_focus", v)} />
        <TagF label="Geo Focus" value={draft.geography_focus} onChange={v => set("geography_focus", v)} />
        <TagF label="Themes / Sector Focus" value={draft.sector_focus} onChange={v => set("sector_focus", v)} />

        <Sect title="Announcement" />
        <LinkField label="Announcement Link" value={draft.announcement_url} onChange={v => set("announcement_url", v)} />
        <TA label="Announcement Title" value={draft.announcement_title} onChange={v => set("announcement_title", v)} rows={2} />
        <div className="grid grid-cols-2 gap-3">
          <NF label="Source Confidence (0-100)" value={confidencePct} onChange={setConfidencePct} />
          <NF label="Source Count" value={draft.source_count} onChange={v => set("source_count", v)} />
        </div>

        <Sect title="Deployment & Review" />
        <BF label="Likely Actively Deploying" value={Boolean(draft.likely_actively_deploying)} onChange={v => set("likely_actively_deploying", v)} />
        <div className="grid grid-cols-2 gap-3">
          <TF label="Deploy Window Start" value={draft.active_deployment_window_start} onChange={v => set("active_deployment_window_start", v)} type="date" />
          <TF label="Deploy Window End" value={draft.active_deployment_window_end} onChange={v => set("active_deployment_window_end", v)} type="date" />
        </div>
        <BF label="Has Fresh Capital" value={Boolean(draft.has_fresh_capital)} onChange={v => set("has_fresh_capital", v)} />
        <BF label="Manually Verified" value={Boolean(draft.manually_verified)} onChange={v => set("manually_verified", v)} />
        <div className="grid grid-cols-2 gap-3">
          <NF label="Priority Score" value={draft.fresh_capital_priority_score} onChange={v => set("fresh_capital_priority_score", v)} step={1} />
          <TF label="Verification Status" value={draft.verification_status} onChange={v => set("verification_status", v)} />
        </div>
      </div>

      <div
        className="flex flex-col gap-2 px-5 py-4 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-[12px] font-semibold transition-colors disabled:opacity-40"
            style={{ background: "#2EE6A6", color: "#050505" }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-md px-4 py-2 text-[12px] font-medium transition-colors disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
          >
            Cancel
          </button>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving || deleting}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-red-500/35 bg-red-500/10 py-2 text-[12px] font-semibold text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-40"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          {deleting ? "Deleting…" : "Delete fund"}
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

function fmtUsd(amount: number | null): string {
  if (amount == null) return "—";
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const t = value?.trim();
    if (t) return t;
  }
  return null;
}

function publicAmount(row: DealRow): string {
  return firstText(row.amount_raw) ?? fmtAmount(row.amount_minor_units, row.currency);
}

const HDR: React.CSSProperties = {
  fontSize: 10, fontFamily: "monospace", letterSpacing: "0.15em",
  textTransform: "uppercase", color: "rgba(255,255,255,0.3)", padding: "6px 12px",
};
const CELL: React.CSSProperties = { padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.75)" };

// ── Add fund / add deal modals ─────────────────────────────────────────────────

function AddFundModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (row: FreshFundRow) => void;
}) {
  const [firmRecordId, setFirmRecordId] = useState("");
  const [fundName, setFundName] = useState("");
  const [vintageYear, setVintageYear] = useState("");
  const [announcedDate, setAnnouncedDate] = useState("");
  const [status, setStatus] = useState("announced");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFirmRecordId("");
      setFundName("");
      setVintageYear("");
      setAnnouncedDate("");
      setStatus("announced");
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const fid = firmRecordId.trim();
    const fn = fundName.trim();
    if (!fid || !fn) {
      toast.error("Firm record ID and fund name are required");
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      firm_record_id: fid,
      name: fn,
      status,
    };
    const vy = vintageYear.trim();
    if (vy) {
      const n = Number.parseInt(vy, 10);
      if (Number.isFinite(n)) payload.vintage_year = n;
    }
    if (announcedDate.trim()) payload.announced_date = announcedDate.trim();
    const { row, error } = await createFreshFund(payload);
    setSaving(false);
    if (error) {
      toast.error("Could not create fund", { description: error });
      return;
    }
    if (row) {
      toast.success("Fund created");
      onCreated(row);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-fund-title"
    >
      <div
        className="w-full max-w-md rounded-xl border p-5 shadow-xl"
        style={{ borderColor: "rgba(255,255,255,0.12)", background: "#0c0c0c" }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="add-fund-title" className="text-[15px] font-semibold text-white/90">
              Add fund vehicle
            </h2>
            <p className="mt-1 text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.38)" }}>
              Creates a row in <span className="font-mono text-white/55">vc_funds</span> linked to an existing firm. Use the firm&apos;s UUID from Firm Records admin.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <TF label="Firm record ID (UUID)" value={firmRecordId} onChange={setFirmRecordId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          <TF label="Fund name" value={fundName} onChange={setFundName} placeholder="e.g. Acme Ventures IV" />
          <div className="grid grid-cols-2 gap-3">
            <TF label="Vintage year" value={vintageYear} onChange={setVintageYear} placeholder="2026" />
            <TF label="Announced date" value={announcedDate} onChange={setAnnouncedDate} type="date" />
          </div>
          <SFld label="Fund status" value={status} onChange={setStatus} options={[...VC_FUND_STATUSES]} allowEmpty={false} />
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ background: "#2EE6A6", color: "#050505" }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create fund
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-[12px] font-medium"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function AddDealModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (row: DealRow) => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [roundType, setRoundType] = useState("series_a");
  const [announcedDate, setAnnouncedDate] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [leadInvestor, setLeadInvestor] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [sourceType, setSourceType] = useState("news");
  const [needsReview, setNeedsReview] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCompanyName("");
      setRoundType("series_a");
      setAnnouncedDate("");
      setAmountRaw("");
      setLeadInvestor("");
      setCompanyWebsite("");
      setSourceType("news");
      setNeedsReview(false);
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const cn = companyName.trim();
    if (!cn) {
      toast.error("Company name is required");
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      company_name: cn,
      round_type_normalized: roundType,
      round_type_raw: roundType.replace(/_/g, " "),
      source_type: sourceType,
      needs_review: needsReview,
    };
    if (announcedDate.trim()) payload.announced_date = announcedDate.trim();
    if (amountRaw.trim()) payload.amount_raw = amountRaw.trim();
    if (leadInvestor.trim()) payload.lead_investor = leadInvestor.trim();
    if (companyWebsite.trim()) payload.company_website = companyWebsite.trim();
    const { row, error } = await createDealRecord(payload);
    setSaving(false);
    if (error) {
      toast.error("Could not create funding round", { description: error });
      return;
    }
    if (row) {
      toast.success("Funding round added");
      onCreated(row);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-deal-title"
    >
      <div
        className="w-full max-w-md rounded-xl border p-5 shadow-xl"
        style={{ borderColor: "rgba(255,255,255,0.12)", background: "#0c0c0c" }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="add-deal-title" className="text-[15px] font-semibold text-white/90">
              Add funding round
            </h2>
            <p className="mt-1 text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.38)" }}>
              Inserts into <span className="font-mono text-white/55">fi_deals_canonical</span> for the Fresh Capital feed.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <TF label="Company name" value={companyName} onChange={setCompanyName} placeholder="PortfolioCo Inc." />
          <SFld label="Round type" value={roundType} onChange={setRoundType} options={[...ROUND_TYPES]} allowEmpty={false} />
          <TF label="Announced date" value={announcedDate} onChange={setAnnouncedDate} type="date" />
          <TF label="Amount (display)" value={amountRaw} onChange={setAmountRaw} placeholder="$25M, €10m, …" />
          <TF label="Lead investor" value={leadInvestor} onChange={setLeadInvestor} />
          <TF label="Company website" value={companyWebsite} onChange={setCompanyWebsite} placeholder="https://…" />
          <SFld label="Source type" value={sourceType} onChange={setSourceType} options={[...SOURCE_TYPES]} allowEmpty={false} />
          <label className="flex cursor-pointer items-center gap-2 text-[12px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            <input
              type="checkbox"
              checked={needsReview}
              onChange={e => setNeedsReview(e.target.checked)}
              className="rounded border-white/20"
            />
            Flag for review queue
          </label>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ background: "#2EE6A6", color: "#050505" }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create round
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-[12px] font-medium"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Fund Watch Component ───────────────────────────────────────────────────────

function FreshFundsAdmin({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const [rows, setRows] = useState<FreshFundRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FreshFundRow | null>(null);
  const [addFundOpen, setAddFundOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { rows: r, total: t, error: e } = await fetchFreshFunds({ page, search, stage });
    setLoading(false);
    if (e) { setError(e); return; }
    setRows(r);
    setTotal(t);
  }, [page, search, stage]);

  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSaved = (updated: FreshFundRow) => {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
    setSelected(updated);
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white/90">Fresh Capital New Funds</h1>
          <p className="mt-0.5 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Edits the public /fresh-capital New Funds rows from vc_funds + firm_records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAddFundOpen(true)}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-semibold transition-colors"
            style={{ borderColor: "rgba(46,230,166,0.35)", color: "#2EE6A6", background: "rgba(46,230,166,0.08)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add fund
          </button>
          <button
            type="button"
            onClick={() => { setPage(0); void load(); }}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      <FreshCapitalPublicPathsAdmin />

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input
            placeholder="Search fund name..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 text-[12px] h-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)" }}
          />
        </div>
        <Select value={stage} onValueChange={v => { setStage(v); setPage(0); }}>
          <SelectTrigger className="w-[160px] h-8 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {STAGE_FOCUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          {total.toLocaleString()} funds total
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border px-4 py-3"
          style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)" }}>
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />
          <span className="text-[12px]" style={{ color: "#ef4444" }}>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-auto rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 0.7fr 0.75fr 0.9fr 0.9fr 1.2fr", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {["Firm","Fund","Size","Announced","Stage Focus","Geo Focus","Themes"].map(h => (
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
            No funds found
          </div>
        )}

        {!loading && rows.map(row => {
          const isSelected = selected?.id === row.id;
          const size = fmtUsd(row.final_size_usd ?? row.target_size_usd);
          return (
            <div
              key={row.id}
              onClick={() => setSelected(isSelected ? null : row)}
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 1fr 0.7fr 0.75fr 0.9fr 0.9fr 1.2fr",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                cursor: "pointer",
                background: isSelected ? "rgba(46,230,166,0.06)" : undefined,
                transition: "background 0.15s",
              }}
              className="hover:bg-white/[0.02]"
            >
              <div style={CELL}>
                <div className="flex min-w-0 items-center gap-2">
                  <LogoPreview src={row.firm_logo_url} initial={(row.firm_name?.charAt(0) || "?").toUpperCase()} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{row.firm_name ?? "—"}</div>
                    <div className="text-[10px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {firstText(row.firm_website_url, row.firm_domain, row.firm_location) ?? "—"}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.65)" }} className="truncate">{row.fund_name}</div>
              <div style={{ ...CELL, fontFamily: "monospace" }}>{size}</div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{fmtDate(row.announced_date)}</div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.5)" }} className="truncate">{(row.stage_focus ?? []).join(", ") || "—"}</div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.5)" }} className="truncate">{(row.geography_focus ?? []).join(", ") || "—"}</div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.5)" }} className="truncate">{(row.sector_focus ?? []).join(", ") || "—"}</div>
            </div>
          );
        })}
      </div>

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

      {selected && (
        <FreshFundEditPanel
          row={selected}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
          onDeleted={(id) => {
            setRows(prev => prev.filter(r => r.id !== id));
            setTotal(t => Math.max(0, t - 1));
            setSelected(null);
          }}
          onNavigate={onNavigate}
        />
      )}

      <AddFundModal
        open={addFundOpen}
        onClose={() => setAddFundOpen(false)}
        onCreated={(row) => {
          setRows(prev => [row, ...prev]);
          setTotal(t => t + 1);
          setSelected(row);
        }}
      />
    </div>
  );
}

// ── Latest Funding Component ──────────────────────────────────────────────────

function LatestFundingDealsAdmin() {
  const [rows,       setRows]       = useState<DealRow[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(0);
  const [search,     setSearch]     = useState("");
  const [needsReview,setNeedsReview]= useState("all");
  const [roundFilter,setRoundFilter]= useState("all");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [selected,   setSelected]   = useState<DealRow | null>(null);
  const [addDealOpen, setAddDealOpen] = useState(false);

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
  const sectorOptions = useMemo(
    () => buildSectorOptions([
      ...DEFAULT_SECTOR_OPTIONS,
      ...rows.flatMap(row => [row.sector_normalized, row.sector_raw]),
    ]),
    [rows],
  );

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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAddDealOpen(true)}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-semibold transition-colors"
            style={{ borderColor: "rgba(46,230,166,0.35)", color: "#2EE6A6", background: "rgba(46,230,166,0.08)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add funding round
          </button>
          <button
            type="button"
            onClick={() => { setPage(0); void load(); }}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      <FreshCapitalPublicPathsAdmin />

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
                {firstText(row.company_website, row.company_domain) && (
                  <div className="text-[10px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {firstText(row.company_website, row.company_domain)}
                  </div>
                )}
              </div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.5)" }}>{firstText(row.sector_normalized, row.sector_raw) ?? "—"}</div>
              <div style={CELL}>
                {firstText(row.round_type_normalized, row.round_type_raw) ? (
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-mono"
                    style={{ background: "rgba(46,230,166,0.1)", color: "#2EE6A6" }}>
                    {firstText(row.round_type_normalized, row.round_type_raw)}
                  </span>
                ) : "—"}
              </div>
              <div style={{ ...CELL, fontFamily: "monospace" }}>{publicAmount(row)}</div>
              <div style={{ ...CELL, color: "rgba(255,255,255,0.6)" }} className="truncate">
                {firstText(row.lead_investor, row.lead_investor_normalized) ?? "—"}
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
          key={selected.id}
          row={selected}
          sectorOptions={sectorOptions}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
          onDeleted={(id) => {
            setRows(prev => prev.filter(r => r.id !== id));
            setTotal(t => Math.max(0, t - 1));
            setSelected(null);
          }}
        />
      )}

      <AddDealModal
        open={addDealOpen}
        onClose={() => setAddDealOpen(false)}
        onCreated={(row) => {
          setRows(prev => [row, ...prev]);
          setTotal(t => t + 1);
          setSelected(row);
        }}
      />
    </div>
  );
}

export function AdminFreshCapital({ onNavigate }: { onNavigate?: (view: string) => void } = {}) {
  const [view, setView] = useState<"funds" | "deals" | "enrichment">("funds");

  return (
    <div className="flex h-full flex-col gap-5">
      <div
        className="inline-flex w-max flex-wrap items-center gap-1 rounded-lg border p-1"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
      >
        {[
          ["funds", "New Funds"],
          ["deals", "Latest Funding"],
          ["enrichment", "Enrichment"],
        ].map(([key, label]) => {
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setView(key as "funds" | "deals" | "enrichment")}
              className="rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors"
              style={{
                background: active ? "rgba(46,230,166,0.12)" : "transparent",
                color: active ? "#2EE6A6" : "rgba(255,255,255,0.45)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {view === "funds" && <FreshFundsAdmin onNavigate={onNavigate} />}
      {view === "deals" && <LatestFundingDealsAdmin />}
      {view === "enrichment" && <FreshCapitalEnrichmentAdmin />}
    </div>
  );
}
