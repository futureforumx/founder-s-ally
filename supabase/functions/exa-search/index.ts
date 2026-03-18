import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    source: "exa",
    highlight: "Co-led growth round for real estate and construction tech portfolio expansion",
    sourceUrl: "https://standard.com",
    domain: "standard.com",
  },
];

function extractInvestorsFromResults(results: ExaResult[]): ParsedInvestor[] {
  const investors: ParsedInvestor[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const fullText = [result.title, ...(result.highlights || []), result.text || ""].join(" ");

    // Extract investor names from common patterns
    const patterns = [
      /(?:led by|backed by|from|invested by|investment from)\s+([A-Z][A-Za-z\s&]+?)(?:\s*,|\s*and\s|\s*\.|$)/gi,
      /([A-Z][A-Za-z\s&]+?)\s+(?:led|invested|participated|backed|announced)/gi,
      /(?:investors?|backers?)\s+(?:include|including|such as)\s+([A-Z][A-Za-z\s&,]+?)(?:\.|$)/gi,
    ];

    for (const pattern of patterns) {
      const matches = fullText.matchAll(pattern);
      for (const match of matches) {
        const names = match[1]
          .split(/\s*,\s*|\s+and\s+/)
          .map((n: string) => n.trim())
          .filter((n: string) => n.length > 2 && n.length < 50);

        for (const name of names) {
          if (/^(the|a|an|its|their|this|that|with|for|has|have|was|were|will|would|said|says|which|who|also|other|new|first|last)$/i.test(name)) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          // Extract amount
          let amount = 0;
          const amountMatch = fullText.match(/\$(\d+(?:\.\d+)?)\s*(million|m|billion|b|k|thousand)/i);
          if (amountMatch) {
            const num = parseFloat(amountMatch[1]);
            const unit = amountMatch[2].toLowerCase();
            if (unit === "billion" || unit === "b") amount = num * 1_000_000_000;
            else if (unit === "million" || unit === "m") amount = num * 1_000_000;
            else if (unit === "thousand" || unit === "k") amount = num * 1_000;
          }

          // Extract instrument type
          let instrument = "Equity";
          if (/safe/i.test(fullText)) instrument = "SAFE (Post-money)";
          else if (/convertible\s*note/i.test(fullText)) instrument = "Convertible Note";

          // Extract date
          let date = "";
          const dateMatch = fullText.match(/(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) date = dateMatch[0];
          else if (result.publishedDate) date = result.publishedDate.substring(0, 10);

          // Build domain from name
          const domain = name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";

          investors.push({
            investorName: name,
            entityType: "VC Firm",
            instrument,
            amount,
            date,
            source: "exa",
            highlight: (result.highlights?.[0] || result.title || "Found via Exa neural search").substring(0, 200),
            sourceUrl: result.url,
            domain,
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
        highlights: {
          numSentences: 3,
          highlightsPerUrl: 2,
          query: `${companyName} investors funding round`,
        },
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

      // Fallback to mock on auth errors
      if (status === 401 || status === 403) {
        console.warn("Exa auth failed, returning mock fallback");
        return new Response(JSON.stringify({ investors: MOCK_INVESTORS, source: "mock_fallback" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`Exa API returned ${status}`);
    }

    const data = await resp.json();
    const results: ExaResult[] = data?.results || [];
    const investors = extractInvestorsFromResults(results);

    // If Exa returned no parseable investors, use mock
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
    // Always return mock on error so UI works
    return new Response(JSON.stringify({ investors: MOCK_INVESTORS, source: "mock_error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
