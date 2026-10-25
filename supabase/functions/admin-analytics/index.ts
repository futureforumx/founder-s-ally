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
    points.set(date, { date, users: 0, waitlist: 0, clicks: 0, interactions: 0 });
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
      adminClient.from("outbound_clicks").select("id, type, context, destination_url, created_at").order("created_at", { ascending: false }).limit(ROW_LIMIT),
      adminClient.from("founder_vc_interactions").select("id, action_type, created_at").order("created_at", { ascending: false }).limit(ROW_LIMIT),
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
    ]);

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
        { key: "interactions", label: "Investor actions", value: interactionsInRange.length, allTime: interactions.length, hint: "Founder actions on firms" },
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
      recent,
    }), { headers: jsonHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: jsonHeaders,
    });
  }
});
