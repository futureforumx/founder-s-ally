/** Candidate columns / shapes that sometimes hold the public X profile URL or @handle. */
const X_URL_KEYS = [
  "x_url",
  "twitter_url",
  "twitter_handle",
  "x_username",
  "x_handle",
  "social_x_url",
] as const;

/**
 * Picks the first non-empty X/Twitter value from a `firm_records` (or similar) row.
 * Uses loose typing so optional DB columns still work with `select("*")`.
 */
export function pickFirmXUrl(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  for (const key of X_URL_KEYS) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const slug = row.slug;
  if (typeof slug === "string") {
    const s = slug.trim();
    if (/^[A-Za-z0-9_]{1,30}$/.test(s)) return s;
  }
  return null;
}

/** Firm records use UUID ids; JSON/MDM firm ids are often hostnames (e.g. `406ventures.com`). */
export function looksLikeFirmRecordsUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}
