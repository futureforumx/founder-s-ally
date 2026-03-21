const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RecentDeal {
  company_name: string;
  amount: string;
  stage: string;
  date_announced: string;
}

interface EnrichmentResult {
  recent_investments: RecentDeal[];
  current_partners: { name: string; title: string }[];
  aum: string | null;
}

// ── Step 1: Exa AI — Neural Discovery ──
async function exaDiscover(firmName: string, exaKey: string): Promise<string> {
  try {
    const resp = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": exaKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `Recent startup investments, term sheets, or funding rounds led by ${firmName} in the last 6 months`,
        type: "auto",
        numResults: 3,
        contents: {
          text: { maxCharacters: 5000 },
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
        const text = r.text ? r.text.substring(0, 2000) : "";
        return `[News Source ${i + 1}] ${r.title}\nURL: ${r.url}\n${highlights}\n${text}`;
      })
      .join("\n\n---\n\n");
  } catch (e) {
    console.error(`[Exa] Failed for ${firmName}:`, e);
    return "";
  }
}

// ── Step 2: Firecrawl — Website Extraction ──
async function firecrawlExtract(
  websiteUrl: string,
  firecrawlKey: string
): Promise<string> {
  if (!websiteUrl) return "";

  try {
    let url = websiteUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }

    // Scrape the main site (Firecrawl handles subpages via onlyMainContent)
    const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });

    if (!resp.ok) {
      const status = resp.status;
      console.warn(`[Firecrawl] Error ${status} for ${url}`);
      if (status === 402) {
        console.warn("[Firecrawl] Credits exhausted");
      }
      return "";
    }

    const data = await resp.json();
    const markdown = data.data?.markdown || data.markdown || "";
    // Cap at ~80k chars to stay within Gemini context budget
    return markdown.substring(0, 80000);
  } catch (e) {
    console.error(`[Firecrawl] Failed for ${websiteUrl}:`, e);
    return "";
  }
}

// ── Step 3: Gemini — Synthesis ──
async function geminiSynthesize(
  firmName: string,
  exaContent: string,
  firecrawlContent: string,
  lovableKey: string
): Promise<EnrichmentResult | null> {
  const payload = [
    exaContent ? `=== RECENT NEWS & DEALS ===\n${exaContent}` : "",
    firecrawlContent ? `=== WEBSITE CONTENT ===\n${firecrawlContent}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!payload) {
    console.warn(`[Gemini] No content to synthesize for ${firmName}`);
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
          model: "google/gemini-2.5-pro",
          messages: [
            {
              role: "system",
              content: `You are an expert VC data analyst. Analyze the provided website dump and recent news articles for "${firmName}". Extract structured data with high precision. If information is not clearly stated, omit it rather than guessing.`,
            },
            {
              role: "user",
              content: `Extract the following from these sources about "${firmName}":\n\n${payload}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_firm_data",
                description:
                  "Extract structured VC firm data from website and news sources",
                parameters: {
                  type: "object",
                  properties: {
                    recent_investments: {
                      type: "array",
                      description: "Up to 5 most recent investments",
                      items: {
                        type: "object",
                        properties: {
                          company_name: { type: "string" },
                          amount: {
                            type: "string",
                            description:
                              "Investment amount (e.g. '$5M') or 'Undisclosed'",
                          },
                          stage: {
                            type: "string",
                            description: "e.g. Seed, Series A",
                          },
                          date_announced: {
                            type: "string",
                            description: "Date or approximate quarter/year",
                          },
                        },
                        required: ["company_name"],
                        additionalProperties: false,
                      },
                    },
                    current_partners: {
                      type: "array",
                      description:
                        "People currently listed as Partners, GPs, or Managing Directors",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          title: {
                            type: "string",
                            description:
                              "e.g. General Partner, Managing Director",
                          },
                        },
                        required: ["name"],
                        additionalProperties: false,
                      },
                    },
                    aum: {
                      type: "string",
                      description:
                        "Assets Under Management if found, null otherwise",
                    },
                  },
                  required: [
                    "recent_investments",
                    "current_partners",
                    "aum",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_firm_data" },
          },
        }),
      }
    );

    if (!resp.ok) {
      const status = resp.status;
      console.error(`[Gemini] API error ${status} for ${firmName}`);
      if (status === 429) console.warn("[Gemini] Rate limited");
      if (status === 402) console.warn("[Gemini] Credits exhausted");
      return null;
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return null;

    return JSON.parse(toolCall.function.arguments) as EnrichmentResult;
  } catch (e) {
    console.error(`[Gemini] Failed for ${firmName}:`, e);
    return null;
  }
}

// ── Step 4: Database Upsert ──
async function upsertResults(
  firmId: string,
  firmName: string,
  result: EnrichmentResult,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  // 4a: Update AUM and last_enriched_at on investor_database
  const updateBody: Record<string, any> = {
    last_enriched_at: new Date().toISOString(),
  };
  if (result.aum) updateBody.aum = result.aum;

  await fetch(
    `${supabaseUrl}/rest/v1/investor_database?id=eq.${firmId}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(updateBody),
    }
  );

  // 4b: Insert recent deals (delete old ones first)
  await fetch(
    `${supabaseUrl}/rest/v1/firm_recent_deals?firm_id=eq.${firmId}`,
    { method: "DELETE", headers }
  );

  if (result.recent_investments.length > 0) {
    const deals = result.recent_investments.map((d) => ({
      firm_id: firmId,
      company_name: d.company_name,
      amount: d.amount || null,
      stage: d.stage || null,
      date_announced: d.date_announced || null,
    }));

    await fetch(`${supabaseUrl}/rest/v1/firm_recent_deals`, {
      method: "POST",
      headers,
      body: JSON.stringify(deals),
    });
  }

  // 4c: Reconcile partners — mark missing ones inactive, upsert current
  if (result.current_partners.length > 0) {
    // Get existing partners for this firm
    const existingResp = await fetch(
      `${supabaseUrl}/rest/v1/investor_partners?firm_id=eq.${firmId}&select=id,full_name`,
      { headers }
    );
    const existing: { id: string; full_name: string }[] =
      await existingResp.json();

    const newNames = new Set(
      result.current_partners.map((p) => p.name.toLowerCase().trim())
    );

    // Mark partners NOT in Gemini's list as inactive
    const toDeactivate = existing.filter(
      (e) => !newNames.has(e.full_name.toLowerCase().trim())
    );
    for (const p of toDeactivate) {
      await fetch(
        `${supabaseUrl}/rest/v1/investor_partners?id=eq.${p.id}`,
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

    // Upsert current partners
    for (const p of result.current_partners) {
      await fetch(
        `${supabaseUrl}/rest/v1/investor_partners`,
        {
          method: "POST",
          headers: {
            ...headers,
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify({
            firm_id: firmId,
            full_name: p.name,
            title: p.title || null,
            is_active: true,
            updated_at: new Date().toISOString(),
          }),
        }
      );
    }
  }

  console.log(`[Upsert] ✅ ${firmName}: ${result.recent_investments.length} deals, ${result.current_partners.length} partners`);
}

// ── Main Handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const EXA_API_KEY = Deno.env.get("EXA_API_KEY");
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
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
    const batchSize = body.batchSize || 20;
    const firmId = body.firmId; // Optional: enrich a single firm

    // Query stale firms (or a specific firm)
    let queryUrl: string;
    if (firmId) {
      queryUrl = `${SUPABASE_URL}/rest/v1/investor_database?id=eq.${firmId}&select=id,firm_name,website_url&limit=1`;
    } else {
      queryUrl = `${SUPABASE_URL}/rest/v1/investor_database?select=id,firm_name,website_url&or=(last_enriched_at.is.null,last_enriched_at.lt.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()})&order=last_enriched_at.asc.nullsfirst&limit=${batchSize}`;
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

    console.log(`[Pipeline] Starting enrichment for ${firms.length} firms`);

    const results: { firm: string; status: string; deals: number; partners: number }[] = [];

    for (const firm of firms) {
      console.log(`\n[Pipeline] ─── ${firm.firm_name} ───`);

      try {
        // Step 1: Exa — discover recent deals
        const exaContent = EXA_API_KEY
          ? await exaDiscover(firm.firm_name, EXA_API_KEY)
          : "";

        // Step 2: Firecrawl — extract website
        const firecrawlContent =
          FIRECRAWL_API_KEY && firm.website_url
            ? await firecrawlExtract(firm.website_url, FIRECRAWL_API_KEY)
            : "";

        // Step 3: Gemini — synthesize
        const enrichment = await geminiSynthesize(
          firm.firm_name,
          exaContent,
          firecrawlContent,
          LOVABLE_API_KEY
        );

        if (!enrichment) {
          results.push({ firm: firm.firm_name, status: "no_data", deals: 0, partners: 0 });
          // Still mark as enriched to avoid re-processing
          await fetch(
            `${SUPABASE_URL}/rest/v1/investor_database?id=eq.${firm.id}`,
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
          enrichment,
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY
        );

        results.push({
          firm: firm.firm_name,
          status: "success",
          deals: enrichment.recent_investments.length,
          partners: enrichment.current_partners.length,
        });

        // Rate-limit protection: 1.5s between firms
        await new Promise((r) => setTimeout(r, 1500));
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
