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
    const { linkedinUrl } = await req.json();
    if (!linkedinUrl || typeof linkedinUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "linkedinUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure it looks like a URL
    let formattedUrl = linkedinUrl.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log("Scraping LinkedIn profile via Firecrawl:", formattedUrl);

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Firecrawl API error:", data);
      return new Response(
        JSON.stringify({ error: data.error || `Scrape failed (${response.status})` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const markdown = data.data?.markdown || data.markdown || "";
    const metadata = data.data?.metadata || data.metadata || {};

    // Extract name from page title (LinkedIn titles are typically "Name - Title | LinkedIn")
    const title = metadata.title || "";
    const ogTitle = metadata.ogTitle || metadata["og:title"] || "";
    const nameSource = ogTitle || title;
    const namePart = nameSource.split(/[|\-–—]/)[0]?.trim() || "";

    // Try to extract headline/title from the markdown
    const headlineMatch = markdown.match(/^#+\s*(.+)/m);
    const bioMatch = markdown.match(/(?:About|Summary)\s*\n+([\s\S]{10,500}?)(?:\n\n|\n#+)/i);

    const mapped = {
      full_name: namePart || null,
      title: headlineMatch?.[1]?.trim() || metadata.description?.split(/[|\-–—]/)?.[0]?.trim() || null,
      bio: bioMatch?.[1]?.trim() || metadata.description || null,
      location: null,
      avatar_url: metadata.ogImage || metadata["og:image"] || null,
      linkedin_url: linkedinUrl,
    };

    return new Response(
      JSON.stringify({ success: true, data: mapped, markdown: markdown.slice(0, 2000) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-linkedin-profile error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
