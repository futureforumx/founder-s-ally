import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT and get user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { intent } = await req.json().catch(() => ({ intent: "manual_export" }));

    // Check user tier — must be admin or pro
    const { data: creditRow } = await supabase
      .from("user_credits")
      .select("tier")
      .eq("user_id", user.id)
      .maybeSingle();

    const tier = creditRow?.tier || "free";
    if (!["admin", "pro"].includes(tier)) {
      return new Response(
        JSON.stringify({ error: "CSV export requires a Pro or Admin plan." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch investor data (excluding email/email_source for safety)
    const { data: investors, error: fetchError } = await supabase
      .from("firm_records")
      .select("firm_name, lead_partner, thesis_verticals, preferred_stage, min_check_size, max_check_size, location, lead_or_follow, market_sentiment, aum, website_url")
      .order("firm_name");

    if (fetchError) throw fetchError;

    const rows = investors || [];

    // Log the export
    await supabase.from("export_audit_logs").insert({
      user_id: user.id,
      export_type: "csv",
      intent: intent || "manual_export",
      row_count: rows.length,
    });

    // Build CSV
    const headers = [
      "Firm Name", "Lead Partner", "Thesis Verticals", "Preferred Stage",
      "Min Check ($)", "Max Check ($)", "Location", "Lead/Follow",
      "Sentiment", "AUM", "Website"
    ];

    const csvLines = [headers.join(",")];
    for (const r of rows) {
      csvLines.push([
        esc(r.firm_name),
        esc(r.lead_partner),
        esc((r.thesis_verticals || []).join("; ")),
        esc(r.preferred_stage),
        r.min_check_size ?? "",
        r.max_check_size ?? "",
        esc(r.location),
        esc(r.lead_or_follow),
        esc(r.market_sentiment),
        esc(r.aum),
        esc(r.website_url),
      ].join(","));
    }

    const csv = csvLines.join("\n");

    return new Response(csv, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="investor_directory_${Date.now()}.csv"`,
      },
    });
  } catch (e) {
    console.error("export-csv error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function esc(val: unknown): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
