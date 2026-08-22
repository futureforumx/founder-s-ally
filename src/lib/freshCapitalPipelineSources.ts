/** Fund Watch feed keys scanned by `source_feeds` (see `src/lib/vc-funds/adapters.ts`). */
export const FUND_WATCH_FEED_SOURCES = [
  { key: "SHAI_GOLDMAN_NEW_FUNDS_SHEET", name: "Shai Goldman New Funds" },
  { key: "TECHCRUNCH_VENTURE", name: "TechCrunch Venture" },
  { key: "TECHCRUNCH_FUNDING_TAG", name: "TechCrunch Funding" },
  { key: "ALLEYWATCH_FUNDING", name: "AlleyWatch Funding" },
  { key: "PRNEWSWIRE_VENTURE_CAPITAL", name: "PR Newswire Venture" },
  { key: "VCSHEET_FUNDS", name: "VC Sheet Funds" },
] as const;

export type FundWatchFeedKey = (typeof FUND_WATCH_FEED_SOURCES)[number]["key"];

export function normalizeDisabledSourceKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()))].sort();
}

export function isPipelineSourceEnabled(key: string, disabledKeys: readonly string[]): boolean {
  return !disabledKeys.includes(key);
}

export function withSourceEnabled(disabledKeys: readonly string[], key: string, enabled: boolean): string[] {
  const next = new Set(disabledKeys);
  if (enabled) next.delete(key);
  else next.add(key);
  return [...next].sort();
}

export function lastScannedFromSyncRun(
  stats: Record<string, unknown> | null | undefined,
  sourceKey: string,
  completedAt: string | null | undefined,
): string | null {
  if (!completedAt) return null;
  const sourceStats = stats?.sourceStats;
  if (!sourceStats || typeof sourceStats !== "object") return completedAt;
  const row = (sourceStats as Record<string, unknown>)[sourceKey];
  if (row == null) return completedAt;
  return completedAt;
}

export function slugFromSourceName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return slug || "source";
}

export function normalizeSourceUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
