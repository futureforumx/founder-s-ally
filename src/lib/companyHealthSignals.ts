import type { AnalysisResult } from "@/components/company-profile/types";
import type { IntelligenceSummaryStrip } from "@/lib/intelligenceFeedApi";

export type TopNavView =
  | "company"
  | "dashboard"
  | "industry"
  | "competitive"
  | "audit"
  | "benchmarks"
  | "market-intelligence"
  | "market-investors"
  | "market-market"
  | "market-tech"
  | "market-network"
  | "market-data-room"
  | "investors"
  | "investor-search"
  | "network"
  | "directory"
  | "connections"
  | "messages"
  | "events"
  | "competitors"
  | "sector"
  | "groups"
  | "data-room"
  | "workspace"
  | "resources"
  | "settings";

export type HealthDriverFamily = "market" | "financial" | "gtm" | "defensibility";

export interface DriverSignal {
  id: string;
  label: string;
  impact: number;
  family: HealthDriverFamily;
}

export interface CompanyHealthSnapshot {
  score: number;
  trendPct: number;
  drivers: DriverSignal[];
  sparkline: number[];
  marketPosition: number;
  financialHealth: number;
  gtmStrength: number;
  defensibility: number;
  updatedAt: number;
}

export interface DeriveCompanyHealthParams {
  score?: number | null;
  stage?: string | null;
  sector?: string | null;
  activeView: TopNavView;
  tick?: number;
  summary?: IntelligenceSummaryStrip | null;
  analysisResult?: AnalysisResult | null;
}

export const COMPANY_HEALTH_CACHE_KEY = "vekta-topnav-company-health-v2";
export const COMPANY_HEALTH_SIGNAL_EVENT = "company-health-signals-updated";

const DEFAULT_SUMMARY: IntelligenceSummaryStrip = {
  highSignal24h: 0,
  investorActivity: 0,
  competitorMoves: 0,
  peopleMoves: 0,
  newFunds: 0,
  productLaunches: 0,
  regulatory: 0,
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toPct(value: number) {
  return Math.round(value * 10) / 10;
}

function seedFrom(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function jitter(seed: number, index: number, spread: number) {
  return Math.sin((seed + index * 73) * 0.0019) * spread;
}

function parseMetricValue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.toLowerCase().replace(/,/g, "").trim();
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  if (Number.isNaN(n)) return null;
  if (cleaned.includes("k")) return n * 1_000;
  if (cleaned.includes("m")) return n * 1_000_000;
  return n;
}

function normalizeMetricBand(value: number | null, min: number, max: number) {
  if (value == null) return 50;
  if (max <= min) return 50;
  const normalized = ((value - min) / (max - min)) * 100;
  return clampScore(normalized);
}

export function deriveCompanyHealthSignals({
  score,
  stage,
  sector,
  activeView,
  tick = 0,
  summary,
  analysisResult,
}: DeriveCompanyHealthParams): CompanyHealthSnapshot {
  const base = clampScore(score ?? 58);
  const intelligence = summary ?? DEFAULT_SUMMARY;
  const seed = seedFrom(`${base}-${stage ?? ""}-${sector ?? ""}-${activeView}`);

  const mrr = parseMetricValue(analysisResult?.metrics?.mrr?.value);
  const burn = parseMetricValue(analysisResult?.metrics?.burnRate?.value);
  const runway = parseMetricValue(analysisResult?.metrics?.runway?.value);
  const cac = parseMetricValue(analysisResult?.metrics?.cac?.value);
  const ltv = parseMetricValue(analysisResult?.metrics?.ltv?.value);

  const companyMetricStrength = clampScore(
    normalizeMetricBand(mrr, 10_000, 300_000) * 0.35 +
      normalizeMetricBand(runway, 6, 30) * 0.25 +
      normalizeMetricBand(ltv, 3_000, 60_000) * 0.2 +
      (100 - normalizeMetricBand(cac, 800, 18_000)) * 0.1 +
      (100 - normalizeMetricBand(burn, 50_000, 2_000_000)) * 0.1,
  );

  const competitorPerformance = clampScore(
    35 + intelligence.competitorMoves * 5 + intelligence.productLaunches * 3 + jitter(seed, tick + 1, 5),
  );
  const fundingEnvironment = clampScore(
    42 + intelligence.investorActivity * 4 + intelligence.newFunds * 4 + jitter(seed, tick + 2, 5),
  );
  const hiringSignals = clampScore(45 + intelligence.peopleMoves * 5 + jitter(seed, tick + 3, 6));
  const marketSignals = clampScore(
    46 + intelligence.productLaunches * 4 + intelligence.regulatory * 3 + jitter(seed, tick + 4, 6),
  );
  const gtmSignals = clampScore(
    companyMetricStrength * 0.45 + marketSignals * 0.3 + fundingEnvironment * 0.25 + jitter(seed, tick + 5, 4),
  );
  const burnPressure = clampScore(100 - companyMetricStrength + jitter(seed, tick + 6, 5));

  const trendPoints =
    companyMetricStrength * 0.25 +
    marketSignals * 0.18 +
    gtmSignals * 0.2 +
    hiringSignals * 0.14 +
    fundingEnvironment * 0.14 -
    competitorPerformance * 0.17 -
    burnPressure * 0.1;
  const trendPct = Math.max(-12, Math.min(12, toPct((trendPoints - 50) / 4.5)));

  const drivers: DriverSignal[] = [
    {
      id: "company-metrics",
      family: "financial",
      label:
        companyMetricStrength >= 55
          ? "Core company metrics strengthening"
          : "Core company metrics below benchmark",
      impact: toPct((companyMetricStrength - 50) / 4),
    },
    {
      id: "competitor-performance",
      family: "market",
      label:
        competitorPerformance >= 56
          ? "Competitor performance accelerating"
          : "Competitor pressure softening",
      impact: toPct((52 - competitorPerformance) / 4),
    },
    {
      id: "funding-environment",
      family: "market",
      label:
        fundingEnvironment >= 53
          ? "Funding environment improving"
          : "Funding environment tightening",
      impact: toPct((fundingEnvironment - 50) / 4),
    },
    {
      id: "hiring-signal",
      family: "defensibility",
      label:
        hiringSignals >= 53
          ? "Hiring signals support execution velocity"
          : "Hiring signals suggest execution risk",
      impact: toPct((hiringSignals - 50) / 4),
    },
    {
      id: "gtm-efficiency",
      family: "gtm",
      label:
        gtmSignals >= 54
          ? "GTM efficiency improving"
          : "GTM efficiency needs correction",
      impact: toPct((gtmSignals - 50) / 4),
    },
    {
      id: "burn-pressure",
      family: "financial",
      label:
        burnPressure >= 56
          ? "Burn rate above benchmark"
          : "Burn rate tracking inside benchmark",
      impact: toPct((50 - burnPressure) / 4),
    },
  ];

  const orderedDrivers = [...drivers].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  const sparkline = Array.from({ length: 18 }).map((_, i) => {
    const seasonal = Math.sin((i + seed % 5) * 0.48) * 2.4;
    const linear = (trendPct / 18) * i;
    const noise = jitter(seed, i + tick, 1.8);
    return clampScore(base - 9 + linear + seasonal + noise);
  });

  return {
    score: base,
    trendPct,
    drivers: orderedDrivers,
    sparkline,
    marketPosition: clampScore(marketSignals * 0.62 + (100 - competitorPerformance) * 0.38),
    financialHealth: clampScore(companyMetricStrength * 0.65 + (100 - burnPressure) * 0.35),
    gtmStrength: clampScore(gtmSignals * 0.7 + companyMetricStrength * 0.3),
    defensibility: clampScore(hiringSignals * 0.55 + (100 - competitorPerformance) * 0.45),
    updatedAt: Date.now(),
  };
}

export function getCachedCompanyHealthSignals(): CompanyHealthSnapshot | null {
  try {
    const raw = localStorage.getItem(COMPANY_HEALTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CompanyHealthSnapshot;
    if (typeof parsed?.score !== "number" || typeof parsed?.trendPct !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function publishCompanyHealthSignals(snapshot: CompanyHealthSnapshot): void {
  try {
    localStorage.setItem(COMPANY_HEALTH_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore cache write failures.
  }
  window.dispatchEvent(new CustomEvent(COMPANY_HEALTH_SIGNAL_EVENT, { detail: snapshot }));
}

export function companyHealthStatus(score: number): {
  border: string;
  bg: string;
  text: string;
  dot: string;
  label: string;
} {
  if (score >= 70) {
    return {
      border: "border-emerald-500/40",
      bg: "bg-emerald-500/10",
      text: "text-emerald-600",
      dot: "bg-emerald-500",
      label: "Healthy",
    };
  }
  if (score >= 40) {
    return {
      border: "border-amber-500/40",
      bg: "bg-amber-500/10",
      text: "text-amber-600",
      dot: "bg-amber-500",
      label: "Watch",
    };
  }
  return {
    border: "border-rose-500/40",
    bg: "bg-rose-500/10",
    text: "text-rose-600",
    dot: "bg-rose-500",
    label: "Critical",
  };
}