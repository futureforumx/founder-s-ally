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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function decisionEmailContent(applicant: WaitlistApplicant, status: DecisionStatus) {
  const firstName = applicant.name?.trim().split(/\s+/)[0] || "there";
  const greeting = escapeHtml(firstName);

  if (status === "approved") {
    return {
      subject: "You're approved — welcome to Vekta",
      text: `Hi ${firstName},\n\nYour Vekta access request has been approved. Sign in with this email to continue: https://vekta.so/login\n\nWelcome to Vekta.\n— The Vekta Team`,
      html: `<div style="margin:0;background:#080808;padding:40px 20px;font-family:Inter,Arial,sans-serif;color:#f5f5f5"><div style="max-width:560px;margin:0 auto;border:1px solid #262626;border-radius:12px;background:#0d0d0d;padding:36px"><div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#2ee6a6">Access approved</div><h1 style="margin:14px 0 18px;font-size:28px;line-height:1.2;color:#fff">Welcome to Vekta</h1><p style="margin:0 0 16px;line-height:1.7;color:#d4d4d4">Hi ${greeting},</p><p style="margin:0 0 26px;line-height:1.7;color:#d4d4d4">Your Vekta access request has been approved. Sign in with this email to continue.</p><a href="https://vekta.so/login" style="display:inline-block;border-radius:7px;background:#2ee6a6;padding:12px 20px;color:#04130e;text-decoration:none;font-weight:700">Sign in to Vekta</a><p style="margin:28px 0 0;line-height:1.6;color:#737373;font-size:13px">Welcome aboard.<br>— The Vekta Team</p></div></div>`,
    };
  }

  return {
    subject: "An update on your Vekta access request",
    text: `Hi ${firstName},\n\nThank you for your interest in Vekta. We're unable to approve your access request at this time. We appreciate the time you took to apply and will keep you in mind as access expands.\n\n— The Vekta Team`,
    html: `<div style="margin:0;background:#080808;padding:40px 20px;font-family:Inter,Arial,sans-serif;color:#f5f5f5"><div style="max-width:560px;margin:0 auto;border:1px solid #262626;border-radius:12px;background:#0d0d0d;padding:36px"><div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#a3a3a3">Access request update</div><h1 style="margin:14px 0 18px;font-size:28px;line-height:1.2;color:#fff">Thank you for your interest</h1><p style="margin:0 0 16px;line-height:1.7;color:#d4d4d4">Hi ${greeting},</p><p style="margin:0 0 16px;line-height:1.7;color:#d4d4d4">We're unable to approve your Vekta access request at this time.</p><p style="margin:0;line-height:1.7;color:#a3a3a3">We appreciate the time you took to apply and will keep you in mind as access expands.</p><p style="margin:28px 0 0;line-height:1.6;color:#737373;font-size:13px">— The Vekta Team</p></div></div>`,
  };
}

async function sendDecisionEmail(
  applicant: WaitlistApplicant,
  status: DecisionStatus,
): Promise<DecisionEmailResult> {
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!resendKey) {
    return { sent: false, status: "not_configured", detail: "RESEND_API_KEY is not configured" };
  }

  const content = decisionEmailContent(applicant, status);
  const reviewedAt = applicant.reviewed_at ? Date.parse(applicant.reviewed_at) : Date.now();
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `waitlist-decision/${applicant.id}/${status}/${reviewedAt}`,
      },
      body: JSON.stringify({
        from: Deno.env.get("WAITLIST_DECISION_FROM_EMAIL")?.trim() ||
          "Vekta Access <access@updates.vekta.so>",
        to: [applicant.email],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    });
    const responseBody = await response.text().catch(() => "");
    if (!response.ok) {
      let detail = `Resend HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(responseBody) as { message?: unknown };
        if (typeof parsed.message === "string") detail += `: ${parsed.message.slice(0, 240)}`;
      } catch {
        // Do not persist arbitrary provider HTML in the audit log.
      }
      return { sent: false, status: "failed", detail };
    }

    let messageId: string | undefined;
    try {
      const parsed = JSON.parse(responseBody) as { id?: unknown };
      if (typeof parsed.id === "string") messageId = parsed.id;
    } catch {
      // A successful status is sufficient if Resend returns no JSON body.
    }
    return { sent: true, status: "sent", messageId };
  } catch (error) {
    return {
      sent: false,
      status: "failed",
      detail: error instanceof Error ? error.message : "Unexpected Resend error",
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
      provider: "resend",
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
          "id, created_at, updated_at, email, name, role, company_name, linkedin_url, source, status, priority_access, referral_count, total_score, waitlist_position, reviewed_at, reviewed_by, reviewed_by_email",
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

    throw new Error("Unsupported action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Method not allowed" ? 405 : 400;
    return new Response(JSON.stringify({ error: message }), { status, headers: jsonHeaders });
  }
});
