/**
 * AdminMarketIntelligence
 *
 * Browse and full-edit Companies, Founders, and Operators.
 * Click any row to open a slide-in edit panel with all fields.
 * All reads + writes go through the admin-market-intel edge function.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AlertCircle, Briefcase, Building2, CheckCircle2, ChevronLeft, ChevronRight,
  ExternalLink, Loader2, RefreshCw, Save, Search, Target, Unlink, Users, X, XCircle,
} from "lucide-react";
import { BouncingDots } from "@/components/loading-ui/bouncing-dots";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { getSupabaseBearerForFunctions, supabase } from "@/integrations/supabase/client";
import { Constants } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { formatCanonicalHqLine, resolveFirmDisplayLocation } from "@/lib/formatCanonicalHqLine";
import { formatRoundKind } from "@/lib/latestFundingFilters";
import { AdminStickyFilters, AdminStickyHeader } from "@/components/admin/AdminStickyHeader";
import { CompanyHqFields } from "@/components/admin/CompanyHqFields";
import {
  formatMoneyRaisedDollars,
  moneyRaisedEntryFromUsd,
  sanitizeMoneyRaisedInput,
  usdFromMoneyRaisedEntry,
  type MoneyRaisedUnit,
} from "@/lib/moneyRaisedAmount";
import { totalRaisedFromFundingRounds } from "@/lib/totalRaisedFromFundingRounds";

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
/** `startups.status` is the StartupStatus enum (uppercase labels). */
const COMPANY_STATUSES    = ["ACTIVE","ACQUIRED","SHUT_DOWN","IPO","UNKNOWN"];
/** `startups.record_status` is the catalog workflow status, separate from operating status. */
const RECORD_STATUSES = [
  { value: "live", label: "Live" },
  { value: "needs_review", label: "Needs Review" },
  { value: "archived", label: "Archived" },
] as const;

type RecordStatus = (typeof RECORD_STATUSES)[number]["value"];

function normalizeRecordStatus(value: string | null | undefined): RecordStatus {
  return value === "needs_review" || value === "archived" ? value : "live";
}

function recordStatusLabel(value: string | null | undefined): string {
  const key = normalizeRecordStatus(value);
  return RECORD_STATUSES.find((option) => option.value === key)?.label ?? "Live";
}

function recordStatusColor(value: string | null | undefined): string {
  const key = normalizeRecordStatus(value);
  if (key === "needs_review") return "#5B5CFF";
  if (key === "archived") return "#94a3b8";
  return "#2EE6A6";
}
/** `startups.sector` is the SectorFocus enum. */
const SECTOR_WORD_LABELS: Record<string, string> = { ai: "AI", saas: "SaaS", web3: "Web3" };

function formatSectorSchemaLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => SECTOR_WORD_LABELS[word] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const COMPANY_SECTORS = Constants.public.Enums.SectorFocus.map((value) => ({
  value,
  label: formatSectorSchemaLabel(value),
}));
const FOUNDER_ARCHETYPES  = ["technical","commercial","operator","domain_expert","unknown"];

type TabKey = "companies" | "founders" | "operators";

// ── Types ──────────────────────────────────────────────────────────────────────

type CompanyRow = {
  id: string;
  company_name: string;
  company_url: string | null;
  logo_url: string | null;
  brand_icon_url: string | null;
  description_short: string | null;
  description_long: string | null;
  sector: string | null;
  stage: string | null;
  status: string | null;
  record_status: RecordStatus | null;
  /** Stored combined HQ line. The company editor does not change this; save omits it. */
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
  startup_id: string | null;
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
  /** Present when the person is stored on operator_profiles but classified as a founder by title. */
  source?: "operator_profiles";
  operator_city?: string | null;
  operator_state?: string | null;
  operator_country?: string | null;
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
  startup_id: string | null;
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCompanyById(id: string): Promise<{ row?: CompanyRow; error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  const companyId = id.trim();
  if (!companyId) return { error: "Missing company id" };
  try {
    const params = new URLSearchParams({ entity: "companies", id: companyId });
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${params}`, {
      headers: await adminHeaders(),
    });
    const json = await res.json().catch(() => ({})) as { row?: CompanyRow; error?: string; message?: string };
    if (!res.ok) return { error: json.error ?? json.message ?? `HTTP ${res.status}` };
    if (!json.row) return { error: "Company not found" };
    return { row: json.row };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

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

  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-market-intel?${params}`,
        { headers: await adminHeaders() },
      );
      const json = await res.json().catch(() => ({})) as { rows?: T[]; total?: number; error?: string; message?: string };
      if (res.status === 429 && attempt < maxAttempts - 1) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1);
        await wait(waitMs);
        continue;
      }
      if (!res.ok) return { rows: [], total: 0, error: json.error ?? json.message ?? `HTTP ${res.status}` };
      return { rows: json.rows ?? [], total: json.total ?? 0 };
    } catch (e: unknown) {
      return { rows: [], total: 0, error: String(e) };
    }
  }
  return { rows: [], total: 0, error: "Request failed" };
}

/** A full parallel page walk trips the edge function rate limit (HTTP 429). */
const METRICS_FETCH_CONCURRENCY = 3;

async function mapWithConcurrency<T>(
  items: number[],
  concurrency: number,
  fn: (item: number) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
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
  const remainingResults = await mapWithConcurrency(remainingPages, METRICS_FETCH_CONCURRENCY, (page) =>
    fetchRows<T>(entity, { page, search: "", filter, limit: metricsPageSize }),
  );

  for (const result of remainingResults) {
    if (result.error) return { rows: allRows, total, error: result.error };
    allRows.push(...result.rows);
  }
  return { rows: allRows, total };
}

type CompanyOption = { id: string; company_name: string; status: string | null };

let companyOptionsCache: CompanyOption[] | null = null;
let companyOptionsInflight: Promise<CompanyOption[]> | null = null;

function rememberCompany(option: CompanyOption) {
  const list = companyOptionsCache ?? [];
  if (list.some((row) => row.id === option.id)) return;
  companyOptionsCache = [...list, option].sort((a, b) => a.company_name.localeCompare(b.company_name));
}

function loadCompanyOptions(): Promise<CompanyOption[]> {
  if (companyOptionsCache) return Promise.resolve(companyOptionsCache);
  if (!companyOptionsInflight) {
    companyOptionsInflight = fetchAllRows<CompanyRow>("companies").then(({ rows, error }) => {
      if (error) throw new Error(error);
      const options = rows
        .map((row) => ({ id: row.id, company_name: row.company_name, status: row.status }))
        .sort((a, b) => a.company_name.localeCompare(b.company_name));
      companyOptionsCache = options;
      return options;
    }).finally(() => {
      companyOptionsInflight = null;
    });
  }
  return companyOptionsInflight;
}

/** Live companies are status ACTIVE. A name-only company does not meet that, so it is stored as UNKNOWN. */
async function createNonLiveCompany(name: string): Promise<{ option?: CompanyOption; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a company name." };
  const existing = await loadCompanyOptions().catch(() => [] as CompanyOption[]);
  const match = existing.find((row) => row.company_name.toLowerCase() === trimmed.toLowerCase());
  if (match) return { option: match };
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-create-company`, {
      method: "POST",
      headers: await adminHeaders(),
      body: JSON.stringify({ company_name: trimmed }),
    });
    const json = await res.json().catch(() => ({})) as { row?: CompanyOption; error?: string };
    if (!res.ok || !json.row) return { error: json.error ?? `HTTP ${res.status}` };
    if (isActiveCompanyStatus(json.row.status)) return { error: "New companies cannot be created as live." };
    const option = {
      id: json.row.id,
      company_name: json.row.company_name,
      status: json.row.status ?? null,
    };
    rememberCompany(option);
    return { option };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Could not add company." };
  }
}

async function withOperatorStartupIds(rows: OperatorRow[]): Promise<OperatorRow[]> {
  const { data, error } = await supabase
    .from("operator_profiles")
    .select("id, startup_id")
    .not("startup_id", "is", null);
  if (error || !data) return rows.map((row) => ({ ...row, startup_id: row.startup_id ?? null }));
  const byId = new Map(data.map((row) => [row.id, row.startup_id]));
  return rows.map((row) => ({ ...row, startup_id: byId.get(row.id) ?? row.startup_id ?? null }));
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

function MoneyRaisedField({ label, value, onChange }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
}) {
  const seeded = moneyRaisedEntryFromUsd(value);
  const [text, setText] = useState(seeded.text);
  const [unit, setUnit] = useState<MoneyRaisedUnit>(seeded.unit);
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(false);
  const lastPushed = useRef<number | null | undefined>(undefined);
  const editedUsd = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (Object.is(lastPushed.current, value)) return;
    const entry = moneyRaisedEntryFromUsd(value);
    setText(entry.text);
    setUnit(entry.unit);
    lastPushed.current = value;
    editedUsd.current = undefined;
  }, [value]);

  const publish = (nextText: string, nextUnit: MoneyRaisedUnit) => {
    setText(nextText);
    setUnit(nextUnit);
    const usd = usdFromMoneyRaisedEntry(nextText, nextUnit);
    editedUsd.current = usd;
    lastPushed.current = usd;
    if (!Object.is(usd, value)) onChange(usd);
  };

  const blurredUsd = editedUsd.current !== undefined ? editedUsd.current : value;
  const display = focused ? text : formatMoneyRaisedDollars(blurredUsd);

  return (
    <FL label={label}>
      <div className="flex items-stretch rounded" style={IS}>
        <span
          className="flex items-center pl-3 text-[12px] select-none"
          style={{ color: "rgba(255,255,255,0.72)" }}
          aria-hidden
        >
          $
        </span>
        <input
          className="min-w-0 flex-1 bg-transparent py-1.5 pl-1.5 pr-2 text-[12px] text-white/80 focus:outline-none"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-label={label}
          value={display}
          onChange={(e) => {
            const raw = e.target.value;
            const expanded = formatMoneyRaisedDollars(
              editedUsd.current !== undefined ? editedUsd.current : value,
            );
            if (expanded && raw === expanded) return;
            const editing = e.currentTarget === document.activeElement;
            focusedRef.current = editing;
            if (editing) setFocused(true);
            publish(sanitizeMoneyRaisedInput(raw), unit);
          }}
          onFocus={(e) => {
            focusedRef.current = true;
            setFocused(true);
            const expanded = formatMoneyRaisedDollars(
              editedUsd.current !== undefined ? editedUsd.current : value,
            );
            if (expanded && e.currentTarget.value === expanded && e.currentTarget.value !== text) {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
              setter?.call(e.currentTarget, text);
            }
            if (e.currentTarget.parentElement) Object.assign(e.currentTarget.parentElement.style, IF);
          }}
          onBlur={(e) => {
            focusedRef.current = false;
            setFocused(false);
            if (e.currentTarget.parentElement) Object.assign(e.currentTarget.parentElement.style, IS);
          }}
        />
        <div
          className="flex shrink-0 items-stretch gap-0.5 p-0.5"
          role="group"
          aria-label="Money raised unit"
          style={{ borderLeft: "1px solid rgba(255,255,255,0.09)" }}
        >
          {(["K", "M"] as const).map((option) => {
            const selected = unit === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                aria-label={option === "K" ? "Thousands" : "Millions"}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (option !== unit) publish(text, option);
                }}
                className="rounded px-2 text-[11px] font-semibold"
                style={{
                  background: selected ? "rgba(46,230,166,0.12)" : "transparent",
                  color: selected ? "#2EE6A6" : "rgba(255,255,255,0.4)",
                }}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
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

type SelectOption = string | { value: string; label: string };

function SFld({ label, value, onChange, options, allowEmpty = true }: {
  label: string; value: string | null; onChange: (v: string) => void; options: readonly SelectOption[];
  allowEmpty?: boolean;
}) {
  const items = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
  const current = value ?? "";
  const rendered = current && !items.some((item) => item.value === current)
    ? [{ value: current, label: current }, ...items]
    : items;

  return (
    <FL label={label}>
      <select
        className={IC} style={IS}
        value={current}
        onChange={e => onChange(e.target.value)}
        onFocus={e => Object.assign(e.currentTarget.style, IF)}
        onBlur={e  => Object.assign(e.currentTarget.style, IS)}
      >
        {allowEmpty ? <option value="">— none —</option> : null}
        {rendered.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </FL>
  );
}

function CompanyField({
  startupId,
  onChange,
  allowEmpty = false,
}: {
  startupId: string | null;
  onChange: (startupId: string | null) => void;
  allowEmpty?: boolean;
}) {
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCompanyOptions()
      .then((rows) => { if (!cancelled) setOptions(rows); })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load companies.");
      });
    return () => { cancelled = true; };
  }, []);

  const selected = options.find((row) => row.id === startupId) ?? null;
  const trimmed = query.trim();
  const filtered = options.filter((row) =>
    row.company_name.toLowerCase().includes(trimmed.toLowerCase()),
  ).slice(0, 40);
  const hasExact = trimmed.length > 0 && options.some((row) => row.company_name.toLowerCase() === trimmed.toLowerCase());
  const shownName = open ? query : (selected?.company_name ?? "");

  const choose = (option: CompanyOption) => {
    onChange(option.id);
    setQuery("");
    setOpen(false);
    setError(null);
    setOptions((prev) => prev.some((row) => row.id === option.id) ? prev : [...prev, option].sort((a, b) => a.company_name.localeCompare(b.company_name)));
  };

  const addCompany = async () => {
    setAdding(true);
    setError(null);
    const result = await createNonLiveCompany(trimmed);
    setAdding(false);
    if (result.error || !result.option) {
      setError(result.error ?? "Could not add company.");
      return;
    }
    choose(result.option);
  };

  return (
    <FL label="Company">
      <input
        className={IC}
        style={IS}
        value={shownName}
        placeholder="Search companies"
        onFocus={(e) => {
          setOpen(true);
          setQuery(selected?.company_name ?? "");
          Object.assign(e.currentTarget.style, IF);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={(e) => {
          Object.assign(e.currentTarget.style, IS);
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && (
        <div
          className="mt-1 max-h-48 overflow-y-auto rounded"
          style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          {allowEmpty && (
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-white/[0.04]"
              style={{ color: "rgba(255,255,255,0.45)" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(null); setQuery(""); setOpen(false); }}
            >
              No company
            </button>
          )}
          {filtered.map((option) => (
            <button
              key={option.id}
              type="button"
              className="block w-full truncate px-3 py-1.5 text-left text-[12px] hover:bg-white/[0.04]"
              style={{ color: option.id === startupId ? "#2EE6A6" : "rgba(255,255,255,0.8)" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.company_name}
            </button>
          ))}
          {trimmed && !hasExact && (
            <button
              type="button"
              disabled={adding}
              className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-white/[0.04] disabled:opacity-50"
              style={{ color: "#2EE6A6" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { void addCompany(); }}
            >
              {adding ? "Adding…" : `Add “${trimmed}”`}
            </button>
          )}
          {!trimmed && filtered.length === 0 && !loadError && (
            <div className="px-3 py-2 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>No companies yet</div>
          )}
        </div>
      )}
      {loadError && <p className="text-[11px]" style={{ color: "#ef4444" }}>{loadError}</p>}
      {error && <p className="text-[11px]" style={{ color: "#ef4444" }}>{error}</p>}
      {selected && !isActiveCompanyStatus(selected.status) && (
        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
          Not live until its status is Active.
        </p>
      )}
    </FL>
  );
}

function logoHref(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  return raw;
}

function asTagList(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === "string");
    } catch {
      /* A plain comma-separated value can also start with a bracket. */
    }
  }
  return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
}

function TagF({ label, value, onChange }: { label: string; value: string[] | string | null; onChange: (v: string[]) => void }) {
  return (
    <FL label={`${label} (comma-sep)`}>
      <input
        className={IC} style={IS}
        value={asTagList(value).join(", ")}
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

/** Stored values and labels are the same stable tokens. Earlier stages extend the investor-card list. */
const FUNDING_ROUND_OPTIONS = [
  { value: "Angel", label: "Angel" },
  { value: "Accelerator", label: "Accelerator" },
  { value: "Pre-Seed", label: "Pre-Seed" },
  { value: "Seed", label: "Seed" },
  { value: "Series A", label: "Series A" },
  { value: "Series B", label: "Series B" },
  { value: "Series C", label: "Series C" },
  { value: "Growth", label: "Growth" },
] as const;

type FundingRoundDraft = {
  key: string;
  id: string | null;
  round_type: string;
  amount_usd: number | null;
};

function blankFundingRound(): FundingRoundDraft {
  return { key: crypto.randomUUID(), id: null, round_type: "", amount_usd: null };
}

function normalizeFundingRounds(rows: FundingRoundDraft[]): FundingRoundDraft[] {
  const filled = rows.filter((row) => row.round_type);
  const empties = rows.filter((row) => !row.round_type);
  const pending = empties.length ? empties[empties.length - 1] : blankFundingRound();
  return [...filled, pending];
}

function fundingRoundLabel(value: string): string {
  return FUNDING_ROUND_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

type InvestorLinkRow = {
  id: string | null;
  firm_id: string;
  firm_name: string | null;
  firm_investor_id: string | null;
  investor_name: string | null;
  investor_title?: string | null;
  round_name: string | null;
  amount_usd: number | null;
  amount_label: string | null;
  portfolio_note: string | null;
  led_round?: boolean;
};

type CardPerson = { id: string; name: string; title: string | null; firm?: FirmHit };

type FirmHit = { id: string; firm_name: string | null };
type PersonHit = { id: string; full_name: string | null; firm_id: string | null; title: string | null; firm_name?: string | null };

async function loadCompanyInvestorLinks(startupId: string): Promise<{ rows: InvestorLinkRow[]; error?: string }> {
  if (!SUPABASE_URL) return { rows: [], error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=company-investors&startup_id=${encodeURIComponent(startupId)}`,
      { headers: await adminHeaders() },
    );
    const json = await res.json().catch(() => ({})) as { rows?: InvestorLinkRow[]; error?: string };
    if (!res.ok) return { rows: [], error: json.error ?? `HTTP ${res.status}` };
    return { rows: json.rows ?? [] };
  } catch (e: unknown) {
    return { rows: [], error: String(e) };
  }
}

async function unlinkCompanyInvestor(body: Record<string, unknown>): Promise<{ error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=company-investors`,
      { method: "POST", headers: await adminHeaders(), body: JSON.stringify({ ...body, action: "unlink" }) },
    );
    const json = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return {};
  } catch (e: unknown) {
    return { error: String(e) };
  }
}

type StoredFundingRound = {
  id: string;
  round_type: string;
  amount_usd: number | null;
  sort_order: number;
};

async function loadCompanyFundingRounds(startupId: string): Promise<{ rows: StoredFundingRound[]; error?: string }> {
  if (!SUPABASE_URL) return { rows: [], error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=company-funding-rounds&startup_id=${encodeURIComponent(startupId)}`,
      { headers: await adminHeaders() },
    );
    const json = await res.json().catch(() => ({})) as { rows?: StoredFundingRound[]; error?: string };
    if (!res.ok) return { rows: [], error: json.error ?? `HTTP ${res.status}` };
    return { rows: json.rows ?? [] };
  } catch (e: unknown) {
    return { rows: [], error: String(e) };
  }
}

async function saveCompanyFundingRounds(
  startupId: string,
  rounds: FundingRoundDraft[],
): Promise<{ rows: StoredFundingRound[]; error?: string }> {
  if (!SUPABASE_URL) return { rows: [], error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=company-funding-rounds`,
      {
        method: "POST",
        headers: await adminHeaders(),
        body: JSON.stringify({
          startup_id: startupId,
          rounds: rounds.filter((row) => row.round_type).map((row) => ({
            id: row.id,
            round_type: row.round_type,
            amount_usd: row.amount_usd,
          })),
        }),
      },
    );
    const json = await res.json().catch(() => ({})) as { rows?: StoredFundingRound[]; error?: string };
    if (!res.ok) return { rows: [], error: json.error ?? `HTTP ${res.status}` };
    return { rows: json.rows ?? [] };
  } catch (e: unknown) {
    return { rows: [], error: String(e) };
  }
}

async function createFirmInvestor(body: { firm_id: string; full_name: string; title: string }): Promise<{ person?: CardPerson; error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=investors`,
      { method: "POST", headers: await adminHeaders(), body: JSON.stringify(body) },
    );
    const json = await res.json().catch(() => ({})) as { row?: { id?: string; full_name?: string | null; title?: string | null }; error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    const id = json.row?.id;
    if (!id) return { error: "Investor was not created" };
    return {
      person: {
        id,
        name: json.row?.full_name?.trim() || body.full_name,
        title: json.row?.title ?? (body.title.trim() || null),
      },
    };
  } catch (e: unknown) {
    return { error: String(e) };
  }
}

async function saveCompanyInvestorLink(body: Record<string, unknown>): Promise<{ created?: boolean; error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=company-investors`,
      { method: "POST", headers: await adminHeaders(), body: JSON.stringify(body) },
    );
    const json = await res.json().catch(() => ({})) as { created?: boolean; error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { created: json.created === true };
  } catch (e: unknown) {
    return { error: String(e) };
  }
}

function FirmLookup({ selected, onSelect }: {
  selected: FirmHit | null;
  onSelect: (firm: FirmHit | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<FirmHit[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) { setHits([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchRows<FirmHit>("firms", { page: 0, search: q, limit: 8 }).then((res) => {
        if (!cancelled) setHits(res.rows);
      });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, open]);

  return (
    <FL label="Firm">
      <input
        className={IC} style={IS}
        placeholder="Search existing firms"
        value={open ? query : (selected?.firm_name ?? "")}
        onFocus={(e) => { setOpen(true); setQuery(selected?.firm_name ?? ""); Object.assign(e.currentTarget.style, IF); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (selected) onSelect(null); }}
        onBlur={(e) => { Object.assign(e.currentTarget.style, IS); window.setTimeout(() => setOpen(false), 150); }}
      />
      {open && query.trim().length >= 2 && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)" }}>
          {hits.length === 0 && <div className="px-3 py-2 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>No firms found</div>}
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              className="block w-full truncate px-3 py-1.5 text-left text-[12px] hover:bg-white/[0.04]"
              style={{ color: "rgba(255,255,255,0.8)" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(hit); setQuery(""); setOpen(false); }}
            >
              {hit.firm_name ?? "Untitled firm"}
            </button>
          ))}
        </div>
      )}
    </FL>
  );
}

function sameInvestorName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function peopleFromLinks(links: InvestorLinkRow[]): CardPerson[] {
  const seen = new Set<string>();
  const people: CardPerson[] = [];
  for (const link of links) {
    if (!link.firm_investor_id || seen.has(link.firm_investor_id)) continue;
    seen.add(link.firm_investor_id);
    people.push({
      id: link.firm_investor_id,
      name: link.investor_name ?? "Investor",
      title: link.investor_title ?? null,
    });
  }
  return people;
}

function PersonLookup({
  firmId,
  firmName,
  excludeIds,
  excludeNames,
  onAdd,
}: {
  firmId: string | null;
  firmName?: string | null;
  excludeIds: string[];
  excludeNames: string[];
  onAdd: (person: CardPerson) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const typed = query.trim();

  useEffect(() => {
    if (!open) return;
    if (!firmId && typed.length < 2) { setHits([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchRows<PersonHit>("investors", {
        page: 0,
        search: typed,
        limit: 8,
        filter: firmId ? { firm_id: firmId } : undefined,
      }).then((res) => {
        if (!cancelled) setHits(res.rows);
      });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [typed, open, firmId]);

  const visible = hits.filter((hit) => !excludeIds.includes(hit.id));
  const exact = typed.length > 0 && (
    hits.some((hit) => sameInvestorName(hit.full_name ?? "", typed))
    || excludeNames.some((name) => sameInvestorName(name, typed))
  );
  const showAdd = open && typed.length >= 2 && !exact;

  const addExisting = (hit: PersonHit) => {
    onAdd({
      id: hit.id,
      name: hit.full_name ?? "Investor",
      title: hit.title,
      firm: hit.firm_id ? { id: hit.firm_id, firm_name: hit.firm_name ?? null } : undefined,
    });
    setQuery("");
    setTitle("");
    setOpen(false);
  };

  const addNew = async () => {
    if (!firmId) { toast.error("Pick a firm first"); return; }
    setCreating(true);
    const result = await createFirmInvestor({ firm_id: firmId, full_name: typed, title: title.trim() });
    setCreating(false);
    if (result.error || !result.person) { toast.error(result.error ?? "Could not add investor"); return; }
    onAdd({ ...result.person, firm: { id: firmId, firm_name: firmName ?? null } });
    setQuery("");
    setTitle("");
    setOpen(false);
    toast.success("Investor added");
  };

  return (
    <div ref={boxRef} className="flex flex-col gap-1">
      <input
        className={IC} style={IS}
        placeholder={firmId ? "Search or add a person at this firm" : "Search investors"}
        value={query}
        onFocus={(e) => { setOpen(true); Object.assign(e.currentTarget.style, IF); }}
        onChange={(e) => { setQuery(e.target.value); setTitle(""); setOpen(true); }}
        onBlur={(e) => {
          Object.assign(e.currentTarget.style, IS);
          const next = e.relatedTarget as Node | null;
          if (next && boxRef.current?.contains(next)) return;
          window.setTimeout(() => {
            if (boxRef.current?.contains(document.activeElement)) return;
            setOpen(false);
          }, 180);
        }}
      />
      {open && (firmId || typed.length >= 2) && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)" }}>
          {visible.length === 0 && !showAdd && <div className="px-3 py-2 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>No investors found</div>}
          {visible.map((hit) => (
            <button
              key={hit.id}
              type="button"
              className="block w-full truncate px-3 py-1.5 text-left text-[12px] hover:bg-white/[0.04]"
              style={{ color: "rgba(255,255,255,0.8)" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addExisting(hit)}
            >
              {hit.full_name ?? "Investor"}
              {hit.title ? ` · ${hit.title}` : ""}
              {!firmId && hit.firm_name ? ` · ${hit.firm_name}` : ""}
            </button>
          ))}
          {showAdd && (
            <div
              className="border-t px-3 py-2"
              style={{ borderColor: "rgba(255,255,255,0.08)" }}
              onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") e.preventDefault();
              }}
            >
              <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.85)" }}>Add {typed}</p>
              <input
                className={`${IC} mt-1.5`}
                style={IS}
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onFocus={(e) => Object.assign(e.currentTarget.style, IF)}
                onBlur={(e) => Object.assign(e.currentTarget.style, IS)}
              />
              <button
                type="button"
                disabled={creating}
                onClick={() => { void addNew(); }}
                className="mt-1.5 inline-flex h-[28px] items-center rounded px-2.5 text-[12px] font-semibold disabled:opacity-60"
                style={{ background: "#5B5CFF", color: "#ffffff" }}
              >
                {creating ? "Adding…" : "Add investor"}
              </button>
              {!firmId && <p className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Pick a firm first.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InvestorPeople({
  firmId,
  firmName,
  people,
  onChange,
}: {
  firmId: string | null;
  firmName?: string | null;
  people: CardPerson[];
  onChange: (next: CardPerson[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Investor / person</span>
      {people.map((person) => (
        <div key={person.id} className="flex items-center justify-between gap-2 rounded px-2 py-1.5" style={IS}>
          <span className="min-w-0 truncate text-[12px]" style={{ color: "rgba(255,255,255,0.85)" }}>
            {person.name}{person.title ? ` · ${person.title}` : ""}
          </span>
          <button
            type="button"
            className="shrink-0 text-[11px]"
            style={{ color: "rgba(255,255,255,0.45)" }}
            onClick={() => onChange(people.filter((item) => item.id !== person.id))}
          >
            Remove
          </button>
        </div>
      ))}
      <PersonLookup
        firmId={firmId}
        firmName={firmName}
        excludeIds={people.map((person) => person.id)}
        excludeNames={people.map((person) => person.name)}
        onAdd={(person) => {
          if (people.some((item) => item.id === person.id)) return;
          onChange([...people, person]);
        }}
      />
    </div>
  );
}

function enteredFundingRoundTypes(rounds: FundingRoundDraft[]): string[] {
  const seen = new Set<string>();
  const types: string[] = [];
  for (const row of rounds) {
    if (!row.round_type || seen.has(row.round_type)) continue;
    seen.add(row.round_type);
    types.push(row.round_type);
  }
  return types;
}

function LedRoundControl({
  round,
  firmId,
  ledFirmId,
  onLead,
}: {
  round: string;
  firmId: string | null;
  ledFirmId: string | null;
  onLead: (round: string, led: boolean) => void;
}) {
  const checked = Boolean(firmId) && ledFirmId === firmId;
  return (
    <label
      className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[12px]"
      style={{ color: "rgba(255,255,255,0.8)" }}
      onClick={(e) => {
        e.preventDefault();
        if (!firmId) { toast.error("Pick a firm first"); return; }
        onLead(round, !checked);
      }}
    >
      <input
        type="radio"
        name={`led-round-${round}`}
        checked={checked}
        onChange={() => { /* selection is controlled so a chosen lead can be cleared */ }}
        style={{ accentColor: "#5B5CFF" }}
      />
      Led Round
    </label>
  );
}

function FundingRoundPicker({
  fundingRounds,
  selected,
  onChange,
  savedRounds = [],
  firmId,
  ledByRound,
  onLead,
}: {
  fundingRounds: FundingRoundDraft[] | null;
  selected: string[];
  onChange: (next: string[]) => void;
  savedRounds?: string[];
  firmId: string | null;
  ledByRound: Record<string, string>;
  onLead: (round: string, led: boolean) => void;
}) {
  if (fundingRounds == null) {
    return (
      <FL label="Round">
        <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>Loading funding rounds…</p>
      </FL>
    );
  }

  const entered = enteredFundingRoundTypes(fundingRounds);
  const filledCount = fundingRounds.filter((row) => row.round_type).length;
  const orphans = savedRounds.filter((name) => name && !entered.includes(name));

  if (entered.length === 0) {
    return (
      <FL label="Round">
        <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
          No funding rounds yet. Add them in Funding Rounds above.
        </p>
        {orphans.map((name) => (
          <p key={name} className="text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>
            Saved round: {fundingRoundLabel(name)}
          </p>
        ))}
      </FL>
    );
  }

  if (filledCount <= 1 && entered.length === 1 && orphans.length === 0) {
    const only = entered[0];
    return (
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <SFld
            label="Round"
            value={selected[0] ?? ""}
            onChange={(value) => {
              onChange(value ? [value] : []);
              if (!value && ledByRound[only] === firmId) onLead(only, false);
            }}
            options={[{ value: only, label: fundingRoundLabel(only) }]}
          />
        </div>
        <div className="mt-5">
          <LedRoundControl round={only} firmId={firmId} ledFirmId={ledByRound[only] ?? null} onLead={(round, led) => {
            onLead(round, led);
            if (led && !selected.includes(round)) onChange([round]);
          }} />
        </div>
      </div>
    );
  }

  const options = [
    ...entered.map((value) => ({ value, label: fundingRoundLabel(value) })),
    ...orphans.map((value) => ({ value, label: `${fundingRoundLabel(value)} (saved)` })),
  ];
  const toggle = (value: string) => {
    const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
    onChange(next);
    if (!next.includes(value) && ledByRound[value] === firmId) onLead(value, false);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Round</span>
      <div className="flex flex-col gap-1 rounded px-2 py-1.5" style={IS}>
        {options.map((option) => (
          <div key={option.value} className="flex items-center gap-2 text-[12px]" style={{ color: "rgba(255,255,255,0.8)" }}>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
                style={{ accentColor: "#5B5CFF" }}
              />
              <span className="truncate">{option.label}</span>
            </label>
            <LedRoundControl
              round={option.value}
              firmId={firmId}
              ledFirmId={ledByRound[option.value] ?? null}
              onLead={(round, led) => {
                onLead(round, led);
                if (led && !selected.includes(round)) onChange([...selected, round]);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function investorLinkGroups(rows: InvestorLinkRow[]): InvestorLinkRow[][] {
  const groups: InvestorLinkRow[][] = [];
  const index = new Map<string, number>();
  for (const row of rows) {
    const at = index.get(row.firm_id);
    if (at == null) {
      index.set(row.firm_id, groups.length);
      groups.push([row]);
    } else {
      groups[at].push(row);
    }
  }
  return groups;
}

function linkTargetKey(firmInvestorId: string | null, roundName: string | null): string {
  return `${firmInvestorId ?? ""}|${(roundName ?? "").trim().toLowerCase()}`;
}

function InvestorLinkCard({
  startupId,
  links,
  fundingRounds,
  ledByRound,
  onLead,
  onSaved,
}: {
  startupId: string;
  links: InvestorLinkRow[];
  fundingRounds: FundingRoundDraft[] | null;
  ledByRound: Record<string, string>;
  onLead: (round: string, firmId: string, led: boolean) => void;
  onSaved: () => void;
}) {
  const link = links[0];
  const savedRounds = [...new Set(links.map((item) => item.round_name).filter((name): name is string => Boolean(name)))];
  const signature = links.map((item) => `${item.id ?? ""}:${item.firm_investor_id ?? ""}:${item.round_name ?? ""}:${item.led_round ? 1 : 0}`).join("|");
  const [rounds, setRounds] = useState<string[]>(savedRounds);
  const [people, setPeople] = useState<CardPerson[]>(() => peopleFromLinks(links));
  const [saving, setSaving] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  useEffect(() => {
    setRounds([...new Set(links.map((item) => item.round_name).filter((name): name is string => Boolean(name)))]);
    setPeople(peopleFromLinks(links));
    // signature is the saved link identity. Depending on `links` would reset in-progress edits on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const save = async () => {
    setSaving(true);
    const selected = [...new Set(rounds.filter(Boolean))];
    const targets: Array<{ firm_investor_id: string | null; round_name: string | null }> = [];
    if (people.length === 0) {
      for (const roundName of selected) targets.push({ firm_investor_id: null, round_name: roundName });
    } else {
      for (const person of people) {
        for (const roundName of selected) targets.push({ firm_investor_id: person.id, round_name: roundName });
      }
    }
    let created = false;
    for (const target of targets) {
      const result = await saveCompanyInvestorLink({
        startup_id: startupId,
        firm_id: link.firm_id,
        firm_investor_id: target.firm_investor_id,
        round_name: target.round_name,
        led_round: target.round_name ? ledByRound[target.round_name] === link.firm_id : false,
      });
      if (result.error) { setSaving(false); toast.error(result.error); return; }
      created = created || result.created === true;
    }
    const keep = new Set(targets.map((target) => linkTargetKey(target.firm_investor_id, target.round_name)));
    const removing = links.filter((item) => item.id && !keep.has(linkTargetKey(item.firm_investor_id, item.round_name)));
    for (const gone of removing) {
      const result = await unlinkCompanyInvestor({
        startup_id: startupId,
        firm_id: gone.firm_id,
        link_id: gone.id,
        firm_investor_id: gone.firm_investor_id,
        round_name: gone.round_name,
      });
      if (result.error) { setSaving(false); toast.error(result.error); return; }
    }
    setSaving(false);
    toast.success(created ? "Investor linked" : "Investor link saved");
    onSaved();
  };

  const unlink = async () => {
    setUnlinking(true);
    for (const item of links) {
      const result = await unlinkCompanyInvestor({
        startup_id: startupId,
        firm_id: item.firm_id,
        link_id: item.id,
        firm_investor_id: item.firm_investor_id,
        round_name: item.round_name,
      });
      if (result.error) { setUnlinking(false); toast.error(result.error); return; }
    }
    setUnlinking(false);
    toast.success("Firm unlinked");
    onSaved();
  };

  const onFile = links.find((item) => item.amount_label && item.amount_usd == null)?.amount_label ?? null;

  return (
    <div className="flex flex-col gap-2 rounded-md p-3" style={{ background: "rgba(46,230,166,0.04)", border: "1px solid rgba(46,230,166,0.22)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[12px] font-medium text-white/85">{link.firm_name ?? "Firm"}</p>
        <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: "rgba(46,230,166,0.12)", color: "#2EE6A6" }}>Linked</span>
      </div>
      {link.portfolio_note && <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Portfolio: {link.portfolio_note}</p>}
      {onFile && <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>On file: {onFile}</p>}
      <FundingRoundPicker
        fundingRounds={fundingRounds}
        selected={rounds}
        onChange={setRounds}
        savedRounds={savedRounds}
        firmId={link.firm_id}
        ledByRound={ledByRound}
        onLead={(round, led) => onLead(round, link.firm_id, led)}
      />
      <InvestorPeople firmId={link.firm_id} firmName={link.firm_name} people={people} onChange={setPeople} />
      <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={saving || unlinking}
        onClick={() => { void save(); }}
        className="inline-flex h-[31px] items-center justify-center gap-1.5 self-start rounded px-3 text-[12px] font-semibold disabled:opacity-60"
        style={{ background: "#2EE6A6", color: "#050505" }}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save link
      </button>
      <button
        type="button"
        disabled={saving || unlinking}
        onClick={() => { void unlink(); }}
        className="inline-flex h-[31px] items-center justify-center gap-1.5 self-start rounded px-3 text-[12px] font-semibold disabled:opacity-60"
        style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.12)" }}
      >
        {unlinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
        Un-Link
      </button>
      </div>
    </div>
  );
}

function NewInvestorLink({
  startupId,
  fundingRounds,
  ledByRound,
  onLead,
  onSaved,
}: {
  startupId: string;
  fundingRounds: FundingRoundDraft[] | null;
  ledByRound: Record<string, string>;
  onLead: (round: string, firmId: string, led: boolean) => void;
  onSaved: () => void;
}) {
  const [firm, setFirm] = useState<FirmHit | null>(null);
  const [people, setPeople] = useState<CardPerson[]>([]);
  const [rounds, setRounds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!firm) { toast.error("Pick a firm"); return; }
    setSaving(true);
    const selected = rounds.length ? rounds : [""];
    const peopleToSave = people.length ? people : [null];
    let created = false;
    for (const person of peopleToSave) {
      for (const roundName of selected) {
        const result = await saveCompanyInvestorLink({
          startup_id: startupId,
          firm_id: firm.id,
          firm_investor_id: person?.id ?? null,
          round_name: roundName || null,
          led_round: roundName ? ledByRound[roundName] === firm.id : false,
        });
        if (result.error) { setSaving(false); toast.error(result.error); return; }
        created = created || result.created === true;
      }
    }
    setSaving(false);
    toast.success(created ? "Investor linked" : "Already linked — details saved");
    setFirm(null);
    setPeople([]);
    setRounds([]);
    onSaved();
  };

  return (
    <div className="flex flex-col gap-2 rounded-md p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Add investor</p>
      <FirmLookup
        selected={firm}
        onSelect={(next) => {
          if (firm && next && firm.id !== next.id) {
            for (const round of rounds) {
              if (ledByRound[round] === firm.id) onLead(round, next.id, true);
            }
          }
          if (!next && firm) {
            for (const round of rounds) {
              if (ledByRound[round] === firm.id) onLead(round, firm.id, false);
            }
          }
          if (next?.id !== firm?.id) setPeople([]);
          setFirm(next);
        }}
      />
      <FundingRoundPicker
        fundingRounds={fundingRounds}
        selected={rounds}
        onChange={setRounds}
        firmId={firm?.id ?? null}
        ledByRound={ledByRound}
        onLead={(round, led) => {
          if (!firm) { toast.error("Pick a firm first"); return; }
          onLead(round, firm.id, led);
        }}
      />
      <InvestorPeople
        firmId={firm?.id ?? null}
        firmName={firm?.firm_name}
        people={people}
        onChange={(next) => {
          setPeople(next);
          const added = next.find((person) => !people.some((item) => item.id === person.id));
          if (added?.firm && !firm) setFirm(added.firm);
        }}
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => { void save(); }}
        className="inline-flex h-[31px] items-center justify-center gap-1.5 self-start rounded px-3 text-[12px] font-semibold disabled:opacity-60"
        style={{ background: "#2EE6A6", color: "#050505" }}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
        Link investor
      </button>
    </div>
  );
}

function CompanyFundingRounds({
  startupId,
  onRoundsChange,
  saveRef,
}: {
  startupId: string;
  onRoundsChange: (rows: FundingRoundDraft[] | null) => void;
  saveRef: React.MutableRefObject<(() => Promise<string | null>) | null>;
}) {
  const [rows, setRows] = useState<FundingRoundDraft[]>([blankFundingRound()]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  const loadedRef = useRef(false);
  rowsRef.current = rows;

  const publish = (next: FundingRoundDraft[]) => {
    const normalized = normalizeFundingRounds(next);
    rowsRef.current = normalized;
    setRows(normalized);
    if (loadedRef.current) onRoundsChange(normalized);
  };

  useEffect(() => {
    let cancelled = false;
    loadedRef.current = false;
    onRoundsChange(null);
    setLoading(true);
    void loadCompanyFundingRounds(startupId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      const loaded = normalizeFundingRounds(result.rows.map((row) => ({
        key: row.id,
        id: row.id,
        round_type: row.round_type,
        amount_usd: row.amount_usd,
      })));
      rowsRef.current = loaded;
      setRows(loaded);
      setError(null);
      loadedRef.current = true;
      onRoundsChange(loaded);
    });
    return () => { cancelled = true; };
  }, [startupId, onRoundsChange]);

  useEffect(() => {
    saveRef.current = async () => {
      if (!loadedRef.current) return "Funding rounds are still loading";
      const result = await saveCompanyFundingRounds(startupId, rowsRef.current);
      if (result.error) return result.error;
      const loaded = normalizeFundingRounds(result.rows.map((row) => ({
        key: row.id,
        id: row.id,
        round_type: row.round_type,
        amount_usd: row.amount_usd,
      })));
      rowsRef.current = loaded;
      setRows(loaded);
      loadedRef.current = true;
      onRoundsChange(loaded);
      return null;
    };
    return () => { saveRef.current = null; };
  }, [startupId, saveRef, onRoundsChange]);

  return (
    <>
      <Sect title="Funding Rounds" />
      <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
        Round size for this company, in USD. These save with Save Changes. Investors below can only use rounds listed here.
      </p>
      {loading && <div className="flex items-center gap-2 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading funding rounds…</div>}
      {error && <p className="text-[11px]" style={{ color: "#ef4444" }}>{error}</p>}
      {rows.map((row) => (
        <div key={row.key} className="flex flex-col gap-2 rounded-md p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {row.round_type && (
            <div className="flex justify-end">
              <button type="button" onClick={() => publish(rowsRef.current.filter((item) => item.key !== row.key))} className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                Remove
              </button>
            </div>
          )}
          <SFld
            label="Round"
            value={row.round_type || null}
            onChange={(value) => publish(rowsRef.current.map((item) => item.key === row.key ? { ...item, round_type: value } : item))}
            options={FUNDING_ROUND_OPTIONS}
          />
          <MoneyRaisedField
            label="Money Raised (USD)"
            value={row.amount_usd}
            onChange={(value) => publish(rowsRef.current.map((item) => item.key === row.key ? { ...item, amount_usd: value } : item))}
          />
        </div>
      ))}
    </>
  );
}

function CompanyInvestors({ startupId, fundingRounds }: {
  startupId: string;
  fundingRounds: FundingRoundDraft[] | null;
}) {
  const [rows, setRows] = useState<InvestorLinkRow[]>([]);
  const [leadByRound, setLeadByRound] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await loadCompanyInvestorLinks(startupId);
    setLoading(false);
    if (result.error) { setError(result.error); setRows([]); setLeadByRound({}); return; }
    setError(null);
    setRows(result.rows);
    const next: Record<string, string> = {};
    for (const row of result.rows) {
      if (row.led_round && row.round_name) next[row.round_name] = row.firm_id;
    }
    setLeadByRound(next);
  }, [startupId]);

  useEffect(() => { void load(); }, [load]);

  const onLead = (round: string, firmId: string, led: boolean) => {
    setLeadByRound((prev) => {
      const next = { ...prev };
      if (led) next[round] = firmId;
      else if (next[round] === firmId) delete next[round];
      return next;
    });
  };

  const groups = investorLinkGroups(rows);

  return (
    <>
      <Sect title="Investors" />
      <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
        Link an existing firm so this company shows in that firm’s portfolio. Choose rounds from Funding Rounds, add one or more people, and mark Led Round when this firm led that round.
      </p>
      {loading && <div className="flex items-center gap-2 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading investors…</div>}
      {error && <p className="text-[11px]" style={{ color: "#ef4444" }}>{error}</p>}
      {!loading && !error && groups.length === 0 && (
        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>No investors linked yet.</p>
      )}
      {groups.map((links) => (
        <InvestorLinkCard
          key={links[0]?.firm_id ?? "firm"}
          startupId={startupId}
          links={links}
          fundingRounds={fundingRounds}
          ledByRound={leadByRound}
          onLead={onLead}
          onSaved={() => { void load(); }}
        />
      ))}
      <NewInvestorLink
        startupId={startupId}
        fundingRounds={fundingRounds}
        ledByRound={leadByRound}
        onLead={onLead}
        onSaved={() => { void load(); }}
      />
    </>
  );
}

// ── Company Edit Panel ─────────────────────────────────────────────────────────

function CompanyEditPanel({ row, onClose, onSaved }: {
  row: CompanyRow; onClose: () => void; onSaved: (u: CompanyRow) => void;
}) {
  const [d, setD] = useState<CompanyRow>({ ...row });
  const [saving, setSaving] = useState(false);
  const [fundingRounds, setFundingRounds] = useState<FundingRoundDraft[] | null>(null);
  const saveRoundsRef = useRef<(() => Promise<string | null>) | null>(null);
  const fundingRoundsRef = useRef<FundingRoundDraft[] | null>(null);
  /** Stored or typed totals stay put. Clearing the field returns to the round sum. */
  const totalRaisedManualRef = useRef(row.total_raised_usd != null);
  const onRoundsChange = useCallback((next: FundingRoundDraft[] | null) => {
    fundingRoundsRef.current = next;
    setFundingRounds(next);
    if (next == null || totalRaisedManualRef.current) return;
    const sum = totalRaisedFromFundingRounds(next);
    setD((prev) => (Object.is(prev.total_raised_usd, sum) ? prev : { ...prev, total_raised_usd: sum }));
  }, []);
  const set = <K extends keyof CompanyRow>(k: K, v: CompanyRow[K]) => setD(p => ({ ...p, [k]: v }));
  const setTotalRaised = (value: number | null) => {
    if (value == null || !Number.isFinite(value)) {
      totalRaisedManualRef.current = false;
      setD((prev) => ({ ...prev, total_raised_usd: totalRaisedFromFundingRounds(fundingRoundsRef.current) }));
      return;
    }
    totalRaisedManualRef.current = true;
    setD((prev) => ({ ...prev, total_raised_usd: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    const { id, created_at, updated_at, ...patch } = d;
    delete patch.location;
    patch.sector = patch.sector?.trim() || null;
    patch.logo_url = patch.logo_url?.trim() || null;
    patch.brand_icon_url = patch.brand_icon_url?.trim() || null;
    patch.hq_city = patch.hq_city?.trim() || null;
    patch.hq_state = patch.hq_state?.trim() || null;
    patch.hq_country = patch.hq_country?.trim() || null;
    patch.record_status = normalizeRecordStatus(patch.record_status);
    const persistCalculatedTotal = row.total_raised_usd == null && !totalRaisedManualRef.current;
    if (persistCalculatedTotal) {
      patch.total_raised_usd = totalRaisedFromFundingRounds(fundingRoundsRef.current);
    }
    const { row: u, error } = await patchRow<CompanyRow>("companies", row.id, patch);
    if (error || !u) { setSaving(false); toast.error(`Save failed: ${error ?? "no data"}`); return; }
    if (persistCalculatedTotal && u.total_raised_usd != null) totalRaisedManualRef.current = true;
    const roundError = await saveRoundsRef.current?.();
    setSaving(false);
    if (roundError) {
      toast.error(`Funding rounds: ${roundError}`);
      onSaved(u);
      return;
    }
    toast.success("Company saved");
    onSaved(u);
  };

  return (
    <PanelShell title="Edit Company" subtitle={row.company_name} saving={saving} onClose={onClose} onSave={handleSave}>
      <Sect title="Basic Info" />
      <TF label="Company Name"      value={d.company_name}      onChange={v => set("company_name", v)} />
      <TF label="Website URL"       value={d.company_url}       onChange={v => set("company_url", v)} placeholder="https://" />
      <FL label="Logo URL">
        <div className="flex gap-1.5">
          <input
            className={`${IC} min-w-0 flex-1`} style={IS} type="url" placeholder="https://"
            value={d.logo_url ?? ""}
            onChange={e => set("logo_url", e.target.value)}
            onFocus={e => Object.assign(e.currentTarget.style, IF)}
            onBlur={e  => Object.assign(e.currentTarget.style, IS)}
          />
          <a
            href={logoHref(d.logo_url) ?? undefined}
            target="_blank"
            rel="noreferrer"
            aria-label="Open company logo"
            aria-disabled={!logoHref(d.logo_url)}
            onClick={e => { if (!logoHref(d.logo_url)) e.preventDefault(); }}
            className="inline-flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded transition-opacity"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: logoHref(d.logo_url) ? "#2EE6A6" : "rgba(255,255,255,0.18)",
              opacity: logoHref(d.logo_url) ? 1 : 0.6,
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </FL>
      <FL label="Brand Icon URL">
        <div className="flex gap-1.5">
          <input
            className={`${IC} min-w-0 flex-1`} style={IS} type="url" placeholder="https://"
            value={d.brand_icon_url ?? ""}
            onChange={e => set("brand_icon_url", e.target.value)}
            onFocus={e => Object.assign(e.currentTarget.style, IF)}
            onBlur={e  => Object.assign(e.currentTarget.style, IS)}
          />
          <a
            href={logoHref(d.brand_icon_url) ?? undefined}
            target="_blank"
            rel="noreferrer"
            aria-label="Open brand icon"
            aria-disabled={!logoHref(d.brand_icon_url)}
            onClick={e => { if (!logoHref(d.brand_icon_url)) e.preventDefault(); }}
            className="inline-flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded transition-opacity"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: logoHref(d.brand_icon_url) ? "#2EE6A6" : "rgba(255,255,255,0.18)",
              opacity: logoHref(d.brand_icon_url) ? 1 : 0.6,
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </FL>
      <TF label="LinkedIn URL"      value={d.linkedin_url}      onChange={v => set("linkedin_url", v)} />
      <TF label="X URL"             value={d.x_url}           onChange={v => set("x_url", v)} placeholder="https://x.com/…" />
      <TA label="Short Description" value={d.description_short} onChange={v => set("description_short", v)} rows={2} />
      <TA label="Long Description"  value={d.description_long}  onChange={v => set("description_long", v)} rows={4} />

      <Sect title="Classification" />
      <SFld label="Sector" value={d.sector} onChange={v => set("sector", v || null)} options={COMPANY_SECTORS} />
      <SFld
        label="Status"
        value={normalizeRecordStatus(d.record_status)}
        onChange={v => set("record_status", normalizeRecordStatus(v))}
        options={RECORD_STATUSES}
        allowEmpty={false}
      />
      <SFld label="Stage"  value={d.stage}   onChange={v => set("stage", v)}   options={COMPANY_STAGES} />
      <SFld label="Operating Status" value={d.status} onChange={v => set("status", v)} options={COMPANY_STATUSES} />
      <CompanyHqFields
        city={d.hq_city}
        state={d.hq_state}
        country={d.hq_country}
        onChange={(patch) => setD((prev) => ({ ...prev, ...patch }))}
      />
      <TF   label="YC Batch" value={d.yc_batch} onChange={v => set("yc_batch", v)} placeholder="W24" />

      <Sect title="Metrics" />
      <div className="grid grid-cols-2 gap-3">
        <NF label="Total Raised (USD)" value={d.total_raised_usd} onChange={setTotalRaised} />
        <NF label="Headcount"          value={d.headcount}        onChange={v => set("headcount", v)} />
        <NF label="Founded Year"       value={d.founded_year}     onChange={v => set("founded_year", v)} />
      </div>

      <CompanyFundingRounds startupId={row.id} onRoundsChange={onRoundsChange} saveRef={saveRoundsRef} />
      <CompanyInvestors startupId={row.id} fundingRounds={fundingRounds} />

    </PanelShell>
  );
}

export function AdminStartupEditor({
  startupId,
  onClose,
  onSaved,
}: {
  startupId: string;
  onClose: () => void;
  onSaved: (row: CompanyRow) => void;
}) {
  const [row, setRow] = useState<CompanyRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRow(null);
    setError(null);
    void fetchCompanyById(startupId).then((result) => {
      if (cancelled) return;
      if (result.error || !result.row) {
        setError(result.error ?? "Company not found");
        return;
      }
      setRow(result.row);
    });
    return () => {
      cancelled = true;
    };
  }, [startupId]);

  if (error) {
    return (
      <PanelShell title="Edit Company" subtitle={startupId} saving={false} onClose={onClose} onSave={() => {}}>
        <p className="text-sm text-red-300">{error}</p>
      </PanelShell>
    );
  }
  if (!row) {
    return (
      <PanelShell title="Edit Company" subtitle="Loading…" saving={false} onClose={onClose} onSave={() => {}}>
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-sm text-white/50">
          <BouncingDots />
          Loading company…
        </div>
      </PanelShell>
    );
  }
  return (
    <CompanyEditPanel
      key={row.id}
      row={row}
      onClose={onClose}
      onSaved={(saved) => {
        setRow(saved);
        onSaved(saved);
      }}
    />
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
    if (row.source === "operator_profiles") {
      const locationChanged = (d.location ?? "") !== (row.location ?? "");
      const patch: Record<string, unknown> = {
        full_name: d.full_name,
        title: d.role,
        linkedin_url: d.linkedin_url,
        x_url: d.x_url,
        email: d.email,
        avatar_url: d.avatar_url,
        expertise: d.domain_expertise,
        prior_companies: d.prior_companies,
        startup_id: d.startup_id,
      };
      if (locationChanged) {
        patch.city = d.location;
        patch.state = null;
        patch.country = null;
      }
      const { row: saved, error } = await patchRow<OperatorRow>("operators", row.id, patch);
      setSaving(false);
      if (error || !saved) { toast.error(`Save failed: ${error ?? "no data"}`); return; }
      toast.success("Founder saved");
      onSaved(operatorProfileToFounder(saved));
      return;
    }
    const { id, created_at, updated_at, source, operator_city, operator_state, operator_country, ...patch } = d;
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
      <CompanyField startupId={d.startup_id} onChange={(id) => set("startup_id", id)} />
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
      <TF label="Role / Title" value={d.title} onChange={v => set("title", v)} />
      <CompanyField startupId={d.startup_id} allowEmpty onChange={(id) => set("startup_id", id)} />

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

function isActiveCompanyStatus(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === "active";
}

/** A title counts as a founder when it contains "founder" anywhere, in any case. */
function titleContainsFounder(title: string | null | undefined): boolean {
  return String(title ?? "").toLowerCase().includes("founder");
}

function operatorProfileToFounder(row: OperatorRow): FounderRow {
  return {
    id: row.id,
    full_name: row.full_name,
    role: row.title,
    startup_id: row.startup_id ?? null,
    location: formatCanonicalHqLine(row.city, row.state, row.country),
    linkedin_url: row.linkedin_url,
    x_url: row.x_url,
    avatar_url: row.avatar_url,
    email: row.email,
    founder_archetype: null,
    is_repeat_founder: false,
    has_prior_exit: false,
    operator_to_founder: false,
    domain_expertise: row.expertise,
    prior_companies: row.prior_companies,
    updated_at: row.updated_at,
    created_at: row.created_at,
    source: "operator_profiles",
    operator_city: row.city,
    operator_state: row.state,
    operator_country: row.country,
  };
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

function CompaniesTab({
  focusCompany = null,
}: {
  focusCompany?: { id: string; name: string } | null;
}) {
  const COL = "2fr 1fr 1fr 1fr 1fr 1fr 1fr";
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
      setLiveCompanies(allRows.filter((row) => isActiveCompanyStatus(row.status)).length);

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

  useEffect(() => {
    const id = focusCompany?.id?.trim();
    const name = focusCompany?.name?.trim();
    if (!id || !name) return;
    setSearch(name);
    setPage(0);
  }, [focusCompany?.id, focusCompany?.name]);

  useEffect(() => {
    const id = focusCompany?.id?.trim();
    if (!id) return;
    const match = rows.find((row) => row.id === id);
    if (match) setSelected(match);
  }, [focusCompany?.id, rows]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <MetricsTiles
        totalLabel="Total companies"
        liveLabel="Live companies"
        totalValue={totalCompanies}
        liveValue={liveCompanies}
        avgCompleteness={avgCompleteness}
        lastUpdateAt={lastUpdateAt}
        loading={metricsLoading}
      />

      <AdminStickyFilters className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input placeholder="Search companies…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 text-[12px] h-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
        </div>
        <FilterSelect
          label="Stage"
          icon={Target}
          value={stage}
          options={[
            { value: "all", label: "All" },
            ...COMPANY_STAGES.map((item) => ({ value: item, label: formatRoundKind(item) })),
          ]}
          onValueChange={(value) => { setStage(value); setPage(0); }}
        />
        <button onClick={() => { void load(); void loadMetrics(); }} className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-[11px]"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </AdminStickyFilters>

      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{total.toLocaleString()} companies — click any row to edit</p>

      {error && (
        <div className="flex items-center gap-2 rounded border px-4 py-3"
          style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)" }}>
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />
          <span className="text-[12px]" style={{ color: "#ef4444" }}>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div style={{ display: "grid", gridTemplateColumns: COL, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {["Company","Sector","Status","Stage","Operating","HQ","Raised"].map(h => <div key={h} style={HDR}>{h}</div>)}
        </div>
        {loading && <div className="flex items-center justify-center py-12"><BouncingDots /></div>}
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
              <div style={{ ...CELL, color: "rgba(255,255,255,0.5)" }}>{row.sector ? formatSectorSchemaLabel(row.sector) : "—"}</div>
              <div style={CELL}><Pill text={recordStatusLabel(row.record_status)} color={recordStatusColor(row.record_status)} /></div>
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
          key={selected.id}
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
  const [reclassified, setReclassified] = useState<FounderRow[]>([]);
  const [startupReady, setStartupReady] = useState(false);
  const [startupMetrics, setStartupMetrics] = useState<{
    total: number;
    live: number;
    completenessSum: number;
    rowCount: number;
    lastUpdateAt: string | null;
    lastUpdateMs: number;
  } | null>(null);

  const matchedReclassified = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reclassified;
    return reclassified.filter((row) =>
      row.full_name.toLowerCase().includes(q) || String(row.role ?? "").toLowerCase().includes(q),
    );
  }, [reclassified, search]);

  const combinedTotal = total + matchedReclassified.length;
  const pageStart = page * PAGE_SIZE;
  const pagePastStartup = startupReady && pageStart >= total;

  const loadReclassified = useCallback(async () => {
    const { rows: operatorRows, error: operatorErr } = await fetchAllRows<OperatorRow>("operators");
    if (operatorErr) {
      console.warn("[AdminMarketIntelligence] Founder-titled operators load failed:", operatorErr);
      return;
    }
    const withCompanies = await withOperatorStartupIds(operatorRows);
    setReclassified(
      withCompanies.filter((row) => titleContainsFounder(row.title)).map(operatorProfileToFounder),
    );
  }, []);

  const totalRef = useRef(0);
  const loadedSearchRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (loadedSearchRef.current === search && page * PAGE_SIZE >= totalRef.current) {
      setLoading(false);
      setError(null);
      setStartupReady(true);
      return;
    }
    setLoading(true); setError(null);
    const { rows: r, total: t, error: e } = await fetchRows<FounderRow>("founders", { page, search });
    setLoading(false);
    setStartupReady(true);
    if (e) { setError(e); return; }
    totalRef.current = t;
    loadedSearchRef.current = search;
    setRows(r); setTotal(t);
  }, [page, search]);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const { rows: allRows, total: totalCount, error: metricsErr } = await fetchAllRows<FounderRow>("founders");
      if (metricsErr) throw new Error(metricsErr);

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

      setStartupMetrics({
        total: totalCount ?? 0,
        live: liveCount,
        completenessSum,
        rowCount,
        lastUpdateAt: maxUpdatedAt,
        lastUpdateMs: maxUpdatedMs,
      });
    } catch (metricsErr) {
      console.warn("[AdminMarketIntelligence] Founders metrics load failed:", metricsErr);
      setStartupMetrics(null);
      setTotalFounders(null);
      setLiveFounders(null);
      setAvgCompleteness(null);
      setLastUpdateAt(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!startupMetrics) return;
    let liveCount = startupMetrics.live;
    let completenessSum = startupMetrics.completenessSum;
    let rowCount = startupMetrics.rowCount;
    let maxUpdatedAt = startupMetrics.lastUpdateAt;
    let maxUpdatedMs = startupMetrics.lastUpdateMs;

    for (const row of reclassified) {
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
      completenessSum += (scoreFields.filter(Boolean).length / scoreFields.length) * 100;
      rowCount += 1;

      const updatedMs = parseIsoMs(row.updated_at);
      if (updatedMs != null && updatedMs > maxUpdatedMs) {
        maxUpdatedMs = updatedMs;
        maxUpdatedAt = row.updated_at;
      }
    }

    setTotalFounders(startupMetrics.total + reclassified.length);
    setLiveFounders(liveCount);
    setAvgCompleteness(rowCount ? completenessSum / rowCount : 0);
    setLastUpdateAt(maxUpdatedAt);
  }, [reclassified, startupMetrics]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadMetrics(); }, [loadMetrics]);
  useEffect(() => { void loadReclassified(); }, [loadReclassified]);

  const displayRows = useMemo(() => {
    const pageEnd = pageStart + PAGE_SIZE;
    if (!startupReady) return [];
    if (pageEnd <= total) return rows;
    if (pageStart >= total) return matchedReclassified.slice(pageStart - total, pageEnd - total);
    return [...rows, ...matchedReclassified.slice(0, pageEnd - total)];
  }, [matchedReclassified, pageStart, rows, startupReady, total]);

  const totalPages = Math.ceil(combinedTotal / PAGE_SIZE);
  const listLoading = loading && !pagePastStartup;

  return (
    <div className="flex flex-col gap-4">
      <MetricsTiles
        totalLabel="Total founders"
        liveLabel="Live founders"
        totalValue={totalFounders}
        liveValue={liveFounders}
        avgCompleteness={avgCompleteness}
        lastUpdateAt={lastUpdateAt}
        loading={metricsLoading}
      />

      <AdminStickyFilters className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input placeholder="Search founders…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 text-[12px] h-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
        </div>
        <button onClick={() => { void load(); void loadMetrics(); void loadReclassified(); }} className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-[11px]"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </AdminStickyFilters>

      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{combinedTotal.toLocaleString()} founders — click any row to edit</p>

      {error && (
        <div className="flex items-center gap-2 rounded border px-4 py-3"
          style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)" }}>
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />
          <span className="text-[12px]" style={{ color: "#ef4444" }}>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div style={{ display: "grid", gridTemplateColumns: COL, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {["Name","Role","Location","Archetype","Flags"].map(h => <div key={h} style={HDR}>{h}</div>)}
        </div>
        {listLoading && <div className="flex items-center justify-center py-12"><BouncingDots /></div>}
        {!listLoading && displayRows.length === 0 && !error && <div className="flex items-center justify-center py-12 text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>No founders found</div>}
        {!listLoading && displayRows.map(row => {
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
          onSaved={u => {
            if (u.source === "operator_profiles") {
              if (titleContainsFounder(u.role)) {
                setReclassified(prev => prev.map(r => r.id === u.id ? u : r));
                setSelected(u);
              } else {
                setReclassified(prev => prev.filter(r => r.id !== u.id));
                setSelected(null);
              }
              return;
            }
            setRows(prev => prev.map(r => r.id === u.id ? u : r));
            setSelected(u);
            void loadMetrics();
          }}
        />
      )}
    </div>
  );
}

// ── Operators Tab ──────────────────────────────────────────────────────────────

function OperatorsTab() {
  const COL = "2fr 1fr 1fr 1fr 1fr";
  const [catalog, setCatalog]   = useState<OperatorRow[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [page, setPage]         = useState(0);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<OperatorRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMetricsLoading(true);
    setError(null);
    const { rows: allRows, error: loadErr } = await fetchAllRows<OperatorRow>("operators");
    setLoading(false);
    setMetricsLoading(false);
    if (loadErr) {
      console.warn("[AdminMarketIntelligence] Operators metrics load failed:", loadErr);
      setError(loadErr);
      setCatalog([]);
      return;
    }
    const withCompanies = await withOperatorStartupIds(allRows);
    setCatalog(withCompanies.filter((row) => !titleContainsFounder(row.title)));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((row) =>
      row.full_name.toLowerCase().includes(q) || String(row.title ?? "").toLowerCase().includes(q),
    );
  }, [catalog, search]);

  const operatorMetrics = useMemo(() => {
    let live = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let maxUpdatedAt: string | null = null;
    let maxUpdatedMs = -Infinity;
    for (const row of catalog) {
      if (row.ready_for_live === true) live += 1;
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
    return {
      total: catalog.length,
      live,
      avg: scoreCount ? scoreSum / scoreCount : 0,
      lastUpdateAt: maxUpdatedAt,
    };
  }, [catalog]);

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <MetricsTiles
        totalLabel="Total operators"
        liveLabel="Live operators"
        totalValue={error ? null : metricsLoading ? null : operatorMetrics.total}
        liveValue={error ? null : metricsLoading ? null : operatorMetrics.live}
        avgCompleteness={error ? null : metricsLoading ? null : operatorMetrics.avg}
        lastUpdateAt={error ? null : metricsLoading ? null : operatorMetrics.lastUpdateAt}
        loading={metricsLoading}
      />

      <AdminStickyFilters className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input placeholder="Search operators…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 text-[12px] h-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
        </div>
        <button onClick={() => { void load(); }} className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-[11px]"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </AdminStickyFilters>

      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{filtered.length.toLocaleString()} operators — click any row to edit</p>

      {error && (
        <div className="flex items-center gap-2 rounded border px-4 py-3"
          style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)" }}>
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />
          <span className="text-[12px]" style={{ color: "#ef4444" }}>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div style={{ display: "grid", gridTemplateColumns: COL, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {["Name","Title","Location","Expertise","Status"].map(h => <div key={h} style={HDR}>{h}</div>)}
        </div>
        {loading && <div className="flex items-center justify-center py-12"><BouncingDots /></div>}
        {!loading && pageRows.length === 0 && !error && <div className="flex items-center justify-center py-12 text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>No operators found</div>}
        {!loading && pageRows.map(row => {
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
          onSaved={u => {
            if (titleContainsFounder(u.title)) {
              setCatalog(prev => prev.filter(r => r.id !== u.id));
              setSelected(null);
              return;
            }
            setCatalog(prev => prev.map(r => r.id === u.id ? u : r));
            setSelected(u);
          }}
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

export function AdminMarketIntelligence({
  focusCompany = null,
}: {
  focusCompany?: { id: string; name: string } | null;
}) {
  const [tab, setTab] = useState<TabKey>("companies");

  useEffect(() => {
    if (focusCompany?.id) setTab("companies");
  }, [focusCompany?.id]);

  return (
    <div className="flex flex-col gap-6">
      <AdminStickyHeader className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-white/90">Market Intelligence</h1>
      </div>

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
      </AdminStickyHeader>

      <div>
        {tab === "companies" && <CompaniesTab focusCompany={focusCompany} />}
        {tab === "founders"  && <FoundersTab />}
        {tab === "operators" && <OperatorsTab />}
      </div>
    </div>
  );
}
