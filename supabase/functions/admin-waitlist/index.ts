import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autoPermissionForEmail,
  clampGodModeToDesignatedEmail,
  hasAdminConsoleAccess,
  type AppPermission,
} from "../_shared/app-admin-email.ts";
import { resolveAdminCaller } from "../_shared/admin-resolve-caller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const reviewStatuses = new Set(["pending", "approved", "rejected"]);

type DecisionStatus = "approved" | "rejected";

type WaitlistApplicant = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  reviewed_at: string | null;
};

type DecisionEmailResult = {
  sent: boolean;
  status: "sent" | "not_configured" | "failed" | "unchanged" | "not_applicable";
  detail?: string;
  messageId?: string;
};

const DEFAULT_APPROVAL_TRANSACTIONAL_ID = "cmscl69gf4s540j1bb0kbgikb";
const DEFAULT_REJECTION_TRANSACTIONAL_ID = "cmsclviu10xw80jzs6f4vg7l3";

async function sendDecisionEmail(
  applicant: WaitlistApplicant,
  status: DecisionStatus,
): Promise<DecisionEmailResult> {
  const loopsApiKey = (Deno.env.get("LOOPS_API_KEY_WAITLIST") ?? Deno.env.get("LOOPS_API_KEY"))?.trim();
  const transactionalId = status === "approved"
    ? Deno.env.get("LOOPS_WAITLIST_APPROVAL_TRANSACTIONAL_ID")?.trim() || DEFAULT_APPROVAL_TRANSACTIONAL_ID
    : Deno.env.get("LOOPS_WAITLIST_REJECTION_TRANSACTIONAL_ID")?.trim() || DEFAULT_REJECTION_TRANSACTIONAL_ID;
  if (!loopsApiKey || !transactionalId) {
    return { sent: false, status: "not_configured", detail: "Loops decision email is not configured" };
  }

  const reviewedAt = applicant.reviewed_at ? Date.parse(applicant.reviewed_at) : Date.now();
  const firstName = applicant.name?.trim().split(/\s+/)[0] || "there";
  const knownDataVariables: Record<string, string> = {
    firstname: firstName,
    firstName,
    first_name: firstName,
    email: applicant.email,
    loginLink: "https://vekta.so/login",
    login_link: "https://vekta.so/login",
    loginUrl: "https://vekta.so/login",
    login_url: "https://vekta.so/login",
    status,
  };

  try {
    let dataVariables = knownDataVariables;
    try {
      const templatesResponse = await fetch(
        "https://app.loops.so/api/v1/transactional?perPage=50",
        { headers: { Authorization: `Bearer ${loopsApiKey}` } },
      );
      if (templatesResponse.ok) {
        const templatesBody = await templatesResponse.json() as {
          data?: Array<{ id?: string; dataVariables?: string[] }>;
        };
        const template = templatesBody.data?.find((item) => item.id === transactionalId);
        if (template?.dataVariables) {
          dataVariables = Object.fromEntries(
            template.dataVariables.map((variable) => [variable, knownDataVariables[variable] ?? ""]),
          );
        }
      }
    } catch (error) {
      console.warn("[admin-waitlist] Loops template lookup failed; using compatible aliases:", error);
    }

    const response = await fetch("https://app.loops.so/api/v1/transactional", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${loopsApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `waitlist-decision/${applicant.id}/${status}/${reviewedAt}`,
      },
      body: JSON.stringify({
        transactionalId,
        email: applicant.email,
        addToAudience: true,
        dataVariables,
      }),
    });
    const responseBody = await response.text().catch(() => "");
    if (response.status === 409) {
      return { sent: true, status: "sent" };
    }
    if (!response.ok) {
      let detail = `Loops HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(responseBody) as { message?: unknown; error?: { message?: unknown } };
        const message = parsed.message ?? parsed.error?.message;
        if (typeof message === "string") detail += `: ${message.slice(0, 240)}`;
      } catch {
        // Do not persist arbitrary provider HTML in the audit log.
      }
      return { sent: false, status: "failed", detail };
    }

    try {
      const parsed = JSON.parse(responseBody) as { success?: unknown };
      if (parsed.success !== true) {
        return { sent: false, status: "failed", detail: "Loops did not confirm success" };
      }
    } catch {
      // A successful HTTP status is sufficient if Loops returns no JSON body.
    }
    return { sent: true, status: "sent" };
  } catch (error) {
    return {
      sent: false,
      status: "failed",
      detail: error instanceof Error ? error.message : "Unexpected Loops error",
    };
  }
}

async function recordDecisionEmailResult(
  adminClient: ReturnType<typeof createClient>,
  applicant: WaitlistApplicant,
  decision: DecisionStatus,
  reviewer: { id: string; email: string | null },
  result: DecisionEmailResult,
) {
  const { error } = await adminClient.from("waitlist_events").insert({
    user_id: applicant.id,
    event_type: result.sent ? "decision_email_sent" : "decision_email_not_sent",
    payload: {
      provider: "loops",
      status: decision,
      delivery_status: result.status,
      reviewed_by: reviewer.id,
      reviewed_by_email: reviewer.email,
      ...(result.messageId ? { message_id: result.messageId } : {}),
      ...(result.detail ? { detail: result.detail } : {}),
    },
  });
  if (error) console.warn("[admin-waitlist] decision email audit failed:", error.message);
}

function asPermission(value: unknown): AppPermission | null {
  const permission = String(value ?? "").toLowerCase();
  return permission === "user" || permission === "manager" || permission === "admin" || permission === "god"
    ? permission as AppPermission
    : null;
}

function highestPermission(...candidates: Array<AppPermission | null>): AppPermission {
  const rank: Record<AppPermission, number> = { user: 0, manager: 1, admin: 2, god: 3 };
  return candidates.reduce<AppPermission>(
    (best, next) => next && rank[next] > rank[best] ? next : best,
    "user",
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") throw new Error("Method not allowed");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resolved = await resolveAdminCaller(
      req.headers.get("Authorization"),
      supabaseUrl,
      supabaseAnonKey,
    );
    if ("error" in resolved) throw new Error(resolved.error);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const roleIds = resolved.identityUserIds.length ? resolved.identityUserIds : [resolved.id];
    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("permission")
      .in("user_id", roleIds);
    if (roleError) throw roleError;

    const rolePermission = (roleRows ?? []).reduce<AppPermission | null>(
      (best, row) => highestPermission(best, asPermission(row.permission)),
      null,
    );
    const callerPermission = clampGodModeToDesignatedEmail(
      highestPermission(rolePermission, autoPermissionForEmail(resolved.email)),
      resolved.email,
    );
    if (!hasAdminConsoleAccess(callerPermission)) throw new Error("Admin access required");

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "list");

    if (action === "list") {
      const { data, error } = await adminClient
        .from("waitlist_users")
        .select(
          "id, created_at, updated_at, email, name, role, company_name, linkedin_url, source, campaign, metadata, status, priority_access, referral_count, total_score, waitlist_position, reviewed_at, reviewed_by, reviewed_by_email, admin_notes",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;

      const applicants = data ?? [];
      const counts = applicants.reduce<Record<string, number>>(
        (acc, applicant) => {
          const status = String(applicant.status ?? "pending");
          acc[status] = (acc[status] ?? 0) + 1;
          return acc;
        },
        { all: applicants.length, pending: 0, approved: 0, rejected: 0 },
      );

      return new Response(JSON.stringify({ applicants, counts }), { headers: jsonHeaders });
    }

    if (action === "update_status") {
      const id = String(body.id ?? "").trim();
      const status = String(body.status ?? "").trim().toLowerCase();
      if (!id || !reviewStatuses.has(status)) {
        throw new Error("Invalid payload: id and a supported status are required");
      }

      const { data: existing, error: existingError } = await adminClient
        .from("waitlist_users")
        .select("id, email, name, status, reviewed_at")
        .eq("id", id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) throw new Error("Waitlist applicant not found");
      if (existing.status === status) {
        return new Response(JSON.stringify({
          applicant: existing,
          notification: { sent: false, status: "unchanged" } satisfies DecisionEmailResult,
        }), { headers: jsonHeaders });
      }

      const { data, error } = await adminClient.rpc("admin_update_waitlist_status", {
        p_waitlist_user_id: id,
        p_status: status,
        p_reviewed_by: resolved.id,
        p_reviewed_by_email: resolved.email,
      });
      if (error) throw error;

      const applicant = (Array.isArray(data) ? data[0] : data) as WaitlistApplicant | null;
      if (!applicant) throw new Error("The waitlist update returned no applicant");

      let notification: DecisionEmailResult = {
        sent: false,
        status: "not_applicable",
      };
      if (status === "approved" || status === "rejected") {
        notification = await sendDecisionEmail(applicant, status);
        await recordDecisionEmailResult(
          adminClient,
          applicant,
          status,
          { id: resolved.id, email: resolved.email },
          notification,
        );
      }

      return new Response(JSON.stringify({ applicant, notification }), { headers: jsonHeaders });
    }

    if (action === "update_notes") {
      const id = String(body.id ?? "").trim();
      if (!id) throw new Error("Invalid payload: id is required");
      const rawNotes = typeof body.notes === "string" ? body.notes : "";
      const trimmed = rawNotes.trim().slice(0, 500);
      const notes = trimmed.length ? trimmed : null;

      const { data, error } = await adminClient
        .from("waitlist_users")
        .update({ admin_notes: notes, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select(
          "id, created_at, updated_at, email, name, role, company_name, linkedin_url, source, campaign, metadata, status, priority_access, referral_count, total_score, waitlist_position, reviewed_at, reviewed_by, reviewed_by_email, admin_notes",
        )
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Waitlist applicant not found");

      return new Response(JSON.stringify({ applicant: data }), { headers: jsonHeaders });
    }

    if (action === "delete") {
      const id = String(body.id ?? "").trim();
      if (!id) throw new Error("Invalid payload: id is required");

      const { error } = await adminClient
        .from("waitlist_users")
        .delete()
        .eq("id", id);
      if (error) throw error;

      return new Response(JSON.stringify({ deleted: true, id }), { headers: jsonHeaders });
    }

    throw new Error("Unsupported action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Method not allowed" ? 405 : 400;
    return new Response(JSON.stringify({ error: message }), { status, headers: jsonHeaders });
  }
});
