import { parseAmountLabelToUsd, roundKindStageBucket } from "@/lib/latestFundingFilters";
import type { RecentFundingRound } from "@/lib/recentFundingSeed";

export type FundingMonthRow = {
  month: string;
  monthKey: string;
  seed: number;
  seriesA: number;
  growth: number;
  other: number;
  total: number;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function utcMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function parseAnnouncedUtc(iso: string): Date | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

/** Last `monthCount` calendar months (UTC), oldest first. Disclosed USD only. */
export function fundingByMonth(
  rows: RecentFundingRound[],
  now: Date = new Date(),
  monthCount = 6,
): FundingMonthRow[] {
  const count = Math.max(1, monthCount);
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const buckets = new Map<string, FundingMonthRow>();
  const order: string[] = [];

  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, monthIndex - i, 1));
    const key = utcMonthKey(d.getUTCFullYear(), d.getUTCMonth());
    order.push(key);
    buckets.set(key, {
      month: MONTH_NAMES[d.getUTCMonth()],
      monthKey: key,
      seed: 0,
      seriesA: 0,
      growth: 0,
      other: 0,
      total: 0,
    });
  }

  for (const row of rows) {
    const announced = parseAnnouncedUtc(row.announcedAt);
    if (!announced) continue;
    const key = utcMonthKey(announced.getUTCFullYear(), announced.getUTCMonth());
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const usd = parseAmountLabelToUsd(row.amountLabel);
    if (usd == null || usd <= 0) continue;
    const stage = roundKindStageBucket(row.roundKind);
    if (stage === "seed") bucket.seed += usd;
    else if (stage === "series_a") bucket.seriesA += usd;
    else if (stage === "growth") bucket.growth += usd;
    else bucket.other += usd;
    bucket.total += usd;
  }

  return order.map((key) => buckets.get(key)!);
}

export function monthOverMonthTotalChange(months: FundingMonthRow[]): {
  percent: number;
  direction: "up" | "down" | "flat";
} | null {
  if (months.length < 2) return null;
  const last = months[months.length - 1]?.total ?? 0;
  const prev = months[months.length - 2]?.total ?? 0;
  if (prev <= 0 && last <= 0) return null;
  if (prev <= 0) return { percent: 100, direction: "up" };
  const percent = ((last - prev) / prev) * 100;
  if (Math.abs(percent) < 0.5) return { percent: 0, direction: "flat" };
  return { percent: Math.abs(percent), direction: percent > 0 ? "up" : "down" };
}
