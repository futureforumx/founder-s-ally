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

  let body: { companyName?: string; website?: string; userId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  const authz = req.headers.get("Authorization");
  const idRes = resolveEdgeUserId(authz, body.userId);
  if (!idRes.ok) {
    return new Response(JSON.stringify({ error: idRes.error }), {
      status: idRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sub = idRes.userId;

  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  if (!companyName) {
    return new Response(JSON.stringify({ error: "companyName is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const websiteUrl =
    typeof body.website === "string" && body.website.trim() ? body.website.trim() : null;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(
      JSON.stringify({
        error:
          "Edge function missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. In Supabase Dashboard → Edge Functions → create-company-workspace → Secrets, ensure the service role key is set (or redeploy so auto-injected secrets apply).",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const admin = createClient(url, serviceKey);

  const { data: existingMem } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", sub)
    .in("role", ["owner", "manager", "admin"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingMem?.company_id) {
    return new Response(
      JSON.stringify({ success: true, companyId: existingMem.company_id, created: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: ownRow } = await admin
    .from("company_analyses")
    .select("id")
    .eq("user_id", sub)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ownRow?.id) {
    const mem = await ensureManagerMembership(admin, sub, ownRow.id);
    if (!mem.ok) {
      return new Response(JSON.stringify({ error: mem.error }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("profiles").update({ company_id: ownRow.id }).eq("user_id", sub);

    return new Response(
      JSON.stringify({ success: true, companyId: ownRow.id, created: false, repairedMembership: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const newCompId = crypto.randomUUID();

  const { error: compErr } = await admin.from("company_analyses").insert({
    id: newCompId,
    user_id: sub,
    company_name: companyName,
    website_url: websiteUrl,
    is_claimed: true,
    claimed_by: sub,
  });

  if (compErr) {
    return new Response(JSON.stringify({ error: compErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const mem = await ensureManagerMembership(admin, sub, newCompId);
  if (!mem.ok) {
    await admin.from("company_analyses").delete().eq("id", newCompId);
    return new Response(JSON.stringify({ error: mem.error }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await admin.from("profiles").update({ company_id: newCompId }).eq("user_id", sub);

  return new Response(
    JSON.stringify({ success: true, companyId: newCompId, created: true }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
