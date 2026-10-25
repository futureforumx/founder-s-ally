import type { AnalyticsPayload, AnalyticsQuery } from "@/components/admin/AdminAnalytics";

const ALL_TIME = {
  users: 2_847,
  waitlist: 12_640,
  approved: 3_102,
  clicks: 48_920,
  searches: 31_450,
  interactions: 9_840,
  uploads: 1_186,
  logins: 21_430,
  active: 1_186,
  avgSession: 12.4,
  referrals: 1_842,
};

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function rangeWindow(query: AnalyticsQuery): { range: string; start: Date; end: Date; spanDays: number } {
  const end = utcDay(new Date());
  if ("from" in query) {
    const start = utcDay(new Date(`${query.from}T00:00:00.000Z`));
    const last = utcDay(new Date(`${query.to}T00:00:00.000Z`));
    const spanDays = Math.max(1, Math.round((last.getTime() - start.getTime()) / 86_400_000) + 1);
    return { range: "custom", start, end: last, spanDays };
  }

  if (query.range === "all") {
    const start = addUtcDays(end, -546);
    return { range: "all", start, end, spanDays: 547 };
  }

  const days = query.range === "1d" ? 1
    : query.range === "3d" ? 3
    : query.range === "7d" ? 7
    : query.range === "30d" ? 30
    : 90;
  const start = addUtcDays(end, -(days - 1));
  return { range: query.range, start, end, spanDays: days };
}

function rangeShare(spanDays: number): number {
  return clamp(spanDays / 400, 0.016, 1);
}

function scaled(value: number, share: number): number {
  return Math.max(0, Math.round(value * share));
}

function buildSeries(
  grain: "day" | "week",
  start: Date,
  end: Date,
  totals: { users: number; waitlist: number; clicks: number; searches: number; uploads: number; logins: number },
) {
  const step = grain === "week" ? 7 : 1;
  const aligned = utcDay(start);
  if (grain === "week") aligned.setUTCDate(aligned.getUTCDate() - ((aligned.getUTCDay() + 6) % 7));

  const dates: string[] = [];
  for (let cursor = new Date(aligned); cursor.getTime() <= end.getTime(); cursor = addUtcDays(cursor, step)) {
    dates.push(isoDay(cursor));
  }

  const count = Math.max(1, dates.length);
  const weights = dates.map((_, index) => {
    const growth = 0.62 + (index / Math.max(1, count - 1)) * 0.7;
    const weekday = grain === "day" ? 0.78 + noise(index + 3) * 0.5 : 1;
    return Math.max(0.28, growth * weekday * (0.82 + noise(index + 11) * 0.36));
  });
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);

  const take = (total: number, index: number) => (
    Math.max(0, Math.round((total * weights[index]) / weightTotal))
  );

  return dates.map((date, index) => ({
    date,
    users: take(totals.users, index),
    waitlist: take(totals.waitlist, index),
    clicks: take(totals.clicks, index),
    searches: take(totals.searches, index),
    uploads: take(totals.uploads, index),
    logins: take(totals.logins, index),
    interactions: take(Math.round(totals.clicks * 0.2), index),
  }));
}

function shareRows(rows: Array<{ name: string; count: number }>) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return rows.map((row) => ({
    name: row.name,
    count: row.count,
    percentage: total === 0 ? 0 : (row.count / total) * 100,
  }));
}

function breakdown(rows: Array<{ label: string; count: number }>) {
  return rows.map((row) => ({ label: row.label, count: row.count }));
}

export function loadDemoAnalyticsPayload(query: AnalyticsQuery): AnalyticsPayload {
  const window = rangeWindow(query);
  const share = rangeShare(window.spanDays);
  const grain: "day" | "week" = window.spanDays > 45 ? "week" : "day";
  const users = scaled(ALL_TIME.users, share);
  const waitlist = scaled(ALL_TIME.waitlist, share);
  const approved = scaled(ALL_TIME.approved, share);
  const clicks = scaled(ALL_TIME.clicks, share);
  const searches = scaled(ALL_TIME.searches, share);
  const interactions = scaled(ALL_TIME.interactions, share);
  const uploads = scaled(ALL_TIME.uploads, share);
  const logins = scaled(ALL_TIME.logins, share);
  const active = scaled(ALL_TIME.active, Math.min(1, share * 1.15));
  const avgSession = Number((11.2 + share * 1.6).toFixed(1));

  const series = buildSeries(grain, window.start, window.end, {
    users,
    waitlist,
    clicks,
    searches,
    uploads,
    logins,
  });

  return {
    range: "range" in query ? query.range : "custom",
    generatedAt: new Date().toISOString(),
    grain,
    referrals: scaled(ALL_TIME.referrals, share),
    kpis: [
      { key: "users", label: "App users", value: users, allTime: ALL_TIME.users, hint: "Accounts created" },
      { key: "waitlist", label: "Waitlist", value: waitlist, allTime: ALL_TIME.waitlist, hint: "Applications received" },
      { key: "approved", label: "Approved", value: approved, allTime: ALL_TIME.approved, hint: "Waitlist approvals" },
      { key: "clicks", label: "Outbound clicks", value: clicks, allTime: ALL_TIME.clicks, hint: "Links opened from the product" },
      { key: "searches", label: "Total searches", value: searches, allTime: ALL_TIME.searches, hint: "Top nav and AI home searches" },
      { key: "interactions", label: "Investor actions", value: interactions, allTime: ALL_TIME.interactions, hint: "Founder actions on firms" },
      { key: "avgSession", label: "Avg. session (min)", value: avgSession, allTime: ALL_TIME.avgSession, hint: "Time spent per visit" },
      { key: "active", label: "Active users", value: active, allTime: ALL_TIME.active, hint: "Seen in the app" },
    ],
    onboarding: {
      inRange: scaled(2_104, share),
      allTime: 2_418,
      profiles: ALL_TIME.users,
    },
    series,
    waitlistStatus: breakdown([
      { label: "Approved", count: approved },
      { label: "Pending", count: scaled(7_840, share) },
      { label: "Waitlisted", count: scaled(1_260, share) },
      { label: "Rejected", count: scaled(438, share) },
    ]),
    waitlistSources: breakdown([
      { label: "Referral", count: scaled(4_820, share) },
      { label: "Direct", count: scaled(3_640, share) },
      { label: "LinkedIn", count: scaled(2_180, share) },
      { label: "Twitter", count: scaled(1_140, share) },
      { label: "Other", count: scaled(860, share) },
    ]),
    waitlistRoles: breakdown([
      { label: "Founder", count: scaled(8_420, share) },
      { label: "Operator", count: scaled(2_180, share) },
      { label: "Investor", count: scaled(1_240, share) },
      { label: "Unspecified", count: scaled(800, share) },
    ]),
    clickTypes: breakdown([
      { label: "Firm Website", count: scaled(18_640, share) },
      { label: "Funding Article", count: scaled(14_280, share) },
      { label: "Lead Investor", count: scaled(9_420, share) },
      { label: "LinkedIn", count: scaled(6_580, share) },
    ]),
    interactionTypes: breakdown([
      { label: "Viewed", count: scaled(6_240, share) },
      { label: "Saved", count: scaled(2_180, share) },
      { label: "Reached out", count: scaled(1_420, share) },
    ]),
    profileTypes: breakdown([
      { label: "Founder", count: scaled(2_180, share) },
      { label: "Operator", count: scaled(420, share) },
      { label: "Investor", count: scaled(247, share) },
    ]),
    navSectionStats: shareRows([
      { name: "AI Intelligence & Search", count: scaled(18_420, share) },
      { name: "Fresh Capital Tracker", count: scaled(12_840, share) },
      { name: "Firm Records Directory", count: scaled(8_760, share) },
      { name: "Market Intel", count: scaled(4_480, share) },
    ]),
    investorReviewStats: shareRows([
      { name: "Meeting / event", count: scaled(186, share) || 18 },
      { name: "Email / outbound", count: scaled(124, share) || 12 },
      { name: "Intro", count: scaled(91, share) || 9 },
      { name: "Passed", count: scaled(47, share) || 5 },
      { name: "Ongoing", count: scaled(38, share) || 4 },
    ]),
    investorReviewRatings: [
      { name: "5 stars", count: scaled(142, share) || 16 },
      { name: "4 stars", count: scaled(186, share) || 14 },
      { name: "3 stars", count: scaled(94, share) || 9 },
      { name: "2 stars", count: scaled(28, share) || 4 },
      { name: "1 star", count: scaled(11, share) || 1 },
    ].map((row, _, rows) => {
      const total = rows.reduce((sum, item) => sum + item.count, 0);
      return { ...row, percentage: total === 0 ? 0 : (row.count / total) * 100 };
    }),
    topInvestorRecords: [
      { id: "demo-sequoia", name: "Sequoia Capital", stage: "Seed", views: scaled(428, Math.max(share, 0.35)), outboundClicks: scaled(86, Math.max(share, 0.35)) },
      { id: "demo-a16z", name: "Andreessen Horowitz", stage: "Series A", views: scaled(391, Math.max(share, 0.35)), outboundClicks: scaled(64, Math.max(share, 0.35)) },
      { id: "demo-accel", name: "Accel", stage: "Seed", views: scaled(274, Math.max(share, 0.35)), outboundClicks: scaled(41, Math.max(share, 0.35)) },
      { id: "demo-benchmark", name: "Benchmark", stage: "Series A", views: scaled(188, Math.max(share, 0.35)), outboundClicks: scaled(29, Math.max(share, 0.35)) },
      { id: "demo-first-round", name: "First Round", stage: "Pre-Seed", views: scaled(142, Math.max(share, 0.35)), outboundClicks: scaled(18, Math.max(share, 0.35)) },
    ],
    topInvestorPeople: [
      { id: "demo-botha", name: "Roelof Botha", stage: "Partner", views: scaled(186, Math.max(share, 0.35)), outboundClicks: scaled(42, Math.max(share, 0.35)), firmName: "Sequoia Capital" },
      { id: "demo-andreessen", name: "Marc Andreessen", stage: "General Partner", views: scaled(164, Math.max(share, 0.35)), outboundClicks: scaled(31, Math.max(share, 0.35)), firmName: "Andreessen Horowitz" },
      { id: "demo-lin", name: "Alfred Lin", stage: "Partner", views: scaled(121, Math.max(share, 0.35)), outboundClicks: scaled(24, Math.max(share, 0.35)), firmName: "Sequoia Capital" },
      { id: "demo-rabois", name: "Keith Rabois", stage: "General Partner", views: scaled(98, Math.max(share, 0.35)), outboundClicks: scaled(19, Math.max(share, 0.35)), firmName: "Founders Fund" },
      { id: "demo-livingston", name: "Jessica Livingston", stage: "Partner", views: scaled(74, Math.max(share, 0.35)), outboundClicks: scaled(11, Math.max(share, 0.35)), firmName: "Y Combinator" },
    ],
    avgSessionSpark: series.map((point, index) => (
      Number((10.4 + (point.logins + point.searches) / Math.max(40, active) + noise(index + 21) * 1.8).toFixed(1))
    )),
    recent: [
      { id: "click-1", at: hoursAgo(1), label: "Firm Website", detail: "Sequoia Capital" },
      { id: "event-1", at: hoursAgo(2), label: "Waitlist signup", detail: "Referral · Founder" },
      { id: "interaction-1", at: hoursAgo(3), label: "Investor action", detail: "Saved" },
      { id: "click-2", at: hoursAgo(4), label: "Funding Article", detail: "Fresh Capital" },
      { id: "event-2", at: hoursAgo(5), label: "Confirmation email", detail: "Email sent" },
      { id: "interaction-2", at: hoursAgo(7), label: "Investor action", detail: "Viewed" },
      { id: "click-3", at: hoursAgo(9), label: "Lead Investor", detail: "Andreessen Horowitz" },
      { id: "event-3", at: hoursAgo(11), label: "Waitlist signup", detail: "LinkedIn · Founder" },
      { id: "click-4", at: hoursAgo(14), label: "Firm Website", detail: "Accel" },
      { id: "interaction-3", at: hoursAgo(16), label: "Investor action", detail: "Reached out" },
      { id: "event-4", at: hoursAgo(18), label: "Decision email", detail: "Approved" },
      { id: "click-5", at: hoursAgo(21), label: "LinkedIn", detail: "First Round" },
    ],
  };
}
