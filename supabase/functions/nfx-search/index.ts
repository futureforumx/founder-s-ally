import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Known aliases for fuzzy matching common shorthand names
const ALIASES: Record<string, string[]> = {
  "andreessen horowitz": ["a16z", "a16", "andreessen"],
  "y combinator": ["yc", "ycombinator"],
  "sequoia capital": ["sequoia"],
  "first round capital": ["first round", "frc"],
  "founders fund": ["ff", "founders"],
  "general catalyst": ["gc", "generalcatalyst"],
  "kleiner perkins": ["kp", "kpcb", "kleiner"],
  "bessemer venture partners": ["bessemer", "bvp"],
  "lightspeed venture partners": ["lightspeed", "lsvp"],
  "initialized capital": ["initialized"],
  "accel": ["accel partners"],
  "nea": ["new enterprise associates"],
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ results: [], source: "none" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmed = query.trim();

    // 1. Try Apify NFX Signal first
    const APIFY_API_KEY = Deno.env.get("APIFY_API_KEY");
    if (APIFY_API_KEY) {
      try {
        const actorId = "curious_coder~nfx-signal-scraper";
        const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const apifyResponse = await fetch(runUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ searchQuery: trimmed, maxItems: 8 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (apifyResponse.ok) {
          const items = await apifyResponse.json();
          const results = (Array.isArray(items) ? items : []).slice(0, 8).map((item: Record<string, unknown>) => ({
            name: item.name || item.firmName || item.title || "Unknown Fund",
            location: item.location || item.headquarters || item.city || "",
            logoUrl: item.logoUrl || item.imageUrl || item.logo || "",
            stage: item.stage || item.preferredStage || "",
            verticals: item.verticals || item.sectors || [],
          }));

          if (results.length > 0) {
            return new Response(
              JSON.stringify({ results, source: "nfx" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      } catch (e) {
        console.warn("Apify call failed, falling through:", e);
      }
    }

    // 2. Fallback: query local firm_records with fuzzy + alias matching
    return await globalDatabaseSearch(trimmed);
  } catch (error: unknown) {
    console.error("NFX search error:", error);
    try {
      const body = await req.clone().json().catch(() => ({ query: "" }));
      return await globalDatabaseSearch(body.query || "");
    } catch {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(
        JSON.stringify({ error: message, results: [], source: "error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
});

async function globalDatabaseSearch(query: string): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(
      JSON.stringify({ results: [], source: "global" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const lowerQuery = query.toLowerCase().trim();

  // Resolve aliases: if user types "a16", find "Andreessen Horowitz"
  const resolvedNames: string[] = [];
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      if (alias.includes(lowerQuery) || lowerQuery.includes(alias)) {
        resolvedNames.push(canonical);
        break;
      }
    }
  }

  // Build OR query: ilike on original query + any alias-resolved names
  let filterParts = [`firm_name.ilike.*${encodeURIComponent(query)}*`];
  for (const name of resolvedNames) {
    filterParts.push(`firm_name.ilike.*${encodeURIComponent(name)}*`);
  }

  const orFilter = filterParts.join(",");
  const url = `${SUPABASE_URL}/rest/v1/firm_records?or=(${orFilter})&select=firm_name,location,preferred_stage,thesis_verticals,min_check_size,max_check_size&limit=8`;

  const dbResponse = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  const dbItems = await dbResponse.json();
  const results = (Array.isArray(dbItems) ? dbItems : []).map((item: Record<string, unknown>) => ({
    name: (item.firm_name as string) || "Unknown",
    location: (item.location as string) || "",
    logoUrl: "",
    stage: (item.preferred_stage as string) || "",
    verticals: item.thesis_verticals || [],
    checkRange: item.min_check_size && item.max_check_size
      ? `$${((item.min_check_size as number) / 1_000_000).toFixed(1)}M–$${((item.max_check_size as number) / 1_000_000).toFixed(1)}M`
      : undefined,
  }));

  return new Response(
    JSON.stringify({ results, source: "global" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
