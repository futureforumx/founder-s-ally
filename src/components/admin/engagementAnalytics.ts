export interface NavSectionStat {
  name: string;
  count: number;
  percentage: number;
}

export type TopRecordKind = "firms" | "investors";

export interface TopInvestorRecord {
  id: string;
  name: string;
  stage: string;
  views: number;
  outboundClicks: number;
  firmId?: string;
  firmName?: string;
}

export const NAV_SECTION_NAMES = [
  "AI Intelligence & Search",
  "Fresh Capital Tracker",
  "Firm Records Directory",
  "Market Intel",
] as const;

export type NavSectionName = (typeof NAV_SECTION_NAMES)[number];

export const FALLBACK_NAV_SECTION_STATS: NavSectionStat[] = withShare([
  { name: "AI Intelligence & Search", count: 1_842 },
  { name: "Fresh Capital Tracker", count: 1_284 },
  { name: "Firm Records Directory", count: 876 },
  { name: "Market Intel", count: 448 },
]);

export const FALLBACK_INVESTOR_REVIEW_STATS: NavSectionStat[] = withShare([
  { name: "Meeting / event", count: 18 },
  { name: "Email / outbound", count: 12 },
  { name: "Intro", count: 9 },
  { name: "Passed", count: 5 },
]);

export type ReviewBreakdownKind = "origins" | "ratings";

export const REVIEW_STAR_LABELS = ["5 stars", "4 stars", "3 stars", "2 stars", "1 star"] as const;

export const FALLBACK_INVESTOR_REVIEW_RATINGS: NavSectionStat[] = withShareInOrder([
  { name: "5 stars", count: 16 },
  { name: "4 stars", count: 14 },
  { name: "3 stars", count: 9 },
  { name: "2 stars", count: 4 },
  { name: "1 star", count: 1 },
]);

const WORK_WITH_STARS: Record<string, number> = {
  Great: 5,
  Good: 4,
  Mixed: 2,
  Poor: 1,
};

export function reviewStarLabel(star: number): string {
  return star === 1 ? "1 star" : `${star} stars`;
}

export function starFromOverallTen(value: unknown): number | null {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(raw) || raw < 1 || raw > 10) return null;

  return Math.max(1, Math.min(5, Math.round(raw / 2)));
}

export function starFromReviewPayload(row: {
  score_resp?: number | null;
  score_respect?: number | null;
  score_feedback?: number | null;
  score_follow_thru?: number | null;
  score_value_add?: number | null;
  star_ratings?: unknown;
}): number | null {
  const answers = row.star_ratings && typeof row.star_ratings === "object" && !Array.isArray(row.star_ratings)
    ? (row.star_ratings as { answers?: Record<string, unknown> }).answers
    : undefined;
  const work = typeof answers?.work_with_them_rating === "string" ? answers.work_with_them_rating : null;
  if (work && WORK_WITH_STARS[work]) return WORK_WITH_STARS[work];

  const fromOverall = starFromOverallTen(answers?.overall_interaction);
  if (fromOverall) return fromOverall;

  const scores = [
    row.score_resp,
    row.score_respect,
    row.score_feedback,
    row.score_follow_thru,
    row.score_value_add,
  ].filter((value): value is number => typeof value === "number" && value >= 1 && value <= 5);
  if (!scores.length) return null;

  return Math.max(1, Math.min(5, Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)));
}

export function bucketReviewStars(stars: Array<number | null>): NavSectionStat[] {
  const counts = new Map<string, number>(REVIEW_STAR_LABELS.map((label) => [label, 0]));
  for (const star of stars) {
    if (!star || star < 1 || star > 5) continue;
    const label = reviewStarLabel(star);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return withShareInOrder(REVIEW_STAR_LABELS.map((name) => ({ name, count: counts.get(name) ?? 0 })));
}

export function withShareInOrder(rows: Array<{ name: string; count: number }>): NavSectionStat[] {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return rows.map((row) => ({
    name: row.name,
    count: row.count,
    percentage: total === 0 ? 0 : (row.count / total) * 100,
  }));
}

export const FALLBACK_TOP_INVESTOR_RECORDS: TopInvestorRecord[] = [
  { id: "mock-sequoia", name: "Sequoia Capital", stage: "Seed", views: 428, outboundClicks: 86 },
  { id: "mock-a16z", name: "Andreessen Horowitz", stage: "Series A", views: 391, outboundClicks: 64 },
  { id: "mock-accel", name: "Accel", stage: "Seed", views: 274, outboundClicks: 41 },
  { id: "mock-benchmark", name: "Benchmark", stage: "Series A", views: 188, outboundClicks: 29 },
  { id: "mock-first-round", name: "First Round", stage: "Pre-Seed", views: 142, outboundClicks: 18 },
];

export const FALLBACK_TOP_INVESTOR_PEOPLE: TopInvestorRecord[] = [
  { id: "mock-botha", name: "Roelof Botha", stage: "Partner", views: 186, outboundClicks: 42, firmName: "Sequoia Capital" },
  { id: "mock-andreessen", name: "Marc Andreessen", stage: "General Partner", views: 164, outboundClicks: 31, firmName: "Andreessen Horowitz" },
  { id: "mock-lin", name: "Alfred Lin", stage: "Partner", views: 121, outboundClicks: 24, firmName: "Sequoia Capital" },
  { id: "mock-rabois", name: "Keith Rabois", stage: "General Partner", views: 98, outboundClicks: 19, firmName: "Founders Fund" },
  { id: "mock-livingston", name: "Jessica Livingston", stage: "Partner", views: 74, outboundClicks: 11, firmName: "Y Combinator" },
];

export function withShare(rows: Array<{ name: string; count: number }>): NavSectionStat[] {
  const ranked = [...rows].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  const total = ranked.reduce((sum, row) => sum + row.count, 0);

  return ranked.map((row) => ({
    name: row.name,
    count: row.count,
    percentage: total === 0 ? 0 : (row.count / total) * 100,
  }));
}

export function resolveNavSectionStats(value: NavSectionStat[] | undefined): NavSectionStat[] {
  if (value === undefined) return FALLBACK_NAV_SECTION_STATS;

  return withShare(value);
}

export function resolveInvestorReviewStats(value: NavSectionStat[] | undefined): NavSectionStat[] {
  if (value === undefined) return FALLBACK_INVESTOR_REVIEW_STATS;

  return withShare(value);
}

export function resolveInvestorReviewRatings(value: NavSectionStat[] | undefined): NavSectionStat[] {
  if (value === undefined) return FALLBACK_INVESTOR_REVIEW_RATINGS;
  if (value.length === 0) return [];

  const byName = new Map(value.map((row) => [row.name, row.count]));

  return withShareInOrder(REVIEW_STAR_LABELS.map((name) => ({ name, count: byName.get(name) ?? 0 })));
}

export function resolveTopInvestorRecords(
  value: TopInvestorRecord[] | undefined,
  fallback: TopInvestorRecord[] = FALLBACK_TOP_INVESTOR_RECORDS,
): TopInvestorRecord[] {
  if (value === undefined) return fallback;

  return [...value]
    .sort((left, right) => {
      const leftScore = left.views + left.outboundClicks;
      const rightScore = right.views + right.outboundClicks;

      return rightScore - leftScore || left.name.localeCompare(right.name);
    })
    .slice(0, 5);
}

export function resolveTopInvestorPeople(
  value: TopInvestorRecord[] | undefined,
): TopInvestorRecord[] {
  return resolveTopInvestorRecords(value, FALLBACK_TOP_INVESTOR_PEOPLE);
}

export const FALLBACK_AVG_SESSION_MINUTES = 8.6;

export const FALLBACK_AVG_SESSION_SPARK = [6.4, 7.1, 8.8, 7.6, 9.4, 8.2, 10.1, 8.6];

export const FALLBACK_AVG_SESSION_BY_RANGE: Record<string, number> = {
  "1d": 6.2,
  "3d": 7.0,
  "7d": 7.8,
  "30d": 8.6,
  "90d": 9.1,
  all: 8.4,
  custom: 8.2,
};

export type AvgSessionActivityPoint = {
  clicks: number;
  interactions?: number;
  searches?: number;
  uploads?: number;
  logins?: number;
};

function activityEventCount(point: AvgSessionActivityPoint): number {
  return Math.max(0, point.clicks)
    + Math.max(0, point.interactions ?? 0)
    + Math.max(0, point.searches ?? 0)
    + Math.max(0, point.uploads ?? 0)
    + Math.max(0, point.logins ?? 0);
}

export type AvgSessionContext = {
  range?: string;
  grain?: "day" | "week";
  series?: AvgSessionActivityPoint[];
};

export function resolveTotalSearches(value: number | undefined): number {
  if (value !== undefined && Number.isFinite(value)) return Math.max(0, Math.round(value));

  return 0;
}

export function resolveSearchSpark(value: number[] | undefined): number[] {
  if (!value || value.length < 2) return [];

  return value.map((point) => Math.max(0, Math.round(point)));
}

const SESSION_GAP_MS = 30 * 60 * 1000;
const SESSION_DWELL_MS = 2 * 60 * 1000;

export function formatShare(value: number): string {
  const rounded = Math.round(value * 10) / 10;

  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

export function formatSessionMinutes(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function roundSessionMinutes(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

export function estimateSessionMinutesFromActivity(
  clicks: number,
  interactions: number,
  spanDays: number,
): number {
  const events = Math.max(0, clicks) + Math.max(0, interactions);
  const days = Math.max(1, spanDays);
  if (events === 0) return 0;

  const perDay = events / days;
  const minutes = 5.1 + Math.min(6.8, perDay * 1.35) + Math.min(2.4, Math.log10(days) * 0.85);

  return roundSessionMinutes(minutes);
}

export function sessionSpanDays(grain: "day" | "week" | undefined, pointCount: number): number {
  return Math.max(1, pointCount * (grain === "week" ? 7 : 1));
}

export function resolveAvgSessionMinutes(value: number | undefined, context?: AvgSessionContext): number {
  if (value !== undefined && Number.isFinite(value)) return roundSessionMinutes(value);

  if (context?.series?.length) {
    const events = context.series.reduce((sum, point) => sum + activityEventCount(point), 0);

    return estimateSessionMinutesFromActivity(events, 0, sessionSpanDays(context.grain, context.series.length));
  }

  const ranged = context?.range ? FALLBACK_AVG_SESSION_BY_RANGE[context.range] : undefined;
  if (ranged !== undefined) return ranged;

  return FALLBACK_AVG_SESSION_MINUTES;
}

export function resolveAvgSessionSpark(value: number[] | undefined, context?: AvgSessionContext): number[] {
  if (value !== undefined) {
    if (value.length < 2) return [];

    return value.map((point) => roundSessionMinutes(point));
  }

  if (context?.series && context.series.length >= 2) {
    const bucketDays = context.grain === "week" ? 7 : 1;

    return context.series.map((point) => (
      estimateSessionMinutesFromActivity(activityEventCount(point), 0, bucketDays)
    ));
  }

  const ranged = context?.range ? FALLBACK_AVG_SESSION_BY_RANGE[context.range] : undefined;
  if (ranged !== undefined) {
    return [ranged - 1.4, ranged - 0.6, ranged + 0.8, ranged - 0.2, ranged + 1.2, ranged];
  }

  return FALLBACK_AVG_SESSION_SPARK;
}

export function averageSessionMinutes(events: Array<{ userId: string; at: string }>): number {
  const timesByUser = new Map<string, number[]>();

  for (const event of events) {
    const time = Date.parse(event.at);
    if (!event.userId || !Number.isFinite(time)) continue;
    const times = timesByUser.get(event.userId) ?? [];
    times.push(time);
    timesByUser.set(event.userId, times);
  }

  const durations: number[] = [];

  for (const times of timesByUser.values()) {
    times.sort((left, right) => left - right);
    const first = times[0];
    if (first === undefined) continue;
    let start = first;
    let last = first;

    for (let index = 1; index < times.length; index += 1) {
      const time = times[index];
      if (time - last > SESSION_GAP_MS) {
        durations.push(Math.max(SESSION_DWELL_MS, last - start + SESSION_DWELL_MS));
        start = time;
      }
      last = time;
    }

    durations.push(Math.max(SESSION_DWELL_MS, last - start + SESSION_DWELL_MS));
  }

  if (durations.length === 0) return 0;

  const averageMs = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;

  return roundSessionMinutes(averageMs / 60_000);
}

export function classifyNavSection(type: string | null | undefined, context: string | null | undefined): NavSectionName | null {
  const blob = `${type ?? ""} ${context ?? ""}`.toLowerCase();

  if (!blob.trim()) return null;

  if (/(fresh|funding_article|latest_funding|fresh_funds|fresh.capital)/.test(blob)) {
    return "Fresh Capital Tracker";
  }

  if (/(firm_website|lead_investor|directory|firm.record|investor.record)/.test(blob)) {
    return "Firm Records Directory";
  }

  if (/(intelligence|search|omnibar|ai.agent)/.test(blob)) {
    return "AI Intelligence & Search";
  }

  if (/(market|company_website)/.test(blob)) {
    return "Market Intel";
  }

  return null;
}
