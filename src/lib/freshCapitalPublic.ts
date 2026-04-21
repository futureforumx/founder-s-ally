import { supabasePublicDirectory, isSupabaseConfigured } from "@/integrations/supabase/client";
import { stripRedundantFirmPrefixFromFundName } from "@/lib/fundNameNormalizer";
import { resolveDirectoryFirmWebsiteUrl } from "@/lib/knownVcDomains";

/**
 * Canonical public Fresh Capital feed source:
 * - RPC: `public.get_new_vc_funds(...)`
 * - Canonical tables behind it: `vc_funds` + derived freshness on `firm_records`
 * - Not candidate staging (`candidate_capital_events*`)
 * - Not `fund_records` except legacy compatibility elsewhere
 */

/**
 * Demo/sample rows: **non-production only**, gated by `VITE_FRESH_CAPITAL_DEMO=true`.
 * Never used when `import.meta.env.PROD` is true.
 */
export class FreshCapitalMisconfiguredError extends Error {
  constructor(message = "Fresh Capital requires VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.") {
    super(message);
    this.name = "FreshCapitalMisconfiguredError";
  }
}

/** Opt-in demo dataset for local/preview dev builds only. */
export function isFreshCapitalDemoDataEnabled(): boolean {
  if (import.meta.env.PROD) return false;
  return import.meta.env.VITE_FRESH_CAPITAL_DEMO === "true";
}

/** Row shape for `public.get_new_vc_funds` (migration 20260418190000 + 20260423120000). */
export type FreshCapitalFundRow = {
  vc_fund_id: string;
  firm_record_id: string;
  firm_name: string;
  fund_name: string;
  fund_type: string | null;
  fund_sequence_number: number | null;
  vintage_year: number | null;
  announced_date: string | null;
  close_date: string | null;
  target_size_usd: number | null;
  final_size_usd: number | null;
  status: string | null;
  /** Used only for sort ordering client-side — do not render as a “score” on the public page. */
  source_confidence: number | null;
  announcement_url: string | null;
  announcement_title: string | null;
  stage_focus: string[] | null;
  sector_focus: string[] | null;
  geography_focus: string[] | null;
  has_fresh_capital: boolean | null;
  /** Firm-level rollup; sort-only on the public page — do not render numerically. */
  fresh_capital_priority_score: number | null;
  /** Same COALESCE rule as `get_active_funds_by_stage` (see migration 20260423120000). */
  likely_actively_deploying: boolean | null;
  /** From `firm_records.logo_url` when the RPC includes it. */
  firm_logo_url: string | null;
  /**
   * From `firm_records.domain`, or host parsed from `website_url` (see `get_new_vc_funds` migration).
   * Used to build a favicon URL when `firm_logo_url` is missing.
   */
  firm_domain: string | null;
  /** Public display line for firm HQ/location. */
  firm_location: string | null;
  /** Public website URL when available. */
  firm_website_url: string | null;
  /** Firm-level AUM in USD (`firm_records.aum`), not this fund vehicle’s target/final size. */
  firm_aum_usd: number | null;
};

export type FreshCapitalStageFilter = "all" | "seed" | "series_a" | "growth";

export type HeatmapBucket = {
  label: string;
  count: number;
  /** 0–1 for bar width */
  intensity: number;
  tier: "high" | "moderate" | "low";
};

export type HeatmapSource = "rpc" | "fallback_sector_tag_counts";

const STAGE_RPC: Record<Exclude<FreshCapitalStageFilter, "all">, string[]> = {
  seed: ["Seed"],
  series_a: ["Series A"],
  growth: ["Growth"],
};

export function stageFilterToRpcArray(stage: FreshCapitalStageFilter): string[] | null {
  if (stage === "all") return null;
  return STAGE_RPC[stage];
}

/**
 * Fresh Capital UI: some fund rows omit early stages that still match the firm’s mandate.
 * Keys are lowercased {@link FreshCapitalFundRow.firm_name}; display-only — RPC filters still use stored `stage_focus`.
 */
const FLYBRIDGE_STAGE_FOCUS_DISPLAY = ["Pre-Seed", "Seed"] as const;

const STAGE_FOCUS_DISPLAY_OVERRIDE_BY_FIRM_NAME: Record<string, readonly string[]> = {
  flybridge: [...FLYBRIDGE_STAGE_FOCUS_DISPLAY],
  "flybridge ventures": [...FLYBRIDGE_STAGE_FOCUS_DISPLAY],
};

const HUMMINGBIRD_VENTURES_LC = "hummingbird ventures";

/** Curated firm-level AUM (USD) for Fresh Capital meta when `firm_records.aum` is missing or stale. */
const FIRM_AUM_USD_DISPLAY_OVERRIDE_LC: Readonly<Record<string, number>> = {
  [HUMMINGBIRD_VENTURES_LC]: 1_000_000_000,
  /** Otro Capital Fund I close — BusinessWire Feb 2026 (~$1.2B committed). */
  "otro capital": 1_200_000_000,
  /** GV AI fund / Gradient Ventures — firm-level AUM commonly cited ~$1.2B. */
  "gradient ventures": 1_200_000_000,
  /** Lux Capital — firm-level AUM. */
  "lux capital": 7_000_000_000,
  /** CRV (Charles River Ventures) — firm-level AUM. */
  crv: 4_000_000_000,
  "charles river ventures": 4_000_000_000,
  "crv (charles river ventures)": 4_000_000_000,
};

/** Ingestion sometimes labels the 2026 growth vehicle as “Hummingbird Ventures V” instead of the fund proper name. */
function isHummingbirdInauguralGrowthFundDisplayCase(
  row: Pick<FreshCapitalFundRow, "firm_name" | "fund_name">,
): boolean {
  if (row.firm_name?.trim().toLowerCase() !== HUMMINGBIRD_VENTURES_LC) return false;
  const raw = row.fund_name?.trim() ?? "";
  if (/^Hummingbird Ventures\s+V\b/i.test(raw)) return true;
  // Prefix strip can collapse the label to a lone roman numeral token.
  if (/^V$/i.test(raw)) return true;
  return false;
}

function isHummingbirdFundVIDisplayCase(row: Pick<FreshCapitalFundRow, "firm_name" | "fund_name">): boolean {
  if (row.firm_name?.trim().toLowerCase() !== HUMMINGBIRD_VENTURES_LC) return false;
  const raw = row.fund_name?.trim() ?? "";
  return /^Fund\s+VI\b/i.test(raw);
}

function isKleinerPerkinsKP22DisplayCase(row: Pick<FreshCapitalFundRow, "firm_name" | "fund_name">): boolean {
  const firm = row.firm_name?.trim().toLowerCase() ?? "";
  if (!firm.includes("kleiner perkins")) return false;
  const fundRaw = row.fund_name?.trim() ?? "";
  return /\bkp\s*22\b/i.test(fundRaw) || /\bkleiner perkins\s*22\b/i.test(fundRaw);
}

function isKpSelectIVDisplayCase(row: Pick<FreshCapitalFundRow, "firm_name" | "fund_name">): boolean {
  const firm = row.firm_name?.trim().toLowerCase() ?? "";
  if (!firm.includes("kleiner perkins")) return false;
  const fundRaw = row.fund_name?.trim() ?? "";
  return /\bkp\s*select\s*(iv|4)\b/i.test(fundRaw) || /\bselect\s*(iv|4)\b/i.test(fundRaw);
}

function isAntlerUSFundIIDisplayCase(row: Pick<FreshCapitalFundRow, "firm_name" | "fund_name">): boolean {
  const firm = row.firm_name?.trim().toLowerCase() ?? "";
  const fund = row.fund_name?.trim().toLowerCase() ?? "";
  if (!firm.includes("antler")) return false;
  return /\bus fund ii\b/i.test(fund);
}

/** Fresh Capital theme column — Antler US Fund II (display-only; RPC may only carry a single sector tag). */
const ANTLER_US_FUND_II_SECTOR_FOCUS_DISPLAY = ["AI", "Housing", "Biotech", "Health"] as const;

function isLuxCapitalIXDisplayCase(row: Pick<FreshCapitalFundRow, "firm_name" | "fund_name">): boolean {
  const firm = row.firm_name?.trim().toLowerCase() ?? "";
  const fund = row.fund_name?.trim().toLowerCase() ?? "";
  if (!firm.includes("lux capital")) return false;
  return /\blux capital\s+ix\b/.test(fund) || /\bcapital\s+ix\b/.test(fund) || /^ix$/i.test(fund.trim());
}

/** Lux Capital IX — curated themes for Fresh Capital feed. */
const LUX_CAPITAL_IX_SECTOR_FOCUS_DISPLAY = [
  "Defense",
  "Biotech",
  "Frontier Science",
  "Transportation",
  "Robotics",
  "AI/ML",
  "Data",
] as const;

/** Lux Capital IX — curated stage chips on Fresh Capital (display-only). */
const LUX_CAPITAL_IX_STAGE_FOCUS_DISPLAY = ["Pre-Seed", "Seed", "Series A"] as const;

/** Battery Ventures XV — map RPC “Growth” tag to Series C+ on the Fresh Capital stage column (display-only). */
function isBatteryVenturesXVFund(row: Pick<FreshCapitalFundRow, "firm_name" | "fund_name">): boolean {
  const firm = row.firm_name?.trim().toLowerCase() ?? "";
  const fund = row.fund_name?.trim().toLowerCase() ?? "";
  if (!firm.includes("battery ventures")) return false;
  return /\bxv\b/.test(fund);
}

/** Thrive Capital X — same Growth → Series C+ swap (display-only); excludes Fund XI+. */
function isThriveCapitalXFund(row: Pick<FreshCapitalFundRow, "firm_name" | "fund_name">): boolean {
  const firm = row.firm_name?.trim().toLowerCase() ?? "";
  const fundRaw = row.fund_name?.trim() ?? "";
  if (!firm.includes("thrive capital")) return false;
  if (/^x$/i.test(fundRaw.trim())) return true;
  if (/^fund$/i.test(fundRaw.trim())) return true;
  if (/^fund\s+x$/i.test(fundRaw.trim())) return true;
  if (/^thrive\s+capital\s+fund$/i.test(fundRaw.trim())) return true;
  if (/^thrive\s+capital\s+fund\s+x$/i.test(fundRaw.trim())) return true;
  return /\bthrive\s+capital\s+x\b(?!i)/i.test(row.fund_name ?? "");
}

function growthStageSwapToSeriesCPlus(stages: readonly string[]): string[] {
  return stages.map((s) => {
    const t = String(s).trim();
    return t.toLowerCase() === "growth" ? "Series C+" : t;
  });
}

function isAndreessenHorowitzFirmName(firmLc: string): boolean {
  if (/\ba16z\b/.test(firmLc)) return true;
  if (firmLc.includes("horowitz") && (firmLc.includes("andreessen") || firmLc.includes("andreesen"))) return true;
  return false;
}

function isA16zAmericanDynamismFundDisplayCase(row: Pick<FreshCapitalFundRow, "firm_name" | "fund_name">): boolean {
  const firm = row.firm_name?.trim().toLowerCase() ?? "";
  const fund = row.fund_name?.trim().toLowerCase() ?? "";
  if (!isAndreessenHorowitzFirmName(firm)) return false;
  return fund.includes("american dynamism");
}

/** American Dynamism Fund (a16z) — curated themes for Fresh Capital feed. */
const A16Z_AMERICAN_DYNAMISM_SECTOR_FOCUS_DISPLAY = [
  "Aerospace",
  "Defense",
  "Public Safety",
  "Education",
  "Housing",
  "Supply Chain",
  "Industrials",
  "Manufacturing",
] as const;

/** Fund vehicle label with repeated firm tokens removed (firm column already shows the GP). */
export function fundNameForDisplay(row: Pick<FreshCapitalFundRow, "firm_name" | "fund_name">): string {
  if (isHummingbirdInauguralGrowthFundDisplayCase(row)) return "Growth Fund I";
  if (isLuxCapitalIXDisplayCase(row)) return "Fund IX";
  if (isThriveCapitalXFund(row)) return "Thrive X";
  return stripRedundantFirmPrefixFromFundName(row.firm_name ?? "", row.fund_name ?? "");
}

/** Stage chips / labels — prefers firm-specific overrides when present. */
export function stageFocusForDisplay(
  row: Pick<FreshCapitalFundRow, "firm_name" | "stage_focus" | "fund_name">,
): string[] {
  if (isHummingbirdInauguralGrowthFundDisplayCase(row)) {
    return ["Series B", "Series C+"];
  }
  if (isKpSelectIVDisplayCase(row)) {
    return ["Series B", "Series C+"];
  }
  if (isLuxCapitalIXDisplayCase(row)) {
    return [...LUX_CAPITAL_IX_STAGE_FOCUS_DISPLAY];
  }
  if (isBatteryVenturesXVFund(row) || isThriveCapitalXFund(row)) {
    return growthStageSwapToSeriesCPlus(row.stage_focus ?? []);
  }
  const key = row.firm_name?.trim().toLowerCase();
  const override = key ? STAGE_FOCUS_DISPLAY_OVERRIDE_BY_FIRM_NAME[key] : undefined;
  if (override?.length) return [...override];
  return row.stage_focus ?? [];
}

/** Geo-focus chips — display-only overrides when RPC/geo tags are noisy or stale. */
export function geographyFocusForDisplay(
  row: Pick<FreshCapitalFundRow, "firm_name" | "geography_focus">,
): string[] | null | undefined {
  const firmLc = row.firm_name?.trim().toLowerCase() ?? "";
  if (firmLc.includes("credo ventures")) return ["Europe"];
  return row.geography_focus ?? null;
}

/**
 * Theme / sector pills on the Fresh Capital feed — same override pattern as stages.
 * Default rows still cap at 3 tags for density; overrides return the full list.
 */
const FLYBRIDGE_SECTOR_FOCUS_DISPLAY = [
  "AI Infrastructure",
  "Dev Platforms",
  "Agentic AI",
  "Future of Work",
  "Consumer",
] as const;

const VIOLA_VENTURES_SECTOR_FOCUS_DISPLAY = [
  "Vertical AI",
  "AI Infrastructure",
  "Quantum",
  "Enterprise",
  "Cybersecurity",
  "Defense",
] as const;

const SECTOR_FOCUS_DISPLAY_OVERRIDE_BY_FIRM_NAME: Record<string, readonly string[]> = {
  flybridge: [...FLYBRIDGE_SECTOR_FOCUS_DISPLAY],
  "flybridge ventures": [...FLYBRIDGE_SECTOR_FOCUS_DISPLAY],
  "viola ventures": [...VIOLA_VENTURES_SECTOR_FOCUS_DISPLAY],
};

const HUMMINGBIRD_GROWTH_FUND_I_SECTOR_FOCUS_DISPLAY = [
  "AI",
  "Fintech",
  "Biotech",
  "Semiconductors",
  "Gaming",
] as const;

const KP22_SECTOR_FOCUS_DISPLAY = [
  "AI-Native",
  "Professional Services",
  "Healthcare",
  "Autonomy / Transportation",
  "Cybersecurity",
  "Financial Services",
  "Productivity",
  "Enterprise",
  "Industrial",
  "Physical AI",
] as const;

const KP_SELECT_IV_SECTOR_FOCUS_DISPLAY = [
  "AI-Native",
  "Professional Services",
  "Healthcare",
  "Cybersecurity",
  "Fintech",
  "Enterprise",
  "Transportation",
  "Industrial",
  "Physical AI",
  "Deep Tech",
  "AI Infrastructure",
] as const;

/** Theme chips — prefers firm-specific overrides when present. */
export function sectorFocusForDisplay(
  row: Pick<FreshCapitalFundRow, "firm_name" | "sector_focus" | "fund_name">,
): string[] {
  if (isHummingbirdInauguralGrowthFundDisplayCase(row)) {
    return [...HUMMINGBIRD_GROWTH_FUND_I_SECTOR_FOCUS_DISPLAY];
  }
  if (isKleinerPerkinsKP22DisplayCase(row)) {
    return [...KP22_SECTOR_FOCUS_DISPLAY];
  }
  if (isKpSelectIVDisplayCase(row)) {
    return [...KP_SELECT_IV_SECTOR_FOCUS_DISPLAY];
  }
  if (isAntlerUSFundIIDisplayCase(row)) {
    return [...ANTLER_US_FUND_II_SECTOR_FOCUS_DISPLAY];
  }
  if (isLuxCapitalIXDisplayCase(row)) {
    return [...LUX_CAPITAL_IX_SECTOR_FOCUS_DISPLAY];
  }
  if (isA16zAmericanDynamismFundDisplayCase(row)) {
    return [...A16Z_AMERICAN_DYNAMISM_SECTOR_FOCUS_DISPLAY];
  }
  const key = row.firm_name?.trim().toLowerCase();
  const override = key ? SECTOR_FOCUS_DISPLAY_OVERRIDE_BY_FIRM_NAME[key] : undefined;
  if (override?.length) return [...override];
  return (row.sector_focus ?? []).filter(Boolean).slice(0, 3);
}

export function formatFundSizeUsd(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${Math.round(value / 1e6)}M`;
  if (value >= 1e3) return `$${Math.round(value / 1e3)}K`;
  return `$${Math.round(value)}`;
}

/**
 * Display-name hints when `firm_domain` is still null (old RPC deploy, or sparse firm_records).
 * Keys are lowercased `firm_name` — used only to build favicon URLs, not as canonical identity.
 */
const FIRM_MARK_NAME_HINT_HOST: Record<string, string> = {
  accel: "accel.com",
  "accel partners": "accel.com",
  "andreessen horowitz": "a16z.com",
  a16z: "a16z.com",
  sequoia: "sequoiacap.com",
  "sequoia capital": "sequoiacap.com",
  benchmark: "benchmark.com",
  greylock: "greylock.com",
  "greylock partners": "greylock.com",
  "kleiner perkins": "kleinerperkins.com",
  lightspeed: "lsvp.com",
  "lightspeed venture partners": "lsvp.com",
  index: "indexventures.com",
  "index ventures": "indexventures.com",
  insight: "insightpartners.com",
  "insight partners": "insightpartners.com",
  founders: "foundersfund.com",
  "founders fund": "foundersfund.com",
  "general catalyst": "generalcatalyst.com",
  bessemer: "bvp.com",
  "bessemer venture partners": "bvp.com",
  nea: "nea.com",
  gv: "gv.com",
  "google ventures": "gv.com",
  "first round": "firstround.com",
  "first round capital": "firstround.com",
  eka: "ekavc.com",
  "eka ventures": "ekavc.com",
  usv: "usv.com",
  "union square ventures": "usv.com",
  "gradient ventures": "gradient.com",
};

/**
 * Curated VC Sheet marks pulled from `https://www.vcsheet.com/funds`.
 * We prefer these first when available because they are typically cleaner than generic favicon proxies.
 */
const VCSHEET_FUND_MARK_BY_NAME: Record<string, string> = {
  "andreessen horowitz": "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/693b180b9b8a6daa57ede490_a16z_logo%20(2).jpeg",
  a16z: "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/693b180b9b8a6daa57ede490_a16z_logo%20(2).jpeg",
  "black flag": "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/696b15cdb9f35449c9a1c3ad_BF%20Icon.webp",
  "deep checks": "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/686313c44d46c34b33c2a0da_DeepChecksIcon.webp",
  eka: "https://cdn.prod.website-files.com/68fb32edfd991098f5733b6b/690247c9911044cfc16d90e6_Eka_logo_white.svg",
  "eka ventures": "https://cdn.prod.website-files.com/68fb32edfd991098f5733b6b/690247c9911044cfc16d90e6_Eka_logo_white.svg",
  "fifty years": "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/693b189128e406d5ca9b6152_fifty_years_logo.jpeg",
  "founders fund": "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/693b18188940e0d554664262_1631346747811.jpeg",
  "harpoon ventures": "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/68631320a7cc6a93d2eb5c07_Harpoon%20Iocn.webp",
  "humba ventures": "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/693b187c5b40ee605330998b_humba_ventures_logo.jpeg",
  "julian capital": "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/693b18635f42e63bb1fa2e28_julian_capital_logo%20(1).jpeg",
  "kleiner perkins": "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/6981207af9befc5bbf7334a9_kleiner_perkins_logo.jpeg",
  lightspeed: "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/698120cac8462a0bf1b604c5_640262cd3052e2b11baa7735_jGxBqUKj_400x400.jpeg",
  "lightspeed venture partners": "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/698120cac8462a0bf1b604c5_640262cd3052e2b11baa7735_jGxBqUKj_400x400.jpeg",
  "sequoia capital": "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/693b184ce8d84123c1b26495_1638904115341.jpeg",
};

function firmMarkHintHostFromName(firmName: string | null | undefined): string | null {
  const k = firmName?.trim().toLowerCase();
  if (!k) return null;
  return FIRM_MARK_NAME_HINT_HOST[k] ?? null;
}

/** Prefer first non-empty string among alternate RPC key spellings (snake_case vs camelCase). */
function readStringAlt(r: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = readString(r[key]);
    if (v) return v;
  }
  return null;
}

function vcsheetFundMarkFromName(firmName: string | null | undefined): string | null {
  const k = firmName?.trim().toLowerCase();
  if (!k) return null;
  return VCSHEET_FUND_MARK_BY_NAME[k] ?? null;
}

function guessedHostsFromFirmName(firmName: string | null | undefined): string[] {
  const raw = firmName?.trim().toLowerCase() ?? "";
  if (!raw) return [];

  const cleaned = raw
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];

  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.length === 0) return [];

  const suffixes = new Set(["capital", "ventures", "venture", "partners", "management", "fund", "funds"]);
  const strippedTokens = tokens.filter((token) => !suffixes.has(token));
  const joined = tokens.join("");
  const strippedJoined = strippedTokens.join("");

  const bases = [joined, strippedJoined].filter((value, index, arr) => value && arr.indexOf(value) === index);
  const tlds = [".com", ".vc", ".ventures", ".capital"];
  const out: string[] = [];

  for (const base of bases) {
    for (const tld of tlds) {
      out.push(`${base}${tld}`);
    }
  }

  return out;
}

/** Same heuristic chain as favicon guesses — used only when RPC + `firm_records` lack a URL. */
export function firstGuessedFirmWebsiteFromName(firmName: string | null | undefined): string | null {
  for (const host of guessedHostsFromFirmName(firmName)) {
    if (host?.trim()) return `https://${host.trim()}`;
  }
  return null;
}

/**
 * After `get_new_vc_funds`, fill `firm_website_url` / `firm_domain` from `firm_records` only when the RPC
 * row did not already supply a website. Otherwise a stale `firm_records.website_url` would overwrite the
 * canonical URL from the fund pipeline (e.g. Kleiner Perkins correct in `get_new_vc_funds`, wrong in DB).
 */
async function hydrateFreshCapitalRowsWithFirmRecords(
  funds: FreshCapitalFundRow[],
): Promise<FreshCapitalFundRow[]> {
  if (!isSupabaseConfigured || funds.length === 0) return funds;

  const ids = [...new Set(funds.map((f) => f.firm_record_id).filter(Boolean))];
  if (ids.length === 0) return funds;

  const byId = new Map<string, string>();
  const chunkSize = 120;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabasePublicDirectory
      .from("firm_records")
      .select("id, website_url")
      .in("id", chunk)
      .is("deleted_at", null);

    if (error) {
      if (import.meta.env.DEV) console.warn("[FreshCapital] hydrate firm_records.website_url", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as { id: string; website_url: string | null };
      const w = typeof r.website_url === "string" ? r.website_url.trim() : "";
      if (w) byId.set(r.id, w);
    }
  }

  return funds.map((f) => {
    const canonical = byId.get(f.firm_record_id);
    if (!canonical) return f;

    const rpcAlreadyHasWebsite = Boolean(f.firm_website_url?.trim());
    if (rpcAlreadyHasWebsite) return f;

    const next: FreshCapitalFundRow = { ...f, firm_website_url: canonical };

    try {
      const href = /^https?:\/\//i.test(canonical)
        ? canonical
        : `https://${canonical.replace(/^\/+/, "")}`;
      next.firm_domain = new URL(href).hostname.replace(/^www\./i, "");
    } catch {
      /* keep RPC firm_domain when URL parse fails */
    }

    return next;
  });
}

/** Domain-style host for links and marks: DB domain, else curated name hints (e.g. sequoiacap.com). */
export function effectiveFirmMarkHost(row: Pick<FreshCapitalFundRow, "firm_domain" | "firm_name">): string | null {
  const fromDb = row.firm_domain?.trim().replace(/^www\./i, "");
  if (fromDb) return fromDb;
  return firmMarkHintHostFromName(row.firm_name);
}

/**
 * Ordered URLs to try for the Fresh Capital firm column:
 * 1. Curated VC Sheet mark when known
 * 2. logo.dev
 * 3. Google s2 favicon
 *
 * The UI falls back to the firm's first letter when all image candidates fail quality checks.
 */
export function firmMarkCandidateUrls(row: Pick<FreshCapitalFundRow, "firm_logo_url" | "firm_domain" | "firm_name">): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (u: string | null | undefined) => {
    const t = u?.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  push(vcsheetFundMarkFromName(row.firm_name));

  const host = effectiveFirmMarkHost(row);
  if (host) {
    push(`https://img.logo.dev/${encodeURIComponent(host)}?size=64&format=png&fallback=404`);
    push(`https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(host)}`);
  }

  for (const guessedHost of guessedHostsFromFirmName(row.firm_name)) {
    push(`https://img.logo.dev/${encodeURIComponent(guessedHost)}?size=64&format=png&fallback=404`);
    push(`https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(guessedHost)}`);
  }

  return out;
}

/** First candidate URL, or null (see {@link firmMarkCandidateUrls}). */
export function firmMarkImageSrc(row: Pick<FreshCapitalFundRow, "firm_logo_url" | "firm_domain" | "firm_name">): string | null {
  const urls = firmMarkCandidateUrls(row);
  return urls[0] ?? null;
}

export function formatAnnouncedDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Announced column — applies the same curated display fixes as {@link fundNameForDisplay} where needed. */
export function announcedDateForDisplay(
  row: Pick<FreshCapitalFundRow, "firm_name" | "fund_name" | "announced_date" | "close_date">,
): string {
  if (isHummingbirdInauguralGrowthFundDisplayCase(row)) return "March 16, 2026";
  if (isHummingbirdFundVIDisplayCase(row)) return "March 16, 2026";
  if (isKleinerPerkinsKP22DisplayCase(row)) return "March 24, 2026";
  const iso = row.announced_date ?? row.close_date ?? null;
  return formatAnnouncedDate(iso);
}

/** MandA coverage of Hummingbird’s raise (Growth Fund I ~$600M within $800M total). */
const HUMMINGBIRD_GROWTH_FUND_I_ANNOUNCEMENT_URL =
  "https://manda.be/articles/hummingbird-ventures-raises-800-million-dollars-to-back-misfit-founders-worldwide/";

/** Announcement link in the firm meta row — curated when ingestion points at the wrong article. */
export function announcementUrlForDisplay(
  row: Pick<FreshCapitalFundRow, "firm_name" | "fund_name" | "announcement_url">,
): string | null {
  if (isHummingbirdInauguralGrowthFundDisplayCase(row)) return HUMMINGBIRD_GROWTH_FUND_I_ANNOUNCEMENT_URL;
  if (isHummingbirdFundVIDisplayCase(row)) return HUMMINGBIRD_GROWTH_FUND_I_ANNOUNCEMENT_URL;
  const u = row.announcement_url?.trim();
  return u || null;
}

/**
 * Display-only row expansion (inject curated duplicates / corrections).
 * Keep this narrowly scoped to avoid hiding upstream data-quality issues.
 */
export function expandFreshCapitalRowsForDisplay(rows: FreshCapitalFundRow[]): FreshCapitalFundRow[] {
  const out: FreshCapitalFundRow[] = [];

  for (const row of rows) {
    out.push(row);

    if (isHummingbirdInauguralGrowthFundDisplayCase(row)) {
      out.push({
        ...row,
        vc_fund_id: `${row.vc_fund_id}::display-dup-fund-vi`,
        fund_name: "Fund VI",
        final_size_usd: 200_000_000,
        target_size_usd: 200_000_000,
        // Keep ISO for sorting; UI date is overridden to "March 16, 2026" above.
        announced_date: "2026-03-16",
        close_date: row.close_date,
        stage_focus: ["Pre-Seed", "Seed", "Series A"],
      });
    }
  }

  return out;
}

/** Spellings that refer to the United States — Fresh Capital geo chips show `U.S.` only (display-only). */
const US_GEO_FOCUS_LABEL_LC = new Set([
  "united states",
  "united states of america",
  "usa",
  "u.s.",
  "u.s.a.",
  "u.s.a",
  "us",
  "u.s",
]);

/**
 * Normalize one `geography_focus` entry for Fresh Capital geo chips.
 * Maps United States / U.S. / USA / US (whole chip) to **`U.S.`**; keeps `Global (…)` shortened to `Global`.
 */
export function normalizeGeoFocusDisplayChip(geo: string): string {
  const raw = geo.trim();
  if (!raw) return "";
  if (/^Global\s*\(/i.test(raw)) return "Global";
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (US_GEO_FOCUS_LABEL_LC.has(collapsed.toLowerCase())) return "U.S.";
  return collapsed;
}

/**
 * HQ location line only — from RPC `firm_location` (firm_records HQ / City, ST).
 * Never uses fund `geography_focus`.
 */
export function freshCapitalFirmLocationLine(row: Pick<FreshCapitalFundRow, "firm_location">): string | null {
  const t = row.firm_location?.trim();
  return t || null;
}

/** Firm meta row — aligns with canonical `firm_records` HQ when RPC lags a deploy. */
export function freshCapitalFirmLocationLineForDisplay(
  row: Pick<FreshCapitalFundRow, "firm_name" | "firm_location">,
): string | null {
  if (row.firm_name?.trim().toLowerCase() === HUMMINGBIRD_VENTURES_LC) return "London, U.K.";
  return freshCapitalFirmLocationLine(row);
}

/**
 * Investor modal / Connect tab — same curated HQ as {@link freshCapitalFirmLocationLineForDisplay} when DB sync lags or name matching fails.
 * Pass hero name, directory label, and `firm_records.firm_name` variants.
 */
export function curatedFirmHqLineForDirectoryName(
  ...nameCandidates: Array<string | null | undefined>
): string | null {
  for (const raw of nameCandidates) {
    const t = raw?.trim();
    if (!t) continue;
    const lc = t.toLowerCase();
    if (lc === HUMMINGBIRD_VENTURES_LC) return "London, U.K.";
    const compact = lc.replace(/[^a-z0-9]/g, "");
    if (compact === "hummingbirdventures") return "London, U.K.";
  }
  return null;
}

/** First URL used for the firm meta row website link — RPC field or curated fallback. */
export function freshCapitalFirmWebsiteLinkSource(
  row: Pick<FreshCapitalFundRow, "firm_name" | "firm_website_url" | "firm_domain">,
): string | null {
  if (row.firm_name?.trim().toLowerCase() === HUMMINGBIRD_VENTURES_LC) return "https://hummingbird.vc";
  return resolveDirectoryFirmWebsiteUrl({
    firmName: row.firm_name,
    firmRecordsWebsite: row.firm_website_url,
    vcDirectoryWebsite: row.firm_domain,
  });
}

/** Firm-level AUM (USD) for meta row (`firm_records.aum`) — curated when ingestion lags. */
export function freshCapitalFirmAumUsd(row: Pick<FreshCapitalFundRow, "firm_name" | "firm_aum_usd">): number | null {
  const key = row.firm_name?.trim().toLowerCase() ?? "";
  const override = key ? FIRM_AUM_USD_DISPLAY_OVERRIDE_LC[key] : undefined;
  if (override != null) return override;
  const v = row.firm_aum_usd;
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

function coerceFirmAumUsdNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.trim().replace(/[^0-9.\-eE]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Connect / investor panel hero AUM — same curated USD map as Fresh Capital when DB string is empty.
 * Falls back to a non-numeric display string when present.
 */
export function firmAumDisplayForInvestorPanel(firmName: string | null | undefined, aumRaw: unknown): string | null {
  const usd = freshCapitalFirmAumUsd({
    firm_name: firmName ?? "",
    firm_aum_usd: coerceFirmAumUsdNumber(aumRaw),
  });
  if (usd != null) return formatFundSizeUsd(usd);
  if (typeof aumRaw === "string" && aumRaw.trim()) return aumRaw.trim();
  return null;
}

/** Sort by recency, then firm priority rollup, then source confidence (ordering only — not displayed). */
export function sortFreshCapitalRows(rows: FreshCapitalFundRow[]): FreshCapitalFundRow[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.announced_date || a.close_date || "") || 0;
    const tb = Date.parse(b.announced_date || b.close_date || "") || 0;
    if (tb !== ta) return tb - ta;
    const pa = a.fresh_capital_priority_score ?? 0;
    const pb = b.fresh_capital_priority_score ?? 0;
    if (pb !== pa) return pb - pa;
    const ca = a.source_confidence ?? 0;
    const cb = b.source_confidence ?? 0;
    return cb - ca;
  });
}

export function isLikelyNewFundAnnouncement(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "announced" || s === "target" || s === "first_close";
}

/**
 * Fallback heatmap when `get_capital_heatmap_backend` is absent or empty.
 *
 * **Diff vs a proper backend heatmap:** this counts **rows** in the current `get_new_vc_funds`
 * result set and increments one per `sector_focus` tag (multi-tag funds contribute to multiple buckets).
 * It does not weight by fund size, geography, or time beyond whatever window the feed RPC used.
 * When `get_capital_heatmap_backend` exists, the UI uses that as the canonical source instead.
 */
export function aggregateSectorHeatmap(rows: FreshCapitalFundRow[], topN = 8): HeatmapBucket[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const raw of r.sector_focus ?? []) {
      const k = raw?.trim();
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);
  const max = sorted[0]?.[1] ?? 1;
  return sorted.map(([label, count]) => {
    const ratio = count / max;
    const tier: HeatmapBucket["tier"] = ratio >= 0.66 ? "high" : ratio >= 0.33 ? "moderate" : "low";
    return { label, count, intensity: ratio, tier };
  });
}

const DEMO_FUNDS: FreshCapitalFundRow[] = [
  {
    vc_fund_id: "00000000-0000-4000-8000-000000000001",
    firm_record_id: "00000000-0000-4000-8000-000000000011",
    firm_name: "Northline Ventures",
    fund_name: "Northline Fund IV",
    fund_type: "venture",
    fund_sequence_number: 4,
    vintage_year: 2026,
    announced_date: new Date().toISOString().slice(0, 10),
    close_date: null,
    target_size_usd: 4e8,
    final_size_usd: null,
    status: "announced",
    source_confidence: 0.82,
    announcement_url: null,
    announcement_title: "Northline Ventures announces $400M Fund IV to back AI infrastructure and devtools.",
    stage_focus: ["Seed", "Series A"],
    sector_focus: ["AI", "Developer Tools"],
    geography_focus: ["North America"],
    has_fresh_capital: true,
    fresh_capital_priority_score: 0.91,
    likely_actively_deploying: true,
    firm_logo_url: null,
    firm_domain: "northline.vc",
    firm_location: "London, UK",
    firm_website_url: "https://northline.vc",
    firm_aum_usd: 2e9,
  },
  {
    vc_fund_id: "00000000-0000-4000-8000-000000000002",
    firm_record_id: "00000000-0000-4000-8000-000000000012",
    firm_name: "Harbor Peak Capital",
    fund_name: "Harbor Peak Growth II",
    fund_type: "growth",
    fund_sequence_number: 2,
    vintage_year: 2026,
    announced_date: new Date(Date.now() - 864e5 * 4).toISOString().slice(0, 10),
    close_date: null,
    target_size_usd: null,
    final_size_usd: 1.1e9,
    status: "first_close",
    source_confidence: 0.77,
    announcement_url: null,
    announcement_title: null,
    stage_focus: ["Growth", "Series B+"],
    sector_focus: ["Climate", "Energy"],
    geography_focus: ["Global"],
    has_fresh_capital: true,
    fresh_capital_priority_score: 0.88,
    likely_actively_deploying: true,
    firm_logo_url: null,
    firm_domain: null,
    firm_location: "San Francisco, CA, US",
    firm_website_url: "https://harborpeak.com",
    firm_aum_usd: 8e9,
  },
  {
    vc_fund_id: "00000000-0000-4000-8000-000000000003",
    firm_record_id: "00000000-0000-4000-8000-000000000013",
    firm_name: "Relay Partners",
    fund_name: "Relay Seed III",
    fund_type: "venture",
    fund_sequence_number: 3,
    vintage_year: 2025,
    announced_date: new Date(Date.now() - 864e5 * 21).toISOString().slice(0, 10),
    close_date: null,
    target_size_usd: 1.2e8,
    final_size_usd: null,
    status: "announced",
    source_confidence: 0.74,
    announcement_url: null,
    announcement_title: "Relay closes first $120M tranche for seed-stage founders in fintech and commerce.",
    stage_focus: ["Seed", "Pre-Seed"],
    sector_focus: ["Fintech", "Consumer"],
    geography_focus: ["United States"],
    has_fresh_capital: true,
    fresh_capital_priority_score: 0.72,
    likely_actively_deploying: false,
    firm_logo_url: null,
    firm_domain: null,
    firm_location: "New York, NY, US",
    firm_website_url: "https://relaypartners.com",
    firm_aum_usd: 5e8,
  },
];

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
  return out.length ? out : null;
}

function readBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

function readFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function readInt(v: unknown): number | null {
  const n = readFiniteNumber(v);
  if (n == null) return null;
  return Math.trunc(n);
}

/** Defensive parse of one RPC row — drops malformed rows instead of crashing the page. */
export function parseFreshCapitalFundRow(raw: unknown): FreshCapitalFundRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const vc_fund_id = readString(r.vc_fund_id);
  const firm_record_id = readString(r.firm_record_id);
  const firm_name = readString(r.firm_name);
  const fund_name = readString(r.fund_name);
  if (!vc_fund_id || !firm_record_id || !firm_name || !fund_name) return null;

  return {
    vc_fund_id,
    firm_record_id,
    firm_name,
    fund_name,
    fund_type: readString(r.fund_type),
    fund_sequence_number: readInt(r.fund_sequence_number),
    vintage_year: readInt(r.vintage_year),
    announced_date: readString(r.announced_date),
    close_date: readString(r.close_date),
    target_size_usd: readFiniteNumber(r.target_size_usd),
    final_size_usd: readFiniteNumber(r.final_size_usd),
    status: readString(r.status),
    source_confidence: readFiniteNumber(r.source_confidence),
    announcement_url: readString(r.announcement_url),
    announcement_title: readString(r.announcement_title),
    stage_focus: readStringArray(r.stage_focus),
    sector_focus: readStringArray(r.sector_focus),
    geography_focus: readStringArray(r.geography_focus),
    has_fresh_capital: readBool(r.has_fresh_capital),
    fresh_capital_priority_score: readFiniteNumber(r.fresh_capital_priority_score),
    likely_actively_deploying: readBool(r.likely_actively_deploying),
    firm_logo_url: readStringAlt(r, "firm_logo_url", "firmLogoUrl"),
    firm_domain: readStringAlt(r, "firm_domain", "firmDomain"),
    firm_location: readStringAlt(r, "firm_location", "firmLocation"),
    firm_website_url: readStringAlt(r, "firm_website_url", "firmWebsiteUrl"),
    firm_aum_usd: readFiniteNumber(r.firm_aum_usd ?? r.firmAumUsd),
  };
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<{ data: T | null; error: Error | null }> {
  const res = await (supabasePublicDirectory as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: T | null; error: { message: string } | null }> }).rpc(
    name,
    args,
  );
  return { data: res.data ?? null, error: res.error ? new Error(res.error.message) : null };
}

export type FreshCapitalLivePayload = {
  funds: FreshCapitalFundRow[];
  heatmapFromRpc: HeatmapBucket[] | null;
  heatmapRpcError: Error | null;
};

function normalizeHeatmapRpcRows(data: unknown): HeatmapBucket[] | null {
  if (!Array.isArray(data)) return null;
  const normalized: HeatmapBucket[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const dimensionKind = readString(r.dimension_kind);
    if (dimensionKind && dimensionKind !== "sector") continue;
    const label =
      readString(r.dimension_value) ??
      readString(r.label) ??
      readString(r.sector) ??
      readString(r.bucket) ??
      readString(r.name) ??
      readString(r.sector_name);
    const countNum =
      readFiniteNumber(r.signal_count) ??
      readFiniteNumber(r.count) ??
      readFiniteNumber(r.fund_count) ??
      readFiniteNumber(r.n);
    const count = countNum != null && countNum > 0 ? Math.round(countNum) : 1;
    if (!label) continue;
    const act = (readString(r.activity) ?? readString(r.tier) ?? "").toLowerCase();
    let tier: HeatmapBucket["tier"] = "moderate";
    if (act.includes("high")) tier = "high";
    else if (act.includes("low")) tier = "low";
    normalized.push({ label, count, intensity: 0.5, tier });
  }
  if (!normalized.length) return null;
  const max = Math.max(...normalized.map((x) => x.count), 1);
  return normalized.map((x) => ({
    ...x,
    intensity: x.count / max,
  }));
}

export async function fetchFreshCapitalLive(input: {
  stage: FreshCapitalStageFilter;
  sector: string | null;
  fundLimit?: number;
  fundDays?: number;
}): Promise<FreshCapitalLivePayload> {
  if (!isSupabaseConfigured) {
    if (!isFreshCapitalDemoDataEnabled()) {
      throw new FreshCapitalMisconfiguredError();
    }
    let funds = [...DEMO_FUNDS];
    if (input.stage !== "all") {
      const need = new Set(stageFilterToRpcArray(input.stage) ?? []);
      funds = funds.filter((f) => (f.stage_focus ?? []).some((s) => need.has(s)));
    }
    if (input.sector) {
      funds = funds.filter((f) => (f.sector_focus ?? []).includes(input.sector));
    }
    return {
      funds: sortFreshCapitalRows(funds),
      heatmapFromRpc: null,
      heatmapRpcError: null,
    };
  }

  const p_stage = stageFilterToRpcArray(input.stage);
  const p_sector = input.sector ? [input.sector] : null;

  const fundArgs = {
    p_limit: input.fundLimit ?? 72,
    p_days: input.fundDays ?? 150,
    p_stage,
    p_sector,
    p_geography: null,
    p_fund_size_min: null,
    p_fund_size_max: null,
    p_firm_type: null,
  };

  const [fundsRes, heatmapRes] = await Promise.all([
    rpc<unknown[]>("get_new_vc_funds", fundArgs),
    rpc<unknown>("get_capital_heatmap_backend", { p_window_days: input.fundDays ?? 150 }),
  ]);

  if (fundsRes.error) {
    console.warn("[FreshCapital] get_new_vc_funds", fundsRes.error);
    throw fundsRes.error;
  }

  const parsed = (fundsRes.data ?? []).map(parseFreshCapitalFundRow).filter((x): x is FreshCapitalFundRow => Boolean(x));
  const hydrated = await hydrateFreshCapitalRowsWithFirmRecords(parsed);
  // Canonical RPC rows remain displayable even when announced/close dates are sparse; the UI
  // already degrades safely to "—" for date cells, so do not drop fresh-capital rows here.
  const funds = sortFreshCapitalRows(hydrated);

  const heatErr = heatmapRes.error;
  if (heatErr) {
    console.warn("[FreshCapital] get_capital_heatmap_backend", heatErr.message);
  }
  const heatBuckets = !heatmapRes.error ? normalizeHeatmapRpcRows(heatmapRes.data) : null;

  if (import.meta.env.DEV) {
    const outcome =
      heatBuckets && heatBuckets.length > 0
        ? `used_rpc_rows(count=${heatBuckets.length})`
        : heatErr
          ? `rpc_error(${heatErr.message})`
          : heatmapRes.data == null
            ? "rpc_null_body"
            : !Array.isArray(heatmapRes.data)
              ? "rpc_non_array_shape"
              : heatmapRes.data.length === 0
                ? "rpc_empty_array"
                : "rpc_unparsed_rows";
    // grep: [FreshCapital] heatmap_rpc — distinguishes heatmap data path per fetch (feed still loads if RPC fails).
    console.info(`[FreshCapital] heatmap_rpc ${outcome}`);
  }

  return {
    funds,
    heatmapFromRpc: heatBuckets && heatBuckets.length ? heatBuckets : null,
    heatmapRpcError: heatErr,
  };
}

function parseSectorOptionRpcRows(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const s = readString((row as Record<string, unknown>).sector);
    if (s) out.push(s);
  }
  return out;
}

/** Keeps the current filter value visible if it is not in the latest RPC list (stale cohort edge case). */
export function mergeSelectedSectorIntoChoices(choices: string[], selected: string | null): string[] {
  if (!selected) return choices;
  const t = selected.trim();
  if (!t) return choices;
  if (choices.some((s) => s === t)) return choices;
  return [t, ...choices];
}

/**
 * Distinct `sector_focus` tags from `get_new_vc_fund_sector_options` (same window/stage cohort as the feed RPC).
 * Falls back to an empty array on RPC error so callers can use `topSectorsForFilter` on fund rows.
 */
export async function fetchNewVcFundSectorOptions(input: {
  stage: FreshCapitalStageFilter;
  fundDays?: number;
  limit?: number;
}): Promise<string[]> {
  const fundDays = input.fundDays ?? 150;
  const limit = input.limit ?? 120;

  if (!isSupabaseConfigured) {
    if (!isFreshCapitalDemoDataEnabled()) return [];
    let funds = [...DEMO_FUNDS];
    if (input.stage !== "all") {
      const need = new Set(stageFilterToRpcArray(input.stage) ?? []);
      funds = funds.filter((f) => (f.stage_focus ?? []).some((s) => need.has(s)));
    }
    return topSectorsForFilter(funds, limit);
  }

  const p_stage = stageFilterToRpcArray(input.stage);
  const res = await rpc<unknown[]>("get_new_vc_fund_sector_options", {
    p_days: fundDays,
    p_stage,
    p_limit: limit,
  });
  if (res.error) {
    console.warn("[FreshCapital] get_new_vc_fund_sector_options", res.error);
    return [];
  }
  return parseSectorOptionRpcRows(res.data ?? []);
}

export function resolveFreshCapitalSectorChoices(input: {
  fromRpc: string[];
  fundRowsForFallback: FreshCapitalFundRow[];
  selectedSector: string | null;
  fallbackTopN?: number;
}): string[] {
  const base =
    input.fromRpc.length > 0
      ? input.fromRpc
      : topSectorsForFilter(input.fundRowsForFallback, input.fallbackTopN ?? 12);
  return mergeSelectedSectorIntoChoices(base, input.selectedSector);
}

export function topSectorsForFilter(rows: FreshCapitalFundRow[], limit = 10): string[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    for (const s of r.sector_focus ?? []) {
      const k = s?.trim();
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, limit);
}
