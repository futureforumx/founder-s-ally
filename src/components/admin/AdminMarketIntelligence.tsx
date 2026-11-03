/**
 * AdminMarketIntelligence
 *
 * Browse and full-edit Companies, Founders, and Operators.
 * Click any row to open a slide-in edit panel with all fields.
 * All reads + writes go through the admin-market-intel edge function.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AlertCircle, Briefcase, Building2, CheckCircle2, ChevronLeft, ChevronRight, CircleDot, Plus,
  ExternalLink, Loader2, RefreshCw, Save, Search, Target, Trash2, Unlink, Users, X, XCircle,
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
import { isTestAdminSampleId } from "@/lib/testAdminSample";
import { CurrencyNumberInput, CurrencyStringInput, parseCurrencyAmount } from "@/components/admin/CurrencyInputs";

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
// Values must match public."OperatorCompanyStage" exactly. The enum has one
// historical lowercase label (`series_b`); all other stage values are uppercase.
const COMPANY_STAGES      = ["PRE_SEED","SEED","SERIES_A","series_b","SERIES_C","GROWTH","PUBLIC","ACQUIRED","UNKNOWN"];
/** `startups.status` is the StartupStatus enum (uppercase labels). */
const COMPANY_STATUSES    = ["ACTIVE","ACQUIRED","SHUT_DOWN","IPO","UNKNOWN"];
/** `startups.record_status` is the catalog workflow status, separate from operating status. */
const RECORD_STATUSES = [
  { value: "live", label: "Live" },
  { value: "needs_review", label: "Needs Review" },
  { value: "archived", label: "Archived" },
] as const;
const RECORD_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  ...RECORD_STATUSES,
  { value: "deleted", label: "Deleted" },
];
type RecordStatus = (typeof RECORD_STATUSES)[number]["value"];
type RecordLifecycleStatus = RecordStatus | "deleted";

function matchesRecordStatusFilter(
  row: { record_status?: string | null; deleted_at?: string | null },
  filter: string,
  showDeleted = false,
): boolean {
  if (filter === "deleted") return Boolean(row.deleted_at);
  if (row.deleted_at) return filter === "all" && showDeleted;
  return filter === "all" || normalizeRecordStatus(row.record_status) === filter;
}

function normalizeRecordStatus(value: string | null | undefined): RecordStatus {
  return value === "needs_review" || value === "archived" ? value : "live";
}

function toLifecycleStatus(row: { record_status?: string | null; deleted_at?: string | null }): RecordLifecycleStatus {
  return row.deleted_at ? "deleted" : normalizeRecordStatus(row.record_status);
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

function lifecycleStatusLabel(row: { record_status?: string | null; deleted_at?: string | null }): string {
  return row.deleted_at ? "Deleted" : recordStatusLabel(row.record_status);
}

function lifecycleStatusColor(row: { record_status?: string | null; deleted_at?: string | null }): string {
  return row.deleted_at ? "#f87171" : recordStatusColor(row.record_status);
}
/** `startups.sector` is the SectorFocus enum. */
const SECTOR_WORD_LABELS: Record<string, string> = {
  ai: "AI",
  saas: "SaaS",
  web3: "Web3",
};

function formatSectorSchemaLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "logistics_supply_chain") return "Logistics & Supply Chain";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((word) => SECTOR_WORD_LABELS[word] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const COMPANY_SECTORS = Constants.public.Enums.SectorFocus.map((value) => ({
  value,
  label: formatSectorSchemaLabel(value),
}));
const FOUNDER_ARCHETYPES = ["Technical", "Commercial", "Hybrid", "Domain Expert", "Operator", "Product", "Academic"];

function normalizeFounderArchetype(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase().replace(/[ -]+/g, "_") ?? "";
  return FOUNDER_ARCHETYPES.find((option) => option.toUpperCase().replace(/[ -]+/g, "_") === normalized) ?? null;
}

function normalizeFounderArchetypes(values: unknown, legacyValue?: string | null): string[] {
  const source = Array.isArray(values) ? values : legacyValue ? [legacyValue] : [];
  return [...new Set(source.flatMap((value) => {
    const option = typeof value === "string" ? normalizeFounderArchetype(value) : null;
    return option ? [option] : [];
  }))];
}

function founderArchetypeCode(value: string): string {
  return value.toUpperCase().replace(/[ -]+/g, "_");
}

type TabKey = "companies" | "founders" | "operators";

// ── Types ──────────────────────────────────────────────────────────────────────

export type CompanyRow = {
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
  deleted_at?: string | null;
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
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  industry_verticals?: string[] | null;
  founded_year: number | null;
  updated_at: string | null;
  created_at: string;
};

type EmploymentEntry = {
  id: string;
  employer_type: "company" | "corporation";
  employer_name: string;
  title: string;
  relationship: "founded" | "hired";
  is_current: boolean;
};

export type FounderRow = {
  id: string;
  full_name: string;
  role: string | null;
  bio?: string | null;
  startup_id: string | null;
  company_profile_ids?: string[] | null;
  employment_history?: EmploymentEntry[] | null;
  is_currently_at_startup?: boolean | null;
  current_employer_name?: string | null;
  current_employer_type?: "company" | "corporation" | null;
  current_employer_title?: string | null;
  location: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  website_url?: string | null;
  avatar_url: string | null;
  email: string | null;
  founder_archetype: string | null;
  founder_archetypes?: string[] | null;
  is_repeat_founder: boolean;
  has_prior_exit: boolean;
  operator_to_founder: boolean;
  domain_expertise: string[] | null;
  prior_companies: string[] | null;
  education?: string[] | null;
  education_highlight?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  record_status?: RecordStatus | null;
  deleted_at?: string | null;
  updated_at: string | null;
  created_at: string;
  /** Present when the person is stored on operator_profiles but classified as a founder by title. */
  source?: "operator_profiles";
  operator_city?: string | null;
  operator_state?: string | null;
  operator_country?: string | null;
};

export type OperatorRow = {
  id: string;
  full_name: string;
  title: string | null;
  bio?: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  website_url: string | null;
  avatar_url: string | null;
  email: string | null;
  stage_focus: string | null;
  stage_focuses?: string[] | null;
  is_available: boolean;
  enrichment_status: string;
  completeness_score: number | null;
  expertise: string[] | null;
  sector_focus: string[] | null;
  prior_companies: string[] | null;
  education?: string[] | null;
  ready_for_live: boolean;
  record_status?: RecordStatus | null;
  deleted_at?: string | null;
  startup_id: string | null;
  company_profile_ids?: string[] | null;
  founder_archetypes?: string[] | null;
  employment_history?: EmploymentEntry[] | null;
  is_currently_at_startup?: boolean | null;
  current_employer_name?: string | null;
  current_employer_type?: "company" | "corporation" | null;
  current_employer_title?: string | null;
  updated_at: string | null;
  created_at: string;
};

type CompanyKeyPerson = {
  client_key: string;
  operator_profile_id: string | null;
  founder_profile_id: string | null;
  full_name: string;
  title: string;
  email: string;
  bio: string;
  avatar_url: string;
  profile_type: "founder" | "operator";
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

async function fetchCompanyKeyPeople(startupId: string): Promise<{ rows: CompanyKeyPerson[]; error?: string }> {
  if (!SUPABASE_URL) return { rows: [], error: "SUPABASE_URL not set" };
  try {
    const params = new URLSearchParams({ entity: "company-key-people", id: startupId });
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${params}`, { headers: await adminHeaders() });
    const json = await res.json().catch(() => ({})) as { rows?: CompanyKeyPerson[]; error?: string; message?: string };
    if (!res.ok) return { rows: [], error: json.error ?? json.message ?? `HTTP ${res.status}` };
    return { rows: Array.isArray(json.rows) ? json.rows : [] };
  } catch (error: unknown) {
    return { rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function saveCompanyKeyPerson(startupId: string, person: CompanyKeyPerson): Promise<{ row?: CompanyKeyPerson; error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const params = new URLSearchParams({ entity: "company-key-people", id: startupId });
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${params}`, {
      method: "POST",
      headers: await adminHeaders(),
      body: JSON.stringify({ person }),
    });
    const json = await res.json().catch(() => ({})) as { row?: CompanyKeyPerson; error?: string; message?: string };
    if (!res.ok) return { error: json.error ?? json.message ?? `HTTP ${res.status}` };
    return { row: json.row };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function removeCompanyKeyPerson(startupId: string, person: CompanyKeyPerson): Promise<{ error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const params = new URLSearchParams({ entity: "company-key-people", id: startupId });
    if (person.operator_profile_id) params.set("operator_profile_id", person.operator_profile_id);
    if (person.founder_profile_id) params.set("founder_profile_id", person.founder_profile_id);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${params}`, {
      method: "DELETE",
      headers: await adminHeaders(),
    });
    const json = await res.json().catch(() => ({})) as { error?: string; message?: string };
    if (!res.ok) return { error: json.error ?? json.message ?? `HTTP ${res.status}` };
    return {};
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchRecordById<T>(entity: string, id: string): Promise<{ row?: T; error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const params = new URLSearchParams({ entity, id });
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${params}`, {
      headers: await adminHeaders(),
    });
    const json = await res.json().catch(() => ({})) as { row?: T; error?: string; message?: string };
    if (!res.ok) return { error: json.error ?? json.message ?? `HTTP ${res.status}` };
    if (!json.row) return { error: "Record not found" };
    return { row: json.row };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
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

function useCompanyNameSuggestions(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void loadCompanyOptions()
      .then((options) => {
        if (active) setNames([...new Map(options.map((option) => [option.company_name.toLowerCase(), option.company_name])).values()]);
      })
      .catch(() => { if (active) setNames([]); });
    return () => { active = false; };
  }, []);
  return names;
}

const UNIVERSITY_SUGGESTIONS = [
  "Arizona State University", "Bocconi University", "Brown University", "California Institute of Technology",
  "Carnegie Mellon University", "Columbia University", "Cornell University", "Dartmouth College",
  "Duke University", "ETH Zurich", "Harvard University", "Imperial College London", "London School of Economics",
  "Massachusetts Institute of Technology", "McGill University", "Northwestern University", "Oxford University",
  "Princeton University", "Stanford University", "Technical University of Munich", "Tel Aviv University",
  "The University of Chicago", "UC Berkeley", "UCLA", "University of Cambridge", "University of Michigan",
  "University of Pennsylvania", "University of Southern California", "University of Toronto", "Yale University",
];
const UNIVERSITY_SUGGESTIONS_KEY = "vekta.admin.education-university-suggestions";
const CUSTOM_PAST_COMPANY_SUGGESTIONS: string[] = [];
const PAST_COMPANY_SUGGESTIONS_KEY = "vekta.admin.past-company-suggestions";

const DOMAIN_EXPERTISE_SUGGESTIONS = [
  "AI & Machine Learning", "Biotech", "Climate Tech", "Consumer", "Cybersecurity", "Data & Analytics",
  "Developer Tools", "E-commerce", "Education", "Enterprise SaaS", "Finance", "Fintech", "Healthcare",
  "HR Tech", "Industrials", "Logistics", "Marketplaces", "Media", "Mobility", "Privacy & Security",
  "Proptech", "Robotics", "Sales & Marketing", "Supply Chain", "Web3",
];
const DOMAIN_EXPERTISE_SUGGESTIONS_KEY = "vekta.admin.domain-expertise-suggestions";
const OPERATOR_STAGE_SUGGESTIONS = Constants.public.Enums.stage_focus_enum.filter((stage) =>
  !["Series B+", "Series B", "Series C", "Growth"].includes(stage),
);
const SERIES_A_INDEX = OPERATOR_STAGE_SUGGESTIONS.indexOf("Series A");
OPERATOR_STAGE_SUGGESTIONS.splice(SERIES_A_INDEX + 1, 0, "Series B", "Series C", "Growth");
const OPERATOR_STAGE_SUGGESTIONS_KEY = "vekta.admin.operator-stage-suggestions";
const OPERATOR_SECTOR_SUGGESTIONS = [
  "AI", "Biotech", "Climate Tech", "Consumer", "Cybersecurity", "Data & Analytics", "Developer Tools",
  "Education", "Enterprise Software", "Fintech", "Healthcare", "Industrials", "Logistics & Supply Chain", "Logistics", "Marketplaces",
  "Media", "Mobility", "Proptech", "Robotics", "SaaS", "Supply Chain", "Web3",
];
const OPERATOR_SECTOR_SUGGESTIONS_KEY = "vekta.admin.operator-sector-suggestions";
const INDUSTRY_VERTICAL_SUGGESTIONS = [
  "Adtech",
  "Advanced manufacturing",
  "Agtech",
  "Artificial intelligence and machine learning (AI/ML)",
  "Audiotech",
  "Augmented reality (AR)",
  "Autonomous cars",
  "B2B payments",
  "Beauty",
  "Big Data",
  "Cannabis",
  "Carsharing",
  "Cleantech",
  "Climate tech",
  "Cloudtech and DevOps",
  "Construction technology",
  "Cryptocurrency and blockchain",
  "Cybersecurity",
  "Digital health",
  "Ecommerce",
  "Edtech",
  "Ephemeral content",
  "eSports",
  "Femtech",
  "Fintech",
  "Foodtech",
  "Gaming",
  "Healthtech",
  "HRtech",
  "Impact investing",
  "Industrials",
  "Infrastructure",
  "Insurtech",
  "Internet of Things (IoT)",
  "Legal tech",
  "Life sciences",
  "Lifestyles of Health and Sustainability (LOHAS) and wellness",
  "Manufacturing",
  "Marketing tech",
  "Micro-mobility",
  "Mobile",
  "Mobile commerce",
  "Mobility tech",
  "Mortgage tech",
  "Nanotechnology",
  "Oil and gas",
  "Oncology",
  "Pet tech",
  "Real estate tech",
  "Restaurant tech",
  "Ridesharing",
  "Robotics and drones",
  "Software as a service (SaaS)",
  "Space tech",
  "Supply chain technology",
  "Technology, media and telecommunications (TMT)",
  "Virtual reality (VR)",
  "Wearables and quantified self",
  "3D printing",
];

function rememberSuggestion(value: string, options: string[], storageKey: string) {
  const suggestion = value.trim();
  if (!suggestion || options.some((item) => item.toLowerCase() === suggestion.toLowerCase())) return;
  options.push(suggestion);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(options));
  } catch {
    // The suggestion remains available to other records for this app session.
  }
}

function restoreSuggestions(options: string[], storageKey: string) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as unknown;
    if (Array.isArray(saved)) {
      for (const value of saved) {
        if (typeof value === "string"
          && !(storageKey === OPERATOR_STAGE_SUGGESTIONS_KEY && value.trim().toLowerCase() === "series b+")) {
          rememberSuggestion(value, options, storageKey);
        }
      }
    }
  } catch {
    // Built-in suggestions remain available if browser storage is unavailable.
  }
}

restoreSuggestions(OPERATOR_STAGE_SUGGESTIONS, OPERATOR_STAGE_SUGGESTIONS_KEY);
restoreSuggestions(OPERATOR_SECTOR_SUGGESTIONS, OPERATOR_SECTOR_SUGGESTIONS_KEY);

function rememberDomainExpertiseSuggestion(value: string) {
  rememberSuggestion(value, DOMAIN_EXPERTISE_SUGGESTIONS, DOMAIN_EXPERTISE_SUGGESTIONS_KEY);
}

restoreSuggestions(DOMAIN_EXPERTISE_SUGGESTIONS, DOMAIN_EXPERTISE_SUGGESTIONS_KEY);
restoreSuggestions(UNIVERSITY_SUGGESTIONS, UNIVERSITY_SUGGESTIONS_KEY);
restoreSuggestions(CUSTOM_PAST_COMPANY_SUGGESTIONS, PAST_COMPANY_SUGGESTIONS_KEY);

function AffinityMultiSelect({
  label, value, options, placeholder, addLabel, onAddCustom, onChange, disallowCustomValues = [], allowCustom = true,
}: {
  label: string;
  value: string[] | null | undefined;
  options: string[];
  placeholder: string;
  addLabel: (value: string) => string;
  onAddCustom?: (value: string) => void;
  onChange: (value: string[]) => void;
  disallowCustomValues?: string[];
  allowCustom?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const selected = value ?? [];
  const needle = query.trim().toLowerCase();
  const filtered = options
    .filter((option) => option.toLowerCase().includes(needle))
    .filter((option) => !selected.some((entry) => entry.toLowerCase() === option.toLowerCase()))
    .slice(0, 8);
  const exactMatch = options.some((option) => option.toLowerCase() === needle);
  const customValueDisallowed = disallowCustomValues.some((item) => item.toLowerCase() === needle);
  const canAddCustom = allowCustom
    && needle.length > 0
    && !exactMatch
    && !customValueDisallowed
    && !selected.some((entry) => entry.toLowerCase() === needle);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  const add = (entry: string) => {
    const trimmed = entry.trim();
    if (!trimmed || selected.some((item) => item.toLowerCase() === trimmed.toLowerCase())) return;
    if (!options.some((option) => option.toLowerCase() === trimmed.toLowerCase())) onAddCustom?.(trimmed);
    onChange([...selected, trimmed]);
    setQuery("");
    setOpen(true);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "ArrowDown" && (filtered.length || canAddCustom)) {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, filtered.length + (canAddCustom ? 0 : -1)));
    } else if (event.key === "ArrowUp" && (filtered.length || canAddCustom)) {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (highlight < filtered.length && filtered[highlight]) add(filtered[highlight]);
      else if (canAddCustom) add(query);
    }
  };

  return (
    <FL label={label}>
      <div ref={rootRef}>
        <div className="relative">
          <input
            className={IC}
            style={open ? IF : IS}
            value={query}
            placeholder={placeholder}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            onFocus={() => setOpen(true)}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
            onKeyDown={onKeyDown}
          />
          {open && (filtered.length > 0 || canAddCustom) && (
            <div role="listbox" aria-label={`${label} suggestions`}
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-md p-1 shadow-xl"
              style={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)" }}>
              {filtered.map((option, index) => (
                <button key={option} type="button" role="option" aria-selected={highlight === index}
                  onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setHighlight(index)} onClick={() => add(option)}
                  className="block w-full rounded px-2.5 py-2 text-left text-[12px] hover:bg-white/[0.06]"
                  style={{ color: "rgba(255,255,255,0.82)", background: highlight === index ? "rgba(46,230,166,0.1)" : undefined }}>
                  {option}
                </button>
              ))}
              {canAddCustom && (
                <button type="button" role="option" aria-selected={highlight === filtered.length}
                  onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setHighlight(filtered.length)} onClick={() => add(query)}
                  className="block w-full rounded px-2.5 py-2 text-left text-[12px] hover:bg-white/[0.06]"
                  style={{ color: "#2EE6A6", background: highlight === filtered.length ? "rgba(46,230,166,0.1)" : undefined }}>
                  {addLabel(query.trim())}
                </button>
              )}
            </div>
          )}
        </div>
        {selected.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {selected.map((entry) => (
              <span key={entry} className="inline-flex max-w-full items-center gap-1 rounded px-2 py-1 text-[11px]"
                style={{ color: "rgba(255,255,255,0.78)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}>
                <span className="truncate">{entry}</span>
                <button type="button" aria-label={`Remove ${entry}`} onClick={() => onChange(selected.filter((item) => item !== entry))}
                  className="shrink-0 rounded p-0.5 hover:bg-white/10" style={{ color: "rgba(255,255,255,0.48)" }}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </FL>
  );
}

function AffinityFields({
  education, priorCompanies, onEducationChange, onPriorCompaniesChange,
}: {
  education: string[] | null | undefined;
  priorCompanies: string[] | null | undefined;
  onEducationChange: (value: string[]) => void;
  onPriorCompaniesChange: (value: string[]) => void;
}) {
  const companyNames = useCompanyNameSuggestions();
  const pastCompanySuggestions = [...new Map(
    [...companyNames, ...CUSTOM_PAST_COMPANY_SUGGESTIONS].map((name) => [name.toLowerCase(), name]),
  ).values()];
  return (
    <>
      <Sect title="AFFINITY" />
      <AffinityMultiSelect label="Education" value={education} options={UNIVERSITY_SUGGESTIONS}
        placeholder="Search universities" addLabel={(value) => `Add university: ${value}`}
        onAddCustom={(value) => rememberSuggestion(value, UNIVERSITY_SUGGESTIONS, UNIVERSITY_SUGGESTIONS_KEY)}
        onChange={onEducationChange} />
      <AffinityMultiSelect label="Past Companies" value={priorCompanies} options={pastCompanySuggestions}
        placeholder="Search companies or add a name" addLabel={(value) => `Add “${value}” without creating a company profile`}
        onAddCustom={(value) => rememberSuggestion(value, CUSTOM_PAST_COMPANY_SUGGESTIONS, PAST_COMPANY_SUGGESTIONS_KEY)}
        onChange={onPriorCompaniesChange} />
    </>
  );
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

function TF({ label, value, onChange, type = "text", placeholder, list }: {
  label: string; value: string | null; onChange: (v: string) => void;
  type?: string; placeholder?: string; list?: string;
}) {
  return (
    <FL label={label}>
      <input
        className={IC} style={IS} type={type} placeholder={placeholder} list={list}
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        onFocus={e => Object.assign(e.currentTarget.style, IF)}
        onBlur={e  => Object.assign(e.currentTarget.style, IS)}
      />
    </FL>
  );
}

function CTF({ label, value, onChange, placeholder }: {
  label: string; value: string | null; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <FL label={label}>
      <CurrencyStringInput className={IC} style={IS} focusStyle={IF} value={value} onChange={onChange} placeholder={placeholder} />
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

function CNF({ label, value, onChange }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
}) {
  return (
    <FL label={label}>
      <CurrencyNumberInput className={IC} style={IS} focusStyle={IF} value={value} onChange={onChange} />
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
            const parsed = parseCurrencyAmount(raw);
            if (parsed.valid && parsed.suffix && parsed.amount != null) {
              const nextUnit: MoneyRaisedUnit = parsed.suffix === "k" ? "K" : "M";
              const divisor = nextUnit === "K" ? 1_000 : 1_000_000;
              publish(String(parsed.amount / divisor), nextUnit);
            } else {
              publish(sanitizeMoneyRaisedInput(raw), unit);
            }
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
  label = "Company",
}: {
  startupId: string | null;
  onChange: (startupId: string | null) => void;
  allowEmpty?: boolean;
  label?: string;
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
    <FL label={label}>
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

function CompanyProfilesField({ startupIds, onChange, required = false, label = "Founder company profile" }: {
  startupIds: string[];
  onChange: (startupIds: string[]) => void;
  required?: boolean;
  label?: string;
}) {
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadCompanyOptions().then((rows) => { if (active) setOptions(rows); }).catch((loadFailure: unknown) => {
      if (active) setLoadError(loadFailure instanceof Error ? loadFailure.message : "Could not load companies.");
    });
    return () => { active = false; };
  }, []);

  const selected = startupIds.flatMap((id) => {
    const option = options.find((row) => row.id === id);
    return option ? [option] : [];
  });
  const trimmed = query.trim();
  const filtered = options.filter((row) => row.company_name.toLowerCase().includes(trimmed.toLowerCase()))
    .filter((row) => !startupIds.includes(row.id)).slice(0, 40);
  const hasExact = trimmed.length > 0 && options.some((row) => row.company_name.toLowerCase() === trimmed.toLowerCase());

  const choose = (option: CompanyOption) => {
    if (!startupIds.includes(option.id)) onChange([...startupIds, option.id]);
    setOptions((previous) => previous.some((row) => row.id === option.id) ? previous : [...previous, option].sort((a, b) => a.company_name.localeCompare(b.company_name)));
    setQuery("");
    setOpen(false);
    setError(null);
  };

  const addCompany = async () => {
    setAdding(true);
    setError(null);
    const result = await createNonLiveCompany(trimmed);
    setAdding(false);
    if (result.error || !result.option) { setError(result.error ?? "Could not add company."); return; }
    choose(result.option);
  };

  return (
    <FL label={label}>
      <div className="relative">
        <input className={IC} style={open ? IF : IS} value={query} placeholder="Search company records"
          aria-label="Search company records to link to this founder"
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onBlur={() => { window.setTimeout(() => setOpen(false), 150); }} />
        {open && (filtered.length > 0 || (trimmed && !hasExact)) && (
          <div className="absolute inset-x-0 top-full z-[80] mt-1 max-h-48 overflow-y-auto rounded-md border shadow-xl" style={{ background: "#111", borderColor: "rgba(255,255,255,0.12)" }}>
            {filtered.map((option) => (
              <button key={option.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}
                className="block w-full truncate px-3 py-2 text-left text-xs hover:bg-white/[0.05]" style={{ color: "rgba(255,255,255,0.82)" }}>
                {option.company_name}
              </button>
            ))}
            {trimmed && !hasExact && (
              <button type="button" disabled={adding} onMouseDown={(event) => event.preventDefault()} onClick={() => void addCompany()}
                className="block w-full border-t px-3 py-2 text-left text-xs disabled:opacity-50" style={{ borderColor: "rgba(255,255,255,0.08)", color: "#2EE6A6" }}>
                {adding ? "Adding company profile…" : `Add “${trimmed}” as a company profile`}
              </button>
            )}
            {!filtered.length && !trimmed && <div className="px-3 py-2 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>No company records available</div>}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <span key={option.id} className="inline-flex max-w-full items-center gap-1 rounded border px-2 py-1 text-[11px]"
              style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.78)" }}>
              <span className="max-w-56 truncate">{option.company_name}</span>
              {(!required || startupIds.length > 1) && (
                <button type="button" aria-label={`Unlink ${option.company_name}`} onClick={() => onChange(startupIds.filter((id) => id !== option.id))}
                  className="shrink-0 rounded px-0.5 text-white/45 hover:bg-white/10" title={`Unlink ${option.company_name}`}>×</button>
              )}
            </span>
          ))}
        </div>
      )}
      {required && startupIds.length === 0 && <p className="text-[10px]" style={{ color: "#fca5a5" }}>Link at least one company profile.</p>}
      {selected.some((option) => !isActiveCompanyStatus(option.status)) && (
        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Linked company profiles are not live until their status is Active.</p>
      )}
      {loadError && <p className="text-[10px]" style={{ color: "#f87171" }}>{loadError}</p>}
      {error && <p role="alert" className="text-[10px]" style={{ color: "#f87171" }}>{error}</p>}
    </FL>
  );
}

function newEmploymentEntry(): EmploymentEntry {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `employment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    employer_type: "company",
    employer_name: "",
    title: "",
    relationship: "hired",
    is_current: false,
  };
}

function normalizeEmploymentHistory(value: unknown): EmploymentEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): EmploymentEntry[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    return [{
      id: typeof row.id === "string" && row.id ? row.id : newEmploymentEntry().id,
      employer_type: row.employer_type === "corporation" ? "corporation" : "company",
      employer_name: typeof row.employer_name === "string" ? row.employer_name : "",
      title: typeof row.title === "string" ? row.title : "",
      relationship: row.relationship === "founded" ? "founded" : "hired",
      is_current: row.is_current === true,
    }];
  });
}

function normalizeCompanyProfileIds(value: unknown, fallbackId?: string | null): string[] {
  const ids = Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim())
    : [];
  const unique = [...new Set(ids)];
  if (unique.length > 0) return unique;
  return fallbackId ? [fallbackId] : [];
}

function EmploymentHistoryEditor({ value, onChange }: {
  value: EmploymentEntry[] | null | undefined;
  onChange: (value: EmploymentEntry[]) => void;
}) {
  const entries = normalizeEmploymentHistory(value);
  const update = (index: number, patch: Partial<EmploymentEntry>) => {
    onChange(entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
  };
  const remove = (index: number) => onChange(entries.filter((_, entryIndex) => entryIndex !== index));

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry, index) => (
        <div key={entry.id} className="rounded-lg border p-3" style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <TF label={`Employer ${index + 1}`} value={entry.employer_name} onChange={(employer_name) => update(index, { employer_name })} placeholder="Enter a company or corporation" />
            </div>
            <button type="button" onClick={() => remove(index)} aria-label={`Remove employer ${index + 1}`}
              className="mb-0.5 rounded border p-2 text-white/45 hover:text-red-300" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {entry.employer_name.trim() && (
            <div className="mt-3 grid gap-3">
              <SFld label="Employer type" value={entry.employer_type} onChange={(employer_type) => update(index, { employer_type: employer_type === "corporation" ? "corporation" : "company" })}
                options={[{ value: "company", label: "Company" }, { value: "corporation", label: "Corporation" }]} allowEmpty={false} />
              <TF label="Title" value={entry.title} onChange={(title) => update(index, { title })} placeholder="Role or title" />
              <SFld label="Relationship" value={entry.relationship} onChange={(relationship) => update(index, { relationship: relationship === "founded" ? "founded" : "hired" })}
                options={[{ value: "founded", label: "Founded" }, { value: "hired", label: "Hired" }]} allowEmpty={false} />
              <label className="flex cursor-pointer items-center gap-2 text-[12px]" style={{ color: "rgba(255,255,255,0.78)" }}>
                <input type="checkbox" checked={entry.is_current} onChange={(event) => update(index, { is_current: event.target.checked })} className="accent-emerald-400" />
                Current employer
              </label>
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...entries, newEmploymentEntry()])}
        className="flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-[11px] font-medium transition-colors hover:bg-white/[0.04]"
        style={{ borderColor: "rgba(46,230,166,0.3)", color: "#2EE6A6" }}>
        <Plus className="h-3.5 w-3.5" /> Add employer
      </button>
      <p className="-mt-1 text-[10px]" style={{ color: "rgba(255,255,255,0.38)" }}>Employer entries are saved to this profile only and do not create separate company records.</p>
    </div>
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
  title, subtitle, saving, onClose, onSave, onDelete, children, zIndex = 50, recordStatus, onRecordStatusChange,
}: {
  title: string; subtitle: string; saving: boolean;
  onClose: () => void; onSave: () => void; onDelete?: () => void; children: React.ReactNode; zIndex?: number;
  recordStatus?: RecordLifecycleStatus; onRecordStatusChange?: (status: RecordLifecycleStatus) => void;
}) {
  return (
    <div
      style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: 440, zIndex,
        background: "#0c0c0c", borderLeft: "1px solid rgba(255,255,255,0.07)",
        display: "flex", flexDirection: "column", boxShadow: "-8px 0 32px rgba(0,0,0,0.6)",
      }}
    >
      <div className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-mono uppercase tracking-widest" style={{ color: "#2EE6A6" }}>{title}</p>
          <p className="text-[13px] font-semibold text-white/80 mt-0.5 truncate max-w-[240px]">{subtitle}</p>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          {recordStatus && onRecordStatusChange && (
            <select
              aria-label="Record status"
              value={recordStatus}
              disabled={saving}
              onChange={event => onRecordStatusChange(event.target.value as RecordLifecycleStatus)}
              className="h-8 max-w-[138px] rounded-md px-2 text-[11px] font-semibold outline-none disabled:opacity-50"
              style={{
                color: recordStatus === "deleted" ? "#f87171" : recordStatusColor(recordStatus),
                background: recordStatus === "deleted" ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${recordStatus === "deleted" ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.14)"}`,
              }}
            >
              <option value="live">Live</option>
              <option value="needs_review">Needs Review</option>
              <option value="archived">Archived</option>
              <option value="deleted">Deleted</option>
            </select>
          )}
          <button type="button" aria-label="Close record editor" onClick={onClose} className="p-1 rounded hover:bg-white/05 transition-colors">
            <X className="h-4 w-4" style={{ color: "rgba(255,255,255,0.4)" }} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {children}
      </div>

      <div className="flex items-center gap-3 px-5 py-4 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        {onDelete && (
          <button
            type="button" onClick={onDelete} disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-40"
            style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        )}
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

const FUNDING_ROUND_ALIASES: Record<string, string> = {
  angel: "Angel",
  accelerator: "Accelerator",
  "pre seed": "Pre-Seed",
  preseed: "Pre-Seed",
  seed: "Seed",
  "series a": "Series A",
  "series b": "Series B",
  "series c": "Series C",
  growth: "Growth",
};

function normalizeFundingRoundName(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return FUNDING_ROUND_ALIASES[key] ?? raw;
}

function fundingRoundKey(value: string | null | undefined): string {
  return (normalizeFundingRoundName(value) ?? "").toLowerCase();
}

type FundingRoundDraft = {
  key: string;
  id: string | null;
  round_type: string;
  amount_usd: number | null;
  announcement_date: string | null;
};

function blankFundingRound(): FundingRoundDraft {
  return { key: crypto.randomUUID(), id: null, round_type: "", amount_usd: null, announcement_date: null };
}

function normalizeFundingRounds(rows: FundingRoundDraft[]): FundingRoundDraft[] {
  const filledByRound = new Map<string, FundingRoundDraft>();
  for (const row of rows) {
    const canonical = normalizeFundingRoundName(row.round_type);
    if (!canonical) continue;
    const key = fundingRoundKey(canonical);
    const existing = filledByRound.get(key);
    if (!existing) filledByRound.set(key, { ...row, round_type: canonical });
    else {
      filledByRound.set(key, {
        ...existing,
        amount_usd: existing.amount_usd ?? row.amount_usd,
        announcement_date: existing.announcement_date ?? row.announcement_date,
      });
    }
  }
  const filled = [...filledByRound.values()];
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
  if (isTestAdminSampleId(startupId)) {
    return {
      rows: [
        {
          id: `${startupId}-link`,
          firm_id: "demo-sequoia",
          firm_name: "Sequoia Capital",
          firm_investor_id: "demo-botha",
          investor_name: "Roelof Botha",
          investor_title: "Partner",
          round_name: "Series A",
          amount_usd: 18_000_000,
          amount_label: "$18M",
          portfolio_note: "Led the round after a partner meeting.",
          led_round: true,
        },
      ],
    };
  }
  if (!SUPABASE_URL) return { rows: [], error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=company-investors&startup_id=${encodeURIComponent(startupId)}`,
      { headers: await adminHeaders() },
    );
    const json = await res.json().catch(() => ({})) as { rows?: InvestorLinkRow[]; error?: string };
    if (!res.ok) return { rows: [], error: json.error ?? `HTTP ${res.status}` };
    return {
      rows: (json.rows ?? []).map((row) => ({
        ...row,
        round_name: normalizeFundingRoundName(row.round_name),
      })),
    };
  } catch (e: unknown) {
    return { rows: [], error: String(e) };
  }
}

async function unlinkCompanyInvestor(body: Record<string, unknown>): Promise<{ error?: string }> {
  if (isTestAdminSampleId(String(body.startup_id ?? ""))) return {};
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
  announcement_date: string | null;
  sort_order: number;
};

async function loadCompanyFundingRounds(startupId: string): Promise<{ rows: StoredFundingRound[]; error?: string }> {
  if (isTestAdminSampleId(startupId)) {
    return {
      rows: [
        { id: `${startupId}-seed`, round_type: "seed", amount_usd: 4_500_000, announcement_date: null, sort_order: 0 },
        { id: `${startupId}-a`, round_type: "series_a", amount_usd: 18_000_000, announcement_date: null, sort_order: 1 },
      ],
    };
  }
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
  if (isTestAdminSampleId(startupId)) {
    return {
      rows: rounds.filter((row) => row.round_type).map((row, index) => ({
        id: row.id ?? `${startupId}-round-${index}`,
        round_type: row.round_type,
        amount_usd: row.amount_usd,
        announcement_date: row.announcement_date,
        sort_order: index,
      })),
    };
  }
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
            announcement_date: row.announcement_date,
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

async function createFirmInvestor(body: { firm_id: string; full_name: string; title: string; email?: string }): Promise<{ person?: CardPerson; error?: string }> {
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

async function createInvestorFirm(firmName: string): Promise<{ firm?: FirmHit; error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?entity=firms`, {
      method: "POST",
      headers: await adminHeaders(),
      body: JSON.stringify({ firm_name: firmName.trim() }),
    });
    const json = await res.json().catch(() => ({})) as { row?: { id?: string; firm_name?: string | null }; error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    if (!json.row?.id) return { error: "Firm was not created" };
    return { firm: { id: json.row.id, firm_name: json.row.firm_name ?? firmName.trim() } };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function createStandaloneInvestor(body: { full_name: string; title: string; email: string }): Promise<{ person?: CardPerson; error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?entity=company-investors`, {
      method: "POST",
      headers: await adminHeaders(),
      body: JSON.stringify({ ...body, action: "create_individual" }),
    });
    const json = await res.json().catch(() => ({})) as {
      row?: { id?: string; full_name?: string | null; title?: string | null; firm_id?: string; firm_name?: string | null };
      error?: string;
    };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    const row = json.row;
    if (!row?.id || !row.firm_id) return { error: "Individual investor was not created" };
    return {
      person: {
        id: row.id,
        name: row.full_name?.trim() || body.full_name,
        title: row.title ?? (body.title.trim() || null),
        firm: { id: row.firm_id, firm_name: row.firm_name ?? body.full_name },
      },
    };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function saveCompanyInvestorLink(body: Record<string, unknown>): Promise<{ created?: boolean; error?: string }> {
  if (isTestAdminSampleId(String(body.startup_id ?? ""))) return { created: true };
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

function FirmLookup({ selected, onSelect, onCreateFirm }: {
  selected: FirmHit | null;
  onSelect: (firm: FirmHit | null) => void;
  onCreateFirm: (name: string) => Promise<FirmHit | null>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<FirmHit[]>([]);
  const [creating, setCreating] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) { setHits([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void fetchRows<FirmHit>("firms", { page: 0, search: q, limit: 8 }).then((res) => {
        if (!cancelled) { setHits(res.rows); setSearching(false); }
      });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, open]);

  const typed = query.trim();
  const exactMatch = hits.some((hit) => sameInvestorName(hit.firm_name ?? "", typed));
  const addFirm = async () => {
    setCreating(true);
    const created = await onCreateFirm(typed);
    setCreating(false);
    if (!created) return;
    onSelect(created);
    setQuery("");
    setOpen(false);
  };

  return (
    <FL label="Firm">
      <input
        className={IC} style={IS}
        placeholder="Search existing firms or add one"
        value={open ? query : (selected?.firm_name ?? "")}
        onFocus={(e) => { setOpen(true); setQuery(selected?.firm_name ?? ""); Object.assign(e.currentTarget.style, IF); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (selected) onSelect(null); }}
        onBlur={(e) => { Object.assign(e.currentTarget.style, IS); window.setTimeout(() => setOpen(false), 150); }}
      />
      {open && typed.length >= 2 && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)" }}>
          {searching && <div className="px-3 py-2 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>Searching firms…</div>}
          {!searching && hits.length === 0 && <div className="px-3 py-2 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>No firms found</div>}
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
          {!searching && !exactMatch && (
            <button
              type="button"
              disabled={creating}
              className="block w-full border-t px-3 py-2 text-left text-[12px] font-medium disabled:opacity-50"
              style={{ color: "#2EE6A6", borderColor: "rgba(255,255,255,0.08)" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { void addFirm(); }}
            >
              {creating ? "Adding firm…" : `+ Add “${typed}” as a firm`}
            </button>
          )}
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
    const canonical = normalizeFundingRoundName(row.round_type);
    const key = fundingRoundKey(canonical);
    if (!canonical || seen.has(key)) continue;
    seen.add(key);
    types.push(canonical);
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
    <button
      type="button"
      aria-pressed={checked}
      aria-label={`${checked ? "Unmark" : "Mark"} ${round} as led by this firm`}
      className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded px-1.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400"
      style={{
        color: checked ? "#2EE6A6" : "rgba(255,255,255,0.8)",
        background: checked ? "rgba(46,230,166,0.08)" : "transparent",
      }}
      onClick={() => {
        if (!firmId) { toast.error("Pick a firm first"); return; }
        onLead(round, !checked);
      }}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border"
        style={{ borderColor: checked ? "#2EE6A6" : "rgba(255,255,255,0.45)" }}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#2EE6A6" }} />}
      </span>
      Led Round
    </button>
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
  return `${firmInvestorId ?? ""}|${fundingRoundKey(roundName)}`;
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
  const savedRounds = [...new Set(links.map((item) => normalizeFundingRoundName(item.round_name)).filter((name): name is string => Boolean(name)))];
  const signature = links.map((item) => `${item.id ?? ""}:${item.firm_investor_id ?? ""}:${fundingRoundKey(item.round_name)}:${item.led_round ? 1 : 0}`).join("|");
  const [rounds, setRounds] = useState<string[]>(savedRounds);
  const [people, setPeople] = useState<CardPerson[]>(() => peopleFromLinks(links));
  const [saving, setSaving] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  useEffect(() => {
    setRounds([...new Set(links.map((item) => normalizeFundingRoundName(item.round_name)).filter((name): name is string => Boolean(name)))]);
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
  const [entryType, setEntryType] = useState<"firm" | "individual">("firm");
  const [individualName, setIndividualName] = useState("");
  const [individualTitle, setIndividualTitle] = useState("");
  const [individualEmail, setIndividualEmail] = useState("");
  const [creatingIndividual, setCreatingIndividual] = useState(false);

  const createFirm = async (name: string): Promise<FirmHit | null> => {
    if (isTestAdminSampleId(startupId)) {
      const sampleFirm = { id: `demo-firm-${crypto.randomUUID()}`, firm_name: name };
      toast.success("Firm added in the test console");
      return sampleFirm;
    }
    const result = await createInvestorFirm(name);
    if (result.error || !result.firm) {
      toast.error("Could not add firm", { description: result.error ?? "No firm returned" });
      return null;
    }
    toast.success("Firm added — add a person below if needed");
    return result.firm;
  };

  const createIndividual = async () => {
    const fullName = individualName.trim();
    if (!fullName) { toast.error("Enter the individual's name"); return; }
    setCreatingIndividual(true);
    if (isTestAdminSampleId(startupId)) {
      const personFirm = { id: `demo-angel-${crypto.randomUUID()}`, firm_name: fullName };
      const person = {
        id: `demo-person-${crypto.randomUUID()}`,
        name: fullName,
        title: individualTitle.trim() || null,
        firm: personFirm,
      };
      setFirm(personFirm);
      setPeople([person]);
      setCreatingIndividual(false);
      toast.success("Individual investor added in the test console");
      return;
    }

    const personResult = await createStandaloneInvestor({
      full_name: fullName,
      title: individualTitle.trim(),
      email: individualEmail.trim(),
    });
    setCreatingIndividual(false);
    if (personResult.error || !personResult.person) {
      toast.error("Could not add individual investor", { description: personResult.error ?? "Person was not created" });
      return;
    }
    setFirm(personResult.person.firm ?? null);
    setPeople([personResult.person]);
    toast.success("Individual investor added");
  };

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
      <div className="inline-flex self-start rounded-md p-0.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} aria-label="Investor type">
        {(["firm", "individual"] as const).map((type) => (
          <button key={type} type="button" aria-pressed={entryType === type} onClick={() => setEntryType(type)}
            className="rounded px-2.5 py-1 text-[11px] capitalize transition-colors"
            style={{ background: entryType === type ? "rgba(46,230,166,0.14)" : "transparent", color: entryType === type ? "#2EE6A6" : "rgba(255,255,255,0.48)" }}>
            {type}
          </button>
        ))}
      </div>
      {entryType === "firm" ? (
        <FirmLookup
          selected={firm}
          onCreateFirm={createFirm}
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
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <TF label="Individual name" value={individualName} onChange={setIndividualName} placeholder="e.g. Jordan Lee" />
          <TF label="Title" value={individualTitle} onChange={setIndividualTitle} placeholder="Angel investor" />
          <TF label="Email (optional)" value={individualEmail} onChange={setIndividualEmail} type="email" />
          <button type="button" disabled={creatingIndividual} onClick={() => { void createIndividual(); }}
            className="inline-flex h-[31px] items-center justify-center gap-1.5 self-end rounded px-3 text-[12px] font-semibold disabled:opacity-60"
            style={{ background: "rgba(46,230,166,0.14)", color: "#2EE6A6", border: "1px solid rgba(46,230,166,0.24)" }}>
            {creatingIndividual ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
            {creatingIndividual ? "Adding individual…" : "Add individual"}
          </button>
          <p className="sm:col-span-2 text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
            Creates an Angel profile and a linked person record for this individual investor.
          </p>
        </div>
      )}
      <FundingRoundPicker
        fundingRounds={fundingRounds}
        selected={rounds}
        onChange={setRounds}
        firmId={entryType === "firm" ? firm?.id ?? null : null}
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
        announcement_date: row.announcement_date,
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
        announcement_date: row.announcement_date,
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
          <TF
            label="Announcement Date"
            type="date"
            value={row.announcement_date}
            onChange={(value) => publish(rowsRef.current.map((item) => item.key === row.key ? { ...item, announcement_date: value || null } : item))}
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
      if (row.led_round && row.round_name) next[normalizeFundingRoundName(row.round_name) ?? row.round_name] = row.firm_id;
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
  const setLifecycleStatus = (status: RecordLifecycleStatus) => setD(previous => ({
    ...previous,
    record_status: status === "deleted" ? normalizeRecordStatus(previous.record_status) : status,
    deleted_at: status === "deleted" ? previous.deleted_at ?? new Date().toISOString() : null,
  }));
  const setTotalRaised = (value: number | null) => {
    if (value == null || !Number.isFinite(value)) {
      totalRaisedManualRef.current = false;
      setD((prev) => ({ ...prev, total_raised_usd: totalRaisedFromFundingRounds(fundingRoundsRef.current) }));
      return;
    }
    totalRaisedManualRef.current = true;
    setD((prev) => ({ ...prev, total_raised_usd: value }));
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${row.company_name}? It will be removed from the active catalog.`)) return;
    setSaving(true);
    const deletedAt = new Date().toISOString();
    if (isTestAdminSampleId(row.id)) {
      onSaved({ ...d, deleted_at: deletedAt, updated_at: deletedAt });
      setSaving(false);
      toast.success("Company deleted from the test console");
      return;
    }
    const { row: updated, error } = await patchRow<CompanyRow>("companies", row.id, { deleted_at: deletedAt });
    setSaving(false);
    if (error || !updated) { toast.error(`Delete failed: ${error ?? "no data"}`); return; }
    toast.success("Company deleted");
    onSaved(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    if (isTestAdminSampleId(row.id)) {
      const updated = { ...d, updated_at: new Date().toISOString() };
      toast.success("Company saved in the test console");
      onSaved(updated);
      setSaving(false);
      return;
    }
    const { id, created_at, updated_at, ...patch } = d;
    delete patch.location;
    patch.sector = patch.sector?.trim() || null;
    patch.logo_url = patch.logo_url?.trim() || null;
    patch.brand_icon_url = patch.brand_icon_url?.trim() || null;
    patch.hq_city = patch.hq_city?.trim() || null;
    patch.hq_state = patch.hq_state?.trim() || null;
    patch.hq_country = patch.hq_country?.trim() || null;
    // These URL fields are editable company-record data. Normalize them explicitly
    // so empty inputs clear the stored value and the canonical website column is sent.
    patch.company_url = patch.company_url?.trim() || null;
    patch.linkedin_url = patch.linkedin_url?.trim() || null;
    patch.x_url = patch.x_url?.trim() || null;
    patch.facebook_url = patch.facebook_url?.trim() || null;
    patch.instagram_url = patch.instagram_url?.trim() || null;
    patch.tiktok_url = patch.tiktok_url?.trim() || null;
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
    <PanelShell title="Edit Company" subtitle={row.company_name} saving={saving} onClose={onClose} onSave={handleSave} onDelete={handleDelete}
      recordStatus={toLifecycleStatus(d)} onRecordStatusChange={setLifecycleStatus}>
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
      <TA label="Short Description" value={d.description_short} onChange={v => set("description_short", v)} rows={2} />
      <TA label="Long Description"  value={d.description_long}  onChange={v => set("description_long", v)} rows={4} />

      <Sect title="Social Platforms" />
      <TF label="LinkedIn URL" value={d.linkedin_url} onChange={v => set("linkedin_url", v)} placeholder="https://linkedin.com/company/…" />
      <TF label="X URL" value={d.x_url} onChange={v => set("x_url", v)} placeholder="https://x.com/…" />
      <TF label="Facebook URL" value={d.facebook_url} onChange={v => set("facebook_url", v)} placeholder="https://facebook.com/…" />
      <TF label="Instagram URL" value={d.instagram_url} onChange={v => set("instagram_url", v)} placeholder="https://instagram.com/…" />
      <TF label="TikTok URL" value={d.tiktok_url} onChange={v => set("tiktok_url", v)} placeholder="https://tiktok.com/@…" />

      <Sect title="Classification" />
      <SFld label="Sector" value={d.sector} onChange={v => set("sector", v || null)} options={COMPANY_SECTORS} />
      <AffinityMultiSelect label="Industry Verticals" value={d.industry_verticals} options={INDUSTRY_VERTICAL_SUGGESTIONS}
        placeholder="Search industry verticals" addLabel={(value) => `Add vertical: ${value}`}
        allowCustom={false}
        onChange={(value) => set("industry_verticals", value)} />
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
        <CNF label="Total Raised (USD)" value={d.total_raised_usd} onChange={setTotalRaised} />
        <NF label="Headcount"          value={d.headcount}        onChange={v => set("headcount", v)} />
        <NF label="Founded Year"       value={d.founded_year}     onChange={v => set("founded_year", v)} />
      </div>

      <CompanyKeyPeopleEditor startupId={row.id} />
      <CompanyFundingRounds startupId={row.id} onRoundsChange={onRoundsChange} saveRef={saveRoundsRef} />
      <CompanyInvestors startupId={row.id} fundingRounds={fundingRounds} />

    </PanelShell>
  );
}

const KEY_PERSON_TITLE_SUGGESTIONS = [
  "Founder", "Co-Founder", "Founder & CEO", "Co-Founder & CEO", "CEO",
  "CTO", "CFO", "COO", "CMO", "CPO", "CRO", "Chief of Staff",
  "VP of Engineering", "VP of Operations", "VP of Product", "VP of Marketing",
  "VP of Sales", "VP of Finance", "Head of Engineering", "Head of Ops",
  "Head of Product", "Head of Growth", "Head of Sales", "Head of Finance",
];

const PROFILE_TITLE_SUGGESTIONS_ID = "admin-profile-title-suggestions";

function ProfileTitleField({ label, value, onChange }: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <TF label={label} value={value} onChange={onChange} list={PROFILE_TITLE_SUGGESTIONS_ID} />
      <datalist id={PROFILE_TITLE_SUGGESTIONS_ID}>
        {KEY_PERSON_TITLE_SUGGESTIONS.map((title) => <option key={title} value={title} />)}
      </datalist>
    </>
  );
}

function newCompanyKeyPerson(): CompanyKeyPerson {
  return {
    client_key: crypto.randomUUID(),
    operator_profile_id: null,
    founder_profile_id: null,
    full_name: "",
    title: "",
    email: "",
    bio: "",
    avatar_url: "",
    profile_type: "operator",
  };
}

function CompanyKeyPeopleEditor({ startupId }: { startupId: string }) {
  const demo = isTestAdminSampleId(startupId);
  const [people, setPeople] = useState<CompanyKeyPerson[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [openingProfileKey, setOpeningProfileKey] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<
    | { type: "founder"; clientKey: string; row: FounderRow }
    | { type: "operator"; clientKey: string; row: OperatorRow }
    | null
  >(null);

  useEffect(() => {
    if (demo) {
      setPeople([]);
      setLoading(false);
      setLoadError(null);
      return;
    }
    let active = true;
    setLoading(true);
    void fetchCompanyKeyPeople(startupId).then(({ rows, error }) => {
      if (!active) return;
      setPeople(rows.map((person) => ({ ...person, client_key: person.client_key || crypto.randomUUID() })));
      setLoadError(error ?? null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [demo, startupId]);

  const update = (clientKey: string, patch: Partial<CompanyKeyPerson>) => {
    setPeople((previous) => previous.map((person) => person.client_key === clientKey ? { ...person, ...patch } : person));
  };

  const save = async (person: CompanyKeyPerson) => {
    if (!person.full_name.trim()) { toast.error("Enter a name for this key person"); return; }
    if (!person.title.trim()) { toast.error("Enter a title for this key person"); return; }
    setSavingKey(person.client_key);
    if (demo) {
      setPeople((previous) => previous.map((item) => item.client_key === person.client_key ? {
        ...person,
        operator_profile_id: person.operator_profile_id ?? `demo-operator-${person.client_key}`,
        founder_profile_id: person.profile_type === "founder" ? person.founder_profile_id ?? `demo-founder-${person.client_key}` : null,
      } : item));
      toast.success("Key person saved in the test console");
      setSavingKey(null);
      return;
    }
    const { row, error } = await saveCompanyKeyPerson(startupId, person);
    setSavingKey(null);
    if (error || !row) { toast.error(`Key person save failed: ${error ?? "no data"}`); return; }
    setPeople((previous) => previous.map((item) => item.client_key === person.client_key ? { ...row, client_key: item.client_key } : item));
    toast.success(row.profile_type === "founder" ? "Founder and operator profiles linked" : "Operator profile linked");
  };

  const remove = async (person: CompanyKeyPerson) => {
    if (person.operator_profile_id || person.founder_profile_id) {
      setSavingKey(person.client_key);
      const { error } = await removeCompanyKeyPerson(startupId, person);
      setSavingKey(null);
      if (error) { toast.error(`Could not unlink key person: ${error}`); return; }
    }
    setPeople((previous) => previous.filter((item) => item.client_key !== person.client_key));
    toast.success("Key person unlinked from this company");
  };

  const openProfile = async (person: CompanyKeyPerson) => {
    const founderId = person.profile_type === "founder" ? person.founder_profile_id : null;
    const type = founderId ? "founder" : "operator";
    const id = founderId ?? person.operator_profile_id;
    if (!id || id.startsWith("demo-")) return;
    setOpeningProfileKey(person.client_key);
    const result = await fetchRecordById<FounderRow | OperatorRow>(type === "founder" ? "founders" : "operators", id);
    setOpeningProfileKey(null);
    if (result.error || !result.row) {
      toast.error(`Could not open ${type} record: ${result.error ?? "no data"}`);
      return;
    }
    if (type === "founder") {
      setActiveProfile({ type, clientKey: person.client_key, row: result.row as FounderRow });
    } else {
      setActiveProfile({ type, clientKey: person.client_key, row: result.row as OperatorRow });
    }
  };

  const syncProfileIntoKeyPerson = (clientKey: string, patch: Partial<CompanyKeyPerson>) => {
    update(clientKey, patch);
    setActiveProfile(null);
  };

  return (
    <>
      <Sect title="Key People" />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-lg text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.42)" }}>
          Founder entries create a founder record linked to an operator profile. Other titles create an operator profile.
        </p>
        <button type="button" onClick={() => setPeople((previous) => [...previous, newCompanyKeyPerson()])}
          className="shrink-0 rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-white/[0.06]"
          style={{ color: "#2EE6A6", border: "1px solid rgba(46,230,166,0.2)" }}>
          + Add key person
        </button>
      </div>
      {loading && <p className="py-3 text-[11px]" style={{ color: "rgba(255,255,255,0.42)" }}>Loading key people…</p>}
      {loadError && <p role="alert" className="py-2 text-[11px]" style={{ color: "#f87171" }}>Could not load key people: {loadError}</p>}
      {!loading && !people.length && !loadError && <p className="py-2 text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>No key people added yet.</p>}
      <div className="space-y-3">
        {people.map((person, index) => (
          <div key={person.client_key} className="space-y-3 rounded-lg p-3" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.018)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.72)" }}>Person {index + 1}</p>
              <div className="flex items-center gap-1.5">
                {(["founder", "operator"] as const).map((profileType) => (
                  <button key={profileType} type="button" aria-pressed={person.profile_type === profileType}
                    onClick={() => update(person.client_key, { profile_type: profileType })}
                    className="rounded px-2 py-1 text-[10px] capitalize transition-colors"
                    style={{ color: person.profile_type === profileType ? "#2EE6A6" : "rgba(255,255,255,0.45)", border: `1px solid ${person.profile_type === profileType ? "rgba(46,230,166,0.28)" : "rgba(255,255,255,0.08)"}` }}>
                    {profileType} profile
                  </button>
                ))}
                <button type="button" aria-label={`Remove ${person.full_name || "key person"}`} disabled={savingKey === person.client_key}
                  onClick={() => { void remove(person); }} className="rounded p-1.5 hover:bg-white/[0.06] disabled:opacity-40"
                  style={{ color: "rgba(255,255,255,0.45)" }}><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TF label="Name" value={person.full_name} onChange={(full_name) => update(person.client_key, { full_name })} />
              <TF label="Title" value={person.title} onChange={(title) => update(person.client_key, {
                title,
                ...(title.toLowerCase().includes("founder") ? { profile_type: "founder" as const } : {}),
              })} placeholder="Founder & CEO" list={`key-person-title-${person.client_key}`} />
              <datalist id={`key-person-title-${person.client_key}`}>
                {KEY_PERSON_TITLE_SUGGESTIONS.map((title) => <option key={title} value={title} />)}
              </datalist>
              <TF label="Email" value={person.email} onChange={(email) => update(person.client_key, { email })} type="email" />
              <TF label="Photo URL" value={person.avatar_url} onChange={(avatar_url) => update(person.client_key, { avatar_url })} type="url" placeholder="https://…" />
            </div>
            <TA label="Bio" value={person.bio} onChange={(bio) => update(person.client_key, { bio })} rows={3} />
            <div className="flex flex-wrap justify-end gap-2">
              {(person.operator_profile_id || person.founder_profile_id) && !String(person.operator_profile_id ?? "").startsWith("demo-") && (
                <button type="button" disabled={openingProfileKey === person.client_key}
                  onClick={() => { void openProfile(person); }}
                  className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-medium disabled:opacity-50"
                  style={{ color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <ExternalLink className="h-3 w-3" />
                  {openingProfileKey === person.client_key ? "Opening…" : `View full ${person.profile_type} record`}
                </button>
              )}
              <button type="button" disabled={savingKey === person.client_key} onClick={() => { void save(person); }}
                className="rounded px-3 py-1.5 text-[11px] font-medium disabled:opacity-50"
                style={{ color: "#050505", background: "#2EE6A6" }}>
                {savingKey === person.client_key ? "Saving…" : "Save person"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {activeProfile?.type === "founder" && (
        <FounderEditPanel
          row={activeProfile.row}
          zIndex={60}
          onClose={() => setActiveProfile(null)}
          onSaved={(row) => {
            if (row.deleted_at) {
              setPeople((previous) => previous.filter((person) => person.client_key !== activeProfile.clientKey));
              setActiveProfile(null);
              return;
            }
            syncProfileIntoKeyPerson(activeProfile.clientKey, {
              founder_profile_id: row.id,
              full_name: row.full_name,
              title: row.role ?? "",
              email: row.email ?? "",
              bio: row.bio ?? "",
              avatar_url: row.avatar_url ?? "",
              profile_type: "founder",
            });
          }}
        />
      )}
      {activeProfile?.type === "operator" && (
        <OperatorEditPanel
          row={activeProfile.row}
          zIndex={60}
          onClose={() => setActiveProfile(null)}
          onSaved={(row) => {
            if (row.deleted_at) {
              setPeople((previous) => previous.filter((person) => person.client_key !== activeProfile.clientKey));
              setActiveProfile(null);
              return;
            }
            syncProfileIntoKeyPerson(activeProfile.clientKey, {
              operator_profile_id: row.id,
              full_name: row.full_name,
              title: row.title ?? "",
              email: row.email ?? "",
              bio: row.bio ?? "",
              avatar_url: row.avatar_url ?? "",
              profile_type: "operator",
            });
          }}
        />
      )}
    </>
  );
}

export function AdminStartupEditor({
  startupId,
  onClose,
  onSaved,
  sampleRow = null,
}: {
  startupId: string;
  onClose: () => void;
  onSaved: (row: CompanyRow) => void;
  sampleRow?: CompanyRow | null;
}) {
  const [row, setRow] = useState<CompanyRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sampleRow?.id === startupId) {
      setRow(sampleRow);
      setError(null);
      return;
    }
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
  }, [sampleRow, startupId]);

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

type ProfileAssociationType = "firm" | "investor" | "founder" | "operator" | "company" | "corporation";
type ProfileAssociation = { type: ProfileAssociationType; id: string; label: string; subtitle: string | null };
type ProfileAssociationSearchRow = {
  id: string;
  firm_name?: string | null;
  company_name?: string | null;
  full_name?: string | null;
  role?: string | null;
  title?: string | null;
};

const PROFILE_ASSOCIATION_TYPES: Array<{ value: ProfileAssociationType; label: string; entity?: string }> = [
  { value: "firm", label: "Firm", entity: "firms" },
  { value: "investor", label: "Investor", entity: "firm-people" },
  { value: "founder", label: "Founder", entity: "founders" },
  { value: "operator", label: "Operator", entity: "operators" },
  { value: "company", label: "Company", entity: "companies" },
  { value: "corporation", label: "Corporation" },
];

function normalizeCorporationAssociationLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 240);
}

function corporationAssociationKey(value: string): string {
  return normalizeCorporationAssociationLabel(value).toLowerCase().normalize("NFKC");
}

function profileAssociationKey(item: Pick<ProfileAssociation, "type" | "id">): string {
  return `${item.type}:${item.id}`;
}

async function requestProfileAssociations(
  profileType: "founder" | "operator",
  profileId: string,
): Promise<{ rows?: ProfileAssociation[]; error?: string }> {
  if (!SUPABASE_URL) return { error: "SUPABASE_URL not set" };
  try {
    const params = new URLSearchParams({ entity: "profile-associations", profile_type: profileType, profile_id: profileId });
    const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${params}`, {
      headers: await adminHeaders(),
    });
    const json = await response.json().catch(() => ({})) as { rows?: ProfileAssociation[]; error?: string; message?: string };
    if (!response.ok) return { error: json.error ?? json.message ?? `HTTP ${response.status}` };
    return { rows: json.rows ?? [] };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function profileAssociationOption(type: ProfileAssociationType, row: ProfileAssociationSearchRow): ProfileAssociation | null {
  const label = type === "firm" ? row.firm_name : type === "company" ? row.company_name : row.full_name;
  if (!label?.trim()) return null;
  return { type, id: row.id, label: label.trim(), subtitle: row.role ?? row.title ?? null };
}

function AssociationsEditor({
  profileType,
  profileId,
  disabled = false,
}: {
  profileType: "founder" | "operator";
  profileId: string;
  disabled?: boolean;
}) {
  const [type, setType] = useState<ProfileAssociationType>("firm");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProfileAssociation[]>([]);
  const [associations, setAssociations] = useState<ProfileAssociation[]>([]);
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void requestProfileAssociations(profileType, profileId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.error) { setError(result.error); return; }
      const rows = result.rows ?? [];
      setAssociations(rows);
      setSavedKeys(rows.map(profileAssociationKey).sort());
    });
    return () => { cancelled = true; };
  }, [disabled, profileId, profileType]);

  useEffect(() => {
    const selectedType = PROFILE_ASSOCIATION_TYPES.find((option) => option.value === type);
    const needle = query.trim();
    if (disabled || type === "corporation" || !selectedType?.entity || needle.length < 2) { setHits([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void fetchRows<ProfileAssociationSearchRow>(selectedType.entity, { page: 0, search: needle, limit: 8 }).then((result) => {
        if (cancelled) return;
        setSearching(false);
        if (result.error) { setHits([]); setError(result.error); return; }
        const currentKey = `${profileType}:${profileId}`;
        const selected = new Set(associations.map(profileAssociationKey));
        setHits(result.rows.flatMap((row) => {
          const option = profileAssociationOption(type, row);
          if (!option || `${type}:${option.id}` === currentKey || selected.has(profileAssociationKey(option))) return [];
          return [option];
        }));
      });
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [associations, disabled, profileId, profileType, query, type]);

  const addAssociationValue = async () => {
    const label = normalizeCorporationAssociationLabel(query);
    if (label.length < 2) return;
    if (type === "corporation") {
      const association: ProfileAssociation = {
        type,
        id: corporationAssociationKey(label),
        label,
        subtitle: null,
      };
      if (associations.some((item) => profileAssociationKey(item) === profileAssociationKey(association))) return;
      setAssociations((previous) => [...previous, association]);
      setQuery("");
      setHits([]);
      return;
    }
    if (!SUPABASE_URL) { setError("SUPABASE_URL not set"); return; }
    setCreating(true);
    setError(null);
    try {
      const params = new URLSearchParams({ entity: "profile-associations" });
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${params}`, {
        method: "POST",
        headers: { ...(await adminHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_target",
          profile_type: profileType,
          profile_id: profileId,
          target_type: type,
          label,
          context_company_id: associations.find((item) => item.type === "company")?.id ?? null,
        }),
      });
      const json = await response.json().catch(() => ({})) as { association?: ProfileAssociation; error?: string; message?: string };
      if (!response.ok || !json.association) throw new Error(json.error ?? json.message ?? `HTTP ${response.status}`);
      const association = json.association;
      setAssociations((previous) => previous.some((item) => profileAssociationKey(item) === profileAssociationKey(association))
        ? previous
        : [...previous, association]);
      setSavedKeys((previous) => [...new Set([...previous, profileAssociationKey(association)])].sort());
      setQuery("");
      setHits([]);
      toast.success(`${association.label} draft created and associated`);
    } catch (createError: unknown) {
      const message = createError instanceof Error ? createError.message : String(createError);
      setError(message);
      toast.error(`Draft could not be created: ${message}`);
    } finally {
      setCreating(false);
    }
  };

  const dirty = associations.map(profileAssociationKey).sort().join("|") !== savedKeys.join("|");
  const save = async () => {
    if (!SUPABASE_URL) { setError("SUPABASE_URL not set"); return; }
    setSaving(true);
    setError(null);
    try {
      const params = new URLSearchParams({ entity: "profile-associations" });
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${params}`, {
        method: "POST",
        headers: { ...(await adminHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_type: profileType,
          profile_id: profileId,
          associations: associations.map(({ type: associationType, id }) => ({ type: associationType, id })),
        }),
      });
      const json = await response.json().catch(() => ({})) as { rows?: ProfileAssociation[]; error?: string; message?: string };
      if (!response.ok) throw new Error(json.error ?? json.message ?? `HTTP ${response.status}`);
      const rows = json.rows ?? [];
      setAssociations(rows);
      setSavedKeys(rows.map(profileAssociationKey).sort());
      toast.success("Associations saved");
    } catch (saveError: unknown) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
      toast.error(`Associations could not be saved: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sect title="Associations" />
      {disabled ? (
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Associations are unavailable for sample records.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.42)" }}>Connect this profile to other records in Vekta. New records start in Needs Review; corporation values are tracked here without a separate profile.</p>
          <div className="flex gap-2">
            <select value={type} onChange={(event) => { setType(event.target.value as ProfileAssociationType); setQuery(""); setHits([]); }}
              className="h-9 rounded-md border px-2 text-xs" style={{ background: "#171717", borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.82)" }}>
              {PROFILE_ASSOCIATION_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <div className="relative min-w-0 flex-1">
              <Input value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder={type === "corporation" ? "Add a corporation name" : `Search ${type === "company" ? "companies" : `${type}s`}…`}
                className="h-9 text-xs" style={{ background: "#171717", borderColor: "rgba(255,255,255,0.12)" }} />
              {(searching || hits.length > 0 || (query.trim().length >= 2 && !associations.some((item) => profileAssociationKey(item) === `${type}:${type === "corporation" ? corporationAssociationKey(query) : ""}`))) && (
                <div className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-48 overflow-y-auto rounded-md border shadow-xl"
                  style={{ background: "#111", borderColor: "rgba(255,255,255,0.12)" }}>
                  {searching && <div className="px-3 py-2 text-xs" style={{ color: "rgba(255,255,255,0.42)" }}>Searching…</div>}
                  {hits.map((hit) => (
                    <button key={profileAssociationKey(hit)} type="button"
                      onClick={() => { setAssociations((previous) => [...previous, hit]); setQuery(""); setHits([]); }}
                      className="block w-full px-3 py-2 text-left hover:bg-white/[0.05]">
                      <span className="block truncate text-xs" style={{ color: "rgba(255,255,255,0.86)" }}>{hit.label}</span>
                      <span className="block truncate text-[10px]" style={{ color: "rgba(255,255,255,0.38)" }}>
                        {PROFILE_ASSOCIATION_TYPES.find((option) => option.value === hit.type)?.label}{hit.subtitle ? ` · ${hit.subtitle}` : ""}
                      </span>
                    </button>
                  ))}
                  {!searching && hits.length === 0 && type !== "corporation" && <div className="px-3 py-2 text-xs" style={{ color: "rgba(255,255,255,0.42)" }}>No matching records</div>}
                  {!searching && query.trim().length >= 2 && (
                    <button type="button" disabled={creating} onClick={() => void addAssociationValue()}
                      className="block w-full border-t px-3 py-2 text-left hover:bg-white/[0.05] disabled:opacity-50"
                      style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                      <span className="block truncate text-xs" style={{ color: "#2EE6A6" }}>
                        {creating ? "Creating draft…" : type === "corporation" ? `Add corporation “${normalizeCorporationAssociationLabel(query)}”` : `Create draft ${type} “${normalizeCorporationAssociationLabel(query)}”`}
                      </span>
                      <span className="block text-[10px]" style={{ color: "rgba(255,255,255,0.38)" }}>
                        {type === "corporation" ? "Tracked as an association value only" : "Starts as Needs Review for later editing or enrichment"}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {loading ? (
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.38)" }}>Loading associations…</p>
          ) : associations.length ? (
            <div className="flex flex-wrap gap-1.5">
              {associations.map((association) => (
                <span key={profileAssociationKey(association)} className="inline-flex max-w-full items-center gap-1 rounded border px-2 py-1 text-[11px]"
                  style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.72)" }}>
                  <span className="shrink-0" style={{ color: "rgba(46,230,166,0.75)" }}>{PROFILE_ASSOCIATION_TYPES.find((option) => option.value === association.type)?.label}</span>
                  <span className="truncate">{association.label}{association.subtitle ? ` · ${association.subtitle}` : ""}</span>
                  <button type="button" aria-label={`Remove association to ${association.label}`}
                    onClick={() => setAssociations((previous) => previous.filter((item) => profileAssociationKey(item) !== profileAssociationKey(association)))}
                    className="ml-1 text-sm leading-none" style={{ color: "rgba(255,255,255,0.5)" }}>×</button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.38)" }}>No associations yet.</p>
          )}
          {error && <p role="alert" className="text-[11px]" style={{ color: "#f87171" }}>{error}</p>}
          <button type="button" disabled={!dirty || saving || loading} onClick={() => void save()}
            className="rounded-md border px-3 py-1.5 text-[11px] disabled:opacity-40"
            style={{ borderColor: "rgba(46,230,166,0.34)", color: "#2ee6a6" }}>
            {saving ? "Saving associations…" : "Save associations"}
          </button>
        </div>
      )}
    </>
  );
}

function FounderEditPanel({ row, onClose, onSaved, zIndex = 50 }: {
  row: FounderRow; onClose: () => void; onSaved: (u: FounderRow) => void; zIndex?: number;
}) {
  const [d, setD] = useState<FounderRow>({
    ...row,
    founder_archetype: normalizeFounderArchetype(row.founder_archetype),
    founder_archetypes: normalizeFounderArchetypes(row.founder_archetypes, row.founder_archetype),
    company_profile_ids: normalizeCompanyProfileIds(row.company_profile_ids, row.startup_id),
    employment_history: normalizeEmploymentHistory(row.employment_history),
    city: row.city ?? row.location ?? null,
    state: row.state ?? row.operator_state ?? null,
    country: row.country ?? row.operator_country ?? null,
    education: row.education ?? [],
    prior_companies: row.prior_companies ?? [],
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof FounderRow>(k: K, v: FounderRow[K]) => setD(p => ({ ...p, [k]: v }));
  const setLifecycleStatus = (status: RecordLifecycleStatus) => setD(previous => ({
    ...previous,
    record_status: status === "deleted" ? normalizeRecordStatus(previous.record_status) : status,
    deleted_at: status === "deleted" ? previous.deleted_at ?? new Date().toISOString() : null,
  }));

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${row.full_name}? It will be removed from the active catalog.`)) return;
    setSaving(true);
    const deletedAt = new Date().toISOString();
    if (isTestAdminSampleId(row.id)) {
      onSaved({ ...d, deleted_at: deletedAt, updated_at: deletedAt });
      setSaving(false);
      toast.success("Founder deleted from the test console");
      return;
    }
    if (row.source === "operator_profiles") {
      const { row: updated, error } = await patchRow<OperatorRow>("operators", row.id, { deleted_at: deletedAt });
      setSaving(false);
      if (error || !updated) { toast.error(`Delete failed: ${error ?? "no data"}`); return; }
      toast.success("Founder record deleted");
      onSaved(operatorProfileToFounder(updated));
      return;
    }
    const { row: updated, error } = await patchRow<FounderRow>("founders", row.id, { deleted_at: deletedAt });
    setSaving(false);
    if (error || !updated) { toast.error(`Delete failed: ${error ?? "no data"}`); return; }
    toast.success("Founder deleted");
    onSaved(updated);
  };

  useEffect(() => {
    if (isTestAdminSampleId(row.id) || row.source === "operator_profiles") return;
    let active = true;
    void fetchRecordById<FounderRow>("founders", row.id).then(({ row: fullRow }) => {
      if (!active || !fullRow) return;
      setD((previous) => ({
        ...previous,
        education: fullRow.education ?? previous.education ?? [],
        prior_companies: fullRow.prior_companies ?? previous.prior_companies ?? [],
        founder_archetypes: normalizeFounderArchetypes(fullRow.founder_archetypes, fullRow.founder_archetype),
        employment_history: normalizeEmploymentHistory(fullRow.employment_history ?? previous.employment_history),
        city: fullRow.city ?? previous.city ?? fullRow.location ?? null,
        state: fullRow.state ?? previous.state ?? null,
        country: fullRow.country ?? previous.country ?? null,
        record_status: fullRow.record_status ?? previous.record_status ?? "live",
        deleted_at: fullRow.deleted_at ?? previous.deleted_at ?? null,
      }));
    });
    return () => { active = false; };
  }, [row.id, row.source]);

  const handleSave = async () => {
    setSaving(true);
    if (isTestAdminSampleId(row.id)) {
      toast.success("Founder saved in the test console");
      onSaved({ ...d, updated_at: new Date().toISOString() });
      setSaving(false);
      return;
    }
    if (row.source === "operator_profiles") {
      const employmentHistory = normalizeEmploymentHistory(d.employment_history);
      const currentEmployment = employmentHistory.find((entry) => entry.is_current);
      const patch: Record<string, unknown> = {
        full_name: d.full_name,
        title: currentEmployment?.title.trim() || d.role,
        linkedin_url: d.linkedin_url,
        x_url: d.x_url,
        website_url: d.website_url,
        email: d.email,
        avatar_url: d.avatar_url,
        record_status: normalizeRecordStatus(d.record_status),
        deleted_at: d.deleted_at ?? null,
        expertise: d.domain_expertise,
        education: d.education ?? [],
        prior_companies: d.prior_companies ?? [],
        startup_id: normalizeCompanyProfileIds(d.company_profile_ids, d.startup_id)[0] ?? null,
        company_profile_ids: normalizeCompanyProfileIds(d.company_profile_ids, d.startup_id),
        founder_archetypes: normalizeFounderArchetypes(d.founder_archetypes, d.founder_archetype).map(founderArchetypeCode),
        employment_history: employmentHistory,
        is_currently_at_startup: null,
        current_employer_name: currentEmployment?.employer_name.trim() || null,
        current_employer_type: currentEmployment?.employer_type ?? null,
        current_employer_title: currentEmployment?.title.trim() || null,
        city: d.city ?? null,
        state: d.state ?? null,
        country: d.country ?? null,
      };
      const { row: saved, error } = await patchRow<OperatorRow>("operators", row.id, patch);
      setSaving(false);
      if (error || !saved) { toast.error(`Save failed: ${error ?? "no data"}`); return; }
      toast.success("Founder saved");
      onSaved(operatorProfileToFounder(saved));
      return;
    }
    const { id, created_at, updated_at, source, operator_city, operator_state, operator_country, ...patch } = d;
    patch.record_status = normalizeRecordStatus(d.record_status);
    patch.location = formatCanonicalHqLine(d.city, d.state, d.country);
    patch.education_highlight = d.education?.join(", ") || null;
    const employmentHistory = normalizeEmploymentHistory(d.employment_history);
    const currentEmployment = employmentHistory.find((entry) => entry.is_current);
    const companyProfileIds = normalizeCompanyProfileIds(d.company_profile_ids, d.startup_id);
    if (!companyProfileIds.length) {
      setSaving(false);
      toast.error("Link at least one company profile to this founder.");
      return;
    }
    patch.startup_id = companyProfileIds[0] ?? d.startup_id;
    patch.company_profile_ids = companyProfileIds;
    const founderArchetypes = normalizeFounderArchetypes(d.founder_archetypes, d.founder_archetype);
    patch.founder_archetypes = founderArchetypes.map(founderArchetypeCode);
    const legacyArchetype = founderArchetypes.find((archetype) => !["Product", "Academic"].includes(archetype));
    patch.founder_archetype = legacyArchetype ? founderArchetypeCode(legacyArchetype) : null;
    if (currentEmployment?.title.trim()) patch.role = currentEmployment.title.trim();
    patch.employment_history = employmentHistory;
    patch.is_currently_at_startup = null;
    patch.current_employer_name = currentEmployment?.employer_name.trim() || null;
    patch.current_employer_type = currentEmployment?.employer_type ?? null;
    patch.current_employer_title = currentEmployment?.title.trim() || null;
    const { row: u, error } = await patchRow<FounderRow>("founders", row.id, patch);
    setSaving(false);
    if (error || !u) { toast.error(`Save failed: ${error ?? "no data"}`); return; }
    toast.success("Founder saved");
    onSaved(u);
  };

  return (
    <PanelShell title="Edit Founder" subtitle={row.full_name} saving={saving} onClose={onClose} onSave={handleSave} onDelete={handleDelete} zIndex={zIndex}
      recordStatus={toLifecycleStatus(d)} onRecordStatusChange={setLifecycleStatus}>
      <Sect title="Identity" />
      <TF label="Full Name"    value={d.full_name} onChange={v => set("full_name", v)} />
      <CompanyHqFields
        city={d.city ?? d.location}
        state={d.state ?? d.operator_state ?? null}
        country={d.country ?? d.operator_country ?? null}
        onChange={(patch) => setD((previous) => ({
          ...previous,
          ...(patch.hq_city !== undefined ? { city: patch.hq_city } : {}),
          ...(patch.hq_state !== undefined ? { state: patch.hq_state } : {}),
          ...(patch.hq_country !== undefined ? { country: patch.hq_country } : {}),
        }))}
      />
      <TF label="Headshot URL" value={d.avatar_url} onChange={v => set("avatar_url", v)} placeholder="Direct image URL from LinkedIn/company site/X" />
      <TA label="Bio" value={d.bio ?? ""} onChange={v => set("bio", v)} rows={4} />
      <Sect title="Employment" />
      <EmploymentHistoryEditor value={d.employment_history} onChange={(value) => set("employment_history", value)} />
      <CompanyProfilesField startupIds={normalizeCompanyProfileIds(d.company_profile_ids, d.startup_id)} required={row.source !== "operator_profiles"}
        onChange={(ids) => setD((previous) => ({
          ...previous,
          company_profile_ids: ids,
          startup_id: ids[0] ?? (row.source === "operator_profiles" ? null : previous.startup_id),
        }))} />

      <Sect title="Contact" />
      <TF label="LinkedIn URL" value={d.linkedin_url} onChange={v => set("linkedin_url", v)} />
      <TF label="X URL"        value={d.x_url}        onChange={v => set("x_url", v)} />
      <TF label="Website URL"  value={d.website_url}  onChange={v => set("website_url", v)} placeholder="https://…" />
      <TF label="Email"        value={d.email}        onChange={v => set("email", v)} type="email" />

      <AssociationsEditor profileType={row.source === "operator_profiles" ? "operator" : "founder"}
        profileId={row.id} disabled={isTestAdminSampleId(row.id)} />

      <Sect title="Founder Profile" />
      <AffinityMultiSelect label="Archetype" value={normalizeFounderArchetypes(d.founder_archetypes, d.founder_archetype)} options={FOUNDER_ARCHETYPES}
        placeholder="Search archetypes" addLabel={(value) => `Add archetype: ${value}`} allowCustom={false}
        onChange={(value) => set("founder_archetypes", value)} />
      <BF   label="Repeat Founder"     value={d.is_repeat_founder}  onChange={v => set("is_repeat_founder", v)} />
      <BF   label="Prior Exit"         value={d.has_prior_exit}     onChange={v => set("has_prior_exit", v)} />
      <BF   label="Operator → Founder" value={d.operator_to_founder} onChange={v => set("operator_to_founder", v)} />
      <AffinityMultiSelect label="Domain Expertise" value={d.domain_expertise} options={DOMAIN_EXPERTISE_SUGGESTIONS}
        placeholder="Search expertise areas" addLabel={(value) => `Add expertise: ${value}`}
        onAddCustom={rememberDomainExpertiseSuggestion}
        onChange={(value) => set("domain_expertise", value)} />
      <AffinityFields
        education={d.education}
        priorCompanies={d.prior_companies}
        onEducationChange={(value) => set("education", value)}
        onPriorCompaniesChange={(value) => set("prior_companies", value)}
      />

    </PanelShell>
  );
}

// ── Operator Edit Panel ────────────────────────────────────────────────────────

function OperatorEditPanel({ row, onClose, onSaved, zIndex = 50 }: {
  row: OperatorRow; onClose: () => void; onSaved: (u: OperatorRow) => void; zIndex?: number;
}) {
  const [d, setD] = useState<OperatorRow>({
    ...row,
    company_profile_ids: normalizeCompanyProfileIds(row.company_profile_ids, row.startup_id),
    stage_focuses: row.stage_focuses ?? asTagList(row.stage_focus),
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof OperatorRow>(k: K, v: OperatorRow[K]) => setD(p => ({ ...p, [k]: v }));
  const setLifecycleStatus = (status: RecordLifecycleStatus) => setD(previous => ({
    ...previous,
    record_status: status === "deleted" ? normalizeRecordStatus(previous.record_status) : status,
    deleted_at: status === "deleted" ? previous.deleted_at ?? new Date().toISOString() : null,
  }));

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${row.full_name}? It will be removed from the active catalog.`)) return;
    setSaving(true);
    const deletedAt = new Date().toISOString();
    if (isTestAdminSampleId(row.id)) {
      onSaved({ ...d, deleted_at: deletedAt, updated_at: deletedAt });
      setSaving(false);
      toast.success("Operator deleted from the test console");
      return;
    }
    const { row: updated, error } = await patchRow<OperatorRow>("operators", row.id, { deleted_at: deletedAt });
    setSaving(false);
    if (error || !updated) { toast.error(`Delete failed: ${error ?? "no data"}`); return; }
    toast.success("Operator deleted");
    onSaved(updated);
  };

  useEffect(() => {
    if (isTestAdminSampleId(row.id)) return;
    let active = true;
    void fetchRecordById<OperatorRow>("operators", row.id).then(({ row: fullRow }) => {
      if (!active || !fullRow) return;
      setD((previous) => ({
        ...previous,
        ...fullRow,
        company_profile_ids: normalizeCompanyProfileIds(fullRow.company_profile_ids, fullRow.startup_id),
        stage_focuses: fullRow.stage_focuses ?? previous.stage_focuses ?? asTagList(fullRow.stage_focus),
        education: fullRow.education ?? previous.education ?? [],
        prior_companies: fullRow.prior_companies ?? previous.prior_companies ?? [],
      }));
    });
    return () => { active = false; };
  }, [row.id]);

  const handleSave = async () => {
    setSaving(true);
    if (isTestAdminSampleId(row.id)) {
      toast.success("Operator saved in the test console");
      onSaved({ ...d, updated_at: new Date().toISOString() });
      setSaving(false);
      return;
    }
    const { id, created_at, updated_at, ...patch } = d;
    patch.record_status = normalizeRecordStatus(d.record_status);
    patch.stage_focuses = d.stage_focuses ?? asTagList(d.stage_focus);
    patch.stage_focus = patch.stage_focuses[0] ?? null;
    patch.education = d.education ?? [];
    patch.prior_companies = d.prior_companies ?? [];
    patch.company_profile_ids = normalizeCompanyProfileIds(d.company_profile_ids, d.startup_id);
    patch.startup_id = patch.company_profile_ids[0] ?? null;
    const { row: u, error } = await patchRow<OperatorRow>("operators", row.id, patch);
    setSaving(false);
    if (error || !u) { toast.error(`Save failed: ${error ?? "no data"}`); return; }
    toast.success("Operator saved");
    onSaved(u);
  };

  return (
    <PanelShell title="Edit Operator" subtitle={row.full_name} saving={saving} onClose={onClose} onSave={handleSave} onDelete={handleDelete} zIndex={zIndex}
      recordStatus={toLifecycleStatus(d)} onRecordStatusChange={setLifecycleStatus}>
      <Sect title="Identity" />
      <TF label="Full Name" value={d.full_name} onChange={v => set("full_name", v)} />
      <ProfileTitleField label="Role / Title" value={d.title} onChange={v => set("title", v)} />
      <CompanyProfilesField label="Company profiles" startupIds={normalizeCompanyProfileIds(d.company_profile_ids, d.startup_id)}
        onChange={(ids) => setD((previous) => ({ ...previous, company_profile_ids: ids, startup_id: ids[0] ?? null }))} />
      <TF label="Headshot URL" value={d.avatar_url} onChange={v => set("avatar_url", v)} placeholder="Direct image URL from LinkedIn/company site/X" />
      <TA label="Bio" value={d.bio ?? ""} onChange={v => set("bio", v)} rows={4} />
      <Sect title="Location" />
      <CompanyHqFields
        city={d.city}
        state={d.state}
        country={d.country}
        onChange={(patch) => setD((previous) => ({
          ...previous,
          ...(patch.hq_city !== undefined ? { city: patch.hq_city } : {}),
          ...(patch.hq_state !== undefined ? { state: patch.hq_state } : {}),
          ...(patch.hq_country !== undefined ? { country: patch.hq_country } : {}),
        }))}
      />

      <Sect title="Contact" />
      <TF label="LinkedIn URL" value={d.linkedin_url} onChange={v => set("linkedin_url", v)} />
      <TF label="X URL"        value={d.x_url}        onChange={v => set("x_url", v)} />
      <TF label="Website URL"  value={d.website_url}  onChange={v => set("website_url", v)} placeholder="https://…" />
      <TF label="Email"        value={d.email}        onChange={v => set("email", v)} type="email" />

      <AssociationsEditor profileType="operator" profileId={row.id} disabled={isTestAdminSampleId(row.id)} />

      <Sect title="Operator Profile" />
      <AffinityMultiSelect label="Stage Focus" value={d.stage_focuses ?? asTagList(d.stage_focus)} options={OPERATOR_STAGE_SUGGESTIONS}
        placeholder="Search stages" addLabel={(value) => `Add stage: ${value}`}
        disallowCustomValues={["Series B+"]}
        onAddCustom={(value) => rememberSuggestion(value, OPERATOR_STAGE_SUGGESTIONS, OPERATOR_STAGE_SUGGESTIONS_KEY)}
        onChange={(value) => set("stage_focuses", value)} />
      <AffinityMultiSelect label="Sector Focus" value={d.sector_focus} options={OPERATOR_SECTOR_SUGGESTIONS}
        placeholder="Search sectors" addLabel={(value) => `Add sector: ${value}`}
        onAddCustom={(value) => rememberSuggestion(value, OPERATOR_SECTOR_SUGGESTIONS, OPERATOR_SECTOR_SUGGESTIONS_KEY)}
        onChange={(value) => set("sector_focus", value)} />
      <AffinityMultiSelect label="Expertise" value={d.expertise} options={DOMAIN_EXPERTISE_SUGGESTIONS}
        placeholder="Search expertise areas" addLabel={(value) => `Add expertise: ${value}`}
        onAddCustom={rememberDomainExpertiseSuggestion}
        onChange={(value) => set("expertise", value)} />
      <BF   label="Is Available"    value={d.is_available}   onChange={v => set("is_available", v)} />

      <AffinityFields
        education={d.education}
        priorCompanies={d.prior_companies}
        onEducationChange={(value) => set("education", value)}
        onPriorCompaniesChange={(value) => set("prior_companies", value)}
      />

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
  const archetypes = normalizeFounderArchetypes(row.founder_archetypes);
  const legacyArchetype = archetypes.find((archetype) => !["Product", "Academic"].includes(archetype));
  return {
    id: row.id,
    full_name: row.full_name,
    role: row.title,
    city: row.city,
    state: row.state,
    country: row.country,
    startup_id: row.startup_id ?? null,
    employment_history: normalizeEmploymentHistory(row.employment_history),
    is_currently_at_startup: row.is_currently_at_startup ?? Boolean(row.startup_id),
    current_employer_name: row.current_employer_name ?? null,
    current_employer_type: row.current_employer_type ?? null,
    current_employer_title: row.current_employer_title ?? null,
    location: formatCanonicalHqLine(row.city, row.state, row.country),
    linkedin_url: row.linkedin_url,
    x_url: row.x_url,
    website_url: row.website_url,
    avatar_url: row.avatar_url,
    email: row.email,
    founder_archetype: legacyArchetype ? founderArchetypeCode(legacyArchetype) : null,
    founder_archetypes: archetypes,
    is_repeat_founder: false,
    has_prior_exit: false,
    operator_to_founder: false,
    domain_expertise: row.expertise,
    prior_companies: row.prior_companies,
    education: row.education,
    record_status: row.record_status ?? "live",
    deleted_at: row.deleted_at ?? null,
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
  demoCompanies = null,
}: {
  focusCompany?: { id: string; name: string } | null;
  demoCompanies?: CompanyRow[] | null;
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
  const [recordStatusFilter, setRecordStatusFilter] = useState("all");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<CompanyRow | null>(null);

  const load = useCallback(async () => {
    if (demoCompanies) {
      const needle = search.trim().toLowerCase();
      const matched = demoCompanies.filter((row) => {
        if (stage !== "all" && row.stage !== stage) return false;
        if (!matchesRecordStatusFilter(row, recordStatusFilter)) return false;
        if (!needle) return true;
        return row.company_name.toLowerCase().includes(needle) || (row.company_url ?? "").toLowerCase().includes(needle);
      });
      setRows(matched.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE));
      setTotal(matched.length);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    const { rows: r, total: t, error: e } = await fetchRows<CompanyRow>("companies", {
      page, search, filter: {
        stage,
        record_status: recordStatusFilter === "deleted" ? "" : recordStatusFilter,
        include_deleted: recordStatusFilter === "deleted" ? "true" : "",
        deleted_only: recordStatusFilter === "deleted" ? "true" : "",
      },
    });
    setLoading(false);
    if (e) { setError(e); return; }
    setRows(r); setTotal(t);
  }, [demoCompanies, page, search, stage, recordStatusFilter]);

  const loadMetrics = useCallback(async () => {
    if (demoCompanies) {
      setTotalCompanies(demoCompanies.length);
      setLiveCompanies(demoCompanies.filter((row) => isActiveCompanyStatus(row.status)).length);
      let completenessSum = 0;
      let maxUpdatedAt: string | null = null;
      for (const row of demoCompanies) {
        const hasHq = hasValue(row.location) || hasValue(row.hq_city) || hasValue(row.hq_state) || hasValue(row.hq_country);
        const scoreFields = [
          hasValue(row.company_url), hasValue(row.description_short), hasValue(row.description_long),
          hasValue(row.sector), hasValue(row.stage), hasValue(row.status), hasHq,
          row.total_raised_usd != null, row.headcount != null, hasValue(row.yc_batch),
          hasValue(row.linkedin_url), hasValue(row.x_url), row.founded_year != null,
        ];
        completenessSum += (scoreFields.filter(Boolean).length / scoreFields.length) * 100;
        if (row.updated_at && (!maxUpdatedAt || row.updated_at > maxUpdatedAt)) maxUpdatedAt = row.updated_at;
      }
      setAvgCompleteness(demoCompanies.length ? completenessSum / demoCompanies.length : 0);
      setLastUpdateAt(maxUpdatedAt);
      setMetricsLoading(false);
      return;
    }
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
  }, [demoCompanies]);

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
        <FilterSelect
          label="Record status"
          icon={CircleDot}
          value={recordStatusFilter}
          options={RECORD_STATUS_FILTER_OPTIONS}
          onValueChange={(value) => { setRecordStatusFilter(value); setPage(0); }}
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
              <div style={CELL}><Pill text={lifecycleStatusLabel(row)} color={lifecycleStatusColor(row)} /></div>
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
          onSaved={u => {
            if (u.deleted_at) { setRows(prev => prev.filter(r => r.id !== u.id)); setSelected(null); }
            else { setRows(prev => prev.map(r => r.id === u.id ? u : r)); setSelected(u); }
            void loadMetrics();
          }}
        />
      )}
    </div>
  );
}

// ── Founders Tab ───────────────────────────────────────────────────────────────

function FoundersTab({ demoFounders = null }: { demoFounders?: FounderRow[] | null }) {
  const COL = "2fr 1fr 1fr 1fr 1fr 1fr";
  const [rows, setRows]         = useState<FounderRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [totalFounders, setTotalFounders] = useState<number | null>(null);
  const [liveFounders, setLiveFounders] = useState<number | null>(null);
  const [avgCompleteness, setAvgCompleteness] = useState<number | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [page, setPage]         = useState(0);
  const [search, setSearch]     = useState("");
  const [recordStatusFilter, setRecordStatusFilter] = useState("all");
  const [showDeleted, setShowDeleted] = useState(false);
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
    if (demoFounders) {
      setReclassified([]);
      return;
    }
    const { rows: operatorRows, error: operatorErr } = await fetchAllRows<OperatorRow>("operators", {
      include_deleted: recordStatusFilter === "deleted" || (recordStatusFilter === "all" && showDeleted) ? "true" : "",
      record_status: recordStatusFilter === "all" || recordStatusFilter === "deleted" ? "" : recordStatusFilter,
      deleted_only: recordStatusFilter === "deleted" ? "true" : "",
    });
    if (operatorErr) {
      console.warn("[AdminMarketIntelligence] Founder-titled operators load failed:", operatorErr);
      return;
    }
    const withCompanies = await withOperatorStartupIds(operatorRows);
    setReclassified(
      withCompanies.filter((row) => titleContainsFounder(row.title)).map(operatorProfileToFounder),
    );
  }, [demoFounders, recordStatusFilter, showDeleted]);

  const totalRef = useRef(0);
  const loadedSearchRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (demoFounders) {
      const needle = search.trim().toLowerCase();
      const matched = demoFounders.filter((row) => (
        matchesRecordStatusFilter(row, recordStatusFilter, showDeleted)
        && (!needle
          || row.full_name.toLowerCase().includes(needle)
          || String(row.role ?? "").toLowerCase().includes(needle))
      ));
      totalRef.current = matched.length;
      loadedSearchRef.current = `${search}|${recordStatusFilter}|${showDeleted}`;
      setRows(matched.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE));
      setTotal(matched.length);
      setError(null);
      setLoading(false);
      setStartupReady(true);
      return;
    }
    const requestKey = `${search}|${recordStatusFilter}|${showDeleted}`;
    if (loadedSearchRef.current === requestKey && page > 0 && page * PAGE_SIZE >= totalRef.current) {
      setLoading(false);
      setError(null);
      setStartupReady(true);
      return;
    }
    setLoading(true); setError(null);
    const { rows: r, total: t, error: e } = await fetchRows<FounderRow>("founders", {
      page, search, filter: {
        include_deleted: recordStatusFilter === "deleted" || (recordStatusFilter === "all" && showDeleted) ? "true" : "",
        record_status: recordStatusFilter === "all" || recordStatusFilter === "deleted" ? "" : recordStatusFilter,
        deleted_only: recordStatusFilter === "deleted" ? "true" : "",
      },
    });
    setLoading(false);
    setStartupReady(true);
    if (e) { setError(e); return; }
    totalRef.current = t;
    loadedSearchRef.current = requestKey;
    setRows(r); setTotal(t);
  }, [demoFounders, page, search, recordStatusFilter, showDeleted]);

  const loadMetrics = useCallback(async () => {
    if (demoFounders) {
      let liveCount = 0;
      let completenessSum = 0;
      let maxUpdatedAt: string | null = null;
      let maxUpdatedMs = -Infinity;
      for (const row of demoFounders) {
        const live = !row.deleted_at && normalizeRecordStatus(row.record_status) === "live";
        if (live) liveCount += 1;
        const scoreFields = [
          hasValue(row.role), hasValue(row.location), hasValue(row.linkedin_url), hasValue(row.email),
          hasValue(row.founder_archetypes ?? row.founder_archetype), hasValue(row.domain_expertise), hasValue(row.prior_companies),
        ];
        completenessSum += (scoreFields.filter(Boolean).length / scoreFields.length) * 100;
        const updatedMs = parseIsoMs(row.updated_at);
        if (updatedMs != null && updatedMs > maxUpdatedMs) {
          maxUpdatedMs = updatedMs;
          maxUpdatedAt = row.updated_at;
        }
      }
      setStartupMetrics({
        total: demoFounders.length,
        live: liveCount,
        completenessSum,
        rowCount: demoFounders.length,
        lastUpdateAt: maxUpdatedAt,
        lastUpdateMs: maxUpdatedMs,
      });
      setMetricsLoading(false);
      return;
    }
    setMetricsLoading(true);
    try {
      const { rows: allRows, total: totalCount, error: metricsErr } = await fetchAllRows<FounderRow>("founders", {
        include_deleted: showDeleted ? "true" : "",
      });
      if (metricsErr) throw new Error(metricsErr);

      let liveCount = 0;
      let completenessSum = 0;
      let rowCount = 0;
      let maxUpdatedAt: string | null = null;
      let maxUpdatedMs = -Infinity;

      for (const row of allRows) {
        const live = !row.deleted_at && row.record_status === "live";
        if (live) liveCount += 1;

        const scoreFields = [
          hasValue(row.role),
          hasValue(row.location),
          hasValue(row.linkedin_url),
          hasValue(row.email),
          hasValue(row.founder_archetypes ?? row.founder_archetype),
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
  }, [demoFounders, showDeleted]);

  useEffect(() => {
    if (!startupMetrics) return;
    let liveCount = startupMetrics.live;
    let completenessSum = startupMetrics.completenessSum;
    let rowCount = startupMetrics.rowCount;
    let maxUpdatedAt = startupMetrics.lastUpdateAt;
    let maxUpdatedMs = startupMetrics.lastUpdateMs;

    for (const row of reclassified) {
      const live = !row.deleted_at && normalizeRecordStatus(row.record_status) === "live";
      if (live) liveCount += 1;

      const scoreFields = [
        hasValue(row.role),
        hasValue(row.location),
        hasValue(row.linkedin_url),
        hasValue(row.email),
        hasValue(row.founder_archetypes ?? row.founder_archetype),
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

      <AdminStickyFilters className="flex gap-3 flex-wrap">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input placeholder="Search founders…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 text-[12px] h-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
        </div>
        <FilterSelect
          label="Record status"
          icon={CircleDot}
          value={recordStatusFilter}
          options={RECORD_STATUS_FILTER_OPTIONS}
          onValueChange={(value) => { setRecordStatusFilter(value); setPage(0); }}
        />
        <button onClick={() => { void load(); void loadMetrics(); void loadReclassified(); }} className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-[11px]"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
        <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.48)" }}>
          <input type="checkbox" checked={showDeleted} onChange={event => { setShowDeleted(event.target.checked); setPage(0); }} />
          Show deleted
        </label>
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
          {["Name","Role","Location","Archetype","Flags","Record Status"].map(h => <div key={h} style={HDR}>{h}</div>)}
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
              <div style={CELL} className="flex flex-wrap gap-1">
                {normalizeFounderArchetypes(row.founder_archetypes, row.founder_archetype).length
                  ? normalizeFounderArchetypes(row.founder_archetypes, row.founder_archetype).map((archetype) => <Pill key={archetype} text={archetype} color="#a78bfa" />)
                  : "—"}
              </div>
              <div style={CELL} className="flex items-center gap-1.5 flex-wrap">
                {row.is_repeat_founder   && <Pill text="repeat" color="#f59e0b" />}
                {row.has_prior_exit      && <Pill text="exit"   color="#34d399" />}
                {row.operator_to_founder && <Pill text="op→f"   color="#60a5fa" />}
              </div>
              <div style={CELL}><Pill text={lifecycleStatusLabel(row)} color={lifecycleStatusColor(row)} /></div>
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
            if (u.deleted_at) {
              if (showDeleted) {
                if (u.source === "operator_profiles") setReclassified(prev => prev.map(r => r.id === u.id ? u : r));
                else setRows(prev => prev.map(r => r.id === u.id ? u : r));
                setSelected(u);
              } else {
                if (u.source === "operator_profiles") setReclassified(prev => prev.filter(r => r.id !== u.id));
                else setRows(prev => prev.filter(r => r.id !== u.id));
                setSelected(null);
              }
              void loadMetrics();
              return;
            }
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

function OperatorsTab({ demoOperators = null }: { demoOperators?: OperatorRow[] | null }) {
  const COL = "2fr 1fr 1fr 1fr 1fr 1fr";
  const [catalog, setCatalog]   = useState<OperatorRow[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [page, setPage]         = useState(0);
  const [search, setSearch]     = useState("");
  const [recordStatusFilter, setRecordStatusFilter] = useState("all");
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<OperatorRow | null>(null);

  const load = useCallback(async () => {
    if (demoOperators) {
      setCatalog(demoOperators);
      setError(null);
      setLoading(false);
      setMetricsLoading(false);
      return;
    }
    setLoading(true);
    setMetricsLoading(true);
    setError(null);
    const { rows: allRows, error: loadErr } = await fetchAllRows<OperatorRow>("operators", {
      include_deleted: recordStatusFilter === "deleted" || showDeleted ? "true" : "",
    });
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
  }, [demoOperators, recordStatusFilter, showDeleted]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((row) => (
      matchesRecordStatusFilter(row, recordStatusFilter, showDeleted)
      && (!q || row.full_name.toLowerCase().includes(q) || String(row.title ?? "").toLowerCase().includes(q))
    ));
  }, [catalog, search, recordStatusFilter, showDeleted]);

  const operatorMetrics = useMemo(() => {
    let live = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let maxUpdatedAt: string | null = null;
    let maxUpdatedMs = -Infinity;
    for (const row of catalog) {
      if (!row.deleted_at && normalizeRecordStatus(row.record_status) === "live" && row.ready_for_live === true) live += 1;
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

      <AdminStickyFilters className="flex gap-3 flex-wrap">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input placeholder="Search operators…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 text-[12px] h-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
        </div>
        <FilterSelect
          label="Record status"
          icon={CircleDot}
          value={recordStatusFilter}
          options={RECORD_STATUS_FILTER_OPTIONS}
          onValueChange={(value) => { setRecordStatusFilter(value); setPage(0); }}
        />
        <button onClick={() => { void load(); }} className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-[11px]"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
        <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.48)" }}>
          <input type="checkbox" checked={showDeleted} onChange={event => { setShowDeleted(event.target.checked); setPage(0); }} />
          Show deleted
        </label>
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
          {["Name","Title","Location","Expertise","Availability","Record Status"].map(h => <div key={h} style={HDR}>{h}</div>)}
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
              <div style={CELL}><Pill text={lifecycleStatusLabel(row)} color={lifecycleStatusColor(row)} /></div>
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
            if (u.deleted_at) {
              if (showDeleted) {
                setCatalog(prev => prev.map(r => r.id === u.id ? u : r));
                setSelected(u);
              } else {
                setCatalog(prev => prev.filter(r => r.id !== u.id));
                setSelected(null);
              }
              return;
            }
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

export type AdminMarketDemoCatalog = {
  companies: CompanyRow[];
  founders: FounderRow[];
  operators: OperatorRow[];
};

export function AdminMarketIntelligence({
  focusCompany = null,
  demoCatalog = null,
}: {
  focusCompany?: { id: string; name: string } | null;
  demoCatalog?: AdminMarketDemoCatalog | null;
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
        {tab === "companies" && <CompaniesTab focusCompany={focusCompany} demoCompanies={demoCatalog?.companies ?? null} />}
        {tab === "founders"  && <FoundersTab demoFounders={demoCatalog?.founders ?? null} />}
        {tab === "operators" && <OperatorsTab demoOperators={demoCatalog?.operators ?? null} />}
      </div>
    </div>
  );
}
