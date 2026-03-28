import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveEdgeUserId } from "../_shared/jwt-sub.ts";
import { ensureManagerMembership } from "../_shared/ensure-manager-membership.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: { companyId?: string; userId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  const idRes = resolveEdgeUserId(req.headers.get("Authorization"), body.userId);
  if (!idRes.ok) {
    return new Response(JSON.stringify({ error: idRes.error }), {
      status: idRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sub = idRes.userId;

  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) {
    return new Response(JSON.stringify({ error: "companyId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(url, serviceKey);

  const { data: row, error: selErr } = await admin
    .from("company_analyses")
    .select("id, is_claimed, claimed_by")
    .eq("id", companyId)
    .maybeSingle();

  if (selErr || !row) {
    return new Response(JSON.stringify({ error: selErr?.message || "Company not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const prevClaimedBy = row.claimed_by;
  const prevIsClaimed = row.is_claimed;

  const taken =
    row.is_claimed === true &&
    row.claimed_by != null &&
    String(row.claimed_by) !== sub;
  if (taken) {
    return new Response(JSON.stringify({ error: "This company is already claimed by another account." }), {
      status: 409,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: upErr } = await admin
    .from("company_analyses")
    .update({ claimed_by: sub, is_claimed: true })
    .eq("id", companyId);

  if (upErr) {
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rollbackClaim = async () => {
    await admin
      .from("company_analyses")
      .update({ claimed_by: prevClaimedBy, is_claimed: prevIsClaimed })
      .eq("id", companyId);
  };

  const mem = await ensureManagerMembership(admin, sub, companyId);
  if (!mem.ok) {
    await rollbackClaim();
    return new Response(JSON.stringify({ error: mem.error }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: memRow, error: memSelErr } = await admin
    .from("company_members")
    .select("id")
    .eq("user_id", sub)
    .eq("company_id", companyId)
    .maybeSingle();

  if (memSelErr || !memRow?.id) {
    await rollbackClaim();
    return new Response(JSON.stringify({ error: memSelErr?.message || "Membership row missing after upsert" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const membershipRowId = memRow.id as string;

  await admin.from("profiles").update({ company_id: companyId }).eq("user_id", sub);

  return new Response(
    JSON.stringify({
      success: true,
      companyId,
      membershipId: membershipRowId,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
