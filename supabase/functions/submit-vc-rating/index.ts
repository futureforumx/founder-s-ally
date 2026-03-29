import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtSub, resolveEdgeUserId } from "../_shared/jwt-sub.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isVcPersonFkViolation(err: { code?: string; message?: string; details?: string } | null): boolean {
  if (!err || typeof err !== "object") return false;
  const blob = `${err.code ?? ""} ${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return (
    err.code === "23503" ||
    (blob.includes("vc_person") && (blob.includes("foreign key") || blob.includes("violates")))
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: {
    userId?: string;
    reviewRecordId?: string | null;
    payload?: Record<string, unknown>;
  } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  const uid = typeof body.userId === "string" ? body.userId.trim() : "";
  const sub = jwtSub(authHeader);
  // Clerk default session JWT: `sub` is the Clerk user id — same as body.userId from the app.
  const idRes =
    uid && sub && sub === uid
      ? ({ ok: true as const, userId: uid })
      : resolveEdgeUserId(authHeader, body.userId);
  if (!idRes.ok) {
    return new Response(JSON.stringify({ error: idRes.error }), {
      status: idRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = idRes.userId;

  const rawPayload = body.payload;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return new Response(JSON.stringify({ error: "payload must be an object" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload: Record<string, unknown> = { ...rawPayload, author_user_id: userId };

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(url, serviceKey);
  const reviewRecordId =
    typeof body.reviewRecordId === "string" && body.reviewRecordId.trim().length > 0
      ? body.reviewRecordId.trim()
      : null;

  const insertWithPersonFallback = async (p: Record<string, unknown>) => {
    const { error } = await admin.from("vc_ratings").insert(p);
    if (!error) return null;
    if (isVcPersonFkViolation(error) && p.vc_person_id) {
      const { error: e2 } = await admin.from("vc_ratings").insert({ ...p, vc_person_id: null });
      return e2;
    }
    return error;
  };

  const jsonErr = (status: number, message: string, extra?: Record<string, unknown>) =>
    new Response(JSON.stringify({ error: message, ...extra }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (reviewRecordId) {
    const { error: updateError } = await admin
      .from("vc_ratings")
      .update(payload)
      .eq("id", reviewRecordId)
      .eq("author_user_id", userId);

    if (!updateError) {
      return new Response(JSON.stringify({ ok: true, savedAsRevision: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const insertErr = await insertWithPersonFallback(payload);
    if (!insertErr) {
      return new Response(JSON.stringify({ ok: true, savedAsRevision: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return jsonErr(400, insertErr.message ?? "Insert after update failed", {
      code: insertErr.code,
      details: insertErr.details,
    });
  }

  const insertErr = await insertWithPersonFallback(payload);
  if (!insertErr) {
    return new Response(JSON.stringify({ ok: true, savedAsRevision: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return jsonErr(400, insertErr.message ?? "Insert failed", {
    code: insertErr.code,
    details: insertErr.details,
  });
});
