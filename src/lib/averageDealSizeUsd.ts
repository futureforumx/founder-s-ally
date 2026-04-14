import { safeTrim } from "@/lib/utils";

/**
 * Resolve average deal / check size in USD from firm DB fields, deals, partners, and text hints.
 */

export type AverageDealSizeSource =
  | "deals_avg"
  | "deals_yearly_trend"
  | "firm_check_range"
  | "partners_median"
  | "enrichment"
  | "directory_sweet_spot";

export interface FirmDealAmountRow {
  amount: string | null;
  date_announced?: string | null;
}

export interface FirmPartnerCheckRow {
  check_size_min?: number | null;
  check_size_max?: number | null;
  sweet_spot?: string | null;
}

function scaleUsd(n: number, suffix: string | undefined): number {
  const u = (suffix || "").toUpperCase();
  if (u === "K") return n * 1_000;
  if (u === "M") return n * 1_000_000;
  if (u === "B") return n * 1_000_000_000;
  return n;
}

/** Parses a single $-style amount like "$4M", "4.5m", "USD 12M" */
export function parseUsdAmount(raw: string | null | undefined): number | null {
  const str = safeTrim(raw);
  if (!str) return null;
  const s = str.replace(/,/g, " ").trim();
  const m = s.match(/\$?\s*([\d.]+)\s*([KMB])?\b/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  return scaleUsd(n, m[2]);
}

/**
 * Parses flexible investor copy: ranges like "$2M–$15M", "$500K to $3M",
 * or narrative strings by taking the first parseable range or amount.
 */
export function formatDealSizeDisplay(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

export function parseUsdFlexible(raw: string | null | undefined): number | null {
  const str = safeTrim(raw);
  if (!str) return null;
  const s = str.replace(/,/g, "").trim();

  const range = s.match(
    /\$?\s*([\d.]+)\s*([KMB])?\s*[-–—]\s*\$?\s*([\d.]+)\s*([KMB])?/i,
  );
  if (range) {
    const a = parseFloat(range[1]);
    const b = parseFloat(range[3]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return (scaleUsd(a, range[2]) + scaleUsd(b, range[4])) / 2;
    }
  }

  const to = s.match(/\$?\s*([\d.]+)\s*([KMB])?\s+to\s+\$?\s*([\d.]+)\s*([KMB])?/i);
  if (to) {
    const a = parseFloat(to[1]);
    const b = parseFloat(to[3]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return (scaleUsd(a, to[2]) + scaleUsd(b, to[4])) / 2;
    }
  }

  return parseUsdAmount(s);
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : ((a[mid - 1]! + a[mid]!) / 2);
}

function partnerTypicalUsd(p: FirmPartnerCheckRow): number | null {
  const spot = parseUsdFlexible(p.sweet_spot ?? null);
  if (spot != null) return spot;
  const min = p.check_size_min;
  const max = p.check_size_max;
  if (min != null && max != null && min > 0 && max >= min) return (min + max) / 2;
  if (min != null && min > 0) return min;
  if (max != null && max > 0) return max;
  return null;
}

export interface ResolveAverageDealSizeResult {
  valueUsd: number | null;
  source: AverageDealSizeSource | null;
  /** Normalized 0..1 heights for sparkline (left → right), or null if no chart */
  sparklineMultipliers: number[] | null;
  sparklineStartYear: number;
  sparklineEndYear: number;
  subtitle: string;
  dealSampleSize: number;
}

const SPARKYears = 6;

/** Build yearly averages from deals; forward-fill missing years inside window */
export function yearlyDealAverageMultipliers(
  deals: FirmDealAmountRow[],
  endYear: number,
): { multipliers: number[]; startYear: number; usedDeals: number } | null {
  const startYear = endYear - (SPARKYears - 1);
  const byYear = new Map<number, number[]>();

  let usedDeals = 0;
  for (const d of deals) {
    const amt = parseUsdAmount(d.amount);
    if (amt == null) continue;
    if (!safeTrim(d.date_announced)) continue;
    const y = new Date(d.date_announced).getFullYear();
    if (!Number.isFinite(y) || y < startYear || y > endYear) continue;
    usedDeals += 1;
    const list = byYear.get(y) ?? [];
    list.push(amt);
    byYear.set(y, list);
  }

  if (usedDeals < 2) return null;

  const avgs: number[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const list = byYear.get(y);
    if (list?.length) {
      avgs.push(list.reduce((a, b) => a + b, 0) / list.length);
    } else {
      avgs.push(NaN);
    }
  }

  let last: number | null = null;
  for (let i = 0; i < avgs.length; i++) {
    if (!Number.isNaN(avgs[i])) last = avgs[i]!;
    else if (last != null) avgs[i] = last;
  }
  for (let i = avgs.length - 1; i >= 0; i--) {
    if (!Number.isNaN(avgs[i])) last = avgs[i]!;
    else if (last != null) avgs[i] = last;
  }
  if (avgs.some((v) => Number.isNaN(v))) return null;

  const minV = Math.min(...avgs);
  const maxV = Math.max(...avgs);
  const spread = maxV - minV;
  if (spread < Math.max(maxV * 0.02, 1)) {
    return { multipliers: avgs.map(() => 0.55), startYear, usedDeals };
  }
  const span = spread;
  const multipliers = avgs.map((v) => 0.15 + ((v - minV) / span) * 0.85);
  return { multipliers, startYear, usedDeals };
}

export function resolveAverageDealSize(input: {
  deals?: FirmDealAmountRow[] | null;
  firmMinUsd?: number | null;
  firmMaxUsd?: number | null;
  partners?: FirmPartnerCheckRow[] | null;
  typicalCheckHint?: string | null;
  directorySweetSpot?: string | null;
}): ResolveAverageDealSizeResult {
  const endYear = new Date().getFullYear();
  const startYear = endYear - (SPARKYears - 1);
  const deals = input.deals ?? [];

  const parsedDe = deals
    .map((d) => parseUsdAmount(d.amount))
    .filter((n): n is number => n != null);

  const yearly = yearlyDealAverageMultipliers(deals, endYear);

  if (yearly && yearly.multipliers.length === SPARKYears) {
    const windowAmounts = deals.flatMap((d) => {
      const amt = parseUsdAmount(d.amount);
      if (amt == null || !safeTrim(d.date_announced)) return [];
      const y = new Date(d.date_announced).getFullYear();
      if (!Number.isFinite(y) || y < yearly.startYear || y > endYear) return [];
      return [amt];
    });
    const valueUsd =
      windowAmounts.length > 0
        ? windowAmounts.reduce((a, b) => a + b, 0) / windowAmounts.length
        : parsedDe.length > 0
          ? parsedDe.reduce((a, b) => a + b, 0) / parsedDe.length
          : null;
    return {
      valueUsd,
      source: "deals_yearly_trend",
      sparklineMultipliers: yearly.multipliers,
      sparklineStartYear: yearly.startYear,
      sparklineEndYear: endYear,
      subtitle: `${yearly.usedDeals} disclosed rounds (${yearly.startYear}–${endYear})`,
      dealSampleSize: yearly.usedDeals,
    };
  }

  if (parsedDe.length > 0) {
    const valueUsd = parsedDe.reduce((a, b) => a + b, 0) / parsedDe.length;
    return {
      valueUsd,
      source: "deals_avg",
      sparklineMultipliers: null,
      sparklineStartYear: startYear,
      sparklineEndYear: endYear,
      subtitle:
        parsedDe.length === 1 ? "1 round with disclosed size" : `Avg. of ${parsedDe.length} rounds with size`,
      dealSampleSize: parsedDe.length,
    };
  }

  const min = input.firmMinUsd;
  const max = input.firmMaxUsd;
  if (min != null && max != null && min > 0 && max >= min) {
    return {
      valueUsd: (min + max) / 2,
      source: "firm_check_range",
      sparklineMultipliers: null,
      sparklineStartYear: startYear,
      sparklineEndYear: endYear,
      subtitle: "Typical check (firm record)",
      dealSampleSize: 0,
    };
  }
  if (min != null && min > 0) {
    return {
      valueUsd: min,
      source: "firm_check_range",
      sparklineMultipliers: null,
      sparklineStartYear: startYear,
      sparklineEndYear: endYear,
      subtitle: "Minimum check (firm record)",
      dealSampleSize: 0,
    };
  }
  if (max != null && max > 0) {
    return {
      valueUsd: max,
      source: "firm_check_range",
      sparklineMultipliers: null,
      sparklineStartYear: startYear,
      sparklineEndYear: endYear,
      subtitle: "Maximum check (firm record)",
      dealSampleSize: 0,
    };
  }

  const partnerVals = (input.partners ?? [])
    .map(partnerTypicalUsd)
    .filter((n): n is number => n != null);
  const partnerMed = median(partnerVals);
  if (partnerMed != null) {
    return {
      valueUsd: partnerMed,
      source: "partners_median",
      sparklineMultipliers: null,
      sparklineStartYear: startYear,
      sparklineEndYear: endYear,
      subtitle: `Median of ${partnerVals.length} partner mandate${partnerVals.length === 1 ? "" : "s"}`,
      dealSampleSize: 0,
    };
  }

  const enrich = parseUsdFlexible(input.typicalCheckHint ?? null);
  if (enrich != null) {
    return {
      valueUsd: enrich,
      source: "enrichment",
      sparklineMultipliers: null,
      sparklineStartYear: startYear,
      sparklineEndYear: endYear,
      subtitle: "From enrichment research",
      dealSampleSize: 0,
    };
  }

  const sweet = parseUsdFlexible(input.directorySweetSpot ?? null);
  if (sweet != null) {
    return {
      valueUsd: sweet,
      source: "directory_sweet_spot",
      sparklineMultipliers: null,
      sparklineStartYear: startYear,
      sparklineEndYear: endYear,
      subtitle: "Directory sweet spot",
      dealSampleSize: 0,
    };
  }

  return {
    valueUsd: null,
    source: null,
    sparklineMultipliers: null,
    sparklineStartYear: startYear,
    sparklineEndYear: endYear,
    subtitle: "No check size or deal data yet",
    dealSampleSize: 0,
  };
}

/** Decorative gentle uptrend when we have a scalar but no time series */
export const SPARKLINE_FALLBACK_MULTIPLIERS = [0.68, 0.72, 0.78, 0.84, 0.91, 1.0];
