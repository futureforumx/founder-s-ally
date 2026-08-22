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
  strategic: "Growth",
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

export function splitSectorLabels(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const part of String(raw ?? "").split(/[;,|]/)) {
    const label = part.replace(/\s+/g, " ").trim();
    if (!label || label.toLowerCase() === "unknown") continue;
    const key = normalizeSectorLabel(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

/**
 * Normalized keys → single dropdown / filter / chip label (collapses near-duplicate sector strings).
 * Unknown keys fall through to the original trimmed label for display.
 */
const SECTOR_DISPLAY_BY_NORMALIZED: Record<string, string> = Object.freeze({
  ai: "AI",
  "ai / ml": "AI",
  "ai-ml": "AI",
  "ai ml": "AI",
  aiml: "AI",
  "artificial intelligence": "AI",
  "machine learning": "AI",
  ml: "AI",
  "generative ai": "AI",
  "gen ai": "AI",
  genai: "AI",
  llm: "AI",

  "fin tech": "Fintech",
  fintech: "Fintech",
  "financial technology": "Fintech",

  "dev tools": "Developer Tools",
  devtools: "Developer Tools",
  "developer tools": "Developer Tools",
  "developer tool": "Developer Tools",

  "health tech": "Healthcare",
  healthtech: "Healthcare",
  healthcare: "Healthcare",
  "health care": "Healthcare",
  "health / bio": "Healthcare",
  "health & bio": "Healthcare",

  crypto: "Crypto",
  web3: "Crypto",
  "crypto / web3": "Crypto",
  "web3 / crypto": "Crypto",

  security: "Cybersecurity",
  cybersecurity: "Cybersecurity",
  "cyber security": "Cybersecurity",
  "cyber-security": "Cybersecurity",

  ecommerce: "E-Commerce",
  "e commerce": "E-Commerce",
  "e-commerce": "E-Commerce",

  climate: "Climate",
  cleantech: "Climate",
  "climate tech": "Climate",
  climatetech: "Climate",

  "ed tech": "Edtech",
  edtech: "Edtech",
  "education technology": "Edtech",

  "prop tech": "Proptech",
  proptech: "Proptech",
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

/** Known tokens that should not be reduced to simple title case. */
const SECTOR_WORD_ACRONYMS: Record<string, string> = {
  ai: "AI",
  ml: "ML",
  saas: "SaaS",
  web3: "Web3",
  iot: "IoT",
  b2b: "B2B",
  b2c: "B2C",
  api: "API",
  ar: "AR",
  vr: "VR",
  hr: "HR",
  it: "IT",
  ui: "UI",
  ux: "UX",
};

function titleCaseSectorWord(word: string): string {
  const lower = word.toLowerCase();
  if (SECTOR_WORD_ACRONYMS[lower]) return SECTOR_WORD_ACRONYMS[lower];
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Title-case sector labels: first letter of each word, preserving AI / ML / SaaS-style tokens. */
export function titleCaseSectorLabel(raw: string): string {
  const spaced = tidySectorDisplay(raw).replace(/\s*\/\s*/g, " / ");
  if (!spaced) return spaced;
  return spaced
    .split(" ")
    .map((token) => {
      if (token === "/") return "/";
      return token.split("-").map(titleCaseSectorWord).join("-");
    })
    .join(" ");
}

/** Canonical label for dropdown display and persisted filter selection. */
export function canonicalSectorChoiceLabel(raw: string): string {
  const n = normalizeSectorLabel(raw);
  if (!n || n === "unknown") return titleCaseSectorLabel(tidySectorDisplay(raw));
  return titleCaseSectorLabel(SECTOR_DISPLAY_BY_NORMALIZED[n] ?? tidySectorDisplay(raw));
}

/** Dedupe sector strings by cluster key; returns sorted canonical labels for the dropdown. */
export function buildDedupedSectorChoices(rawLabels: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const raw of rawLabels) {
    for (const labelPart of splitSectorLabels(raw)) {
      const k = sectorClusterKey(labelPart);
      if (!k) continue;
      const label = canonicalSectorChoiceLabel(labelPart);
      if (!byKey.has(k)) byKey.set(k, label);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}

export function sectorLabelsForDisplay(raw: string | null | undefined): string[] {
  return canonicalSectorTagsForDisplay(splitSectorLabels(raw));
}

/** Collapse synonym sector strings (e.g. Artificial Intelligence → AI) and drop duplicate clusters. */
export function canonicalSectorTagsForDisplay(rawLabels: readonly string[]): string[] {
  const byKey = new Map<string, string>();
  const order: string[] = [];
  for (const raw of rawLabels) {
    for (const labelPart of splitSectorLabels(raw)) {
      const key = sectorClusterKey(labelPart);
      if (!key || byKey.has(key)) continue;
      const label = canonicalSectorChoiceLabel(labelPart);
      if (!label) continue;
      byKey.set(key, label);
      order.push(key);
    }
  }
  return order.map((key) => byKey.get(key)!);
}

function matchesSector(row: RecentFundingRound, sector: string | null): boolean {
  if (!sector?.trim()) return true;
  const fk = sectorClusterKey(sector);
  if (!fk) return true;
  return splitSectorLabels(row.sector).some((label) => sectorClusterKey(label) === fk);
}

export function sortFundingByAnnouncedDesc(rows: RecentFundingRound[]): RecentFundingRound[] {
  return sortFundingByAnnounced(rows, "newest");
}

export type LatestFundingDateSort = "newest" | "oldest";

export function sortFundingByAnnounced(
  rows: RecentFundingRound[],
  direction: LatestFundingDateSort,
): RecentFundingRound[] {
  const sign = direction === "oldest" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.announcedAt) || 0;
    const tb = Date.parse(b.announcedAt) || 0;
    return sign * (ta - tb);
  });
}

/** Parse labels like $45M, $500K, $1.2B, $12,000,000 into USD major units. */
export function parseAmountLabelToUsd(label: string | null | undefined): number | null {
  const t = String(label ?? "").replace(/,/g, "").replace(/\u00a0/g, " ").trim();
  if (!t || t === "—" || /^undisclosed$/i.test(t)) return null;
  const m = t.match(/\$?\s*([\d.]+)\s*([KMB]|million|billion)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suf = (m[2] ?? "").toLowerCase();
  let mult = 1;
  if (suf === "k") mult = 1_000;
  else if (suf === "m" || suf === "million") mult = 1_000_000;
  else if (suf === "b" || suf === "billion") mult = 1_000_000_000;
  return n * mult;
}

export function formatUsdCompact(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0";
  if (usd >= 1_000_000_000) {
    const v = usd / 1_000_000_000;
    return `$${v >= 10 ? Math.round(v) : Number(v.toFixed(1))}B`;
  }
  if (usd >= 1_000_000) {
    const v = usd / 1_000_000;
    return `$${v >= 10 ? Math.round(v) : Number(v.toFixed(1))}M`;
  }
  if (usd >= 1_000) {
    const v = usd / 1_000;
    return `$${v >= 10 ? Math.round(v) : Number(v.toFixed(1))}K`;
  }
  return `$${Math.round(usd)}`;
}

export function computeAmountBounds(rows: RecentFundingRound[]): { min: number; max: number } {
  let max = 0;
  for (const row of rows) {
    const usd = parseAmountLabelToUsd(row.amountLabel);
    if (usd != null && usd > max) max = usd;
  }
  if (max <= 0) max = 100_000_000;
  return { min: 0, max };
}

export function buildDedupedRoundChoices(rows: RecentFundingRound[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const label = formatRoundKind(row.roundKind).trim();
    if (!label || label === "—" || label.toLowerCase() === "unknown") continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function matchesSectors(row: RecentFundingRound, sectors: string[]): boolean {
  if (!sectors.length) return true;
  return sectors.some((sector) => matchesSector(row, sector));
}

function matchesRounds(row: RecentFundingRound, rounds: string[]): boolean {
  if (!rounds.length) return true;
  const label = formatRoundKind(row.roundKind).trim().toLowerCase();
  return rounds.some((round) => formatRoundKind(round).trim().toLowerCase() === label);
}

export type LatestFundingAmountPreset = "all" | "under_5m" | "5m_20m" | "20m_100m" | "100m_plus" | "custom";

export const LATEST_FUNDING_AMOUNT_PRESETS: { id: LatestFundingAmountPreset; label: string }[] = [
  { id: "all", label: "All Amounts" },
  { id: "under_5m", label: "< $5M" },
  { id: "5m_20m", label: "$5M – $20M" },
  { id: "20m_100m", label: "$20M – $100M" },
  { id: "100m_plus", label: "$100M+" },
  { id: "custom", label: "Custom" },
];

/** Bare numbers are treated as millions (5 → $5M); otherwise parse $45M / $500K. */
export function parseCustomAmountInput(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) ? n * 1_000_000 : null;
  }
  return parseAmountLabelToUsd(t);
}

export function matchesFundingSearch(row: RecentFundingRound, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    row.companyName,
    row.leadInvestor,
    ...(row.coInvestors ?? []),
    row.sector,
    row.roundKind,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function matchesUsdAmountPreset(
  usd: number | null,
  preset: LatestFundingAmountPreset,
  customMinUsd: number | null,
  customMaxUsd: number | null,
): boolean {
  if (preset === "all") return true;
  if (usd == null) return false;

  if (preset === "under_5m") return usd < 5_000_000;
  if (preset === "5m_20m") return usd >= 5_000_000 && usd <= 20_000_000;
  if (preset === "20m_100m") return usd >= 20_000_000 && usd <= 100_000_000;
  if (preset === "100m_plus") return usd >= 100_000_000;

  const minOk = customMinUsd == null || usd >= customMinUsd;
  const maxOk = customMaxUsd == null || usd <= customMaxUsd;
  if (customMinUsd == null && customMaxUsd == null) return true;
  return minOk && maxOk;
}

function matchesAmountPreset(
  row: RecentFundingRound,
  preset: LatestFundingAmountPreset,
  customMinUsd: number | null,
  customMaxUsd: number | null,
): boolean {
  return matchesUsdAmountPreset(parseAmountLabelToUsd(row.amountLabel), preset, customMinUsd, customMaxUsd);
}

export type LatestFundingTableFilters = {
  query: string;
  sectors: string[];
  rounds: string[];
  amountPreset: LatestFundingAmountPreset;
  customMinUsd: number | null;
  customMaxUsd: number | null;
  dateSort: LatestFundingDateSort;
};

export function applyLatestFundingTableFilters(rows: RecentFundingRound[], filters: LatestFundingTableFilters): RecentFundingRound[] {
  const filtered = rows.filter(
    (row) =>
      matchesFundingSearch(row, filters.query) &&
      matchesSectors(row, filters.sectors) &&
      matchesRounds(row, filters.rounds) &&
      matchesAmountPreset(row, filters.amountPreset, filters.customMinUsd, filters.customMaxUsd),
  );
  return sortFundingByAnnounced(filtered, filters.dateSort);
}

export function latestFundingFiltersAreDefault(filters: {
  query: string;
  sectors: string[];
  rounds: string[];
  amountPreset: LatestFundingAmountPreset;
  dateSort: LatestFundingDateSort;
}): boolean {
  return (
    !filters.query.trim() &&
    filters.sectors.length === 0 &&
    filters.rounds.length === 0 &&
    filters.amountPreset === "all" &&
    filters.dateSort === "newest"
  );
}

export function filterLatestFundingRows(
  rows: RecentFundingRound[],
  stage: FreshCapitalStageFilter,
  sector: string | null,
): RecentFundingRound[] {
  const filtered = rows.filter((r) => matchesStage(r, stage) && matchesSector(r, sector));
  return sortFundingByAnnouncedDesc(filtered);
}
