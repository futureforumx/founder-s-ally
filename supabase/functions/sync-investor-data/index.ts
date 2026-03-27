import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SECFiling {
  investorName: string;
  amount: number;
  formType: string;
  filingDate: string;
  sourceUrl: string;
}

// ── SEC EDGAR: search Form D filings by company name ──
async function searchSECEdgar(companyName: string): Promise<SECFiling[]> {
  const results: SECFiling[] = [];
  try {
    const resp = await fetch(
      `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName)}%22&forms=D&dateRange=custom&startdt=2024-01-01`,
      { headers: { "User-Agent": "FounderCopilot/1.0 support@example.com", Accept: "application/json" } }
    );

    if (!resp.ok) {
      const resp2 = await fetch(
        `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(companyName)}&CIK=&type=D&dateb=&owner=include&count=10&search_text=&action=getcompany&output=atom`,
        { headers: { "User-Agent": "FounderCopilot/1.0 support@example.com" } }
      );
      if (!resp2.ok) return results;
      const text = await resp2.text();
      const filingMatches = text.matchAll(/<title[^>]*>([^<]+)<\/title>/g);
      const dateMatches = text.matchAll(/<updated>([^<]+)<\/updated>/g);
      const linkMatches = text.matchAll(/<link[^>]*href="([^"]+)"[^>]*\/>/g);
      const titles = [...filingMatches].map(m => m[1]);
      const dates = [...dateMatches].map(m => m[1]);
      const links = [...linkMatches].map(m => m[1]);
      for (let i = 1; i < Math.min(titles.length, 5); i++) {
        results.push({
          investorName: titles[i]?.replace(/\s*-\s*Form D.*/, "").trim() || "Unknown Investor",
          amount: 0,
          formType: "Form D",
          filingDate: dates[i]?.substring(0, 10) || new Date().toISOString().substring(0, 10),
          sourceUrl: links[i] || "https://www.sec.gov/cgi-bin/browse-edgar",
        });
      }
      return results;
    }

    const data = await resp.json();
    const hits = data?.hits?.hits || [];
    for (const hit of hits.slice(0, 5)) {
      const source = hit._source || {};
      results.push({
        investorName: source.display_names?.[0] || source.entity_name || "Unknown",
        amount: 0,
        formType: "Form D",
        filingDate: source.file_date || new Date().toISOString().substring(0, 10),
        sourceUrl: `https://www.sec.gov/Archives/edgar/data/${source.entity_id || ""}`,
      });
    }
  } catch (e) {
    console.error("SEC EDGAR search error:", e);
  }
  return results;
}

// ── Firecrawl Domain-Led Deep Search ──
async function firecrawlDeepSearch(
  companyName: string,
  companyDomain: string
): Promise<Array<{
  investorName: string;
  entityType: string;
  amount: number;
  roundName: string;
  date: string;
  source: string;
}>> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) {
    console.warn("FIRECRAWL_API_KEY not set, skipping domain-led search");
    return [];
  }

  const results: Array<{
    investorName: string;
    entityType: string;
    amount: number;
    roundName: string;
    date: string;
    source: string;
  }> = [];

  // Search queries for funding news
  const queries = [
    `${companyName} fundraising`,
    `${companyName} funding round`,
    `${companyName} investors`,
  ];

  for (const query of queries) {
    try {
      const resp = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit: 5,
          scrapeOptions: { formats: ["markdown"] },
        }),
      });

      if (!resp.ok) {
        console.warn(`Firecrawl search failed for "${query}": ${resp.status}`);
        continue;
      }

      const data = await resp.json();
      const searchResults = data?.data || [];

      for (const result of searchResults) {
        const text = (result.markdown || result.description || "").toLowerCase();
        
        // Extract investor names from common patterns
        const investorPatterns = [
          /(?:led by|backed by|from|invested by)\s+([A-Z][A-Za-z\s&]+?)(?:\s*,|\s*and\s|\s*\.|$)/gi,
          /([A-Z][A-Za-z\s&]+?)\s+(?:led|invested|participated|backed)/gi,
          /(?:investors?|backers?)\s+(?:include|including|such as)\s+([A-Z][A-Za-z\s&,]+?)(?:\.|$)/gi,
        ];

        const fullText = result.markdown || result.description || "";
        
        for (const pattern of investorPatterns) {
          const matches = fullText.matchAll(pattern);
          for (const match of matches) {
            const names = match[1].split(/\s*,\s*|\s+and\s+/).map((n: string) => n.trim()).filter((n: string) => n.length > 2 && n.length < 50);
            for (const name of names) {
              // Skip common false positives
              if (/^(the|a|an|its|their|this|that|with|for|has|have|was|were|will|would|said|says)$/i.test(name)) continue;
              if (results.some(r => r.investorName.toLowerCase() === name.toLowerCase())) continue;
              
              // Try to extract amount
              let amount = 0;
              const amountMatch = fullText.match(/\$(\d+(?:\.\d+)?)\s*(million|m|billion|b|k|thousand)/i);
              if (amountMatch) {
                const num = parseFloat(amountMatch[1]);
                const unit = amountMatch[2].toLowerCase();
                if (unit === "billion" || unit === "b") amount = num * 1_000_000_000;
                else if (unit === "million" || unit === "m") amount = num * 1_000_000;
                else if (unit === "thousand" || unit === "k") amount = num * 1_000;
              }

              // Try to extract round name
              let roundName = "Unknown";
              const roundMatch = fullText.match(/(seed|pre-seed|series\s*[a-e]|angel|bridge|growth)\s*(?:round|funding)?/i);
              if (roundMatch) roundName = roundMatch[1].trim();

              // Extract date
              let date = "";
              const dateMatch = fullText.match(/(\d{4}-\d{2}-\d{2})|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/i);
              if (dateMatch) date = dateMatch[0];

              results.push({
                investorName: name,
                entityType: "VC Firm",
                amount,
                roundName,
                date,
                source: `Firecrawl: ${result.title || result.url || query}`,
              });
            }
          }
        }
      }
    } catch (e) {
      console.error(`Firecrawl search error for "${query}":`, e);
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { company_id, company_domain, user_id, company_name } = body;

    // If called by cron (no specific company), process all companies
    if (!company_id) {
      const { data: companies, error } = await supabase
        .from("company_analyses")
        .select("id, user_id, company_name, website_url");
      
      if (error) throw error;

      let totalFound = 0;
      for (const co of companies || []) {
        const domain = co.website_url
          ? co.website_url.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
          : "";
        
        const found = await processCompany(supabase, co.id, co.user_id, co.company_name, domain);
        totalFound += found;
      }

      return new Response(JSON.stringify({ success: true, companiesProcessed: companies?.length || 0, newInvestorsFound: totalFound }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process single company
    const found = await processCompany(supabase, company_id, user_id, company_name || "", company_domain || "");

    return new Response(JSON.stringify({ success: true, newInvestorsFound: found }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-investor-data error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processCompany(
  supabase: any,
  companyId: string,
  userId: string,
  companyName: string,
  companyDomain: string
): Promise<number> {
  // 1. Get existing investors to avoid duplicates
  const { data: existing } = await supabase
    .from("cap_table")
    .select("investor_name")
    .eq("user_id", userId);

  const { data: existingPending } = await supabase
    .from("pending_investors")
    .select("investor_name")
    .eq("user_id", userId)
    .eq("status", "pending");

  const knownNames = new Set([
    ...(existing || []).map((r: any) => r.investor_name.toLowerCase().trim()),
    ...(existingPending || []).map((r: any) => r.investor_name.toLowerCase().trim()),
  ]);

  const pendingInserts: any[] = [];

  // 2. Firecrawl Domain-Led Deep Search (replaces mock PredictLeads)
  const firecrawlResults = await firecrawlDeepSearch(companyName, companyDomain);
  for (const fc of firecrawlResults) {
    if (knownNames.has(fc.investorName.toLowerCase().trim())) continue;
    knownNames.add(fc.investorName.toLowerCase().trim());
    pendingInserts.push({
      user_id: userId,
      company_analysis_id: companyId,
      investor_name: fc.investorName,
      entity_type: fc.entityType,
      instrument: "Equity",
      amount: fc.amount,
      round_name: fc.roundName,
      source_type: "News / Firecrawl",
      source_detail: fc.source,
      source_date: fc.date || null,
      status: "pending",
    });
  }

  // 3. SEC EDGAR
  if (companyName) {
    const secResults = await searchSECEdgar(companyName);
    for (const sec of secResults) {
      if (knownNames.has(sec.investorName.toLowerCase().trim())) continue;
      knownNames.add(sec.investorName.toLowerCase().trim());
      pendingInserts.push({
        user_id: userId,
        company_analysis_id: companyId,
        investor_name: sec.investorName,
        entity_type: "VC Firm",
        instrument: "Equity",
        amount: sec.amount,
        round_name: "Unknown",
        source_type: "SEC Filing",
        source_detail: `${sec.formType} filed ${sec.filingDate} — ${sec.sourceUrl}`,
        source_date: sec.filingDate,
        status: "pending",
      });
    }
  }

  // 4. Insert pending investors
  if (pendingInserts.length > 0) {
    const { error } = await supabase.from("pending_investors").insert(pendingInserts);
    if (error) {
      console.error("Failed to insert pending investors:", error);
      return 0;
    }
  }

  return pendingInserts.length;
}
