import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LI_SCRAPER_HOST = "li-data-scraper.p.rapidapi.com";
const LINKEDIN_API8_HOST = "linkedin-api8.p.rapidapi.com";

function normalizeLinkedinProfileUrl(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withProto);
    if (!/linkedin\.com$/i.test(u.hostname) && !/\.linkedin\.com$/i.test(u.hostname)) return null;
    if (!/^\/in\//i.test(u.pathname)) return null;
    u.hash = "";
    u.search = "";
    return u.toString();
  } catch {
    return null;
  }
}

function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickImageUrl(r: Record<string, unknown>): string | null {
  const direct = pickString(
    r.profilePicture,
    r.profile_picture,
    r.profileImage,
    r.profile_photo,
    r.imageUrl,
    r.avatar,
    r.photo,
  );
  if (direct) return direct;
  for (const key of ["profilePicture", "profileImage", "image", "picture"]) {
    const o = r[key];
    if (o && typeof o === "object" && o !== null) {
      const u = pickString(
        (o as Record<string, unknown>).url,
        (o as Record<string, unknown>).displayImage,
        (o as Record<string, unknown>).displayImageReferenceResolutionResult,
      );
      if (u) return u;
    }
  }
  return null;
}

function pickLocation(r: Record<string, unknown>): string | null {
  const loc = r.location;
  if (typeof loc === "string") return loc;
  if (loc && typeof loc === "object" && loc !== null) {
    const o = loc as Record<string, unknown>;
    return pickString(o.default, o.name, o.country, o.city);
  }
  return null;
}

type ProfileSource = "li_data_scraper" | "linkedin_api8" | "scrapingdog";

/** Map scraper payloads (LI Data Scraper, linkedin-api8 records, etc.) to our profile shape. */
function mapScraperProfileRecord(raw: unknown, linkedinUrl: string, source: ProfileSource) {
  if (!raw || typeof raw !== "object") return null;
  const top = raw as Record<string, unknown>;
  const r =
    top.data && typeof top.data === "object" && !Array.isArray(top.data)
      ? (top.data as Record<string, unknown>)
      : top;

  const first = pickString(r.firstName, r.first_name) || "";
  const last = pickString(r.lastName, r.last_name) || "";
  const combined = `${first} ${last}`.trim();
  const full_name =
    pickString(r.fullName, r.full_name, r.name, r.profileName) || combined || null;

  const title = pickString(r.headline, r.title, r.occupation, r.headlineText);
  const bio = pickString(r.about, r.summary, r.description, r.bio);
  const location = pickLocation(r);
  const avatar_url = pickImageUrl(r);

  if (!full_name && !title && !bio) return null;

  return {
    full_name,
    title,
    bio,
    location,
    avatar_url,
    linkedin_url: linkedinUrl,
    source,
  };
}

/** Depth-first search for an object whose URL or vanity matches the requested profile (avoids using a random "similar" row). */
function findProfileObjectMatchingUrl(
  obj: unknown,
  profileId: string,
  normalizedUrl: string,
): Record<string, unknown> | null {
  const idLower = profileId.toLowerCase();
  const normLower = normalizedUrl.toLowerCase();

  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const el of obj) {
      const hit = findProfileObjectMatchingUrl(el, profileId, normalizedUrl);
      if (hit) return hit;
    }
    return null;
  }

  const o = obj as Record<string, unknown>;
  const urlCandidates = [
    o.url,
    o.profileUrl,
    o.linkedinUrl,
    o.linkedin_url,
    o.profile_url,
    o.link,
    o.navigationUrl,
  ];
  for (const v of urlCandidates) {
    if (typeof v === "string" && (v.toLowerCase().includes(`/in/${idLower}`) || v.toLowerCase() === normLower)) {
      return o;
    }
  }

  const vanity = pickString(o.publicIdentifier, o.username, o.vanityName, o.profileId);
  if (vanity && vanity.toLowerCase() === idLower) return o;

  for (const v of Object.values(o)) {
    if (v && typeof v === "object") {
      const hit = findProfileObjectMatchingUrl(v, profileId, normalizedUrl);
      if (hit) return hit;
    }
  }
  return null;
}

/** linkedin-api8 similar-profiles: extract matching profile or root-shaped profile only. */
function mapLinkedinApi8SimilarProfiles(
  raw: unknown,
  normalizedUrl: string,
  profileId: string,
): ReturnType<typeof mapScraperProfileRecord> | null {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (body && (typeof body.error === "string" || body.error === true)) return null;

  const matched = findProfileObjectMatchingUrl(raw, profileId, normalizedUrl);
  if (matched) {
    return mapScraperProfileRecord(matched, normalizedUrl, "linkedin_api8");
  }
  // Single-profile response with no URL fields but same vanity in nested meta
  return mapScraperProfileRecord(raw, normalizedUrl, "linkedin_api8");
}

async function fetchViaLiDataScraper(normalizedUrl: string, apiKey: string) {
  const endpoint = `https://${LI_SCRAPER_HOST}/get-profile-data-by-url?url=${encodeURIComponent(normalizedUrl)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": LI_SCRAPER_HOST,
      "x-rapidapi-key": apiKey,
    },
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function fetchViaLinkedinApi8SimilarProfiles(normalizedUrl: string, apiKey: string) {
  const endpoint = `https://${LINKEDIN_API8_HOST}/similar-profiles?url=${encodeURIComponent(normalizedUrl)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": LINKEDIN_API8_HOST,
      "x-rapidapi-key": apiKey,
    },
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function fetchViaScrapingDog(profileId: string, apiKey: string) {
  let apiUrl = `https://api.scrapingdog.com/linkedin/?api_key=${apiKey}&type=profile&linkId=${encodeURIComponent(profileId)}&premium=true`;
  let response = await fetch(apiUrl);
  let data = await response.json();

  if (!response.ok || data.error) {
    apiUrl = `https://api.scrapingdog.com/linkedin/?api_key=${apiKey}&type=profile&linkId=${encodeURIComponent(profileId)}`;
    response = await fetch(apiUrl);
    data = await response.json();
  }

  return { response, data };
}

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

    const normalizedUrl = normalizeLinkedinProfileUrl(linkedinUrl);
    if (!normalizedUrl) {
      return new Response(
        JSON.stringify({ error: "Invalid LinkedIn profile URL (expected linkedin.com/in/...)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const profileId = normalizedUrl.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1];
    if (!profileId) {
      return new Response(
        JSON.stringify({ error: "Invalid LinkedIn profile URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY");
    const SCRAPINGDOG_API_KEY = Deno.env.get("SCRAPINGDOG_API_KEY");

    if (RAPIDAPI_KEY) {
      console.log("Fetching LinkedIn profile via RapidAPI (li-data-scraper):", normalizedUrl);
      const { response, data } = await fetchViaLiDataScraper(normalizedUrl, RAPIDAPI_KEY);
      const body = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
      const bodyError =
        body &&
        (typeof body.error === "string" ||
          body.error === true ||
          (typeof body.message === "string" && /error|fail/i.test(body.message)));

      const mappedLi = !bodyError ? mapScraperProfileRecord(data, normalizedUrl, "li_data_scraper") : null;
      if (response.ok && mappedLi) {
        return new Response(JSON.stringify({ success: true, data: mappedLi }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.warn("li-data-scraper failed or empty mapping, status:", response.status, data);

      console.log("RapidAPI backup: linkedin-api8 similar-profiles:", normalizedUrl);
      const { response: r8, data: d8 } = await fetchViaLinkedinApi8SimilarProfiles(normalizedUrl, RAPIDAPI_KEY);
      const body8 = d8 && typeof d8 === "object" ? (d8 as Record<string, unknown>) : null;
      const body8Error =
        body8 &&
        (typeof body8.error === "string" ||
          body8.error === true ||
          (typeof body8.message === "string" && /error|fail/i.test(body8.message)));

      const mapped8 = !body8Error ? mapLinkedinApi8SimilarProfiles(d8, normalizedUrl, profileId) : null;
      if (r8.ok && mapped8) {
        return new Response(JSON.stringify({ success: true, data: mapped8 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.warn("linkedin-api8 backup failed or no matching profile, status:", r8.status, d8);
    }

    if (!SCRAPINGDOG_API_KEY) {
      return new Response(
        JSON.stringify({
          error: RAPIDAPI_KEY
            ? "LinkedIn fetch failed (RapidAPI providers exhausted) and SCRAPINGDOG_API_KEY is not configured"
            : "Neither RAPIDAPI_KEY nor SCRAPINGDOG_API_KEY is configured",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Fetching LinkedIn profile via ScrapingDog:", profileId);
    const { response, data } = await fetchViaScrapingDog(profileId, SCRAPINGDOG_API_KEY);

    if (!response.ok || data.error) {
      console.error("ScrapingDog API error:", data);
      return new Response(
        JSON.stringify({ error: data.error || `LinkedIn fetch failed (${response.status})` }),
        { status: response.status >= 400 ? response.status : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mapped = {
      full_name: data.name || data.full_name || null,
      title: data.headline || data.title || null,
      bio: data.about || data.summary || null,
      location: data.location || null,
      avatar_url: data.profile_photo || data.profile_picture || data.avatar || null,
      linkedin_url: normalizedUrl,
      source: "scrapingdog" satisfies ProfileSource,
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
