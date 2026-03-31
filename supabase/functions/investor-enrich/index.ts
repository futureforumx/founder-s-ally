// Investor enrichment waterfall: Exa → Gemini Grounded → Local DB
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EnrichedInvestor {
  firmName: string;
  logoUrl: string;
  recentDeals: string[];
  currentThesis: string;
  stage: string;
  geography: string;
  typicalCheckSize: string;
  confidenceScore: number;
  source: "exa" | "gemini_grounded" | "local_db";
  lastVerified: string;
}

// ── Tier 1: Exa Neural Search ──
async function tier1Exa(investorName: string): Promise<EnrichedInvestor | null> {
  const exaApiKey = Deno.env.get("EXA_API_KEY");
  if (!exaApiKey) {
    console.warn("EXA_API_KEY not set, skipping Tier 1");
    return null;
  }

  try {
    const searchResp = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": exaApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `${investorName} venture capital firm official website portfolio investments`,
        type: "auto",
        numResults: 5,
        contents: {
          text: { maxCharacters: 3000 },
          highlights: {
            query: `${investorName} investment thesis portfolio deals`,
            highlightsPerUrl: 3,
            numSentences: 3,
          },
        },
      }),
    });

    if (!searchResp.ok) {
      console.error(`Exa API error: ${searchResp.status}`);
      return null;
    }

    const searchData = await searchResp.json();
    const results = searchData?.results || [];
    if (results.length === 0) return null;

    // Build context for LLM extraction
    const snippets = results
      .map((r: any, i: number) => {
        const highlights = (r.highlights || []).join(" ");
        const text = r.text ? r.text.substring(0, 800) : "";
        return `[Source ${i + 1}] URL: ${r.url}\nTitle: ${r.title}\n${highlights} ${text}`.trim();
      })
      .join("\n\n");

    // Use Gemini to extract structured data from Exa results
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      console.warn("LOVABLE_API_KEY not set, cannot parse Exa results");
      return null;
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a venture capital analyst. Extract structured data about the investor "${investorName}" from the provided search results. Be precise and factual. If information is not found, leave fields empty. Assign a confidenceScore between 0 and 1 based on how much reliable data you found.`,
          },
          {
            role: "user",
            content: `Extract investor profile data for "${investorName}" from these search results:\n\n${snippets}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_investor_profile",
              description: "Extract structured investor profile from search results",
              parameters: {
                type: "object",
                properties: {
                  firmName: { type: "string", description: "Official firm name" },
                  logoUrl: { type: "string", description: "URL to the firm's logo if found, empty string otherwise" },
                  recentDeals: {
                    type: "array",
                    items: { type: "string" },
                    description: "Up to 5 most recent portfolio companies or deals",
                  },
                  currentThesis: { type: "string", description: "Current investment thesis summary (1-2 sentences)" },
                  stage: { type: "string", description: "Preferred investment stage (e.g. Seed, Series A)" },
                  geography: { type: "string", description: "Primary geographic focus" },
                  typicalCheckSize: { type: "string", description: "Typical check size range (e.g. $1M-$5M)" },
                  confidenceScore: {
                    type: "number",
                    description: "Confidence in data accuracy, 0.0 to 1.0. High (>0.7) if data from official sources, low if inferred.",
                  },
                },
                required: ["firmName", "recentDeals", "currentThesis", "stage", "geography", "typicalCheckSize", "confidenceScore"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_investor_profile" } },
      }),
    });

    if (!resp.ok) {
      console.error(`AI gateway error in Tier 1: ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return null;

    const parsed = JSON.parse(toolCall.function.arguments);
    return {
      firmName: parsed.firmName || investorName,
      logoUrl: parsed.logoUrl || "",
      recentDeals: parsed.recentDeals || [],
      currentThesis: parsed.currentThesis || "",
      stage: parsed.stage || "",
      geography: parsed.geography || "",
      typicalCheckSize: parsed.typicalCheckSize || "",
      confidenceScore: parsed.confidenceScore ?? 0.5,
      source: "exa",
      lastVerified: new Date().toISOString(),
    };
  } catch (e) {
    console.error("Tier 1 (Exa) failed:", e);
    return null;
  }
}

// ── Tier 2: Gemini 3 Flash with Google Search Grounding ──
async function tier2Gemini(investorName: string): Promise<EnrichedInvestor | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.warn("LOVABLE_API_KEY not set, skipping Tier 2");
    return null;
  }

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a venture capital research analyst with access to current information. Search for the most up-to-date data available.`,
          },
          {
            role: "user",
            content: `Search for "${investorName}" and summarize their 2026 investment thesis and most recent 3 publicly announced deals. Include their preferred stage, geographic focus, and typical check size. Return as structured JSON.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "investor_profile",
              description: "Return structured investor profile with grounded search data",
              parameters: {
                type: "object",
                properties: {
                  firmName: { type: "string" },
                  logoUrl: { type: "string", description: "Logo URL if known, empty string otherwise" },
                  recentDeals: {
                    type: "array",
                    items: { type: "string" },
                    description: "3 most recent publicly announced deals with company names",
                  },
                  currentThesis: { type: "string", description: "Current 2025-2026 investment thesis (2-3 sentences)" },
                  stage: { type: "string" },
                  geography: { type: "string" },
                  typicalCheckSize: { type: "string" },
                  confidenceScore: {
                    type: "number",
                    description: "How confident you are in this data, 0.0-1.0",
                  },
                },
                required: ["firmName", "recentDeals", "currentThesis", "stage", "geography", "typicalCheckSize", "confidenceScore"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "investor_profile" } },
      }),
    });

    if (!resp.ok) {
      const status = resp.status;
      console.error(`AI gateway error in Tier 2: ${status}`);
      if (status === 429 || status === 402) {
        return null;
      }
      return null;
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return null;

    const parsed = JSON.parse(toolCall.function.arguments);
    return {
      firmName: parsed.firmName || investorName,
      logoUrl: parsed.logoUrl || "",
      recentDeals: parsed.recentDeals || [],
      currentThesis: parsed.currentThesis || "",
      stage: parsed.stage || "",
      geography: parsed.geography || "",
      typicalCheckSize: parsed.typicalCheckSize || "",
      confidenceScore: parsed.confidenceScore ?? 0.6,
      source: "gemini_grounded",
      lastVerified: new Date().toISOString(),
    };
  } catch (e) {
    console.error("Tier 2 (Gemini) failed:", e);
    return null;
  }
}

// ── Tier 3: Local Database Fallback ──
async function tier3LocalDB(investorName: string): Promise<EnrichedInvestor | null> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("Supabase env vars not set, skipping Tier 3");
    return null;
  }

  try {
    const dbResp = await fetch(
      `${SUPABASE_URL}/rest/v1/firm_records?firm_name=ilike.*${encodeURIComponent(investorName)}*&select=*&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    const rows = await dbResp.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const row = rows[0];
    return {
      firmName: row.firm_name || investorName,
      logoUrl: "",
      recentDeals: row.recent_deals || [],
      currentThesis: row.thesis_verticals?.join(", ") || "",
      stage: row.preferred_stage || "",
      geography: row.location || "",
      typicalCheckSize: row.min_check_size && row.max_check_size
        ? `$${(row.min_check_size / 1_000_000).toFixed(1)}M–$${(row.max_check_size / 1_000_000).toFixed(1)}M`
        : "",
      confidenceScore: 0.5,
      source: "local_db",
      lastVerified: row.created_at || new Date().toISOString(),
    };
  } catch (e) {
    console.error("Tier 3 (Local DB) failed:", e);
    return null;
  }
}

// ── Merge Logic ──
function mergeResults(primary: EnrichedInvestor, fallback: EnrichedInvestor): EnrichedInvestor {
  return {
    firmName: primary.firmName || fallback.firmName,
    logoUrl: primary.logoUrl || fallback.logoUrl,
    // Use primary (AI) for recent deals
    recentDeals: primary.recentDeals.length > 0 ? primary.recentDeals : fallback.recentDeals,
    currentThesis: primary.currentThesis || fallback.currentThesis,
    // Use fallback (directory) for standard criteria
    stage: fallback.stage || primary.stage,
    geography: fallback.geography || primary.geography,
    typicalCheckSize: primary.typicalCheckSize || fallback.typicalCheckSize,
    confidenceScore: Math.max(primary.confidenceScore, fallback.confidenceScore),
    source: primary.source,
    lastVerified: primary.lastVerified,
  };
}

// ── Main Handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { investorName } = await req.json().catch(() => ({ investorName: "" }));

    if (!investorName || typeof investorName !== "string" || investorName.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: "investorName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const name = investorName.trim();

    // ── Tier 1: Exa ──
    console.log(`[Waterfall] Tier 1 (Exa) for: ${name}`);
    const tier1Result = await tier1Exa(name);

    if (tier1Result && tier1Result.confidenceScore >= 0.7 && tier1Result.currentThesis) {
      // High confidence from Exa — check if we can merge with local for standard criteria
      const localData = await tier3LocalDB(name);
      const final = localData ? mergeResults(tier1Result, localData) : tier1Result;
      console.log(`[Waterfall] Tier 1 success, confidence: ${tier1Result.confidenceScore}`);
      return new Response(JSON.stringify({ profile: final, tier: 1 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Tier 2: Gemini Grounded ──
    console.log(`[Waterfall] Tier 2 (Gemini Grounded) for: ${name}`);
    const tier2Result = await tier2Gemini(name);

    if (tier2Result && tier2Result.confidenceScore >= 0.5) {
      // Merge with local DB for standard criteria
      const localData = await tier3LocalDB(name);
      const final = localData ? mergeResults(tier2Result, localData) : tier2Result;
      console.log(`[Waterfall] Tier 2 success, confidence: ${tier2Result.confidenceScore}`);
      return new Response(JSON.stringify({ profile: final, tier: 2 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Tier 3: Local DB Only ──
    console.log(`[Waterfall] Tier 3 (Local DB) for: ${name}`);
    const tier3Result = await tier3LocalDB(name);

    if (tier3Result) {
      return new Response(JSON.stringify({ profile: tier3Result, tier: 3 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Nothing found at all
    return new Response(
      JSON.stringify({
        profile: {
          firmName: name,
          logoUrl: "",
          recentDeals: [],
          currentThesis: "",
          stage: "",
          geography: "",
          typicalCheckSize: "",
          confidenceScore: 0,
          source: "local_db",
          lastVerified: new Date().toISOString(),
        },
        tier: 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("investor-enrich error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
