/**
 * scoring.ts — Confidence scoring for extracted values and match decisions.
 */

import type { SourceName } from "./types";

/** Base confidence per source (before field-specific adjustments). */
const BASE_CONFIDENCE: Record<SourceName, number> = {
  website:          0.90,
  crunchbase:       0.85,
  cbinsights:       0.85,
  tracxn:           0.75,
  openvc:           0.80,
  signal_nfx:       0.70,
  vcsheet:          0.65,
  startups_gallery: 0.60,
  medium:           0.55,
  substack:         0.55,
  linkedin:         0.60,
  angellist:        0.50,
  wellfound:        0.50,
  classification:   0.70, // derived values have moderate confidence
};

export function baseConfidence(source: SourceName): number {
  return BASE_CONFIDENCE[source] ?? 0.5;
}

/**
 * Scores the likelihood that a scraped entity is the same as the requested
 * firm. Used to reject false positives during URL discovery.
 *
 * Inputs:
 *   expectedName    – canonical firm name we're looking for
 *   foundName       – name as it appears on the source page
 *   expectedDomain  – domain we expect (from firm_records.website_url)
 *   foundDomain     – domain as it appears on the source profile
 *
 * Returns 0 (no match) – 1 (perfect match).
 */
export function matchScore(opts: {
  expectedName: string;
  foundName?: string | null;
  expectedDomain?: string | null;
  foundDomain?: string | null;
}): number {
  const { expectedName, foundName, expectedDomain, foundDomain } = opts;

  let score = 0;

  if (foundName) {
    const n1 = normalize(expectedName);
    const n2 = normalize(foundName);
    if (n1 === n2) score += 0.6;
    else if (n1 && n2 && (n1.includes(n2) || n2.includes(n1))) score += 0.45;
    else score += jaroWinkler(n1, n2) * 0.5;
  }

  if (expectedDomain && foundDomain) {
    const d1 = stripWww(expectedDomain);
    const d2 = stripWww(foundDomain);
    if (d1 === d2) score += 0.5;
    else if (d1 && d2 && (d1.endsWith(d2) || d2.endsWith(d1))) score += 0.25;
  } else if (foundName && !foundDomain) {
    // name-only match can still be valid but cap confidence
    score = Math.min(score, 0.65);
  }

  return Math.min(1, score);
}

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(llc|lp|ltd|inc|capital|ventures?|partners?|fund|management)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWww(host: string | null | undefined): string {
  return (host ?? "").toLowerCase().replace(/^www\./, "");
}

/** Jaro-Winkler similarity — pure function, 0–1. */
export function jaroWinkler(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end   = Math.min(s2.length, i + matchWindow + 1);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const m = matches;
  const jaro = (m / s1.length + m / s2.length + (m - transpositions / 2) / m) / 3;
  // Winkler: bonus for common prefix up to 4 chars
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}
