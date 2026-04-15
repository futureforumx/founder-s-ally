/**
 * Shared types and utilities for startup data scrapers.
 *
 * Uses @supabase/supabase-js for persistence (REST API — no DATABASE_URL needed).
 * Every scraper normalizes its output into `StartupIngestPayload` and calls
 * `upsertStartup()` for idempotent persistence. Deduplication keys:
 *   1. domain (canonical, no www)
 *   2. company_name (exact match, case-preserved)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Supabase client — initialized from env
// ---------------------------------------------------------------------------

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val) process.env[key] = val;
  }
}

export function initSupabase(): SupabaseClient {
  const root = process.cwd();
  loadEnvFile(join(root, ".env"));
  loadEnvFile(join(root, ".env.local"));

  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL (or VITE_SUPABASE_URL) and " +
        "SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) in .env"
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Source priority — higher number wins scalar conflicts
// ---------------------------------------------------------------------------

export const STARTUP_SOURCE_PRIORITY: Record<string, number> = {
  crunchbase: 100,
  tracxn: 95,
  cb_insights: 90,
  yc: 85,
  nextplay: 70,
  topstartups: 60,
  seedtable: 55,
  startups_gallery: 50,
  tinyteams: 45,
  manual: 30,
  other: 10,
};

// ---------------------------------------------------------------------------
// Ingest payload — every scraper outputs this shape
// ---------------------------------------------------------------------------

export type StartupIngestPayload = {
  company_name: string;
  data_source: string;
  company_url?: string | null;
  domain?: string | null;
  description_short?: string | null;
  description_long?: string | null;
  logo_url?: string | null;
  founding_date?: Date | null;
  founded_year?: number | null;
  hq_city?: string | null;
  hq_state?: string | null;
  hq_country?: string | null;
  geo_footprint?: string[];
  stage?: string | null;
  status?: string | null;
  sector?: string | null;
  sectors?: string[];
  secondary_sectors?: string[];
  business_model?: string | null;
  business_model_tags?: string[];
  headcount?: number | null;
  headcount_band?: string | null;
  headcount_growth_pct?: number | null;
  tech_stack?: string[];
  total_raised_usd?: number | null;
  last_round_size_usd?: number | null;
  last_round_date?: Date | null;
  last_round_type?: string | null;
  last_funding_date?: Date | null;
  valuation_usd?: number | null;
  revenue_range?: string | null;
  hiring_velocity?: number | null;
  investor_names?: string[];
  lead_investor_names?: string[];
  board_members?: string[];
  target_customer?: string | null;
  icp_description?: string | null;
  notable_customers?: string[];
  market_category?: string | null;
  market_subcategory?: string | null;
  linkedin_url?: string | null;
  x_url?: string | null;
  github_url?: string | null;
  crunchbase_url?: string | null;
  yc_batch?: string | null;
  yc_slug?: string | null;
  external_ids?: Record<string, string>;
  founders?: FounderIngestPayload[];
  funding_rounds?: FundingRoundIngestPayload[];
};

export type FounderIngestPayload = {
  full_name: string;
  role?: string | null;
  linkedin_url?: string | null;
  x_url?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  prior_companies?: string[];
  prior_exits?: string[];
  has_prior_exit?: boolean;
  education_highlight?: string | null;
  operator_background?: string | null;
  domain_expertise?: string[];
  is_repeat_founder?: boolean;
  founder_archetype?: string | null;
};

export type FundingRoundIngestPayload = {
  round_name: string;
  round_date?: Date | null;
  amount_usd?: number | null;
  valuation_usd?: number | null;
  lead_investors?: string[];
  participants?: string[];
  source_url?: string | null;
};

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

export function normalizeDomain(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  let s = url.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.split("/")[0]!.split("?")[0]!.split("#")[0]!;
  s = s.replace(/^www\./, "");
  return s || null;
}

export function normalizeCompanyName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function mapStage(raw: string | null | undefined): string {
  if (!raw) return "UNKNOWN";
  const s = raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const MAP: Record<string, string> = {
    PRE_SEED: "PRE_SEED", PRESEED: "PRE_SEED", SEED: "SEED",
    SERIES_A: "SERIES_A", A: "SERIES_A", SERIES_B: "SERIES_B", B: "SERIES_B",
    SERIES_C: "SERIES_C", C: "SERIES_C", GROWTH: "GROWTH", LATE: "GROWTH",
    PUBLIC: "PUBLIC", IPO: "PUBLIC", BOOTSTRAPPED: "BOOTSTRAPPED",
    ACQUIRED: "ACQUIRED", SHUTDOWN: "SHUTDOWN", SHUT_DOWN: "SHUTDOWN",
  };
  return MAP[s] ?? "UNKNOWN";
}

export function mapStatus(raw: string | null | undefined): string {
  if (!raw) return "ACTIVE";
  const s = raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const MAP: Record<string, string> = {
    ACTIVE: "ACTIVE", OPERATING: "ACTIVE", ACQUIRED: "ACQUIRED",
    SHUT_DOWN: "SHUT_DOWN", SHUTDOWN: "SHUT_DOWN", CLOSED: "SHUT_DOWN", DEAD: "SHUT_DOWN",
    IPO: "IPO", PUBLIC: "IPO",
  };
  return MAP[s] ?? "UNKNOWN";
}

export function mapSector(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_");
  const MAP: Record<string, string> = {
    FINTECH: "FINTECH", SAAS: "ENTERPRISE_SAAS", ENTERPRISE_SAAS: "ENTERPRISE_SAAS",
    ENTERPRISE: "ENTERPRISE_SAAS", AI: "AI", ARTIFICIAL_INTELLIGENCE: "AI",
    ML: "AI", MACHINE_LEARNING: "AI", HEALTHTECH: "HEALTHTECH", HEALTH: "HEALTHTECH",
    HEALTHCARE: "HEALTHTECH", BIOTECH: "BIOTECH", CONSUMER: "CONSUMER",
    CLIMATE: "CLIMATE", CLEANTECH: "CLIMATE", MOBILITY: "MOBILITY",
    TRANSPORTATION: "MOBILITY", INDUSTRIAL: "INDUSTRIAL", CYBERSECURITY: "CYBERSECURITY",
    SECURITY: "CYBERSECURITY", MEDIA: "MEDIA", WEB3: "WEB3", CRYPTO: "WEB3",
    BLOCKCHAIN: "WEB3", EDTECH: "EDTECH", EDUCATION: "EDTECH", GOVTECH: "GOVTECH",
    HARDWARE: "HARDWARE", ROBOTICS: "ROBOTICS", MARKETPLACE: "MARKETPLACE",
    AGRITECH: "AGRITECH", PROPTECH: "PROPTECH", REAL_ESTATE: "PROPTECH",
  };
  return MAP[s] ?? null;
}

export function mapBusinessModel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_");
  const MAP: Record<string, string> = {
    SAAS: "SAAS", B2B_SAAS: "SAAS", MARKETPLACE: "MARKETPLACE",
    E_COMMERCE: "E_COMMERCE", ECOMMERCE: "E_COMMERCE", FINTECH: "FINTECH_INFRA",
    API: "API_PLATFORM", API_PLATFORM: "API_PLATFORM", HARDWARE: "HARDWARE",
    D2C: "D2C", DTC: "D2C", ENTERPRISE: "ENTERPRISE",
    CONSUMER: "CONSUMER_APP", CONSUMER_APP: "CONSUMER_APP",
    OPEN_SOURCE: "OPEN_SOURCE", OSS: "OPEN_SOURCE",
  };
  return MAP[s] ?? "OTHER";
}

export function mapHeadcountBand(count: number | null | undefined): string | null {
  if (!count) return null;
  if (count <= 1) return "SOLO";
  if (count <= 10) return "MICRO";
  if (count <= 50) return "SMALL";
  if (count <= 200) return "MID";
  if (count <= 1000) return "LARGE";
  return "ENTERPRISE";
}

export function mapDataSource(raw: string): string {
  const MAP: Record<string, string> = {
    seedtable: "SEEDTABLE", topstartups: "TOPSTARTUPS", tinyteams: "TINYTEAMS",
    yc: "YC", nextplay: "NEXTPLAY", startups_gallery: "STARTUPS_GALLERY",
    cb_insights: "CB_INSIGHTS", crunchbase: "CRUNCHBASE", tracxn: "TRACXN",
    manual: "MANUAL",
  };
  return MAP[raw.toLowerCase()] ?? "OTHER";
}

// ---------------------------------------------------------------------------
// Upsert result
// ---------------------------------------------------------------------------

export type UpsertResult = {
  id: string;
  created: boolean;
  fieldsUpdated: number;
};

// ---------------------------------------------------------------------------
// Generate a cuid-like ID
// ---------------------------------------------------------------------------

function genId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `cs_${ts}${rand}`;
}

// ---------------------------------------------------------------------------
// Core upsert — idempotent startup persistence via Supabase REST
// ---------------------------------------------------------------------------

export async function upsertStartup(
  sb: SupabaseClient,
  raw: StartupIngestPayload,
): Promise<UpsertResult> {
  const name = normalizeCompanyName(raw.company_name);
  const domain = normalizeDomain(raw.company_url ?? raw.domain ?? null);
  const dsEnum = mapDataSource(raw.data_source);
  const now = new Date().toISOString();

  // --- Find existing by domain or name ---
  let existing: any = null;
  if (domain) {
    const { data } = await sb.from("startups").select("*").eq("domain", domain).maybeSingle();
    existing = data;
  }
  if (!existing) {
    const { data } = await sb.from("startups").select("*").eq("company_name", name).maybeSingle();
    existing = data;
  }

  const sectorEnum = mapSector(raw.sector);
  const stageEnum = mapStage(raw.stage);
  const statusEnum = mapStatus(raw.status);
  const bmEnum = mapBusinessModel(raw.business_model);
  const hcBand = raw.headcount_band || mapHeadcountBand(raw.headcount);

  const mergedExtIds = { ...(existing?.external_ids ?? {}), ...(raw.external_ids ?? {}) };
  const mergedSources = [...new Set([...(existing?.data_sources ?? []), dsEnum])];
  const mergeArr = (ex: string[] | null, inc: string[] | undefined): string[] =>
    [...new Set([...(ex ?? []), ...(inc ?? [])])];

  const pick = (inVal: any, exVal: any) => (inVal != null ? inVal : exVal ?? null);

  const data: Record<string, any> = {
    company_name: name,
    company_url: pick(raw.company_url, existing?.company_url),
    domain: pick(domain, existing?.domain),
    sector: pick(sectorEnum, existing?.sector),
    location: raw.hq_city && raw.hq_country ? `${raw.hq_city}, ${raw.hq_country}` : existing?.location ?? null,
    description_short: pick(raw.description_short, existing?.description_short),
    description_long: pick(raw.description_long, existing?.description_long),
    logo_url: pick(raw.logo_url, existing?.logo_url),
    founded_year: pick(raw.founded_year, existing?.founded_year),
    hq_city: pick(raw.hq_city, existing?.hq_city),
    hq_state: pick(raw.hq_state, existing?.hq_state),
    hq_country: pick(raw.hq_country, existing?.hq_country),
    geo_footprint: mergeArr(existing?.geo_footprint, raw.geo_footprint),
    stage: stageEnum,
    status: statusEnum,
    sectors: raw.sectors?.map(s => mapSector(s)).filter(Boolean) ?? existing?.sectors ?? [],
    secondary_sectors: mergeArr(existing?.secondary_sectors, raw.secondary_sectors),
    business_model: pick(bmEnum, existing?.business_model),
    business_model_tags: mergeArr(existing?.business_model_tags, raw.business_model_tags),
    headcount: pick(raw.headcount, existing?.headcount),
    headcount_band: pick(hcBand, existing?.headcount_band),
    tech_stack: mergeArr(existing?.tech_stack, raw.tech_stack),
    total_raised_usd: pick(raw.total_raised_usd, existing?.total_raised_usd),
    last_round_size_usd: pick(raw.last_round_size_usd, existing?.last_round_size_usd),
    last_round_type: pick(raw.last_round_type, existing?.last_round_type),
    valuation_usd: pick(raw.valuation_usd, existing?.valuation_usd),
    investor_names: mergeArr(existing?.investor_names, raw.investor_names),
    lead_investor_names: mergeArr(existing?.lead_investor_names, raw.lead_investor_names),
    board_members: mergeArr(existing?.board_members, raw.board_members),
    market_category: pick(raw.market_category, existing?.market_category),
    linkedin_url: pick(raw.linkedin_url, existing?.linkedin_url),
    x_url: pick(raw.x_url, existing?.x_url),
    github_url: pick(raw.github_url, existing?.github_url),
    crunchbase_url: pick(raw.crunchbase_url, existing?.crunchbase_url),
    yc_batch: pick(raw.yc_batch, existing?.yc_batch),
    yc_slug: pick(raw.yc_slug, existing?.yc_slug),
    data_sources: mergedSources,
    primary_data_source: dsEnum,
    external_ids: Object.keys(mergedExtIds).length > 0 ? mergedExtIds : null,
    last_verified_at: now,
    updated_at: now,
  };

  // Drop nulls that would overwrite existing non-null values
  if (existing) {
    for (const key of Object.keys(data)) {
      if (data[key] === null && existing[key] != null) delete data[key];
    }
  }

  let startupId: string;
  let created: boolean;

  if (!existing) {
    data.id = genId();
    data.created_at = now;
    const { error } = await sb.from("startups").insert(data);
    if (error) throw new Error(`Insert startup "${name}": ${error.message}`);
    startupId = data.id;
    created = true;
  } else {
    const { error } = await sb.from("startups").update(data).eq("id", existing.id);
    if (error) throw new Error(`Update startup "${name}": ${error.message}`);
    startupId = existing.id;
    created = false;
  }

  // --- Upsert founders ---
  if (raw.founders?.length) {
    for (const f of raw.founders) {
      const fName = f.full_name.normalize("NFKC").replace(/\s+/g, " ").trim();
      if (!fName) continue;

      const { data: existingF } = await sb
        .from("startup_founders")
        .select("id")
        .eq("startup_id", startupId)
        .eq("full_name", fName)
        .maybeSingle();

      const fData: Record<string, any> = {
        startup_id: startupId,
        full_name: fName,
        role: f.role ?? null,
        linkedin_url: f.linkedin_url ?? null,
        x_url: f.x_url ?? null,
        location: f.location ?? null,
        avatar_url: f.avatar_url ?? null,
        prior_companies: f.prior_companies ?? [],
        prior_exits: f.prior_exits ?? [],
        has_prior_exit: f.has_prior_exit ?? false,
        education_highlight: f.education_highlight ?? null,
        operator_background: f.operator_background ?? null,
        domain_expertise: f.domain_expertise ?? [],
        is_repeat_founder: f.is_repeat_founder ?? false,
        founder_archetype: f.founder_archetype ?? null,
        data_source: dsEnum,
        updated_at: now,
      };

      if (!existingF) {
        fData.id = genId();
        fData.created_at = now;
        await sb.from("startup_founders").insert(fData);
      } else {
        await sb.from("startup_founders").update(fData).eq("id", existingF.id);
      }
    }
  }

  // --- Upsert funding rounds ---
  if (raw.funding_rounds?.length) {
    for (const r of raw.funding_rounds) {
      const roundName = r.round_name.trim();
      if (!roundName) continue;

      let query = sb
        .from("startup_funding_rounds")
        .select("id")
        .eq("startup_id", startupId)
        .eq("round_name", roundName);
      if (r.round_date) query = query.eq("round_date", r.round_date.toISOString().slice(0, 10));
      const { data: existingR } = await query.maybeSingle();

      const rData: Record<string, any> = {
        startup_id: startupId,
        round_name: roundName,
        round_date: r.round_date?.toISOString().slice(0, 10) ?? null,
        amount_usd: r.amount_usd ?? null,
        valuation_usd: r.valuation_usd ?? null,
        lead_investors: r.lead_investors ?? [],
        participants: r.participants ?? [],
        source_url: r.source_url ?? null,
        data_source: dsEnum,
        updated_at: now,
      };

      if (!existingR) {
        rData.id = genId();
        rData.created_at = now;
        await sb.from("startup_funding_rounds").insert(rData);
      } else {
        await sb.from("startup_funding_rounds").update(rData).eq("id", existingR.id);
      }
    }
  }

  return { id: startupId, created, fieldsUpdated: created ? -1 : Object.keys(data).length };
}

// ---------------------------------------------------------------------------
// HTTP fetch with retry
// ---------------------------------------------------------------------------

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function fetchWithRetry(
  url: string,
  opts: { maxRetries?: number; delayMs?: number; userAgent?: string; headers?: Record<string, string> } = {},
): Promise<string> {
  const maxRetries = opts.maxRetries ?? 3;
  const delayMs = opts.delayMs ?? 1000;
  const ua = opts.userAgent ?? DEFAULT_UA;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": ua, Accept: "text/html,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9", ...opts.headers },
        redirect: "follow",
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
          await sleep(delayMs * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.text();
    } catch (err) {
      if (attempt < maxRetries) { await sleep(delayMs * Math.pow(2, attempt)); continue; }
      throw err;
    }
  }
  throw new Error(`Exhausted retries for ${url}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Scraper progress tracker
// ---------------------------------------------------------------------------

export class ScrapeProgress {
  private path: string;
  private data: Record<string, any>;
  constructor(name: string) {
    const dir = join(process.cwd(), "data");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.path = join(dir, `scraper-progress-${name}.json`);
    this.data = existsSync(this.path) ? JSON.parse(readFileSync(this.path, "utf8")) : {};
  }
  get<T>(key: string, fallback: T): T { return (this.data[key] as T) ?? fallback; }
  set(key: string, value: any): void { this.data[key] = value; writeFileSync(this.path, JSON.stringify(this.data, null, 2)); }
  isDone(key: string): boolean { return !!this.data[`done:${key}`]; }
  markDone(key: string): void { this.set(`done:${key}`, true); }
}

// ---------------------------------------------------------------------------
// Stats counter
// ---------------------------------------------------------------------------

export class ScrapeStats {
  source: string;
  created = 0; updated = 0; skipped = 0; errors = 0; startedAt = Date.now();
  constructor(source: string) { this.source = source; }
  record(result: UpsertResult): void { if (result.created) this.created++; else this.updated++; }
  recordError(): void { this.errors++; }
  recordSkip(): void { this.skipped++; }
  summary(): string {
    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    return `\n=== ${this.source} scrape complete ===\n  Created: ${this.created}\n  Updated: ${this.updated}\n  Skipped: ${this.skipped}\n  Errors:  ${this.errors}\n  Elapsed: ${elapsed}s`;
  }
}
