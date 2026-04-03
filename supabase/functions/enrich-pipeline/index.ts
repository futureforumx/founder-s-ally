const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RecentDeal {
  company: string;
  amount: string | null;
  sector: string | null;
}

interface FormattedResult {
  aum: string | null;
  current_partners: string[];
  recent_deals: RecentDeal[];
}

// ── Step 1: Perplexity Pro — Macro Research ──
async function perplexityResearch(
  firmName: string,
  firmDomain: string | null,
  apiKey: string
): Promise<string> {
  try {
    const domainHint = firmDomain ? ` (${firmDomain})` : "";
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "user",
            content: `Search the web for the venture capital firm ${firmName}${domainHint}. Provide a concise text summary of: 1) Their most recently announced fund size and total AUM. 2) A list of their current General Partners and Managing Partners. Do not format as JSON, just provide the facts.`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const status = resp.status;
      console.warn(`[Perplexity] API error ${status} for ${firmName}`);
      if (status === 402) console.warn("[Perplexity] Insufficient balance");
      if (status === 429) console.warn("[Perplexity] Rate limited");
      return "";
    }

    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || "";
  } catch (e) {
    console.error(`[Perplexity] Failed for ${firmName}:`, e);
    return "";
  }
}

// ── Step 2: Exa AI — Deal Scouting ──
async function exaDiscover(firmName: string, exaKey: string): Promise<string> {
  try {
    const resp = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": exaKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `Recent startup investments, seed rounds, or series A/B funding led by ${firmName} in the last 6 months`,
        type: "auto",
        numResults: 3,
        contents: {
          text: { maxCharacters: 3000 },
          highlights: {
            query: `${firmName} investment funding round`,
            highlightsPerUrl: 3,
            numSentences: 3,
          },
        },
      }),
    });

    if (!resp.ok) {
      console.warn(`[Exa] API error ${resp.status} for ${firmName}`);
      return "";
    }

    const data = await resp.json();
    const results = data?.results || [];

    return results
      .map((r: any, i: number) => {
        const highlights = (r.highlights || []).join(" ");
        const text = r.text ? r.text.substring(0, 1500) : "";
        return `[Source ${i + 1}] ${r.title}\n${highlights}\n${text}`;
      })
      .join("\n\n---\n\n");
  } catch (e) {
    console.error(`[Exa] Failed for ${firmName}:`, e);
    return "";
  }
}

// ── Step 3: OpenAI (gpt-5-nano) — Cheap Formatting ──
async function formatWithOpenAI(
  firmName: string,
  perplexityText: string,
  exaText: string,
  lovableKey: string
): Promise<FormattedResult | null> {
  const combined = [
    perplexityText ? `=== PERPLEXITY RESEARCH ===\n${perplexityText}` : "",
    exaText ? `=== EXA DEAL SCOUTING ===\n${exaText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!combined) {
    console.warn(`[OpenAI] No content to format for ${firmName}`);
    return null;
  }

  try {
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5-nano",
          messages: [
            {
              role: "system",
              content: `You are a strict data formatter. I am providing you with research text about a VC firm. Extract the facts and format them EXACTLY into this JSON schema: { "aum": "string (e.g., $500M) or null", "current_partners": ["Name 1", "Name 2"], "recent_deals": [ { "company": "string", "amount": "string (e.g., $3M) or null", "sector": "string or null" } ] } If a piece of data is missing from the text, use null or an empty array. Do not hallucinate data.`,
            },
            {
              role: "user",
              content: `Extract structured data about "${firmName}" from this research:\n\n${combined}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!resp.ok) {
      const status = resp.status;
      console.error(`[OpenAI] API error ${status} for ${firmName}`);
      if (status === 429) console.warn("[OpenAI] Rate limited");
      if (status === 402) console.warn("[OpenAI] Credits exhausted");
      return null;
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    return JSON.parse(content) as FormattedResult;
  } catch (e) {
    console.error(`[OpenAI] Failed for ${firmName}:`, e);
    return null;
  }
}

// ── Step 4: Database Upsert ──
async function upsertResults(
  firmId: string,
  firmName: string,
  result: FormattedResult,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  // 4a: Update AUM and last_enriched_at
  const updateBody: Record<string, any> = {
    last_enriched_at: new Date().toISOString(),
  };
  if (result.aum) updateBody.aum = result.aum;

  await fetch(
    `${supabaseUrl}/rest/v1/firm_records?id=eq.${firmId}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(updateBody),
    }
  );

  // 4b: Wipe old deals and insert new ones
  await fetch(
    `${supabaseUrl}/rest/v1/firm_recent_deals?firm_id=eq.${firmId}`,
    { method: "DELETE", headers }
  );

  if (result.recent_deals.length > 0) {
    const deals = result.recent_deals.map((d) => ({
      firm_id: firmId,
      company_name: d.company || "Unknown",
      amount: d.amount || null,
      stage: d.sector || null,
      date_announced: null,
    }));

    await fetch(`${supabaseUrl}/rest/v1/firm_recent_deals`, {
      method: "POST",
      headers,
      body: JSON.stringify(deals),
    });
  }

  // 4c: Reconcile partners
  if (result.current_partners.length > 0) {
    const existingResp = await fetch(
      `${supabaseUrl}/rest/v1/firm_investors?firm_id=eq.${firmId}&select=id,full_name`,
      { headers }
    );
    const existing: { id: string; full_name: string }[] =
      await existingResp.json();

    const newNames = new Set(
      result.current_partners.map((n) => n.toLowerCase().trim())
    );

    // Mark partners NOT in new list as inactive.
    // Previously: one PATCH per partner (O(n) round-trips).
    // Now: single PATCH using PostgREST `in` filter (1 round-trip).
    const toDeactivate = existing.filter(
      (e) => !newNames.has(e.full_name.toLowerCase().trim())
    );
    if (toDeactivate.length > 0) {
      const idList = toDeactivate.map((p) => p.id).join(",");
      await fetch(
        `${supabaseUrl}/rest/v1/firm_investors?id=in.(${idList})`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            is_active: false,
            updated_at: new Date().toISOString(),
          }),
        }
      );
    }

    // Upsert current partners.
    // Previously: one POST per partner (O(n) round-trips).
    // Now: single bulk POST with the full array (1 round-trip).
    const partnerRows = result.current_partners.map((name) => ({
      firm_id: firmId,
      full_name: name,
      title: null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }));
    await fetch(`${supabaseUrl}/rest/v1/firm_investors`, {
      method: "POST",
      headers: {
        ...headers,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(partnerRows),
    });
  }

  console.log(
    `[Upsert] ✅ ${firmName}: ${result.recent_deals.length} deals, ${result.current_partners.length} partners`
  );
}

// ── Main Handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  const EXA_API_KEY = Deno.env.get("EXA_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing required environment variables" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 25;
    const firmId = body.firmId; // Optional: enrich a single firm

    // Query stale firms (30-day window)
    let queryUrl: string;
    if (firmId) {
      queryUrl = `${SUPABASE_URL}/rest/v1/firm_records?id=eq.${firmId}&select=id,firm_name,website_url&limit=1`;
    } else {
      const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      queryUrl = `${SUPABASE_URL}/rest/v1/firm_records?select=id,firm_name,website_url&or=(last_enriched_at.is.null,last_enriched_at.lt.${staleDate})&order=last_enriched_at.asc.nullsfirst&limit=${batchSize}`;
    }

    const firmsResp = await fetch(queryUrl, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    const firms: { id: string; firm_name: string; website_url: string | null }[] =
      await firmsResp.json();

    if (!Array.isArray(firms) || firms.length === 0) {
      return new Response(
        JSON.stringify({ message: "No firms need enrichment", enriched: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Pipeline] Starting Tri-Force enrichment for ${firms.length} firms`);

    const results: { firm: string; status: string; deals: number; partners: number }[] = [];

    for (const firm of firms) {
      console.log(`\n[Pipeline] ─── ${firm.firm_name} ───`);

      try {
        // Step 1: Perplexity — macro research (AUM, partners)
        const perplexityText = PERPLEXITY_API_KEY
          ? await perplexityResearch(firm.firm_name, firm.website_url, PERPLEXITY_API_KEY)
          : "";

        // Step 2: Exa — deal scouting
        const exaText = EXA_API_KEY
          ? await exaDiscover(firm.firm_name, EXA_API_KEY)
          : "";

        // Step 3: OpenAI (gpt-5-nano) — format into JSON
        const formatted = await formatWithOpenAI(
          firm.firm_name,
          perplexityText,
          exaText,
          LOVABLE_API_KEY
        );

        if (!formatted) {
          results.push({ firm: firm.firm_name, status: "no_data", deals: 0, partners: 0 });
          // Mark enriched to avoid re-processing
          await fetch(
            `${SUPABASE_URL}/rest/v1/firm_records?id=eq.${firm.id}`,
            {
              method: "PATCH",
              headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ last_enriched_at: new Date().toISOString() }),
            }
          );
          continue;
        }

        // Step 4: Upsert
        await upsertResults(
          firm.id,
          firm.firm_name,
          formatted,
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY
        );

        results.push({
          firm: firm.firm_name,
          status: "success",
          deals: formatted.recent_deals.length,
          partners: formatted.current_partners.length,
        });

        // Rate-limit protection: 2s between firms
        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[Pipeline] Error for ${firm.firm_name}:`, e);
        results.push({ firm: firm.firm_name, status: "error", deals: 0, partners: 0 });
      }
    }

    const enriched = results.filter((r) => r.status === "success").length;
    console.log(`\n[Pipeline] ✅ Complete: ${enriched}/${firms.length} enriched`);

    return new Response(
      JSON.stringify({ enriched, total: firms.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[Pipeline] Fatal error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
