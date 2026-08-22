import type { RecentFundingRound } from "@/lib/recentFundingSeed";

/** Latest round per company (input should already be newest-first). */
export function uniqueCompaniesByLatestRound(rows: RecentFundingRound[]): RecentFundingRound[] {
  const seen = new Set<string>();
  const out: RecentFundingRound[] = [];
  for (const row of rows) {
    const key = row.companyName.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
