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

// ── Proper Noun Extraction ──
// Parses highlight text to extract the actual VC firm name as a proper noun,
// rather than using a sentence fragment.
function extractProperNoun(text: string): string | null {
  // Patterns that precede investor names
  const leadPatterns = [
    /(?:led by|backed by|from|invested by|investment from|funding from|raised from|capital from|co-led by)\s+([A-Z][A-Za-z0-9\s&'.\-()]+?)(?:\s*[,;.]|\s+(?:and|with|in|for|to|at|has|have|was|were|will|which|who|that|this)\b)/gi,
    /([A-Z][A-Za-z0-9\s&'.\-()]+?)\s+(?:led|invested|participated|backed|announced|joined|committed|contributed|co-led)/gi,
    /(?:investors?\s+(?:include|including|such as|like)\s+)([A-Z][A-Za-z0-9\s&'.\-(),]+?)(?:\.|$)/gi,
  ];

  for (const pattern of leadPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const rawNames = match[1]
        .split(/\s*,\s*|\s+and\s+/)
        .map((n: string) => n.trim())
        .filter((n: string) => n.length >= 3 && n.length < 60);

      for (const name of rawNames) {
        // Must start with uppercase (proper noun) and not be a common word
        if (!/^[A-Z]/.test(name)) continue;
        if (/^(The|A|An|Its|Their|This|That|With|For|Has|Have|Was|Were|Will|Would|Said|Says|Which|Who|Also|Other|New|First|Last|More|Most|Some|All|Each|Every|Both|Several|Many|Few|Much|Round|Series|Company|Startup|Venture|Capital|Funding|Investment|Total|About|Around|Over|Under|Between|During|After|Before|Into|Through)$/i.test(name)) continue;
        return name;
      }
    }
  }

  // Fallback: look for sequences of capitalized words (2+ words, likely a firm name)
  const capitalizedSeq = text.match(/\b([A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|&|of|the)){1,4})\b/g);
  if (capitalizedSeq) {
    for (const candidate of capitalizedSeq) {
      if (candidate.length >= 4 && candidate.length < 50) {
        if (!/^(The Round|The Company|Series [A-Z]|Total Funding|Venture Capital|New York|San Francisco|United States)/i.test(candidate)) {
          return candidate.trim();
        }
      }
    }
  }

  return null;
}

function extractInvestorsFromResults(results: ExaResult[]): ParsedInvestor[] {
  const investors: ParsedInvestor[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const highlights = result.highlights || [];
    const fullText = [result.title, ...highlights, result.text || ""].join(" ");

    // Try to extract names from each highlight individually first
    const textsToSearch = highlights.length > 0 ? highlights : [fullText];

    for (const searchText of textsToSearch) {
      const patterns = [
        /(?:led by|backed by|from|invested by|investment from|funding from|raised from)\s+([A-Z][A-Za-z0-9\s&'.\-()]+?)(?:\s*[,;.]|\s+(?:and|with|in|for|to|at|has|have|was|were|will|which|who|that|this)\b)/gi,
        /([A-Z][A-Za-z0-9\s&'.\-()]+?)\s+(?:led|invested|participated|backed|announced|joined|committed|co-led)/gi,
        /(?:investors?\s+(?:include|including|such as)\s+)([A-Z][A-Za-z0-9\s&'.\-(),]+?)(?:\.|$)/gi,
      ];

      for (const pattern of patterns) {
        const matches = searchText.matchAll(pattern);
        for (const match of matches) {
          const names = match[1]
            .split(/\s*,\s*|\s+and\s+/)
            .map((n: string) => n.trim())
            .filter((n: string) => n.length >= 3 && n.length < 50);

          for (const name of names) {
            if (!/^[A-Z]/.test(name)) continue;
            if (/^(The|A|An|Its|Their|This|That|With|For|Has|Have|Was|Were|Will|Would|Said|Says|Which|Who|Also|Other|New|First|Last|More|Most|Some|Round|Series|Company|Startup|Venture|Capital|Funding|Investment|Total|About|Around|Over|Under)$/i.test(name)) continue;

            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            // Extract amount from full text
            let amount = 0;
            const amountMatch = fullText.match(/\$(\d+(?:\.\d+)?)\s*(million|m|billion|b|k|thousand)/i);
            if (amountMatch) {
              const num = parseFloat(amountMatch[1]);
              const unit = amountMatch[2].toLowerCase();
              if (unit === "billion" || unit === "b") amount = num * 1_000_000_000;
              else if (unit === "million" || unit === "m") amount = num * 1_000_000;
              else if (unit === "thousand" || unit === "k") amount = num * 1_000;
            }

            let instrument = "Equity";
            if (/safe/i.test(fullText)) instrument = "SAFE (Post-money)";
            else if (/convertible\s*note/i.test(fullText)) instrument = "Convertible Note";

            let date = "";
            const dateMatch = fullText.match(/(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) date = dateMatch[0];
            else if (result.publishedDate) date = result.publishedDate.substring(0, 10);

            const domain = name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";

            investors.push({
              investorName: name,
              entityType: "VC Firm",
              instrument,
              amount,
              date,
              source: "exa",
              highlight: (searchText || result.title || "Found via Exa neural search").substring(0, 200),
              sourceUrl: result.url,
              domain,
            });
          }
        }
      }
    }

    // If no names were extracted from patterns, try the proper noun extractor on each highlight
    if (investors.length === 0 && highlights.length > 0) {
      for (const hl of highlights) {
        const extracted = extractProperNoun(hl);
        if (extracted && !seen.has(extracted.toLowerCase())) {
          seen.add(extracted.toLowerCase());

          let amount = 0;
          const amountMatch = fullText.match(/\$(\d+(?:\.\d+)?)\s*(million|m|billion|b|k|thousand)/i);
          if (amountMatch) {
            const num = parseFloat(amountMatch[1]);
            const unit = amountMatch[2].toLowerCase();
            if (unit === "billion" || unit === "b") amount = num * 1_000_000_000;
            else if (unit === "million" || unit === "m") amount = num * 1_000_000;
            else if (unit === "thousand" || unit === "k") amount = num * 1_000;
          }

          let instrument = "Equity";
          if (/safe/i.test(fullText)) instrument = "SAFE (Post-money)";
          else if (/convertible\s*note/i.test(fullText)) instrument = "Convertible Note";

          let date = result.publishedDate?.substring(0, 10) || "";

          investors.push({
            investorName: extracted,
            entityType: "VC Firm",
            instrument,
            amount,
            date,
            source: "exa",
            highlight: hl.substring(0, 200),
            sourceUrl: result.url,
            domain: extracted.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com",
          });
        }
      }
    }
  }

  // Final safety: replace any investor whose name looks like a sentence
  return investors.slice(0, 10).map(inv => {
    const words = inv.investorName.split(/\s+/);
    // If name is >5 words or starts with lowercase or contains verbs, it's likely a sentence
    if (words.length > 5 || /^[a-z]/.test(inv.investorName) || /\b(was|were|is|are|has|have|had|the|a|an)\b/i.test(inv.investorName)) {
      const extracted = extractProperNoun(inv.investorName + " " + inv.highlight);
      return { ...inv, investorName: extracted || "Unknown Investor" };
    }
    return inv;
  });
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
