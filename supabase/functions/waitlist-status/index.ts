import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WAITLIST_BASE_URL =
  Deno.env.get("WAITLIST_BASE_URL") || "https://vekta.app";

function asRpcJsonObject(data: unknown): Record<string, unknown> {
  if (data != null && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

function waitlistReferralShareUrl(code: string): string {
  const base = WAITLIST_BASE_URL.replace(/\/$/, "");
  const path = `${base}/access`;
  const t = code.trim();
  if (!t) return path;
  return `${path}?ref=${encodeURIComponent(t)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let email: string | null = null;
    let referralCode: string | null = null;

    if (req.method === "GET") {
      email = url.searchParams.get("email");
      referralCode = url.searchParams.get("referral_code");
    } else {
      const body = await req.json();
      email = body.email ?? null;
      referralCode = body.referral_code ?? null;
    }

    if (!email && !referralCode) {
      return new Response(
        JSON.stringify({ error: "Provide email or referral_code" }),
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

    const { data, error } = await supabase.rpc("waitlist_get_status", {
      p_email: email,
      p_referral_code: referralCode,
    });

    if (error) {
      console.error("waitlist_get_status RPC error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const rpcPayload = asRpcJsonObject(data);
    if (Deno.env.get("WAITLIST_DEBUG") === "1") {
      console.log("[waitlist-status] waitlist_get_status RPC payload:", JSON.stringify(rpcPayload));
    }

    if (rpcPayload.error) {
      return new Response(
        JSON.stringify({ error: rpcPayload.error }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const result = {
      ...rpcPayload,
      referral_link: waitlistReferralShareUrl(String(rpcPayload.referral_code ?? "")),
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("waitlist-status error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
