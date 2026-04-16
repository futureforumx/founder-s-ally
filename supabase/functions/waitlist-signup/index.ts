import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WAITLIST_BASE_URL =
  Deno.env.get("WAITLIST_BASE_URL") || "https://vekta.app";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = await req.json();

    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "A valid email is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("waitlist_signup", {
      p_email: email,
      p_name: body.name ?? null,
      p_role: body.role ?? null,
      p_stage: body.stage ?? null,
      p_urgency: body.urgency ?? null,
      p_intent: body.intent ?? [],
      p_biggest_pain: body.biggest_pain ?? null,
      p_company_name: body.company_name ?? null,
      p_linkedin_url: body.linkedin_url ?? null,
      p_source: body.source ?? null,
      p_campaign: body.campaign ?? null,
      p_referral_code_used: body.referral_code ?? null,
      p_metadata: body.metadata ?? {},
    });

    if (error) {
      console.error("waitlist_signup RPC error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (data?.error) {
      return new Response(
        JSON.stringify({ error: data.error }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const result = {
      ...data,
      referral_link: `${WAITLIST_BASE_URL}?ref=${data.referral_code}`,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("waitlist-signup error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
