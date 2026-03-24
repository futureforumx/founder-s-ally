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

    // Extract the profile ID from the LinkedIn URL
    const profileMatch = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (!profileMatch) {
      return new Response(
        JSON.stringify({ error: "Invalid LinkedIn profile URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const profileId = profileMatch[1];

    const SCRAPINGDOG_API_KEY = Deno.env.get("SCRAPINGDOG_API_KEY");
    if (!SCRAPINGDOG_API_KEY) {
      return new Response(
        JSON.stringify({ error: "SCRAPINGDOG_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Fetching LinkedIn profile via ScrapingDog:", profileId);

    // Try with premium=true first (standard often fails with 400)
    let apiUrl = `https://api.scrapingdog.com/linkedin/?api_key=${SCRAPINGDOG_API_KEY}&type=profile&linkId=${encodeURIComponent(profileId)}&premium=true`;
    let response = await fetch(apiUrl);
    let data = await response.json();

    // If premium fails, retry without it
    if (!response.ok || data.error) {
      console.warn("Premium request failed, retrying standard:", data);
      apiUrl = `https://api.scrapingdog.com/linkedin/?api_key=${SCRAPINGDOG_API_KEY}&type=profile&linkId=${encodeURIComponent(profileId)}`;
      response = await fetch(apiUrl);
      data = await response.json();
    }

    if (!response.ok || data.error) {
      console.error("ScrapingDog API error:", data);
      return new Response(
        JSON.stringify({ error: data.error || `LinkedIn fetch failed (${response.status})` }),
        { status: response.status >= 400 ? response.status : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map ScrapingDog LinkedIn profile response to our format
    const mapped = {
      full_name: data.name || data.full_name || null,
      title: data.headline || data.title || null,
      bio: data.about || data.summary || null,
      location: data.location || null,
      avatar_url: data.profile_photo || data.profile_picture || data.avatar || null,
      linkedin_url: linkedinUrl,
    };

    return new Response(
      JSON.stringify({ success: true, data: mapped }),
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
