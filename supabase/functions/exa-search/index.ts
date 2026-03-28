import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtSubjectMatchesUser } from "../_shared/jwt-sub.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExaResult {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  highlights?: string[];
  text?: string;
}

/** Bing Web Search v7 → same shape as Exa snippets for the shared LLM extractor. */
async function searchViaBingWebSearch(query: string, subscriptionKey: string): Promise<ExaResult[] | null> {
  const url = new URL("https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");
  url.searchParams.set("mkt", "en-US");
  url.searchParams.set("safeSearch", "Moderate");

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: { "Ocp-Apim-Subscription-Key": subscriptionKey },
  });

  if (!resp.ok) {
    console.warn("Bing Web Search error:", resp.status, await resp.text().catch(() => ""));
    return null;
  }

  const data = (await resp.json()) as {
    webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string; datePublished?: string; datePublishedDisplayDate?: string }> };
  };
  const values = data?.webPages?.value;
  if (!Array.isArray(values) || values.length === 0) return null;

  return values.map((v) => {
    const snippet = (v.snippet || "").trim();
    return {
      title: v.name || v.url || "Result",
      url: v.url || "",
      publishedDate: v.datePublished || v.datePublishedDisplayDate,
      highlights: snippet ? [snippet] : [],
      text: snippet,
    };
  });
}

async function searchViaExa(
  query: string,
  highlightQuery: string,
  apiKey: string,
): Promise<{ ok: boolean; results: ExaResult[]; status: number }> {
  const resp = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults: 10,
      contents: {
        highlights: {
          query: highlightQuery,
          highlightsPerUrl: 2,
          numSentences: 3,
        },
      },
    }),
  });
  const status = resp.status;
  if (!resp.ok) {
    return { ok: false, results: [], status };
  }
  const data = await resp.json();
  const results: ExaResult[] = Array.isArray(data?.results) ? data.results : [];
  return { ok: true, results, status };
}

interface ParsedInvestor {
  investorName: string;
  entityType: string;
  instrument: string;
  amount: number;
  date: string;
  round: string;
  source: "exa";
  highlight: string;
  sourceUrl: string;
  domain: string;
}

/** Upsert into pending_investors (service role). Caller JWT sub must match userId. */
async function persistInvestorsToPending(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyAnalysisId: string | null,
  investors: ParsedInvestor[],
  webSource: "exa" | "bing",
): Promise<{ inserted: number; updated: number }> {
  if (investors.length === 0) return { inserted: 0, updated: 0 };

  const { data: capRows } = await supabase.from("cap_table").select("investor_name").eq("user_id", userId);
  const capLower = new Set(
    (capRows || []).map((r: { investor_name: string }) => r.investor_name.toLowerCase().trim()),
  );

  let pendingQuery = supabase
    .from("pending_investors")
    .select("id, investor_name")
    .eq("user_id", userId)
    .eq("status", "pending");
  pendingQuery = companyAnalysisId
    ? pendingQuery.eq("company_analysis_id", companyAnalysisId)
    : pendingQuery.is("company_analysis_id", null);

  const { data: pendingRows, error: pendingErr } = await pendingQuery;
  if (pendingErr) {
    console.warn("pending_investors load failed:", pendingErr);
    return { inserted: 0, updated: 0 };
  }

  const pendingByLower = new Map<string, { id: string }>();
  for (const row of pendingRows || []) {
    pendingByLower.set((row as { investor_name: string }).investor_name.toLowerCase().trim(), {
      id: (row as { id: string }).id,
    });
  }

  const sourceType = webSource === "exa" ? "News / Exa" : "News / Bing";
  let inserted = 0;
  let updated = 0;
  const seenBatch = new Set<string>();

  for (const inv of investors) {
    const key = inv.investorName.toLowerCase().trim();
    if (!key || capLower.has(key) || seenBatch.has(key)) continue;
    seenBatch.add(key);

    const sourceDetail = [inv.highlight, inv.sourceUrl].filter(Boolean).join(" — ").slice(0, 8000);
    const payload = {
      user_id: userId,
      company_analysis_id: companyAnalysisId,
      investor_name: inv.investorName.trim(),
      entity_type: inv.entityType || "VC Firm",
      instrument: inv.instrument || "Equity",
      amount: Math.min(Math.max(0, Math.round(Number(inv.amount) || 0)), 2_147_483_647),
      round_name: inv.round?.trim() || null,
      source_type: sourceType,
      source_detail: sourceDetail || null,
      source_date: inv.date?.trim() || null,
      status: "pending",
    };

    const existing = pendingByLower.get(key);
    if (existing) {
      const { error } = await supabase
        .from("pending_investors")
        .update({
          entity_type: payload.entity_type,
          instrument: payload.instrument,
          amount: payload.amount,
          round_name: payload.round_name,
          source_type: payload.source_type,
          source_detail: payload.source_detail,
          source_date: payload.source_date,
        })
        .eq("id", existing.id);
      if (!error) updated++;
      continue;
    }

    const { data: ins, error } = await supabase.from("pending_investors").insert(payload).select("id").maybeSingle();
    if (error) {
      console.warn("pending_investors insert failed:", error);
      continue;
    }
    if (ins?.id) {
      inserted++;
      pendingByLower.set(key, { id: ins.id });
    }
  }

  return { inserted, updated };
}

const MOCK_INVESTORS: ParsedInvestor[] = [
  {
    investorName: "Andreessen Horowitz (a16z)",
    entityType: "VC Firm",
    instrument: "Equity",
    amount: 15_000_000,
    date: "2024-06-15",
    round: "Series A",
    source: "exa",
    highlight: "Led Series A round with focus on construction technology disruption",
    sourceUrl: "https://a16z.com",
    domain: "a16z.com",
  },
  {
    investorName: "Founders Fund",
    entityType: "VC Firm",
    instrument: "SAFE (Post-money)",
    amount: 5_000_000,
    date: "2024-03-10",
    round: "Seed",
    source: "exa",
    highlight: "Participated in seed extension targeting vertical SaaS for infrastructure",
    sourceUrl: "https://foundersfund.com",
    domain: "foundersfund.com",
  },
  {
    investorName: "Standard Investments",
    entityType: "VC Firm",
    instrument: "Equity",
    amount: 8_000_000,
    date: "2024-09-22",
    round: "Series B",
    source: "exa",
    highlight: "Co-led growth round for real estate and construction tech portfolio expansion",
    sourceUrl: "https://standard.com",
    domain: "standard.com",
  },
];

// ── LLM-based extraction ──
async function extractInvestorsViaLLM(
  results: ExaResult[],
  companyName: string
): Promise<ParsedInvestor[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.warn("LOVABLE_API_KEY not set, falling back to regex extraction");
    return regexFallbackExtraction(results);
  }

  // Build context from all Exa results
  const snippets = results.map((r, i) => {
    const highlights = (r.highlights || []).join(" ");
    const text = r.text ? r.text.substring(0, 500) : "";
    return `[Source ${i + 1}] URL: ${r.url}\nTitle: ${r.title}\nDate: ${r.publishedDate || "unknown"}\nContent: ${highlights} ${text}`.trim();
  }).join("\n\n");

  const systemPrompt = `You are a financial analyst. Read the provided news snippets about "${companyName}". Extract the exact name of the Venture Capital firm or Lead Investor that supplied the funding. Ignore introductory text, article titles, or generic phrases. If the text says "The round was led by Sway Ventures", the investorName MUST be exactly "Sway Ventures".

Rules:
- investorName must be a proper noun (a real firm name), never a sentence fragment
- If you cannot identify a real firm name, skip that entry entirely
- Deduplicate: if multiple articles mention the same round (same amount + same investor), combine into ONE entry
- amount should be in raw dollars (e.g. 11000000 for $11M)
- round should be the funding stage like "Seed", "Series A", "Series B", etc. Use "Unknown" if unclear
- instrument should be one of: "Equity", "SAFE (Post-money)", "SAFE (Pre-money)", "Convertible Note"
- date should be ISO format YYYY-MM-DD if available, empty string if not
- domain should be the investor's website domain (e.g. "swayventures.com")`;

  const userPrompt = `Extract all unique investors from these snippets about ${companyName}:\n\n${snippets}`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_investors",
              description: "Extract deduplicated investor data from funding news snippets",
              parameters: {
                type: "object",
                properties: {
                  investors: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        investorName: { type: "string", description: "Proper noun name of the VC firm or lead investor" },
                        amount: { type: "number", description: "Funding amount in raw dollars" },
                        round: { type: "string", description: "Funding stage e.g. Seed, Series A" },
                        instrument: { type: "string", enum: ["Equity", "SAFE (Post-money)", "SAFE (Pre-money)", "Convertible Note"] },
                        date: { type: "string", description: "ISO date YYYY-MM-DD or empty" },
                        domain: { type: "string", description: "Investor website domain" },
                        sourceUrl: { type: "string", description: "URL of the source article" },
                        highlight: { type: "string", description: "Brief excerpt explaining the investment" },
                      },
                      required: ["investorName", "amount", "round", "instrument", "domain", "sourceUrl", "highlight"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["investors"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_investors" } },
      }),
    });

    if (!resp.ok) {
      console.error(`AI gateway error: ${resp.status}`);
      const text = await resp.text();
      console.error(text);
      return regexFallbackExtraction(results);
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.warn("No tool call in AI response, falling back");
      return regexFallbackExtraction(results);
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const investors: ParsedInvestor[] = (parsed.investors || [])
      .filter((inv: any) => inv.investorName && inv.investorName.length >= 2 && inv.investorName.length < 80)
      .map((inv: any) => ({
        investorName: inv.investorName,
        entityType: "VC Firm",
        instrument: inv.instrument || "Equity",
        amount: inv.amount || 0,
        date: inv.date || "",
        round: inv.round || "Unknown",
        source: "exa" as const,
        highlight: (inv.highlight || "").substring(0, 200),
        sourceUrl: inv.sourceUrl || "",
        domain: inv.domain || inv.investorName.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com",
      }));

    // Final deduplication by investorName (case-insensitive)
    const seen = new Set<string>();
    return investors.filter((inv) => {
      const key = inv.investorName.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10);
  } catch (e) {
    console.error("LLM extraction failed:", e);
    return regexFallbackExtraction(results);
  }
}

// ── Regex fallback (simplified) ──
function regexFallbackExtraction(results: ExaResult[]): ParsedInvestor[] {
  const investors: ParsedInvestor[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const highlights = result.highlights || [];
    const fullText = [result.title, ...highlights, result.text || ""].join(" ");

    const patterns = [
      /(?:led by|backed by|from|investment from|funding from)\s+([A-Z][A-Za-z0-9\s&'.\-()]+?)(?:\s*[,;.]|\s+(?:and|with|in|for|to|at|has|have|was|were|will)\b)/gi,
      /([A-Z][A-Za-z0-9\s&'.\-()]+?)\s+(?:led|invested|participated|backed|co-led)/gi,
    ];

    for (const pattern of patterns) {
      const matches = fullText.matchAll(pattern);
      for (const match of matches) {
        const names = match[1].split(/\s*,\s*|\s+and\s+/).map((n: string) => n.trim()).filter((n: string) => n.length >= 3 && n.length < 50);
        for (const name of names) {
          if (!/^[A-Z]/.test(name)) continue;
          if (/^(The|A|An|Its|Their|This|That|With|For|Round|Series|Company|Startup|Venture|Capital|Funding|Investment|Total)$/i.test(name)) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          let amount = 0;
          const amountMatch = fullText.match(/\$(\d+(?:\.\d+)?)\s*(million|m|billion|b)/i);
          if (amountMatch) {
            const num = parseFloat(amountMatch[1]);
            const unit = amountMatch[2].toLowerCase();
            if (unit === "billion" || unit === "b") amount = num * 1_000_000_000;
            else amount = num * 1_000_000;
          }

          investors.push({
            investorName: name,
            entityType: "VC Firm",
            instrument: /safe/i.test(fullText) ? "SAFE (Post-money)" : "Equity",
            amount,
            date: result.publishedDate?.substring(0, 10) || "",
            round: "Unknown",
            source: "exa",
            highlight: (highlights[0] || result.title || "").substring(0, 200),
            sourceUrl: result.url,
            domain: name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com",
          });
        }
      }
    }
  }

  return investors.slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { companyName, subsector, user_id: bodyUserId, company_analysis_id: bodyCompanyAnalysisId } = body;
    const userId = typeof bodyUserId === "string" && bodyUserId.trim() ? bodyUserId.trim() : null;
    const companyAnalysisId =
      typeof bodyCompanyAnalysisId === "string" && bodyCompanyAnalysisId.trim() ? bodyCompanyAnalysisId.trim() : null;

    if (!companyName) {
      return new Response(JSON.stringify({ error: "companyName is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exaApiKey = Deno.env.get("EXA_API_KEY");
    const bingKey = Deno.env.get("BING_SEARCH_API_KEY");

    const query = `Recent venture capital investors and funding rounds for ${companyName}${subsector ? ` in the ${subsector} space` : ""}`;
    const highlightQuery = `${companyName} investors funding`;

    let results: ExaResult[] = [];
    let webSource: "exa" | "bing" = "exa";

    if (exaApiKey) {
      const exa = await searchViaExa(query, highlightQuery, exaApiKey);
      if (exa.ok && exa.results.length > 0) {
        results = exa.results;
        webSource = "exa";
      } else {
        console.warn(`Exa API not usable (status ${exa.status}), trying web search backup`);
      }
    }

    if (results.length === 0 && bingKey) {
      const bingResults = await searchViaBingWebSearch(query, bingKey);
      if (bingResults?.length) {
        results = bingResults;
        webSource = "bing";
      }
    }

    if (results.length === 0) {
      if (!exaApiKey && !bingKey) {
        console.warn("EXA_API_KEY and BING_SEARCH_API_KEY not set, returning mock data");
      } else {
        console.warn("No web results from Exa or Bing, returning mock data");
      }
      return new Response(JSON.stringify({ investors: MOCK_INVESTORS, source: "mock" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const investors = await extractInvestorsViaLLM(results, companyName);

    if (investors.length === 0) {
      return new Response(
        JSON.stringify({ investors: MOCK_INVESTORS, source: webSource === "bing" ? "mock_no_results_bing" : "mock_no_results" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let persisted: { inserted: number; updated: number } | undefined;
    if (userId) {
      if (!jwtSubjectMatchesUser(req.headers.get("Authorization"), userId)) {
        console.warn("exa-search: user_id does not match JWT identity claims; skipping DB persist");
      } else {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (supabaseUrl && serviceKey) {
          const supabase = createClient(supabaseUrl, serviceKey);
          persisted = await persistInvestorsToPending(supabase, userId, companyAnalysisId, investors, webSource);
        }
      }
    }

    return new Response(JSON.stringify({ investors, source: webSource, ...(persisted ? { persisted } : {}) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("exa-search error:", e);
    return new Response(JSON.stringify({ investors: MOCK_INVESTORS, source: "mock_error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
