/**
 * Fund name normalization and matching.
 *
 * Handles:
 *  - Roman numeral ↔ arabic conversion (I–XX)
 *  - LP / LLC / Inc / Ltd / Corp suffix removal
 *  - "Fund" prefix/suffix canonicalization
 *  - Punctuation, whitespace, and case normalization
 *  - Fuzzy matching with configurable threshold
 */

// ---------------------------------------------------------------------------
// Roman ↔ Arabic
// ---------------------------------------------------------------------------

const ROMAN_TO_ARABIC: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
  XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15, XVI: 16, XVII: 17, XVIII: 18,
  XIX: 19, XX: 20,
};

const ARABIC_TO_ROMAN: Record<number, string> = Object.fromEntries(
  Object.entries(ROMAN_TO_ARABIC).map(([r, a]) => [a, r])
);

/**
 * Convert roman numerals in a string to arabic (e.g. "Fund III" → "Fund 3").
 * Only matches standalone roman numerals (word boundaries).
 */
function romanToArabic(s: string): string {
  // Match standalone roman numerals (I, II, III, IV, V, ... XX)
  // Sort by length descending so "XVIII" matches before "X"
  const romanPattern = Object.keys(ROMAN_TO_ARABIC)
    .sort((a, b) => b.length - a.length)
    .join("|");
  const re = new RegExp(`\\b(${romanPattern})\\b`, "g");
  return s.replace(re, (match) => String(ROMAN_TO_ARABIC[match] ?? match));
}

/**
 * Convert arabic numerals in a string to roman (e.g. "Fund 3" → "Fund III").
 * Only matches standalone numbers 1–20.
 */
export function arabicToRoman(s: string): string {
  return s.replace(/\b(\d{1,2})\b/g, (match) => {
    const n = parseInt(match, 10);
    return ARABIC_TO_ROMAN[n] ?? match;
  });
}

// ---------------------------------------------------------------------------
// Suffix / noise removal
// ---------------------------------------------------------------------------

/** Legal entity suffixes to strip. */
const LEGAL_SUFFIXES = /\b(l\.?p\.?|llc|llp|inc\.?|ltd\.?|corp\.?|co\.?|plc|s\.?a\.?|gmbh|n\.?v\.?|b\.?v\.?|s\.?à\.?r\.?l\.?|pte\.?)\b/gi;

/** "Fund" as a standalone word is sometimes redundant noise. */
const FUND_NOISE = /\bfund\b/gi;

/** Ordinal suffixes: 1st, 2nd, 3rd, 4th, etc. → bare number */
const ORDINAL_RE = /\b(\d+)(?:st|nd|rd|th)\b/gi;

// ---------------------------------------------------------------------------
// Core normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a fund name for dedup matching.
 *
 * Steps:
 *  1. Lowercase
 *  2. Convert roman numerals to arabic
 *  3. Strip ordinal suffixes (1st → 1)
 *  4. Remove legal entity suffixes (LP, LLC, etc.)
 *  5. Remove "Fund" ONLY when immediately before a number or at the very end
 *     (keeps "Seed Fund" and "Growth Fund" distinguishable from "Main Fund")
 *  6. Strip non-alphanumeric characters except spaces
 *  7. Collapse whitespace
 *  8. Trim
 *
 * @example
 *   normalizeFundName("Sequoia Capital Fund III, L.P.")
 *   // → "sequoia capital 3"
 *
 *   normalizeFundName("Andreessen Horowitz Fund IV LLC")
 *   // → "andreessen horowitz 4"
 *
 *   normalizeFundName("Accel Leaders Fund III")
 *   // → "accel leaders 3"
 */
function escapeRegexChars(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeFirmWords(firmName: string): string[] {
  return firmName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Tokenize a fund name the same way as firm names (alphanumeric runs only).
 */
function tokenizeFundWords(fundName: string): string[] {
  return fundName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * When the fund name begins with the first K words of the firm name (same
 * tokens, case-insensitive), strip only those words — e.g. "Sequoia Capital"
 * + "Sequoia Expansion Strategy Fund" → "Expansion Strategy Fund".
 */
function stripLeadingSharedFirmWordTokens(firmName: string, fundName: string): string | null {
  const firmToks = tokenizeFirmWords(firmName);
  const fundToks = tokenizeFundWords(fundName);
  if (!firmToks.length || !fundToks.length) return null;

  let k = 0;
  while (k < firmToks.length && k < fundToks.length && firmToks[k] === fundToks[k]) {
    k++;
  }
  if (k === 0) return null;

  const wordRe = /\b[A-Za-z0-9]+\b/g;
  let matched = 0;
  let endPos = 0;
  let m: RegExpExecArray | null;
  while (matched < k && (m = wordRe.exec(fundName))) {
    if (m[0].toLowerCase() !== firmToks[matched]) return null;
    matched++;
    endPos = m.index + m[0].length;
  }
  if (matched !== k) return null;

  let tail = fundName.slice(endPos).replace(/^[\s,;:|\-–—[\]()]+/, "").trim();
  // If we stopped after "Capital" but the source had "Capital's", the slice starts with "'s".
  tail = tail.replace(/^['\u2019]s\b/i, "").trim();
  if (!tail) return null;
  return tail;
}

/**
 * Strip repeated leading firm branding from a fund vehicle name for display.
 *
 * Handles possessives ("Acme Ventures' Acme Ventures Fund II") and duplicated
 * firm tokens ("RING CAPITAL'S RING CAPITAL ALTITUDE II" → "ALTITUDE II").
 *
 * If stripping would erase the entire string, returns the original fund name.
 */
export function stripRedundantFirmPrefixFromFundName(firmName: string, fundName: string): string {
  const raw = fundName.trim();
  if (!raw) return raw;
  const firmWords = tokenizeFirmWords(firmName);
  if (firmWords.length === 0) return raw;

  const partial = stripLeadingSharedFirmWordTokens(firmName, raw);
  let current = partial !== null ? partial : raw;

  for (let pass = 0; pass < 12; pass++) {
    const next = stripOneLeadingFirmPrefix(current, firmWords).trim();
    if (!next) return raw;
    if (next === current) break;
    current = next;
  }
  return current.trim() || raw;
}

/** Remove one leading instance of the firm name (last word may end with ’s / 's). */
function stripOneLeadingFirmPrefix(fundName: string, firmWords: string[]): string {
  const parts = firmWords.map((w, i) => {
    const e = escapeRegexChars(w);
    const isLast = i === firmWords.length - 1;
    return isLast ? `${e}(?:['\u2019]s)?` : e;
  });
  const gap = "[^a-z0-9]+";
  const core =
    parts.length === 1 ? parts[0] : parts.slice(0, -1).join(gap) + gap + parts[parts.length - 1];

  const re = new RegExp(`^[\\s\\-–—:|[("']*(?:the\\s+)?${core}[^a-z0-9]*`, "i");
  const trimmed = fundName.trim();
  return trimmed.replace(re, "").trim();
}

export function normalizeFundName(raw: string): string {
  let s = raw.trim().toLowerCase();

  // Roman → arabic
  // Need to work on uppercase version then lowercase again
  s = romanToArabic(s.replace(/\b([ivxlcdm]+)\b/gi, (m) => m.toUpperCase()));
  s = s.toLowerCase();

  // Ordinals → bare number
  s = s.replace(ORDINAL_RE, "$1");

  // Strip legal suffixes
  s = s.replace(LEGAL_SUFFIXES, "");

  // Remove "fund" ONLY when immediately before a number ("Fund 3", "Fund 14")
  // or when it is the very last word (trailing noise).
  // This preserves "Seed Fund", "Opportunity Fund", "Growth Fund" as distinct tokens.
  s = s.replace(/\bfund\s+(\d)/gi, "$1");  // "fund 3" → "3"
  s = s.replace(/\bfund\s*$/gi, "");         // trailing "fund"

  // Strip non-alphanumeric except spaces
  s = s.replace(/[^a-z0-9\s]/g, "");

  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Check if two fund names are a match after normalization.
 */
export function fundNamesMatch(a: string, b: string): boolean {
  return normalizeFundName(a) === normalizeFundName(b);
}

/**
 * Generate all plausible normalized variants of a fund name.
 * Useful for searching existing records.
 *
 * Returns the primary normalized form plus roman/arabic swapped variant.
 */
export function fundNameVariants(raw: string): string[] {
  const primary = normalizeFundName(raw);
  const variants = new Set<string>([primary]);

  // Generate roman ↔ arabic variants
  // If primary has numbers, also generate roman version
  const withRoman = primary.replace(/\b(\d{1,2})\b/g, (m) => {
    const n = parseInt(m, 10);
    return ARABIC_TO_ROMAN[n]?.toLowerCase() ?? m;
  });
  if (withRoman !== primary) variants.add(withRoman);

  return [...variants];
}

/**
 * Extract a fund number from the fund name if present.
 * Returns null if no number is found.
 *
 * @example
 *   extractFundNumber("Sequoia Capital Fund III") // → 3
 *   extractFundNumber("Accel Partners XIV") // → 14
 *   extractFundNumber("First Round Capital") // → null
 */
export function extractFundNumber(raw: string): number | null {
  const normalized = normalizeFundName(raw);
  // Find the last number in the normalized name
  const numbers = [...normalized.matchAll(/\b(\d+)\b/g)];
  if (numbers.length === 0) return null;
  const last = numbers[numbers.length - 1];
  const n = parseInt(last[1], 10);
  // Fund numbers are typically 1–30
  return n >= 1 && n <= 50 ? n : null;
}

/**
 * Compute a simple similarity score between two fund names (0–1).
 * Uses normalized token overlap (Jaccard index).
 */
export function fundNameSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeFundName(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeFundName(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}
