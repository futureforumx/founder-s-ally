/**
 * Client-side name normalization aligned with Postgres `firm_search_normalize(text, boolean)`.
 * Used for grid filters and ranking when RPC results are not yet loaded.
 */

import { safeTrim } from "@/lib/utils";

const NUMBER_WORDS: [RegExp, string][] = [
  [/\btwelve\b/gi, "12"],
  [/\beleven\b/gi, "11"],
  [/\bthirteen\b/gi, "13"],
  [/\bfourteen\b/gi, "14"],
  [/\bfifteen\b/gi, "15"],
  [/\bten\b/gi, "10"],
  [/\bnine\b/gi, "9"],
  [/\beight\b/gi, "8"],
  [/\bseven\b/gi, "7"],
  [/\bsix\b/gi, "6"],
  [/\bfive\b/gi, "5"],
  [/\bfour\b/gi, "4"],
  [/\bthree\b/gi, "3"],
  [/\btwo\b/gi, "2"],
  [/\bone\b/gi, "1"],
  [/\bzero\b/gi, "0"],
];

const SUFFIX_RE =
  /\s+(ventures|venture|capital|partners?|partner|management|funds?|fund|investments?|investment|holdings?|holding|advisors?|advisory|vc|v\.c\.|group|lp|llc|inc|corp|corporation|plc)$/i;

/**
 * @param stripSuffix When true (firm names), strip trailing corporate tokens for fuzzy matching only.
 */
export function normalizeForFirmSearch(input: string | null | undefined, stripSuffix = true): string {
  let t = safeTrim(input).toLowerCase();
  if (!t) return "";
  t = t.replace(/&/g, " and ");
  t = t.replace(/[^a-z0-9]+/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return "";
  for (const [re, digit] of NUMBER_WORDS) {
    t = t.replace(re, digit);
  }
  t = t.replace(/\s+/g, " ").trim();
  if (stripSuffix) {
    let prev = "";
    while (prev !== t) {
      prev = t;
      t = t.replace(SUFFIX_RE, "").replace(/\s+/g, " ").trim();
    }
  }
  return t.replace(/\s+/g, " ").trim();
}

/** True if free-text `query` should match canonical `firmDisplayName` (fuzzy / normalized). */
export function firmDisplayNameMatchesQuery(firmDisplayName: string | null | undefined, query: string | null | undefined): boolean {
  const q = safeTrim(query).toLowerCase();
  if (!q) return true;
  const qn = normalizeForFirmSearch(q, true);
  if (!qn) return true;
  const nn = normalizeForFirmSearch(firmDisplayName, true);
  if (!nn) return false;
  if (nn === qn || nn.includes(qn) || qn.includes(nn)) return true;
  const raw = firmDisplayName.toLowerCase();
  if (raw.includes(q)) return true;
  return false;
}

/** Person names: same punctuation + number normalization, no corporate suffix stripping. */
export function personDisplayNameMatchesQuery(fullName: string | null | undefined, query: string | null | undefined): boolean {
  const q = safeTrim(query).toLowerCase();
  if (!q) return true;
  const qn = normalizeForFirmSearch(q, false);
  const nn = normalizeForFirmSearch(fullName, false);
  if (nn === qn || nn.includes(qn) || qn.includes(nn)) return true;
  return String(fullName ?? "").toLowerCase().includes(q);
}
