import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveEdgeUserId } from "../_shared/jwt-sub.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");

  let body: { userId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* body is optional */
  }

  const idRes = resolveEdgeUserId(authHeader, body.userId);
  if (!idRes.ok) {
    return new Response(JSON.stringify({ error: idRes.error }), {
      status: idRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = idRes.userId;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(url, serviceKey);

  // Fetch vc_ratings
  const { data: vcRatings, error: vcErr } = await admin
    .from("vc_ratings")
    .select("id, vc_firm_id, vc_person_id, interaction_type, comment, created_at, star_ratings, is_draft")
    .eq("author_user_id", userId)
    .eq("is_draft", false)
    .order("created_at", { ascending: false })
    .limit(100);

  // Fetch investor_reviews (legacy fallback)
  const { data: legacyReviews, error: legacyErr } = await admin
    .from("investor_reviews")
    .select("id, nps_score, interaction_type, comment, created_at, did_respond, firm_id, star_ratings")
    .eq("founder_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  return new Response(
    JSON.stringify({
      vcRatings: vcErr ? [] : (vcRatings ?? []),
      legacyReviews: legacyErr ? [] : (legacyReviews ?? []),
      vcRatingsError: vcErr ? vcErr.message : null,
      legacyError: legacyErr ? legacyErr.message : null,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
