import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const APIFY_API_KEY = Deno.env.get("APIFY_API_KEY");
  if (!APIFY_API_KEY) {
    return new Response(
      JSON.stringify({ error: "APIFY_API_KEY is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Apify NFX Signal scraper actor synchronously
    const actorId = "curious_coder~nfx-signal-scraper";
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}`;

    const apifyResponse = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchQuery: query.trim(),
        maxItems: 8,
      }),
    });

    if (!apifyResponse.ok) {
      const errorBody = await apifyResponse.text();
      console.error(`Apify API error [${apifyResponse.status}]: ${errorBody}`);

      // Fallback: search the local investor_database instead
      return await fallbackSearch(req, query);
    }

    const items = await apifyResponse.json();

    const results = (Array.isArray(items) ? items : []).slice(0, 8).map((item: Record<string, unknown>) => ({
      name: item.name || item.firmName || item.title || "Unknown Fund",
      location: item.location || item.headquarters || item.city || "",
      logoUrl: item.logoUrl || item.imageUrl || item.logo || "",
      stage: item.stage || item.preferredStage || "",
      verticals: item.verticals || item.sectors || [],
    }));

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("NFX search error:", error);

    // On any failure, try fallback
    try {
      const body = await req.clone().json().catch(() => ({ query: "" }));
      return await fallbackSearch(req, body.query || "");
    } catch {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(
        JSON.stringify({ error: message, results: [] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
});

async function fallbackSearch(_req: Request, query: string): Promise<Response> {
  // Fallback: query the local investor_database table
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(
      JSON.stringify({ results: [], fallback: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const dbResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/investor_database?firm_name=ilike.*${encodeURIComponent(query)}*&select=firm_name,location,preferred_stage,thesis_verticals&limit=8`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  );

  const dbItems = await dbResponse.json();
  const results = (Array.isArray(dbItems) ? dbItems : []).map((item: Record<string, unknown>) => ({
    name: item.firm_name || "Unknown",
    location: (item.location as string) || "",
    logoUrl: "",
    stage: (item.preferred_stage as string) || "",
    verticals: item.thesis_verticals || [],
  }));

  return new Response(
    JSON.stringify({ results, fallback: true }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
