import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autoPermissionForEmail,
  clampGodModeToDesignatedEmail,
  hasAdminConsoleAccess,
  type AppPermission,
} from "../_shared/app-admin-email.ts";
import { resolveAdminCaller } from "../_shared/admin-resolve-caller.ts";
import { clerkGetUser, clerkPrimaryEmail } from "../_shared/clerk-backend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const ROW_LIMIT = 5000;

type AnalyticsRange = "1d" | "3d" | "7d" | "30d" | "90d" | "all";
type Grain = "day" | "week";

type Breakdown = { label: string; count: number };

type RecentItem = {
  id: string;
  at: string;
  label: string;
  detail: string;
};

type SeriesPoint = {
  date: string;
  users: number;
  waitlist: number;
  clicks: number;
  interactions: number;
  searches: number;
  uploads: number;
  logins: number;
};

function asPermission(v: unknown): AppPermission | null {
  const p = String(v ?? "").toLowerCase();
  if (p === "user" || p === "manager" || p === "admin" || p === "god") return p as AppPermission;
  return null;
}

function highestPermission(...candidates: Array<AppPermission | null>): AppPermission {
  const rank: Record<AppPermission, number> = { user: 0, manager: 1, admin: 2, god: 3 };
  let best: AppPermission = "user";
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (rank[candidate] > rank[best]) best = candidate;
  }
  return best;
}

const RANGE_DAYS: Record<Exclude<AnalyticsRange, "all">, number> = {
  "1d": 1,
  "3d": 3,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function parseRange(value: unknown): AnalyticsRange {
  if (value === "all") return "all";
  if (typeof value === "string" && value in RANGE_DAYS) return value as Exclude<AnalyticsRange, "all">;
  return "30d";
}

function rangeStart(range: AnalyticsRange, now: Date): Date | null {
  if (range === "all") return null;
  const days = RANGE_DAYS[range];
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

function parseDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) ? value : null;
}

function inRange(iso: string | null | undefined, start: Date | null, endExclusive: Date | null = null): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return false;
  if (start && time < start.getTime()) return false;
  if (endExclusive && time >= endExclusive.getTime()) return false;
  return true;
}

function prettify(value: string): string {
  const cleaned = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Unknown";
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function breakdown(values: Array<string | null | undefined>, emptyLabel: string, limit = 6): Breakdown[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value?.trim() ? prettify(value) : emptyLabel;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length <= limit) return sorted.map(([label, count]) => ({ label, count }));
  const head = sorted.slice(0, limit - 1);
  const rest = sorted.slice(limit - 1).reduce((sum, [, count]) => sum + count, 0);
  return [...head.map(([label, count]) => ({ label, count })), { label: "Other", count: rest }];
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function bucketDate(iso: string, grain: Grain): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  if (grain === "week") {
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - mondayOffset);
  }
  return date.toISOString().slice(0, 10);
}

function chooseGrain(start: Date | null, end: Date, earliest: Date | null): { grain: Grain; from: Date } {
  const from = start ?? earliest ?? end;
  const spanDays = Math.round((end.getTime() - utcDay(from).getTime()) / 86_400_000) + 1;
  const grain: Grain = spanDays > 45 ? "week" : "day";
  const aligned = utcDay(from);
  if (grain === "week") {
    aligned.setUTCDate(aligned.getUTCDate() - ((aligned.getUTCDay() + 6) % 7));
  }
  return { grain, from: aligned };
}

function buildSeries(
  grain: Grain,
  from: Date,
  end: Date,
  groups: Array<{ iso: string; key: keyof Omit<SeriesPoint, "date"> }>,
): SeriesPoint[] {
  const points = new Map<string, SeriesPoint>();
  const cursor = new Date(from);
  const last = utcDay(end);
  while (cursor.getTime() <= last.getTime()) {
    const date = cursor.toISOString().slice(0, 10);
    points.set(date, { date, users: 0, waitlist: 0, clicks: 0, interactions: 0, searches: 0, uploads: 0, logins: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + (grain === "week" ? 7 : 1));
  }

  for (const group of groups) {
    const date = bucketDate(group.iso, grain);
    if (!date) continue;
    const point = points.get(date);
    if (!point) continue;
    point[group.key] += 1;
  }

  return [...points.values()];
}

function latestSeenIso(
  activity: Array<{ user_id: string | null; last_active_at: string | null }>,
  ipLog: Array<{ user_id: string | null; last_seen_at: string | null }>,
): string[] {
  const latest = new Map<string, number>();
  const consider = (userId: string | null, iso: string | null | undefined) => {
    if (!userId || !iso) return;
    const time = new Date(iso).getTime();
    if (!Number.isFinite(time)) return;
    const current = latest.get(userId);
    if (current === undefined || time > current) latest.set(userId, time);
  };

  for (const row of activity) consider(row.user_id, row.last_active_at);
  for (const row of ipLog) consider(row.user_id, row.last_seen_at);

  return [...latest.values()].map((time) => new Date(time).toISOString());
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function eventDetail(eventType: string, payload: unknown): string {
  const record = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const text = (key: string) => (typeof record[key] === "string" && record[key].trim() ? record[key].trim() : null);

  if (eventType === "signup") {
    return [text("source") ? prettify(text("source")!) : null, text("campaign")].filter(Boolean).join(" · ") || "New applicant";
  }
  if (eventType === "decision_email_sent") {
    return text("status") ? prettify(text("status")!) : "Decision sent";
  }
  if (eventType === "confirmation_email_sent") {
    return text("status") ? `Email ${text("status")}` : "Confirmation sent";
  }
  return text("source") ? prettify(text("source")!) : "";
}

function eventLabel(eventType: string): string {
  const known: Record<string, string> = {
    signup: "Waitlist signup",
    confirmation_email_sent: "Confirmation email",
    decision_email_sent: "Decision email",
    referral_attributed: "Referral",
  };
  return known[eventType] ?? prettify(eventType);
}

const NAV_SECTION_NAMES = [
  "AI Intelligence & Search",
  "Fresh Capital Tracker",
  "Firm Records Directory",
  "Market Intel",
] as const;

type NavSectionName = (typeof NAV_SECTION_NAMES)[number];

function classifyNavSection(type: string | null | undefined, context: string | null | undefined): NavSectionName | null {
  const blob = `${type ?? ""} ${context ?? ""}`.toLowerCase();
  if (!blob.trim()) return null;
  if (/(fresh|funding_article|latest_funding|fresh_funds|fresh.capital)/.test(blob)) return "Fresh Capital Tracker";
  if (/(firm_website|lead_investor|directory|firm.record|investor.record)/.test(blob)) return "Firm Records Directory";
  if (/(intelligence|search|omnibar|ai.agent)/.test(blob)) return "AI Intelligence & Search";
  if (/(market|company_website)/.test(blob)) return "Market Intel";
  return null;
}

function isFirmId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function firstStage(preferred: string | null | undefined, focus: string[] | null | undefined): string {
  if (preferred?.trim()) return preferred.trim();
  const fromFocus = focus?.find((value) => value.trim());
  return fromFocus?.trim() || "";
}

const SESSION_GAP_MS = 30 * 60 * 1000;
const SESSION_DWELL_MS = 2 * 60 * 1000;

function roundSessionMinutes(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

function sessionDurations(events: Array<{ userId: string; at: string }>): Array<{ start: number; minutes: number }> {
  const timesByUser = new Map<string, number[]>();
  for (const event of events) {
    const time = Date.parse(event.at);
    if (!event.userId || !Number.isFinite(time)) continue;
    const times = timesByUser.get(event.userId) ?? [];
    times.push(time);
    timesByUser.set(event.userId, times);
  }

  const sessions: Array<{ start: number; minutes: number }> = [];
  for (const times of timesByUser.values()) {
    times.sort((left, right) => left - right);
    const first = times[0];
    if (first === undefined) continue;
    let start = first;
    let last = first;
    for (let index = 1; index < times.length; index += 1) {
      const time = times[index];
      if (time === undefined) continue;
      if (time - last > SESSION_GAP_MS) {
        sessions.push({
          start,
          minutes: roundSessionMinutes(Math.max(SESSION_DWELL_MS, last - start + SESSION_DWELL_MS) / 60_000),
        });
        start = time;
      }
      last = time;
    }
    sessions.push({
      start,
      minutes: roundSessionMinutes(Math.max(SESSION_DWELL_MS, last - start + SESSION_DWELL_MS) / 60_000),
    });
  }
  return sessions;
}

function averageSessionMinutes(sessions: Array<{ minutes: number }>): number {
  if (sessions.length === 0) return 0;
  return roundSessionMinutes(sessions.reduce((sum, session) => sum + session.minutes, 0) / sessions.length);
}

const REVIEW_LABELS: Record<string, string> = {
  meeting: "Meeting / event",
  email: "Email / outbound",
  intro: "Intro",
  passed: "Passed",
  ongoing: "Ongoing",
  other: "Other",
  investor_relationship: "Investor relationship",
  review_draft: "Draft review",
  review_draft_investor: "Draft review",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const resolved = await resolveAdminCaller(authHeader, supabaseUrl, supabaseKey);
    if ("error" in resolved) throw new Error(resolved.error);

    const adminClient = createClient(supabaseUrl, serviceKey);
    const roleIds = resolved.identityUserIds.length ? resolved.identityUserIds : [resolved.id];
    const { data: roleRows } = await adminClient.from("user_roles").select("permission").in("user_id", roleIds);
    let roleFromDb: AppPermission | null = null;
    for (const row of roleRows ?? []) {
      roleFromDb = highestPermission(roleFromDb, asPermission(row.permission));
    }

    let callerEmail = resolved.email;
    if (!callerEmail && resolved.id.startsWith("user_")) {
      const clerkSecret = Deno.env.get("CLERK_SECRET_KEY")?.trim() ?? "";
      if (clerkSecret) {
        try {
          const clerkUser = await clerkGetUser(clerkSecret, resolved.id);
          callerEmail = clerkUser ? (clerkPrimaryEmail(clerkUser) || null) : null;
        } catch (emailErr) {
          throw new Error(
            `Admin access denied: Clerk API returned an error resolving caller identity (${(emailErr as Error).message}).`,
          );
        }
      }
    }

    const callerPermission = clampGodModeToDesignatedEmail(
      highestPermission(
        roleFromDb,
        asPermission(resolved.user_metadata?.role),
        autoPermissionForEmail(callerEmail),
      ),
      callerEmail,
    );
    if (!hasAdminConsoleAccess(callerPermission)) throw new Error("Admin access required");

    let requested: { range?: unknown; from?: unknown; to?: unknown } = {};
    if (req.method !== "GET") {
      try {
        requested = await req.json();
      } catch {
        requested = {};
      }
    } else {
      const url = new URL(req.url);
      requested = {
        range: url.searchParams.get("range"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      };
    }
    const now = new Date();
    const fromDay = parseDay(requested.from);
    const toDay = parseDay(requested.to);
    let range: AnalyticsRange | "custom";
    let start: Date | null;
    let endExclusive: Date | null;
    if (fromDay && toDay && fromDay <= toDay) {
      range = "custom";
      start = new Date(`${fromDay}T00:00:00.000Z`);
      endExclusive = new Date(Date.parse(`${toDay}T00:00:00.000Z`) + 86_400_000);
    } else {
      const preset = parseRange(requested.range);
      range = preset;
      start = rangeStart(preset, now);
      endExclusive = preset === "all" ? null : new Date(utcDay(now).getTime() + 86_400_000);
    }

    const [
      usersResult,
      profilesResult,
      waitlistResult,
      eventsResult,
      clicksResult,
      interactionsResult,
      activityResult,
      ipResult,
    ] = await Promise.all([
      adminClient.from("users").select("id, created_at").order("created_at", { ascending: false }).limit(ROW_LIMIT),
      adminClient.from("profiles").select("user_id, user_type, has_completed_onboarding, created_at").limit(ROW_LIMIT),
      adminClient.from("waitlist_users").select("id, status, source, role, created_at, reviewed_at, referred_by_user_id").order("created_at", { ascending: false }).limit(ROW_LIMIT),
      adminClient.from("waitlist_events").select("id, event_type, payload, created_at").order("created_at", { ascending: false }).limit(ROW_LIMIT),
      adminClient.from("outbound_clicks").select("id, type, context, destination_url, entity_id, created_at").order("created_at", { ascending: false }).limit(ROW_LIMIT),
      adminClient.from("founder_vc_interactions").select("id, action_type, firm_id, founder_id, created_at").order("created_at", { ascending: false }).limit(ROW_LIMIT),
      adminClient.from("user_activity").select("user_id, last_active_at").limit(ROW_LIMIT),
      adminClient.from("user_ip_log").select("user_id, last_seen_at").limit(ROW_LIMIT),
    ]);

    const failures = [
      usersResult.error,
      profilesResult.error,
      waitlistResult.error,
      eventsResult.error,
      clicksResult.error,
      interactionsResult.error,
      activityResult.error,
      ipResult.error,
    ].filter(Boolean);
    if (failures.length) throw new Error(failures[0]!.message);

    const reviewsResult = await adminClient
      .from("vc_ratings")
      .select("id, interaction_type, is_draft, created_at, vc_person_id, star_ratings, score_resp, score_respect, score_feedback, score_follow_thru, score_value_add")
      .eq("is_draft", false)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT);
    const reviews = reviewsResult.error ? [] : reviewsResult.data ?? [];
    const searchesResult = await adminClient
      .from("product_searches")
      .select("id, source, created_at")
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT);
    const searches = searchesResult.error ? [] : searchesResult.data ?? [];
    const decksResult = await adminClient
      .from("company_pitch_decks")
      .select("id, uploaded_at")
      .order("uploaded_at", { ascending: false })
      .limit(ROW_LIMIT);
    const uploads = decksResult.error ? [] : decksResult.data ?? [];

    const users = usersResult.data ?? [];
    const profiles = profilesResult.data ?? [];
    const waitlist = waitlistResult.data ?? [];
    const events = eventsResult.data ?? [];
    const clicks = clicksResult.data ?? [];
    const interactions = interactionsResult.data ?? [];
    const activity = activityResult.data ?? [];
    const ipLog = ipResult.data ?? [];

    const usersInRange = users.filter((row) => inRange(row.created_at, start, endExclusive));
    const waitlistInRange = waitlist.filter((row) => inRange(row.created_at, start, endExclusive));
    const clicksInRange = clicks.filter((row) => inRange(row.created_at, start, endExclusive));
    const interactionsInRange = interactions.filter((row) => inRange(row.created_at, start, endExclusive));
    const searchesInRange = searches.filter((row) => inRange(row.created_at, start, endExclusive));
    const uploadsInRange = uploads.filter((row) => inRange(row.uploaded_at, start, endExclusive));
    const loginAts = latestSeenIso(activity, ipLog);
    const loginsInRange = loginAts.filter((iso) => inRange(iso, start, endExclusive));
    const profilesInRange = profiles.filter((row) => inRange(row.created_at, start, endExclusive));

    const approved = (rows: typeof waitlist) =>
      rows.filter((row) => row.status === "approved" && inRange(row.reviewed_at ?? row.created_at, start, endExclusive)).length;
    const approvedAllTime = waitlist.filter((row) => row.status === "approved").length;

    const activeIds = (from: Date | null, until: Date | null) => {
      const ids = new Set<string>();
      for (const row of activity) {
        if (row.user_id && inRange(row.last_active_at, from, until)) ids.add(row.user_id);
      }
      for (const row of ipLog) {
        if (row.user_id && inRange(row.last_seen_at, from, until)) ids.add(row.user_id);
      }
      return ids.size;
    };

    const timestamps = [
      ...users.map((row) => row.created_at),
      ...waitlist.map((row) => row.created_at),
      ...clicks.map((row) => row.created_at),
      ...interactions.map((row) => row.created_at),
      ...searches.map((row) => row.created_at),
      ...uploads.map((row) => row.uploaded_at),
      ...loginAts,
    ].filter((iso): iso is string => Boolean(iso));
    const earliest = timestamps.reduce<Date | null>((min, iso) => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return min;
      return !min || date < min ? date : min;
    }, null);

    const seriesEnd = endExclusive ? new Date(endExclusive.getTime() - 1) : utcDay(now);
    const { grain, from } = chooseGrain(start, seriesEnd, earliest);
    const series = buildSeries(grain, from, seriesEnd, [
      ...usersInRange.map((row) => ({ iso: row.created_at, key: "users" as const })),
      ...waitlistInRange.map((row) => ({ iso: row.created_at, key: "waitlist" as const })),
      ...clicksInRange.map((row) => ({ iso: row.created_at, key: "clicks" as const })),
      ...interactionsInRange.map((row) => ({ iso: row.created_at, key: "interactions" as const })),
      ...searchesInRange.map((row) => ({ iso: row.created_at, key: "searches" as const })),
      ...uploadsInRange.map((row) => ({ iso: row.uploaded_at, key: "uploads" as const })),
      ...loginsInRange.map((iso) => ({ iso, key: "logins" as const })),
    ]);
    const sessionEventsInRange = interactionsInRange
      .filter((row) => row.founder_id && row.created_at)
      .map((row) => ({ userId: row.founder_id, at: row.created_at }));
    const sessionEventsAllTime = interactions
      .filter((row) => row.founder_id && row.created_at)
      .map((row) => ({ userId: row.founder_id, at: row.created_at }));
    const sessionsInRange = sessionDurations(sessionEventsInRange);
    const avgSessionMinutes = averageSessionMinutes(sessionsInRange);
    const avgSessionAllTime = averageSessionMinutes(sessionDurations(sessionEventsAllTime));
    const sessionMinutesByDate = new Map<string, number[]>();
    for (const session of sessionsInRange) {
      const date = bucketDate(new Date(session.start).toISOString(), grain);
      if (!date) continue;
      const bucket = sessionMinutesByDate.get(date) ?? [];
      bucket.push(session.minutes);
      sessionMinutesByDate.set(date, bucket);
    }
    const avgSessionSpark = series.map((point) => {
      const bucket = sessionMinutesByDate.get(point.date) ?? [];
      return averageSessionMinutes(bucket.map((minutes) => ({ minutes })));
    });

    const recent: RecentItem[] = [
      ...events
        .filter((row) => inRange(row.created_at, start, endExclusive))
        .map((row) => ({
          id: `event-${row.id}`,
          at: row.created_at,
          label: eventLabel(row.event_type),
          detail: eventDetail(row.event_type, row.payload),
        })),
      ...clicksInRange.map((row) => ({
        id: `click-${row.id}`,
        at: row.created_at,
        label: row.type ? prettify(row.type) : "Outbound click",
        detail: [row.context ? prettify(row.context) : null, hostOf(row.destination_url)].filter(Boolean).join(" · "),
      })),
      ...interactionsInRange.map((row) => ({
        id: `interaction-${row.id}`,
        at: row.created_at,
        label: "Investor action",
        detail: prettify(row.action_type),
      })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 12);

    const onboardedInRange = profilesInRange.filter((row) => row.has_completed_onboarding).length;
    const onboardedAllTime = profiles.filter((row) => row.has_completed_onboarding).length;

    const navCounts = new Map<NavSectionName, number>(NAV_SECTION_NAMES.map((name) => [name, 0]));
    for (const row of clicksInRange) {
      const section = classifyNavSection(row.type, row.context);
      if (!section) continue;
      navCounts.set(section, (navCounts.get(section) ?? 0) + 1);
    }
    navCounts.set(
      "Firm Records Directory",
      (navCounts.get("Firm Records Directory") ?? 0) + interactionsInRange.length,
    );
    const navTotal = [...navCounts.values()].reduce((sum, count) => sum + count, 0);
    const navSectionStats = NAV_SECTION_NAMES
      .map((name) => {
        const count = navCounts.get(name) ?? 0;
        return { name, count, percentage: navTotal === 0 ? 0 : (count / navTotal) * 100 };
      })
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));

    const reviewsInRange = reviews.filter((row) => inRange(row.created_at, start, endExclusive));
    const reviewCounts = new Map<string, number>();
    for (const row of reviewsInRange) {
      const label = REVIEW_LABELS[row.interaction_type] ?? prettify(row.interaction_type);
      reviewCounts.set(label, (reviewCounts.get(label) ?? 0) + 1);
    }
    const reviewTotal = [...reviewCounts.values()].reduce((sum, count) => sum + count, 0);
    const investorReviewStats = [...reviewCounts.entries()]
      .map(([name, count]) => ({
        name,
        count,
        percentage: reviewTotal === 0 ? 0 : (count / reviewTotal) * 100,
      }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));

    const WORK_WITH_STARS: Record<string, number> = { Great: 5, Good: 4, Mixed: 2, Poor: 1 };
    const reviewStarLabel = (star: number) => (star === 1 ? "1 star" : `${star} stars`);
    const starFromReview = (row: {
      score_resp?: number | null;
      score_respect?: number | null;
      score_feedback?: number | null;
      score_follow_thru?: number | null;
      score_value_add?: number | null;
      star_ratings?: unknown;
    }): number | null => {
      const answers = row.star_ratings && typeof row.star_ratings === "object" && !Array.isArray(row.star_ratings)
        ? (row.star_ratings as { answers?: Record<string, unknown> }).answers
        : undefined;
      const work = typeof answers?.work_with_them_rating === "string" ? answers.work_with_them_rating : null;
      if (work && WORK_WITH_STARS[work]) return WORK_WITH_STARS[work];
      const overallRaw = answers?.overall_interaction;
      const overall = typeof overallRaw === "number"
        ? overallRaw
        : typeof overallRaw === "string"
          ? Number.parseInt(overallRaw, 10)
          : Number.NaN;
      if (Number.isFinite(overall) && overall >= 1 && overall <= 10) {
        return Math.max(1, Math.min(5, Math.round(overall / 2)));
      }
      const scores = [
        row.score_resp,
        row.score_respect,
        row.score_feedback,
        row.score_follow_thru,
        row.score_value_add,
      ].filter((value): value is number => typeof value === "number" && value >= 1 && value <= 5);
      if (!scores.length) return null;
      return Math.max(1, Math.min(5, Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)));
    };
    const ratingCounts = new Map<string, number>([
      ["5 stars", 0],
      ["4 stars", 0],
      ["3 stars", 0],
      ["2 stars", 0],
      ["1 star", 0],
    ]);
    for (const row of reviewsInRange) {
      const star = starFromReview(row);
      if (!star) continue;
      const label = reviewStarLabel(star);
      ratingCounts.set(label, (ratingCounts.get(label) ?? 0) + 1);
    }
    const ratingTotal = [...ratingCounts.values()].reduce((sum, count) => sum + count, 0);
    const investorReviewRatings = ["5 stars", "4 stars", "3 stars", "2 stars", "1 star"].map((name) => {
      const count = ratingCounts.get(name) ?? 0;
      return { name, count, percentage: ratingTotal === 0 ? 0 : (count / ratingTotal) * 100 };
    });

    const personCandidateIds = [...new Set([
      ...clicksInRange.map((row) => row.entity_id),
      ...reviewsInRange.map((row) => row.vc_person_id),
    ].filter(isFirmId))];
    const peopleResult = personCandidateIds.length
      ? await adminClient
        .from("firm_people")
        .select("id, full_name, title, firm_id, stage_focus")
        .in("id", personCandidateIds.slice(0, 200))
        .is("deleted_at", null)
      : { data: [] as Array<{ id: string; full_name: string | null; title: string | null; firm_id: string; stage_focus: string[] | null }>, error: null };
    const peopleRows = peopleResult.error ? [] : peopleResult.data ?? [];
    const peopleById = new Map(peopleRows.map((row) => [row.id, row]));

    const firmStats = new Map<string, { views: number; outboundClicks: number }>();
    const bumpFirm = (firmId: string, field: "views" | "outboundClicks") => {
      const current = firmStats.get(firmId) ?? { views: 0, outboundClicks: 0 };
      current[field] += 1;
      firmStats.set(firmId, current);
    };
    for (const row of interactionsInRange) {
      if (!isFirmId(row.firm_id)) continue;
      bumpFirm(row.firm_id, "views");
    }
    for (const row of clicksInRange) {
      if (!isFirmId(row.entity_id) || peopleById.has(row.entity_id)) continue;
      bumpFirm(row.entity_id, "outboundClicks");
    }
    const topFirmIds = [...firmStats.entries()]
      .sort((left, right) => {
        const leftScore = left[1].views + left[1].outboundClicks;
        const rightScore = right[1].views + right[1].outboundClicks;
        return rightScore - leftScore;
      })
      .slice(0, 5)
      .map(([id]) => id);

    let topInvestorRecords: Array<{ id: string; name: string; stage: string; views: number; outboundClicks: number }> = [];
    if (topFirmIds.length) {
      const { data: firmRows, error: firmError } = await adminClient
        .from("firm_records")
        .select("id, firm_name, preferred_stage, stage_focus")
        .in("id", topFirmIds)
        .is("deleted_at", null);
      if (firmError) throw new Error(firmError.message);
      const firmsById = new Map((firmRows ?? []).map((row) => [row.id, row]));
      topInvestorRecords = topFirmIds.flatMap((id) => {
        const firm = firmsById.get(id);
        const stats = firmStats.get(id);
        if (!firm || !stats) return [];
        return [{
          id,
          name: firm.firm_name || "Unknown firm",
          stage: firstStage(firm.preferred_stage, firm.stage_focus),
          views: stats.views,
          outboundClicks: stats.outboundClicks,
        }];
      });
    }

    const personStats = new Map<string, { views: number; outboundClicks: number }>();
    const bumpPerson = (personId: string, field: "views" | "outboundClicks") => {
      const current = personStats.get(personId) ?? { views: 0, outboundClicks: 0 };
      current[field] += 1;
      personStats.set(personId, current);
    };
    for (const row of reviewsInRange) {
      if (!row.vc_person_id || !peopleById.has(row.vc_person_id)) continue;
      bumpPerson(row.vc_person_id, "views");
    }
    for (const row of clicksInRange) {
      if (!row.entity_id || !peopleById.has(row.entity_id)) continue;
      bumpPerson(row.entity_id, "outboundClicks");
    }
    const topPersonIds = [...personStats.entries()]
      .sort((left, right) => {
        const leftScore = left[1].views + left[1].outboundClicks;
        const rightScore = right[1].views + right[1].outboundClicks;
        return rightScore - leftScore;
      })
      .slice(0, 5)
      .map(([id]) => id);
    const topPersonFirmIds = [...new Set(
      topPersonIds.flatMap((id) => {
        const firmId = peopleById.get(id)?.firm_id;
        return isFirmId(firmId) ? [firmId] : [];
      }),
    )];
    const personFirmNames = new Map<string, string>();
    if (topPersonFirmIds.length) {
      const { data: personFirms } = await adminClient
        .from("firm_records")
        .select("id, firm_name")
        .in("id", topPersonFirmIds)
        .is("deleted_at", null);
      for (const firm of personFirms ?? []) {
        personFirmNames.set(firm.id, firm.firm_name || "Unknown firm");
      }
    }
    const topInvestorPeople = topPersonIds.flatMap((id) => {
      const person = peopleById.get(id);
      const stats = personStats.get(id);
      if (!person || !stats) return [];
      return [{
        id,
        name: person.full_name?.trim() || "Unknown investor",
        stage: person.title?.trim() || firstStage(null, person.stage_focus),
        views: stats.views,
        outboundClicks: stats.outboundClicks,
        firmId: person.firm_id,
        firmName: personFirmNames.get(person.firm_id) ?? "",
      }];
    });

    return new Response(JSON.stringify({
      range,
      generatedAt: now.toISOString(),
      grain,
      referrals: waitlistInRange.filter((row) => row.referred_by_user_id).length,
      kpis: [
        { key: "users", label: "App users", value: usersInRange.length, allTime: users.length, hint: "Accounts created" },
        { key: "waitlist", label: "Waitlist", value: waitlistInRange.length, allTime: waitlist.length, hint: "Applications received" },
        { key: "approved", label: "Approved", value: approved(waitlist), allTime: approvedAllTime, hint: "Waitlist approvals" },
        { key: "clicks", label: "Outbound clicks", value: clicksInRange.length, allTime: clicks.length, hint: "Links opened from the product" },
        { key: "searches", label: "Total searches", value: searchesInRange.length, allTime: searches.length, hint: "Top nav and AI home searches" },
        { key: "interactions", label: "Investor actions", value: interactionsInRange.length, allTime: interactions.length, hint: "Founder actions on firms" },
        { key: "avgSession", label: "Avg. session (min)", value: avgSessionMinutes, allTime: avgSessionAllTime, hint: "Time spent per visit" },
        { key: "active", label: "Active users", value: activeIds(start, endExclusive), allTime: activeIds(null, null), hint: "Seen in the app" },
      ],
      onboarding: { inRange: onboardedInRange, allTime: onboardedAllTime, profiles: profiles.length },
      series,
      waitlistStatus: breakdown(waitlistInRange.map((row) => row.status), "Unknown"),
      waitlistSources: breakdown(waitlistInRange.map((row) => row.source), "Direct"),
      waitlistRoles: breakdown(waitlistInRange.map((row) => row.role), "Unspecified"),
      clickTypes: breakdown(clicksInRange.map((row) => row.type), "Unspecified"),
      interactionTypes: breakdown(interactionsInRange.map((row) => row.action_type), "Unspecified"),
      profileTypes: breakdown(profilesInRange.map((row) => row.user_type), "Unspecified"),
      navSectionStats,
      investorReviewStats,
      investorReviewRatings,
      topInvestorRecords,
      topInvestorPeople,
      avgSessionSpark,
      recent,
    }), { headers: jsonHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: jsonHeaders,
    });
  }
});
