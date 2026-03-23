import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyUrl } = await req.json();
    if (!companyUrl || typeof companyUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "companyUrl is required (LinkedIn company page or website)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const APIFY_API_KEY = Deno.env.get("APIFY_API_KEY");
    if (!APIFY_API_KEY) {
      return new Response(
        JSON.stringify({ error: "APIFY_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isLinkedIn = companyUrl.includes("linkedin.com");

    console.log("Scraping company data:", companyUrl, "isLinkedIn:", isLinkedIn);

    let mapped: Record<string, unknown>;

    if (isLinkedIn) {
      // Use LinkedIn Company Scraper
      const actorId = "anchor~linkedin-company-scraper";
      const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}&timeout=60`;

      const response = await fetch(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrls: [{ url: companyUrl }],
          maxItems: 1,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Apify company error:", errText);
        return new Response(
          JSON.stringify({ error: `Apify request failed (${response.status})` }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const items = await response.json();
      const company = items?.[0];

      if (!company) {
        return new Response(
          JSON.stringify({ error: "No company data returned" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      mapped = {
        company_name: company.name || company.companyName || null,
        description: company.description || company.about || company.tagline || null,
        sector: company.industry || company.industries?.[0] || null,
        website_url: company.website || company.websiteUrl || null,
        logo_url: company.logoUrl || company.logo || null,
        hq_location: company.headquarter?.city
          ? `${company.headquarter.city}, ${company.headquarter.country || ""}`
          : company.locations?.[0] || null,
        employee_count: company.employeeCount || company.staffCount?.toString() || null,
        founded_year: company.foundedYear || company.founded || null,
        specialties: company.specialties || [],
      };
    } else {
      // For non-LinkedIn URLs, use the website scraper to gather company info
      // Use Firecrawl via existing function or Apify web scraper
      const actorId = "apify~website-content-crawler";
      const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}&timeout=60`;

      const response = await fetch(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrls: [{ url: companyUrl }],
          maxCrawlPages: 3,
          maxCrawlDepth: 1,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Apify web scraper error:", errText);
        return new Response(
          JSON.stringify({ error: `Website scrape failed (${response.status})` }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const items = await response.json();
      const pageContent = items?.map((i: any) => i.text || i.markdown || "").join("\n").slice(0, 5000);

      mapped = {
        company_name: null,
        description: pageContent?.slice(0, 500) || null,
        sector: null,
        website_url: companyUrl,
        logo_url: null,
        hq_location: null,
        employee_count: null,
        founded_year: null,
        specialties: [],
        raw_content: pageContent,
      };
    }

    return new Response(
      JSON.stringify({ success: true, data: mapped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-company-linkedin error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
