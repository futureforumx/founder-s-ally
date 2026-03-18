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
    const q = encodeURIComponent(companyName);
    const url = `https://efts.sec.gov/LATEST/search-index?q=${q}&dateRange=custom&startdt=2024-01-01&forms=D&hits.hits.total=10`;
    // Use the full-text search API
    const searchUrl = `https://efts.sec.gov/LATEST/search-index?q=${q}&forms=D`;
    
    // SEC EDGAR full-text search
    const ftUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${q}%22&forms=D&dateRange=custom&startdt=2024-01-01`;
    
    // Try the EDGAR company search API
    const companySearchUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName)}%22&forms=D`;
    
    // Use EDGAR full text search API
    const edgarUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName)}%22&dateRange=custom&startdt=2024-01-01&forms=D`;
    
    const resp = await fetch(
      `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName)}%22&forms=D&dateRange=custom&startdt=2024-01-01`,
      { headers: { "User-Agent": "FounderCopilot/1.0 support@example.com", Accept: "application/json" } }
    );

    if (!resp.ok) {
      // Fallback: try the simpler company search
      const resp2 = await fetch(
        `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(companyName)}&CIK=&type=D&dateb=&owner=include&count=10&search_text=&action=getcompany&output=atom`,
        { headers: { "User-Agent": "FounderCopilot/1.0 support@example.com" } }
      );
      if (!resp2.ok) return results;
      // Parse Atom feed for basic filing info
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

// ── Mock PredictLeads financing events ──
function mockPredictLeads(companyDomain: string): Array<{
  investorName: string;
  entityType: string;
  amount: number;
  roundName: string;
  date: string;
  source: string;
}> {
  // In production, replace with real PredictLeads API call:
  // GET https://predictleads.com/api/v2/companies/{domain}/financing_events
  // Header: X-Api-Token: <PREDICTLEADS_API_KEY>
  
  // Return empty if no domain — real API would return actual data
  if (!companyDomain) return [];
  
  // Mock: simulate finding a recent round for demo purposes
  const now = new Date();
  const recentDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  
  return [
    {
      investorName: "Andreessen Horowitz",
      entityType: "VC Firm",
      amount: 5000000,
      roundName: "Seed",
      date: recentDate.toISOString().substring(0, 10),
      source: `PredictLeads: TechCrunch Article ${recentDate.toISOString().substring(0, 10)}`,
    },
    {
      investorName: "Y Combinator",
      entityType: "Accelerator",
      amount: 500000,
      roundName: "Pre-Seed",
      date: recentDate.toISOString().substring(0, 10),
      source: `PredictLeads: Crunchbase ${recentDate.toISOString().substring(0, 10)}`,
    },
  ];
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
    return new Response(JSON.stringify({ error: e.message }), {
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

  // 2. PredictLeads (mock)
  const plResults = mockPredictLeads(companyDomain);
  for (const pl of plResults) {
    if (knownNames.has(pl.investorName.toLowerCase().trim())) continue;
    knownNames.add(pl.investorName.toLowerCase().trim());
    pendingInserts.push({
      user_id: userId,
      company_analysis_id: companyId,
      investor_name: pl.investorName,
      entity_type: pl.entityType,
      instrument: "Equity",
      amount: pl.amount,
      round_name: pl.roundName,
      source_type: "News / PredictLeads",
      source_detail: pl.source,
      source_date: pl.date,
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
