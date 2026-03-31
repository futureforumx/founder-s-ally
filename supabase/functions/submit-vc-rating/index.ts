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

function isMissingVcRatingsTableError(err: { message?: string; details?: string; hint?: string } | null): boolean {
  if (!err || typeof err !== "object") return false;
  const blob = `${err.message ?? ""} ${err.details ?? ""} ${err.hint ?? ""}`.toLowerCase();
  return blob.includes("could not find the table") && blob.includes("public.vc_ratings");
}

/** When vc_ratings is missing or the row cannot reference directory firms/people, persist to investor_reviews (text firm_id). */
function shouldFallbackToInvestorReviews(err: { code?: string; message?: string; details?: string } | null): boolean {
  if (!err) return false;
  if (isMissingVcRatingsTableError(err)) return true;
  const blob = `${err.code ?? ""} ${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  if (err.code === "23503" && blob.includes("vc_ratings")) return true;
  if (err.code === "23514" && blob.includes("vc_ratings")) return true;
  return false;
}

function buildInvestorReviewUpsertRow(userId: string, payload: Record<string, unknown>): Record<string, unknown> {
  const starRatings =
    payload.star_ratings && typeof payload.star_ratings === "object" && !Array.isArray(payload.star_ratings)
      ? (payload.star_ratings as Record<string, unknown>)
      : {};
  const firmNameFromStar =
    typeof starRatings.firm_name === "string" && starRatings.firm_name.trim().length > 0
      ? starRatings.firm_name.trim()
      : "";
  const derivedFirmId =
    typeof payload.vc_firm_id === "string" && payload.vc_firm_id.trim().length > 0
      ? payload.vc_firm_id.trim()
      : firmNameFromStar || "unknown-firm";
  const npsRaw = payload.nps;
  const npsScore = typeof npsRaw === "number" && Number.isFinite(npsRaw) ? npsRaw : 0;
  const rawPerson =
    typeof payload.vc_person_id === "string" ? payload.vc_person_id.trim() : "";
  return {
    founder_id: userId,
    firm_id: derivedFirmId,
    person_id: rawPerson,
    interaction_type:
      typeof payload.interaction_type === "string" && payload.interaction_type.trim()
        ? payload.interaction_type
        : "investor_relationship",
    nps_score: npsScore,
    did_respond: false,
    comment: typeof payload.comment === "string" ? payload.comment : null,
    star_ratings: starRatings,
    is_anonymous: typeof payload.anonymous === "boolean" ? payload.anonymous : true,
  };
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

  const tryInvestorReviewsUpsert = async (): Promise<{ error: { message?: string; code?: string; details?: string } | null }> => {
    const invRow = buildInvestorReviewUpsertRow(userId, payload);
    const firmId = String(invRow.firm_id ?? "");
    const personId = String(invRow.person_id ?? "");

    const { data: existing, error: selErr } = await admin
      .from("investor_reviews")
      .select("id")
      .eq("founder_id", userId)
      .eq("firm_id", firmId)
      .eq("person_id", personId)
      .maybeSingle();
    if (selErr) return { error: selErr };

    const updatePatch = {
      interaction_type: invRow.interaction_type,
      nps_score: invRow.nps_score,
      did_respond: invRow.did_respond,
      comment: invRow.comment,
      star_ratings: invRow.star_ratings,
      is_anonymous: invRow.is_anonymous,
    };

    if (existing?.id) {
      const { error } = await admin.from("investor_reviews").update(updatePatch).eq("id", existing.id);
      return { error };
    }

    const { error } = await admin.from("investor_reviews").insert(invRow);
    return { error };
  };

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

    if (shouldFallbackToInvestorReviews(updateError)) {
      const { error: invErr } = await tryInvestorReviewsUpsert();
      if (!invErr) {
        return new Response(JSON.stringify({ ok: true, savedAsRevision: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return jsonErr(400, invErr.message ?? updateError.message ?? "Could not save to investor_reviews", {
        code: invErr.code,
        details: invErr.details,
      });
    }

    const insertErr = await insertWithPersonFallback(payload);
    if (!insertErr) {
      return new Response(JSON.stringify({ ok: true, savedAsRevision: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (shouldFallbackToInvestorReviews(insertErr)) {
      const { error: invErr } = await tryInvestorReviewsUpsert();
      if (!invErr) {
        return new Response(JSON.stringify({ ok: true, savedAsRevision: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return jsonErr(400, invErr.message ?? insertErr.message ?? "Could not save to investor_reviews", {
        code: invErr.code,
        details: invErr.details,
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
  if (shouldFallbackToInvestorReviews(insertErr)) {
    const { error: invErr } = await tryInvestorReviewsUpsert();
    if (!invErr) {
      return new Response(JSON.stringify({ ok: true, savedAsRevision: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return jsonErr(400, invErr.message ?? insertErr.message ?? "Could not save to investor_reviews", {
      code: invErr.code,
      details: invErr.details,
    });
  }
  return jsonErr(400, insertErr.message ?? "Insert failed", {
    code: insertErr.code,
    details: insertErr.details,
  });
});
