/**
 * Shared types and utilities for startup data scrapers.
 *
 * Every scraper normalizes its output into `StartupIngestPayload` and calls
 * `upsertStartup()` for idempotent persistence. Deduplication keys:
 *   1. domain (canonical, no www)
 *   2. company_name (exact match, case-preserved)
 */

import type { Prisma, PrismaClient, Startup } from "@prisma/client";

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
  // --- Required ---
  company_name: string;
  data_source: string; // maps to StartupDataSource enum value

  // --- Company Core ---
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

  // --- Funding ---
  total_raised_usd?: number | null;
  last_round_size_usd?: number | null;
  last_round_date?: Date | null;
  last_round_type?: string | null;
  last_funding_date?: Date | null;
  valuation_usd?: number | null;
  revenue_range?: string | null;
  hiring_velocity?: number | null;

  // --- Investors (denormalized) ---
  investor_names?: string[];
  lead_investor_names?: string[];
  board_members?: string[];

  // --- Customer & Market ---
  target_customer?: string | null;
  icp_description?: string | null;
  notable_customers?: string[];
  market_category?: string | null;
  market_subcategory?: string | null;

  // --- Social ---
  linkedin_url?: string | null;
  x_url?: string | null;
  github_url?: string | null;
  crunchbase_url?: string | null;

  // --- YC-specific ---
  yc_batch?: string | null;
  yc_slug?: string | null;

  // --- External IDs ---
  external_ids?: Record<string, string>;

  // --- Founders (nested) ---
  founders?: FounderIngestPayload[];

  // --- Funding rounds (nested) ---
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
  // Strip protocol
  s = s.replace(/^https?:\/\//, "");
  // Strip trailing path / query
  s = s.split("/")[0]!.split("?")[0]!.split("#")[0]!;
  // Strip www.
  s = s.replace(/^www\./, "");
  return s || null;
}

export function normalizeCompanyName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** Map raw stage string to Prisma enum value. */
export function mapStage(raw: string | null | undefined): string {
  if (!raw) return "UNKNOWN";
  const s = raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const MAP: Record<string, string> = {
    PRE_SEED: "PRE_SEED",
    PRESEED: "PRE_SEED",
    SEED: "SEED",
    SERIES_A: "SERIES_A",
    A: "SERIES_A",
    SERIES_B: "SERIES_B",
    B: "SERIES_B",
    SERIES_C: "SERIES_C",
    C: "SERIES_C",
    GROWTH: "GROWTH",
    LATE: "GROWTH",
    PUBLIC: "PUBLIC",
    IPO: "PUBLIC",
    BOOTSTRAPPED: "BOOTSTRAPPED",
    ACQUIRED: "ACQUIRED",
    SHUTDOWN: "SHUTDOWN",
    SHUT_DOWN: "SHUTDOWN",
  };
  return MAP[s] ?? "UNKNOWN";
}

/** Map raw status string to Prisma StartupStatus enum. */
export function mapStatus(raw: string | null | undefined): string {
  if (!raw) return "ACTIVE";
  const s = raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const MAP: Record<string, string> = {
    ACTIVE: "ACTIVE",
    OPERATING: "ACTIVE",
    ACQUIRED: "ACQUIRED",
    SHUT_DOWN: "SHUT_DOWN",
    SHUTDOWN: "SHUT_DOWN",
    CLOSED: "SHUT_DOWN",
    DEAD: "SHUT_DOWN",
    IPO: "IPO",
    PUBLIC: "IPO",
  };
  return MAP[s] ?? "UNKNOWN";
}

/** Map raw sector string to SectorFocus enum value. */
export function mapSector(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_");
  const MAP: Record<string, string> = {
    FINTECH: "FINTECH",
    SAAS: "ENTERPRISE_SAAS",
    ENTERPRISE_SAAS: "ENTERPRISE_SAAS",
    ENTERPRISE: "ENTERPRISE_SAAS",
    AI: "AI",
    ARTIFICIAL_INTELLIGENCE: "AI",
    ML: "AI",
    MACHINE_LEARNING: "AI",
    HEALTHTECH: "HEALTHTECH",
    HEALTH: "HEALTHTECH",
    HEALTHCARE: "HEALTHTECH",
    BIOTECH: "BIOTECH",
    CONSUMER: "CONSUMER",
    CLIMATE: "CLIMATE",
    CLEANTECH: "CLIMATE",
    MOBILITY: "MOBILITY",
    TRANSPORTATION: "MOBILITY",
    INDUSTRIAL: "INDUSTRIAL",
    CYBERSECURITY: "CYBERSECURITY",
    SECURITY: "CYBERSECURITY",
    MEDIA: "MEDIA",
    WEB3: "WEB3",
    CRYPTO: "WEB3",
    BLOCKCHAIN: "WEB3",
    EDTECH: "EDTECH",
    EDUCATION: "EDTECH",
    GOVTECH: "GOVTECH",
    HARDWARE: "HARDWARE",
    ROBOTICS: "ROBOTICS",
    MARKETPLACE: "MARKETPLACE",
    AGRITECH: "AGRITECH",
    PROPTECH: "PROPTECH",
    REAL_ESTATE: "PROPTECH",
  };
  return MAP[s] ?? null;
}

/** Map raw business model string to BusinessModel enum. */
export function mapBusinessModel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_");
  const MAP: Record<string, string> = {
    SAAS: "SAAS",
    B2B_SAAS: "SAAS",
    MARKETPLACE: "MARKETPLACE",
    E_COMMERCE: "E_COMMERCE",
    ECOMMERCE: "E_COMMERCE",
    FINTECH: "FINTECH_INFRA",
    API: "API_PLATFORM",
    API_PLATFORM: "API_PLATFORM",
    HARDWARE: "HARDWARE",
    D2C: "D2C",
    DTC: "D2C",
    ENTERPRISE: "ENTERPRISE",
    CONSUMER: "CONSUMER_APP",
    CONSUMER_APP: "CONSUMER_APP",
    OPEN_SOURCE: "OPEN_SOURCE",
    OSS: "OPEN_SOURCE",
  };
  return MAP[s] ?? "OTHER";
}

/** Map headcount to CompanyHeadcountBand. */
export function mapHeadcountBand(count: number | null | undefined): string | null {
  if (!count) return null;
  if (count <= 1) return "SOLO";
  if (count <= 10) return "MICRO";
  if (count <= 50) return "SMALL";
  if (count <= 200) return "MID";
  if (count <= 1000) return "LARGE";
  return "ENTERPRISE";
}

/** Map data_source string to StartupDataSource enum. */
export function mapDataSource(raw: string): string {
  const MAP: Record<string, string> = {
    seedtable: "SEEDTABLE",
    topstartups: "TOPSTARTUPS",
    tinyteams: "TINYTEAMS",
    yc: "YC",
    nextplay: "NEXTPLAY",
    startups_gallery: "STARTUPS_GALLERY",
    cb_insights: "CB_INSIGHTS",
    crunchbase: "CRUNCHBASE",
    tracxn: "TRACXN",
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
// Core upsert — idempotent startup persistence
// ---------------------------------------------------------------------------

export async function upsertStartup(
  prisma: PrismaClient,
  raw: StartupIngestPayload,
): Promise<UpsertResult> {
  const name = normalizeCompanyName(raw.company_name);
  const domain = normalizeDomain(raw.company_url ?? raw.domain ?? null);
  const dsEnum = mapDataSource(raw.data_source) as any;
  const now = new Date();

  // --- Find existing by domain or name ---
  let existing: Startup | null = null;
  if (domain) {
    existing = await prisma.startup.findUnique({ where: { domain } });
  }
  if (!existing) {
    existing = await prisma.startup.findUnique({ where: { company_name: name } });
  }

  // Build the data payload (only non-null values from ingest)
  const sectorEnum = mapSector(raw.sector) as any;
  const stageEnum = mapStage(raw.stage) as any;
  const statusEnum = mapStatus(raw.status) as any;
  const bmEnum = mapBusinessModel(raw.business_model) as any;
  const hcBand = raw.headcount_band
    ? (raw.headcount_band as any)
    : (mapHeadcountBand(raw.headcount) as any);

  // Merge external IDs
  const mergedExtIds = {
    ...(existing ? ((existing as any).external_ids as Record<string, string>) ?? {} : {}),
    ...(raw.external_ids ?? {}),
  };

  // Merge data_sources array
  const existingSources: string[] = existing ? ((existing as any).data_sources as string[]) ?? [] : [];
  const mergedSources = [...new Set([...existingSources, dsEnum])];

  // Merge array fields (union)
  const mergeArrays = (existing: string[] | null | undefined, incoming: string[] | undefined): string[] => {
    return [...new Set([...(existing ?? []), ...(incoming ?? [])])];
  };

  const data: any = {
    company_name: name,
    company_url: raw.company_url ?? existing?.company_url ?? null,
    domain: domain ?? (existing as any)?.domain ?? null,
    sector: sectorEnum ?? existing?.sector ?? null,
    location: raw.hq_city && raw.hq_country
      ? `${raw.hq_city}, ${raw.hq_country}`
      : existing?.location ?? null,
    description_short: raw.description_short ?? (existing as any)?.description_short ?? null,
    description_long: raw.description_long ?? (existing as any)?.description_long ?? null,
    logo_url: raw.logo_url ?? (existing as any)?.logo_url ?? null,
    founding_date: raw.founding_date ?? (existing as any)?.founding_date ?? null,
    founded_year: raw.founded_year ?? (existing as any)?.founded_year ?? null,
    hq_city: raw.hq_city ?? (existing as any)?.hq_city ?? null,
    hq_state: raw.hq_state ?? (existing as any)?.hq_state ?? null,
    hq_country: raw.hq_country ?? (existing as any)?.hq_country ?? null,
    geo_footprint: mergeArrays((existing as any)?.geo_footprint, raw.geo_footprint),
    stage: stageEnum,
    status: statusEnum,
    sectors: raw.sectors?.map(s => mapSector(s)).filter(Boolean) as any[] ?? (existing as any)?.sectors ?? [],
    secondary_sectors: mergeArrays((existing as any)?.secondary_sectors, raw.secondary_sectors),
    business_model: bmEnum ?? (existing as any)?.business_model ?? null,
    business_model_tags: mergeArrays((existing as any)?.business_model_tags, raw.business_model_tags),
    headcount: raw.headcount ?? (existing as any)?.headcount ?? null,
    headcount_band: hcBand ?? (existing as any)?.headcount_band ?? null,
    headcount_growth_pct: raw.headcount_growth_pct ?? (existing as any)?.headcount_growth_pct ?? null,
    tech_stack: mergeArrays((existing as any)?.tech_stack, raw.tech_stack),
    total_raised_usd: raw.total_raised_usd ?? existing?.total_raised_usd ?? null,
    last_round_size_usd: raw.last_round_size_usd ?? (existing as any)?.last_round_size_usd ?? null,
    last_round_date: raw.last_round_date ?? (existing as any)?.last_round_date ?? null,
    last_round_type: raw.last_round_type ?? (existing as any)?.last_round_type ?? null,
    last_funding_date: raw.last_funding_date ?? existing?.last_funding_date ?? null,
    valuation_usd: raw.valuation_usd ?? (existing as any)?.valuation_usd ?? null,
    revenue_range: raw.revenue_range as any ?? (existing as any)?.revenue_range ?? null,
    hiring_velocity: raw.hiring_velocity ?? (existing as any)?.hiring_velocity ?? null,
    investor_names: mergeArrays((existing as any)?.investor_names, raw.investor_names),
    lead_investor_names: mergeArrays((existing as any)?.lead_investor_names, raw.lead_investor_names),
    board_members: mergeArrays((existing as any)?.board_members, raw.board_members),
    target_customer: raw.target_customer as any ?? (existing as any)?.target_customer ?? null,
    icp_description: raw.icp_description ?? (existing as any)?.icp_description ?? null,
    notable_customers: mergeArrays((existing as any)?.notable_customers, raw.notable_customers),
    market_category: raw.market_category ?? (existing as any)?.market_category ?? null,
    market_subcategory: raw.market_subcategory ?? (existing as any)?.market_subcategory ?? null,
    linkedin_url: raw.linkedin_url ?? (existing as any)?.linkedin_url ?? null,
    x_url: raw.x_url ?? (existing as any)?.x_url ?? null,
    github_url: raw.github_url ?? (existing as any)?.github_url ?? null,
    crunchbase_url: raw.crunchbase_url ?? (existing as any)?.crunchbase_url ?? null,
    yc_batch: raw.yc_batch ?? (existing as any)?.yc_batch ?? null,
    yc_slug: raw.yc_slug ?? (existing as any)?.yc_slug ?? null,
    data_sources: mergedSources,
    primary_data_source: dsEnum,
    external_ids: Object.keys(mergedExtIds).length > 0 ? mergedExtIds : null,
    last_verified_at: now,
    updated_at: now,
  };

  // Remove null/undefined to avoid overwriting existing values with null
  for (const key of Object.keys(data)) {
    if (data[key] === null && existing && (existing as any)[key] != null) {
      delete data[key];
    }
  }

  let startupId: string;
  let created: boolean;

  if (!existing) {
    data.created_at = now;
    const row = await prisma.startup.create({ data });
    startupId = row.id;
    created = true;
  } else {
    await prisma.startup.update({ where: { id: existing.id }, data });
    startupId = existing.id;
    created = false;
  }

  // --- Upsert founders ---
  if (raw.founders?.length) {
    for (const f of raw.founders) {
      const fName = f.full_name.normalize("NFKC").replace(/\s+/g, " ").trim();
      if (!fName) continue;
      await prisma.startupFounder.upsert({
        where: {
          startup_id_full_name: { startup_id: startupId, full_name: fName },
        },
        create: {
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
          founder_archetype: (f.founder_archetype as any) ?? null,
          data_source: dsEnum,
        },
        update: {
          role: f.role ?? undefined,
          linkedin_url: f.linkedin_url ?? undefined,
          x_url: f.x_url ?? undefined,
          location: f.location ?? undefined,
          avatar_url: f.avatar_url ?? undefined,
          prior_companies: f.prior_companies?.length ? f.prior_companies : undefined,
          prior_exits: f.prior_exits?.length ? f.prior_exits : undefined,
          has_prior_exit: f.has_prior_exit ?? undefined,
          education_highlight: f.education_highlight ?? undefined,
          operator_background: f.operator_background ?? undefined,
          domain_expertise: f.domain_expertise?.length ? f.domain_expertise : undefined,
          is_repeat_founder: f.is_repeat_founder ?? undefined,
          founder_archetype: (f.founder_archetype as any) ?? undefined,
        },
      });
    }
  }

  // --- Upsert funding rounds ---
  if (raw.funding_rounds?.length) {
    for (const r of raw.funding_rounds) {
      const roundName = r.round_name.trim();
      if (!roundName) continue;
      await prisma.startupFundingRound.upsert({
        where: {
          startup_id_round_name_round_date: {
            startup_id: startupId,
            round_name: roundName,
            round_date: r.round_date ?? new Date(0),
          },
        },
        create: {
          startup_id: startupId,
          round_name: roundName,
          round_date: r.round_date ?? null,
          amount_usd: r.amount_usd ?? null,
          valuation_usd: r.valuation_usd ?? null,
          lead_investors: r.lead_investors ?? [],
          participants: r.participants ?? [],
          source_url: r.source_url ?? null,
          data_source: dsEnum,
        },
        update: {
          amount_usd: r.amount_usd ?? undefined,
          valuation_usd: r.valuation_usd ?? undefined,
          lead_investors: r.lead_investors?.length ? r.lead_investors : undefined,
          participants: r.participants?.length ? r.participants : undefined,
          source_url: r.source_url ?? undefined,
        },
      });
    }
  }

  return { id: startupId, created, fieldsUpdated: created ? -1 : Object.keys(data).length };
}

// ---------------------------------------------------------------------------
// HTTP fetch with retry, rate limiting, and user agent
// ---------------------------------------------------------------------------

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function fetchWithRetry(
  url: string,
  opts: {
    maxRetries?: number;
    delayMs?: number;
    userAgent?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<string> {
  const maxRetries = opts.maxRetries ?? 3;
  const delayMs = opts.delayMs ?? 1000;
  const ua = opts.userAgent ?? DEFAULT_UA;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": ua,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...opts.headers,
        },
        redirect: "follow",
      });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          if (attempt < maxRetries) {
            const wait = delayMs * Math.pow(2, attempt);
            console.warn(`  [retry] ${url} → ${res.status}, waiting ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
            await sleep(wait);
            continue;
          }
        }
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.text();
    } catch (err) {
      if (attempt < maxRetries) {
        const wait = delayMs * Math.pow(2, attempt);
        console.warn(`  [retry] ${url} → ${err instanceof Error ? err.message : err}, waiting ${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Exhausted retries for ${url}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Scraper progress tracker — resume from last checkpoint
// ---------------------------------------------------------------------------

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export class ScrapeProgress {
  private path: string;
  private data: Record<string, any>;

  constructor(name: string) {
    this.path = join(process.cwd(), "data", `scraper-progress-${name}.json`);
    this.data = existsSync(this.path)
      ? JSON.parse(readFileSync(this.path, "utf8"))
      : {};
  }

  get<T>(key: string, fallback: T): T {
    return (this.data[key] as T) ?? fallback;
  }

  set(key: string, value: any): void {
    this.data[key] = value;
    writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }

  /** Check if a specific item (e.g. company slug) was already processed. */
  isDone(key: string): boolean {
    return !!this.data[`done:${key}`];
  }

  markDone(key: string): void {
    this.set(`done:${key}`, true);
  }
}

// ---------------------------------------------------------------------------
// Stats counter for scrape runs
// ---------------------------------------------------------------------------

export class ScrapeStats {
  source: string;
  created = 0;
  updated = 0;
  skipped = 0;
  errors = 0;
  startedAt = Date.now();

  constructor(source: string) {
    this.source = source;
  }

  record(result: UpsertResult): void {
    if (result.created) this.created++;
    else this.updated++;
  }

  recordError(): void {
    this.errors++;
  }

  recordSkip(): void {
    this.skipped++;
  }

  summary(): string {
    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    return [
      `\n=== ${this.source} scrape complete ===`,
      `  Created: ${this.created}`,
      `  Updated: ${this.updated}`,
      `  Skipped: ${this.skipped}`,
      `  Errors:  ${this.errors}`,
      `  Elapsed: ${elapsed}s`,
    ].join("\n");
  }
}
