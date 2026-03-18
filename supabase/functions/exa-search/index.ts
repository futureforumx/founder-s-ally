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
    const { companyName, subsector } = body;

    if (!companyName) {
      return new Response(JSON.stringify({ error: "companyName is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exaApiKey = Deno.env.get("EXA_API_KEY");
    if (!exaApiKey) {
      console.warn("EXA_API_KEY not set, returning mock data");
      return new Response(JSON.stringify({ investors: MOCK_INVESTORS, source: "mock" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const query = `Recent venture capital investors and funding rounds for ${companyName}${subsector ? ` in the ${subsector} space` : ""}`;

    const resp = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": exaApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: 10,
        contents: {
          highlights: {
            query: `${companyName} investors funding`,
            highlightsPerUrl: 2,
            numSentences: 3,
          },
        },
      }),
    });

    if (!resp.ok) {
      const status = resp.status;
      console.error(`Exa API error: ${status}`);
      if (status === 401 || status === 403) {
        return new Response(JSON.stringify({ investors: MOCK_INVESTORS, source: "mock_fallback" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Exa API returned ${status}`);
    }

    const data = await resp.json();
    const results: ExaResult[] = data?.results || [];

    // Pass through LLM extraction instead of regex
    const investors = await extractInvestorsViaLLM(results, companyName);

    if (investors.length === 0) {
      return new Response(JSON.stringify({ investors: MOCK_INVESTORS, source: "mock_no_results" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ investors, source: "exa" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("exa-search error:", e);
    return new Response(JSON.stringify({ investors: MOCK_INVESTORS, source: "mock_error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
