import type { FreshCapitalStageFilter } from "@/lib/freshCapitalPublic";
import type { RecentFundingRound } from "@/lib/recentFundingSeed";

/**
 * Converts raw DB round_kind values (snake_case or mixed) to display labels.
 * e.g. "series_a" → "Series A", "pre_seed" → "Pre-Seed", "Series B" → "Series B"
 */
const ROUND_KIND_DISPLAY: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c: "Series C",
  series_d: "Series D",
  series_e: "Series E",
  series_f: "Series F",
  growth: "Growth",
  strategic: "Strategic",
  venture: "Venture",
  angel: "Angel",
  bridge: "Bridge",
  convertible: "Convertible Note",
  safe: "SAFE",
  ipo: "IPO",
  secondary: "Secondary",
};

export function formatRoundKind(raw: string): string {
  if (!raw) return raw;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ROUND_KIND_DISPLAY[key] ?? raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Maps free-text round labels to the same coarse buckets as the Fresh Capital stage chips.
 * Kept intentionally conservative on substrings (e.g. avoids classifying "venture debt" as growth).
 */
export function roundKindStageBucket(kind: string): "seed" | "series_a" | "growth" | "other" {
  const k = kind.toLowerCase().replace(/\s+/g, " ").trim();
  if (!k) return "other";

  if (/\bseries\s*a\b/.test(k)) return "series_a";

  if (/\bseries\s*[b-z]\b/i.test(k)) return "growth";

  if (/\bgrowth\b/.test(k) || /\blate\b/.test(k) || /\bexpansion\b/.test(k) || /\bstrategic\b/.test(k)) {
    return "growth";
  }

  if (k === "venture" || /\bventure\s+round\b/.test(k)) return "growth";

  if (/\bcorporate\s+venture\b/.test(k) || /\bcvc\b/.test(k)) return "growth";

  if (/\bpre[- ]seed\b/.test(k) || /\bseed\s*\+\b/.test(k) || /\bseed\s*extension\b/.test(k)) return "seed";

  if (/\bseed\b/.test(k) && !/\bseries\b/.test(k)) return "seed";

  if (/\bangel\b/.test(k)) return "seed";

  if (/\bipo\b/.test(k) || /\bpublic\s+offering\b/.test(k)) return "growth";

  // Common ingest labels that sit in “other” but map cleanly to stage buckets
  if (/\bsafe\b/.test(k) || /\bsimple agreement\b/.test(k)) return "seed";
  if (/\bconvertible\b/.test(k)) return "seed";
  if (/\bbridge\b/.test(k)) return "seed";
  if (/\bfriends\b.*\bfamily\b|\bf&f\b/i.test(k)) return "seed";
  if (/\bgrant\b/.test(k)) return "seed";

  if (/\bsecondary\b/.test(k)) return "growth";
  if (/\bfollow[- ]on\b/.test(k)) return "growth";

  return "other";
}

function matchesStage(row: RecentFundingRound, stage: FreshCapitalStageFilter): boolean {
  if (stage === "all") return true;
  const bucket = roundKindStageBucket(row.roundKind);
  if (stage === "seed") return bucket === "seed";
  if (stage === "series_a") return bucket === "series_a";
  if (stage === "growth") return bucket === "growth";
  return true;
}

/** Aligns RPC / UI sector strings for filter matching (slash spacing, case, whitespace). */
export function normalizeSectorLabel(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalized keys → single dropdown / filter label (collapses near-duplicate sector strings).
 * Unknown keys fall through to the original trimmed label for display.
 */
const SECTOR_DISPLAY_BY_NORMALIZED: Record<string, string> = Object.freeze({
  ai: "AI / ML",
  "ai / ml": "AI / ML",
  "artificial intelligence": "AI / ML",

  "fin tech": "Fintech",
  fintech: "Fintech",
  "financial technology": "Fintech",

  "dev tools": "DevTools",
  devtools: "DevTools",
  "developer tools": "DevTools",

  "health tech": "Healthcare",
  healthcare: "Healthcare",
  "health care": "Healthcare",
  biotech: "Healthcare",
  biotechnology: "Healthcare",

  crypto: "Crypto",
  web3: "Crypto",

  security: "Cybersecurity",
  cybersecurity: "Cybersecurity",

  ecommerce: "E-commerce",
  "e commerce": "E-commerce",
  "e-commerce": "E-commerce",

  climate: "Climate",
  cleantech: "Climate",
});

/** Stable key for deduping and filter equality (always normalized lowercase). */
export function sectorClusterKey(raw: string): string {
  const n = normalizeSectorLabel(raw);
  if (!n || n === "unknown") return "";
  const mapped = SECTOR_DISPLAY_BY_NORMALIZED[n];
  return mapped ? normalizeSectorLabel(mapped) : n;
}

function tidySectorDisplay(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Canonical label for dropdown display and persisted filter selection. */
export function canonicalSectorChoiceLabel(raw: string): string {
  const n = normalizeSectorLabel(raw);
  if (!n || n === "unknown") return tidySectorDisplay(raw);
  return SECTOR_DISPLAY_BY_NORMALIZED[n] ?? tidySectorDisplay(raw);
}

/** Dedupe sector strings by cluster key; returns sorted canonical labels for the dropdown. */
export function buildDedupedSectorChoices(rawLabels: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const raw of rawLabels) {
    const k = sectorClusterKey(raw);
    if (!k) continue;
    const label = canonicalSectorChoiceLabel(raw);
    if (!byKey.has(k)) byKey.set(k, label);
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}

function matchesSector(row: RecentFundingRound, sector: string | null): boolean {
  if (!sector?.trim()) return true;
  const rk = sectorClusterKey(row.sector);
  const fk = sectorClusterKey(sector);
  return Boolean(rk && fk && rk === fk);
}

export function sortFundingByAnnouncedDesc(rows: RecentFundingRound[]): RecentFundingRound[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.announcedAt) || 0;
    const tb = Date.parse(b.announcedAt) || 0;
    return tb - ta;
  });
}

export function filterLatestFundingRows(
  rows: RecentFundingRound[],
  stage: FreshCapitalStageFilter,
  sector: string | null,
): RecentFundingRound[] {
  const filtered = rows.filter((r) => matchesStage(r, stage) && matchesSector(r, sector));
  return sortFundingByAnnouncedDesc(filtered);
}
