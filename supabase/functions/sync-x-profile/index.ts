import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractUsername(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Handle full URLs: https://x.com/username or https://twitter.com/username
  const urlMatch = trimmed.match(/(?:x\.com|twitter\.com)\/(@?[\w]+)/i);
  if (urlMatch) return urlMatch[1].replace(/^@/, "");

  // Handle bare @handle or username
  const bare = trimmed.replace(/^@/, "");
  if (/^[\w]{1,15}$/.test(bare)) return bare;

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { twitterUrl } = await req.json();
    if (!twitterUrl || typeof twitterUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "twitterUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const username = extractUsername(twitterUrl);
    if (!username) {
      return new Response(
        JSON.stringify({ error: "Could not extract X username from the provided URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SCRAPINGDOG_API_KEY = Deno.env.get("SCRAPINGDOG_API_KEY");
    if (!SCRAPINGDOG_API_KEY) {
      return new Response(
        JSON.stringify({ error: "SCRAPINGDOG_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Fetching X profile for @${username} via Scrapingdog`);

    const apiUrl = `https://api.scrapingdog.com/x/profile?api_key=${encodeURIComponent(SCRAPINGDOG_API_KEY)}&username=${encodeURIComponent(username)}`;

    const response = await fetch(apiUrl, { method: "GET" });

    if (response.status === 404) {
      return new Response(
        JSON.stringify({ error: "X user not found", skipped: true }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limited — try again later", skipped: true }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    if (!response.ok) {
      console.error("Scrapingdog API error:", data);
      return new Response(
        JSON.stringify({ error: data.error || `Scrapingdog failed (${response.status})` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map Scrapingdog response to our profile fields
    const mapped = {
      bio: data.description || data.bio || null,
      location: data.location || null,
      avatar_url: data.profile_image_url_https
        ? data.profile_image_url_https.replace("_normal", "_400x400")
        : null,
      twitter_url: `https://x.com/${username}`,
      display_name: data.name || null,
    };

    return new Response(
      JSON.stringify({ success: true, data: mapped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-x-profile error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
