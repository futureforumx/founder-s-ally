// ─── String normalization utilities ──────────────────────────────────────────

/** Normalize a domain string for comparison */
export function normalizeDomain(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .split("/")[0]
    .split("?")[0];
}

/** Normalize a LinkedIn URL to a comparable slug */
export function normalizeLinkedinSlug(url: string): string {
  const match = url.match(/linkedin\.com\/(in|company)\/([^/?#]+)/i);
  return match ? match[2].toLowerCase().replace(/\/$/, "") : url.toLowerCase();
}

/** Normalize a company/person name for fuzzy comparison */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|limited|the|a|an)\b\.?/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance (pure, no dependencies) */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Normalized similarity score: 1.0 = identical, 0.0 = completely different
 * Uses Levenshtein distance normalized to max string length
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

/** Token-based similarity (Jaccard on word sets) — better for names */
export function tokenSimilarity(a: string, b: string): number {
  const tokA = new Set(a.split(/\s+/).filter(Boolean));
  const tokB = new Set(b.split(/\s+/).filter(Boolean));
  const intersection = new Set([...tokA].filter((t) => tokB.has(t)));
  const union = new Set([...tokA, ...tokB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/** Combined similarity: max of char-level and token-level */
export function combinedSimilarity(a: string, b: string): number {
  return Math.max(similarity(a, b), tokenSimilarity(a, b));
}
