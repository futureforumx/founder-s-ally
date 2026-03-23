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

    const APIFY_API_KEY = Deno.env.get("APIFY_API_KEY");
    if (!APIFY_API_KEY) {
      return new Response(
        JSON.stringify({ error: "APIFY_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Scraping LinkedIn profile:", linkedinUrl);

    // Run the Apify LinkedIn Profile Scraper actor synchronously
    const actorId = "anchor~linkedin-profile-scraper";
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}&timeout=60`;

    const response = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: linkedinUrl }],
        maxItems: 1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Apify error:", errText);
      return new Response(
        JSON.stringify({ error: `Apify request failed (${response.status})` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const items = await response.json();
    const profile = items?.[0];

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "No profile data returned" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map to our profile fields
    const mapped = {
      full_name: profile.fullName || profile.firstName && profile.lastName
        ? `${profile.firstName || ""} ${profile.lastName || ""}`.trim()
        : null,
      title: profile.headline || profile.title || null,
      bio: profile.summary || profile.about || null,
      location: profile.location || profile.geoLocation || null,
      avatar_url: profile.profilePicture || profile.profilePictureUrl || null,
      linkedin_url: linkedinUrl,
    };

    return new Response(
      JSON.stringify({ success: true, data: mapped, raw: profile }),
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
