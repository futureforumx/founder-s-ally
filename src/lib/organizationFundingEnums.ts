/**
 * Canonical values for public.organizations funding signals (Network company cards + analytics).
 * Keep in sync with supabase/migrations/20260418140000_organizations_funding_enum_normalize.sql
 */

export const FUNDING_STATUS_VALUES = [
  "bootstrapped",
  "vc_backed",
  "acquired",
  "public",
  "unknown",
] as const;

export type FundingStatus = (typeof FUNDING_STATUS_VALUES)[number];

export const INVESTMENT_STAGE_VALUES = [
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "series_c_plus",
  "growth",
  "late_stage",
  "unknown",
] as const;

export type InvestmentStage = (typeof INVESTMENT_STAGE_VALUES)[number];

function safeLower(s: string | null | undefined): string {
  return typeof s === "string" ? s.trim().toLowerCase() : "";
}

/** Collapse free-text / legacy labels into fundingStatus enum. */
export function normalizeFundingStatus(raw: string | null | undefined): FundingStatus {
  const t = safeLower(raw).replace(/\s+/g, "_");
  if (!t || t === "unknown" || t === "—") return "unknown";
  if (t === "bootstrapped" || t === "bootstrap") return "bootstrapped";
  if (t === "vc_backed" || t === "vc-backed" || t === "vc" || t === "venture_backed") return "vc_backed";
  if (t === "angel_backed" || t === "angel") return "vc_backed";
  if (t === "grant_non_dilutive" || t === "grant" || t === "non_dilutive") return "bootstrapped";
  if (t === "acquired" || t === "m&a" || t === "ma") return "acquired";
  if (t === "public" || t === "ipo" || t === "listed") return "public";
  return "unknown";
}

const STAGE_RANK: Record<InvestmentStage, number> = {
  pre_seed: 1,
  seed: 2,
  series_a: 3,
  series_b: 4,
  series_c_plus: 5,
  growth: 6,
  late_stage: 7,
  unknown: 0,
};

/** Pick the numerically later stage (for merging multiple evidence strings). */
export function pickLaterInvestmentStage(a: InvestmentStage, b: InvestmentStage): InvestmentStage {
  return STAGE_RANK[a] >= STAGE_RANK[b] ? a : b;
}

/**
 * Map Crunchbase-style / UI / portfolio strings → investmentStage enum.
 * Returns unknown when no confident match.
 */
export function normalizeInvestmentStage(raw: string | null | undefined): InvestmentStage {
  const t = safeLower(raw).replace(/[\u2013\u2014]/g, "-");
  if (!t || t === "unknown" || t === "—" || t === "n/a") return "unknown";

  const compact = t.replace(/[\s_]+/g, "");

  if (/(^|[^a-z])pre[-]?seed([^a-z]|$)/i.test(t) || compact === "preseed") return "pre_seed";
  if (/(^|[^a-z])seed([^a-z]|$)/i.test(t) && !/pre/i.test(t)) return "seed";
  if (/series\s*f([^a-z]|$)/i.test(t)) return "seed";
  if (/series\s*a([^a-z]|$)/i.test(t)) return "series_a";
  if (/series\s*b\+?([^a-z]|$)/i.test(t)) return "series_b";
  if (/series\s*c\+?|series\s*[d-z]([^a-z]|$)/i.test(t)) return "series_c_plus";
  if (/\bgrowth\b/i.test(t)) return "growth";
  if (/\b(late|later)\s*stage\b/i.test(t) || /\blate[- ]stage\b/i.test(t)) return "late_stage";
  if (/\bearly[- ]?stage\b/i.test(t)) return "seed";

  return "unknown";
}

/** Map portfolio JSON investment_status → fundingStatus (best effort). */
export function fundingStatusFromPortfolioInvestmentStatus(raw: string | null | undefined): FundingStatus | null {
  const t = safeLower(raw);
  if (!t) return null;
  if (t === "ipo") return "public";
  if (t === "acquired") return "acquired";
  if (t === "active" || t === "exited" || t === "unknown") return null;
  return null;
}

const FUNDING_STATUS_TITLE: Record<FundingStatus, string> = {
  bootstrapped: "Bootstrapped",
  vc_backed: "VC-backed",
  acquired: "Acquired",
  public: "Public",
  unknown: "Unknown",
};

const INVESTMENT_STAGE_TITLE: Record<InvestmentStage, string> = {
  pre_seed: "Pre-seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c_plus: "Series C+",
  growth: "Growth",
  late_stage: "Late stage",
  unknown: "Unknown",
};

export function displayFundingStatus(fs: string | null | undefined, vcBacked: boolean | null | undefined): string {
  const norm = normalizeFundingStatus(fs);
  if (vcBacked === true && norm === "unknown") return FUNDING_STATUS_TITLE.vc_backed;
  if (vcBacked === false && norm === "unknown") return "Not VC-backed";
  return FUNDING_STATUS_TITLE[norm] ?? FUNDING_STATUS_TITLE.unknown;
}

export function displayInvestmentStage(code: string | null | undefined): string {
  if (code == null || !String(code).trim()) return INVESTMENT_STAGE_TITLE.unknown;
  const n = normalizeInvestmentStage(code);
  return INVESTMENT_STAGE_TITLE[n] ?? INVESTMENT_STAGE_TITLE.unknown;
}
