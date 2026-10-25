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
const STALL_MS = 86_400_000;

type AnalyticsRange = "1d" | "3d" | "7d" | "30d" | "90d" | "all";

const RANGE_DAYS: Record<Exclude<AnalyticsRange, "all">, number> = {
  "1d": 1,
  "3d": 3,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const STEPS = [
  { index: 1, key: "personal-details", title: "Let’s confirm your details", code: "PERSONAL-DETAILS", fields: ["firstName", "lastName", "email", "linkedinUrl", "twitterUrl", "substackUrl", "tiktokUrl"] },
  { index: 2, key: "path", title: "Welcome to Vekta", code: "PATH", fields: ["userType", "title"] },
  { index: 3, key: "company", title: "Your Company", code: "COMPANY", fields: ["companyName", "websiteUrl", "stage", "sectors"] },
  { index: 4, key: "connections", title: "Bring your network into focus", code: "CONNECTIONS", fields: ["connectedIntegrations"] },
  { index: 5, key: "materials", title: "Add the numbers investors ask for", code: "MATERIALS", fields: ["revenueBand", "recurringRevenue", "burnRate", "cac", "ltv", "headcount", "cofounderCount", "superpowers", "currentlyRaising", "targetRaise", "roundType", "targetCloseDate"] },
] as const;

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

function parseRange(value: unknown): AnalyticsRange {
  if (value === "all") return "all";
  if (typeof value === "string" && value in RANGE_DAYS) return value as Exclude<AnalyticsRange, "all">;
  return "30d";
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function rangeWindow(range: AnalyticsRange, now: Date): { start: Date | null; endExclusive: Date | null } {
  if (range === "all") return { start: null, endExclusive: null };
  const start = utcDay(now);
  start.setUTCDate(start.getUTCDate() - (RANGE_DAYS[range] - 1));
  return { start, endExclusive: new Date(utcDay(now).getTime() + 86_400_000) };
}

function previousWindow(range: AnalyticsRange, now: Date): { start: Date | null; endExclusive: Date | null } {
  if (range === "all") return { start: null, endExclusive: null };
  const current = rangeWindow(range, now);
  if (!current.start || !current.endExclusive) return { start: null, endExclusive: null };
  const span = current.endExclusive.getTime() - current.start.getTime();
  return { start: new Date(current.start.getTime() - span), endExclusive: current.start };
}

function inRange(iso: string | null | undefined, start: Date | null, endExclusive: Date | null): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return false;
  if (start && time < start.getTime()) return false;
  if (endExclusive && time >= endExclusive.getTime()) return false;
  return true;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function asIso(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function fieldFilled(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value === true;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

function wizardOf(data: Record<string, unknown>): Record<string, unknown> {
  return asRecord(data.wizardState);
}

function personaLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Unspecified";
  const lower = raw.toLowerCase();
  if (lower === "founder") return "Founder";
  if (lower === "investor") return "Investor";
  if (lower === "operator") return "Operator";
  if (lower === "angel") return "Angel";
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fieldsCompleted(wizard: Record<string, unknown>, keys: readonly string[]): number {
  return keys.filter((key) => fieldFilled(wizard[key])).length;
}

function reachedStep(completed: boolean, wizard: Record<string, unknown>, stepIndex: number): boolean {
  if (completed) return true;
  const current = Number(wizard.step);
  if (Number.isFinite(current) && current >= stepIndex) return true;
  const step = STEPS[stepIndex - 1];
  return step ? fieldsCompleted(wizard, step.fields) > 0 : false;
}

function furthestStep(completed: boolean, wizard: Record<string, unknown>): number {
  if (completed) return 5;
  for (let index = STEPS.length; index >= 1; index -= 1) {
    if (reachedStep(false, wizard, index)) return index;
  }
  return 1;
}

type Journey = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  persona: string;
  completed: boolean;
  startedAt: string;
  completedAt: string | null;
  lastActiveAt: string;
  furthest: number;
  wizard: Record<string, unknown>;
  durations: Record<string, number>;
};

function durationMap(value: unknown): Record<string, number> {
  const source = asRecord(value);
  const next: Record<string, number> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) next[key] = raw;
  }
  return next;
}

function buildJourney(
  profile: { user_id: string; full_name: string; avatar_url: string | null; user_type: string; has_completed_onboarding: boolean; created_at: string; updated_at: string },
  pref: { onboarding_data: unknown; created_at: string; updated_at: string } | undefined,
  email: string,
): Journey | null {
  const data = asRecord(pref?.onboarding_data);
  const wizard = wizardOf(data);
  const hasWizard = Object.keys(wizard).length > 0;
  const completed = profile.has_completed_onboarding === true;
  if (!completed && !hasWizard && !pref) return null;

  const startedAt = asIso(data.startedAt) ?? pref?.created_at ?? profile.created_at;
  const completedAt = completed
    ? asIso(data.completedAt) ?? (pref && pref.updated_at !== pref.created_at ? pref.updated_at : null) ?? (profile.updated_at !== profile.created_at ? profile.updated_at : profile.created_at)
    : null;
  const lastActiveAt = pref?.updated_at ?? profile.updated_at ?? profile.created_at;
  const persona = personaLabel(wizard.userType || data.userType || profile.user_type);
  const name = [wizard.firstName, wizard.lastName].filter((part) => typeof part === "string" && part.trim()).join(" ")
    || (typeof data.firstName === "string" || typeof data.lastName === "string"
      ? [data.firstName, data.lastName].filter((part) => typeof part === "string" && String(part).trim()).join(" ")
      : "")
    || profile.full_name?.trim()
    || "";

  return {
    userId: profile.user_id,
    name,
    email: (typeof wizard.email === "string" && wizard.email.trim()) || (typeof data.email === "string" && data.email.trim()) || email,
    avatarUrl: profile.avatar_url,
    persona,
    completed,
    startedAt,
    completedAt,
    lastActiveAt,
    furthest: furthestStep(completed, wizard),
    wizard,
    durations: durationMap(data.stepDurationsMs),
  };
}

function windowMetrics(journeys: Journey[], start: Date | null, endExclusive: Date | null) {
  const started = journeys.filter((row) => inRange(row.startedAt, start, endExclusive));
  const completed = journeys.filter((row) => row.completed && inRange(row.completedAt, start, endExclusive));
  const durations = completed
    .map((row) => {
      if (!row.completedAt) return null;
      const ms = Date.parse(row.completedAt) - Date.parse(row.startedAt);
      return Number.isFinite(ms) && ms > 0 ? ms : null;
    })
    .filter((ms): ms is number => ms != null);

  const rate = started.length > 0 ? (completed.length / started.length) * 100 : null;

  return {
    started: started.length,
    completed: completed.length,
    completionRate: rate,
    medianCompleteMs: median(durations),
    cohort: started,
  };
}

function stepRows(cohort: Journey[]) {
  const started = Math.max(1, cohort.length);
  const reached = STEPS.map((step) => cohort.filter((row) => row.completed || row.furthest >= step.index).length);
  const dropOffs = STEPS.map((step, index) => {
    if (index === STEPS.length - 1) return null;
    const from = reached[index];
    const to = reached[index + 1];
    if (from <= 0) return null;
    return ((from - to) / from) * 100;
  });
  const highest = dropOffs.reduce<{ index: number; value: number } | null>((best, value, index) => {
    if (value == null) return best;
    if (!best || value > best.value) return { index, value };
    return best;
  }, null);

  return STEPS.map((step, index) => {
    const count = reached[index];
    const stepDurations = cohort
      .map((row) => row.durations[String(step.index)])
      .filter((ms): ms is number => typeof ms === "number" && ms > 0);

    return {
      index: step.index,
      key: step.key,
      title: step.title,
      code: step.code,
      fieldCount: step.fields.length,
      reached: count,
      percent: cohort.length > 0 ? (count / started) * 100 : 0,
      dropOff: dropOffs[index],
      medianMs: median(stepDurations),
      highestDropOff: highest?.index === index && (highest.value ?? 0) > 0,
    };
  });
}

function personaRows(cohort: Journey[]) {
  const pathReached = cohort.filter((row) => row.completed || row.furthest >= 2);
  const groups = new Map<string, { started: number; completed: number }>();
  for (const row of pathReached) {
    const current = groups.get(row.persona) ?? { started: 0, completed: 0 };
    current.started += 1;
    if (row.completed) current.completed += 1;
    groups.set(row.persona, current);
  }

  return [...groups.entries()]
    .map(([label, counts]) => ({
      label,
      started: counts.started,
      completed: counts.completed,
      conversion: counts.started > 0 ? (counts.completed / counts.started) * 100 : null,
    }))
    .sort((a, b) => b.started - a.started || a.label.localeCompare(b.label));
}

function stalledRows(journeys: Journey[], now: number) {
  return journeys
    .filter((row) => !row.completed)
    .map((row) => {
      const step = STEPS[row.furthest - 1] ?? STEPS[0];
      const stalledMs = now - Date.parse(row.lastActiveAt);
      const status = Number.isFinite(stalledMs) && stalledMs >= STALL_MS ? "stalled" : "incomplete";
      return {
        id: row.userId,
        name: row.name.trim() || "Profile incomplete",
        email: row.email,
        avatarUrl: row.avatarUrl,
        persona: row.persona,
        status,
        furthestStep: step.index,
        furthestStepTitle: step.title,
        furthestStepKey: step.code,
        fieldsCompleted: fieldsCompleted(row.wizard, step.fields),
        fieldsTotal: step.fields.length,
        stalledAt: row.lastActiveAt,
        draft: {
          firstName: row.wizard.firstName ?? null,
          lastName: row.wizard.lastName ?? null,
          email: row.wizard.email ?? row.email,
          userType: row.wizard.userType ?? row.persona,
          title: row.wizard.title ?? null,
          companyName: row.wizard.companyName ?? null,
          websiteUrl: row.wizard.websiteUrl ?? null,
          stage: row.wizard.stage ?? null,
          sectors: row.wizard.sectors ?? [],
          connectedIntegrations: row.wizard.connectedIntegrations ?? [],
          step: row.wizard.step ?? row.furthest,
        },
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "stalled" ? -1 : 1;
      return Date.parse(a.stalledAt) - Date.parse(b.stalledAt);
    });
}

async function assertAdmin(req: Request) {
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
      const clerkUser = await clerkGetUser(clerkSecret, resolved.id);
      callerEmail = clerkUser ? (clerkPrimaryEmail(clerkUser) || null) : null;
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

  return adminClient;
}

async function loadJourneys(adminClient: ReturnType<typeof createClient>): Promise<Journey[]> {
  const [profilesResult, prefsResult, usersResult] = await Promise.all([
    adminClient.from("profiles").select("user_id, full_name, avatar_url, user_type, has_completed_onboarding, created_at, updated_at").limit(ROW_LIMIT),
    adminClient.from("user_preferences").select("user_id, onboarding_data, created_at, updated_at").limit(ROW_LIMIT),
    adminClient.from("users").select("id, email").limit(ROW_LIMIT),
  ]);

  const failures = [profilesResult.error, prefsResult.error, usersResult.error].filter(Boolean);
  if (failures.length) throw new Error(failures[0]!.message);

  const prefsByUser = new Map((prefsResult.data ?? []).map((row) => [row.user_id, row]));
  const emailByUser = new Map((usersResult.data ?? []).map((row) => [row.id, row.email]));
  const journeys: Journey[] = [];

  for (const profile of profilesResult.data ?? []) {
    const journey = buildJourney(profile, prefsByUser.get(profile.user_id), emailByUser.get(profile.user_id) ?? "");
    if (journey) journeys.push(journey);
  }

  return journeys;
}

function nudgeHtml(name: string, stepTitle: string): string {
  const label = name.trim() || "there";
  return `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:32px;background:#050505;color:#eee;font-family:Inter,Arial,sans-serif;">
  <p style="margin:0 0 16px;font-size:16px;">Hi ${label},</p>
  <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#b3b3b3;">You left Vekta onboarding at <strong style="color:#eee;">${stepTitle}</strong>. Finish the remaining fields and your workspace will be ready.</p>
  <p style="margin:24px 0;"><a href="https://app.vekta.so/onboarding" style="display:inline-block;background:#5B5CFF;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600;">Continue onboarding</a></p>
  <p style="margin:0;font-size:12px;color:#737373;">Vekta</p>
  </body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const adminClient = await assertAdmin(req);
    let body: { range?: unknown; action?: unknown; userId?: unknown } = {};
    if (req.method !== "GET") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    } else {
      body = { range: new URL(req.url).searchParams.get("range") };
    }

    if (body.action === "nudge" || body.action === "force_approve") {
      const userId = typeof body.userId === "string" ? body.userId : "";
      if (!userId) throw new Error("userId is required");

      const { data: profile, error: profileError } = await adminClient
        .from("profiles")
        .select("user_id, full_name, has_completed_onboarding")
        .eq("user_id", userId)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (!profile) throw new Error("Profile not found");

      const { data: pref } = await adminClient
        .from("user_preferences")
        .select("user_id, onboarding_data, created_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      const { data: userRow } = await adminClient.from("users").select("email").eq("id", userId).maybeSingle();
      const journey = buildJourney(
        {
          user_id: profile.user_id,
          full_name: profile.full_name,
          avatar_url: null,
          user_type: "founder",
          has_completed_onboarding: profile.has_completed_onboarding,
          created_at: pref?.created_at ?? new Date().toISOString(),
          updated_at: pref?.updated_at ?? new Date().toISOString(),
        },
        pref ?? undefined,
        userRow?.email ?? "",
      );

      if (body.action === "nudge") {
        const email = journey?.email || userRow?.email || "";
        if (!email) throw new Error("No email on this profile");
        const resendKey = Deno.env.get("RESEND_API_KEY");
        const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")?.trim() || "Vekta <onboarding@resend.dev>";
        if (!resendKey) throw new Error("RESEND_API_KEY is not configured");
        const step = STEPS[(journey?.furthest ?? 1) - 1] ?? STEPS[0];
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: "Finish setting up Vekta",
            html: nudgeHtml(journey?.name || profile.full_name, step.title),
          }),
        });
        if (!resendRes.ok) throw new Error(`Resend rejected the send (${resendRes.status})`);
        return new Response(JSON.stringify({ ok: true, action: "nudge" }), { headers: jsonHeaders });
      }

      const now = new Date().toISOString();
      const nextData = {
        ...asRecord(pref?.onboarding_data),
        completedAt: now,
      };
      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ has_completed_onboarding: true, updated_at: now })
        .eq("user_id", userId);
      if (updateError) throw new Error(updateError.message);
      if (pref) {
        await adminClient.from("user_preferences").update({ onboarding_data: nextData, updated_at: now }).eq("user_id", userId);
      }
      return new Response(JSON.stringify({ ok: true, action: "force_approve" }), { headers: jsonHeaders });
    }

    const now = new Date();
    const range = parseRange(body.range);
    const current = rangeWindow(range, now);
    const previous = previousWindow(range, now);
    const journeys = await loadJourneys(adminClient);
    const currentMetrics = windowMetrics(journeys, current.start, current.endExclusive);
    const previousMetrics = windowMetrics(journeys, previous.start, previous.endExclusive);
    const completionRateDelta =
      currentMetrics.completionRate == null || previousMetrics.completionRate == null
        ? null
        : currentMetrics.completionRate - previousMetrics.completionRate;

    return new Response(JSON.stringify({
      range,
      generatedAt: now.toISOString(),
      kpis: {
        started: currentMetrics.started,
        completed: currentMetrics.completed,
        completionRate: currentMetrics.completionRate,
        completionRateDelta,
        medianCompleteMs: currentMetrics.medianCompleteMs,
      },
      steps: stepRows(currentMetrics.cohort),
      personas: personaRows(currentMetrics.cohort),
      stalled: stalledRows(journeys.filter((row) => !row.completed), now.getTime()),
    }), { headers: jsonHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: jsonHeaders,
    });
  }
});
