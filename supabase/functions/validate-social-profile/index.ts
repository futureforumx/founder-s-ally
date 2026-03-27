// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Platform = "linkedin" | "x" | "instagram";
type Reachability = "reachable" | "unreachable" | "unknown-blocked";

const ALLOWED_HOSTS: Record<Platform, string[]> = {
  linkedin: ["linkedin.com", "www.linkedin.com", "m.linkedin.com"],
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "m.twitter.com"],
  instagram: ["instagram.com", "www.instagram.com", "m.instagram.com"],
};

function inferPlatform(hostname: string): Platform | null {
  const host = hostname.toLowerCase();
  if (host.includes("linkedin.com")) return "linkedin";
  if (host.includes("x.com") || host.includes("twitter.com")) return "x";
  if (host.includes("instagram.com")) return "instagram";
  return null;
}

function isAllowedHost(platform: Platform, hostname: string): boolean {
  return ALLOWED_HOSTS[platform].includes(hostname.toLowerCase());
}

function isLikelyLoginWall(platform: Platform, finalUrl: string): boolean {
  const u = finalUrl.toLowerCase();
  if (platform === "linkedin") {
    return /linkedin\.com\/(login|checkpoint|authwall)/.test(u);
  }
  if (platform === "x") {
    return /(x\.com\/i\/flow\/login|x\.com\/login|twitter\.com\/login)/.test(u);
  }
  return /instagram\.com\/accounts\/login/.test(u);
}

function asJson(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const rawUrl = String(payload?.url || "").trim();
    const providedPlatform = String(payload?.platform || "").trim().toLowerCase();

    if (!rawUrl) {
      return asJson({ error: "url is required" }, 400);
    }

    const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      return asJson({ error: "Invalid URL format" }, 400);
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return asJson({ error: "Only http(s) URLs are allowed" }, 400);
    }

    const inferred = inferPlatform(parsed.hostname);
    const platform = (providedPlatform || inferred) as Platform | null;

    if (!platform || !(platform in ALLOWED_HOSTS)) {
      return asJson({ error: "Unsupported social platform" }, 400);
    }

    if (!isAllowedHost(platform, parsed.hostname)) {
      return asJson({
        status: "unreachable",
        reachable: false,
        reason: "Host is not allowed for this platform",
      });
    }

    const requestInit: RequestInit = {
      redirect: "follow",
      signal: AbortSignal.timeout(6500),
      headers: {
        "User-Agent": "VektaSocialValidator/1.0 (+https://tryvekta.com)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    };

    let response = await fetch(parsed.toString(), { ...requestInit, method: "HEAD" });

    if (response.status === 405 || response.status === 501) {
      response = await fetch(parsed.toString(), { ...requestInit, method: "GET" });
    }

    const finalUrl = response.url || parsed.toString();
    const finalHost = new URL(finalUrl).hostname;

    if (!isAllowedHost(platform, finalHost)) {
      return asJson({
        status: "unknown-blocked",
        reachable: null,
        httpStatus: response.status,
        finalUrl,
        reason: "Redirected outside platform domain",
      });
    }

    if (isLikelyLoginWall(platform, finalUrl)) {
      return asJson({
        status: "unknown-blocked",
        reachable: null,
        httpStatus: response.status,
        finalUrl,
        reason: "Redirected to login or auth wall",
      });
    }

    const status = response.status;

    if (status >= 200 && status < 300) {
      return asJson({
        status: "reachable",
        reachable: true,
        httpStatus: status,
        finalUrl,
      });
    }

    if (status === 404 || status === 410) {
      return asJson({
        status: "unreachable",
        reachable: false,
        httpStatus: status,
        finalUrl,
      });
    }

    if (status === 401 || status === 403 || status === 429) {
      return asJson({
        status: "unknown-blocked",
        reachable: null,
        httpStatus: status,
        finalUrl,
        reason: "Blocked or rate-limited by platform",
      });
    }

    return asJson({
      status: "unknown-blocked",
      reachable: null,
      httpStatus: status,
      finalUrl,
      reason: "Indeterminate response from platform",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const timeout = msg.toLowerCase().includes("aborted") || msg.toLowerCase().includes("timeout");

    return asJson(
      {
        status: "unknown-blocked",
        reachable: null,
        reason: timeout ? "Validation timed out" : msg,
      },
      timeout ? 408 : 500
    );
  }
});
