import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { resolvePersonWebsiteProfile } from "./_personWebsiteProfile.js";

const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SCRAPE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function setCors(res: VercelResponse): VercelResponse {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  return res;
}

function normalizeHost(raw: string): string | null {
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function profileCacheKey(firmWebsiteUrl: string, fullName: string, title: string | null): string {
  const host = normalizeHost(firmWebsiteUrl) || firmWebsiteUrl.toLowerCase().trim();
  const payload = `${host}\n${fullName.toLowerCase().trim()}\n${(title || "").toLowerCase().trim()}`;
  return createHash("sha256").update(payload).digest("hex");
}

function emptySkippedProfile() {
  return {
    headshotUrl: null,
    title: null,
    email: null,
    linkedinUrl: null,
    xUrl: null,
    bio: null,
    location: null,
    websiteUrl: null,
    profileUrl: null,
    sectorFocus: [] as string[],
    portfolioCompanies: [] as string[],
    scannedUrls: [] as string[],
    _cached: true as const,
    _skippedRecentAttempt: true as const,
  };
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    return setCors(res).status(200).end();
  }

  if (req.method !== "POST") {
    return setCors(res).status(405).json({ error: "Method not allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const firmWebsiteUrl = typeof body.firmWebsiteUrl === "string" ? body.firmWebsiteUrl.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : null;
  const firmInvestorId = typeof body.firmInvestorId === "string" ? body.firmInvestorId.trim() : null;
  const forceRefresh = body.forceRefresh === true;

  if (!firmWebsiteUrl || !fullName) {
    return setCors(res).status(400).json({
      error: "firmWebsiteUrl and fullName are required",
    });
  }

  const admin = supabaseAdmin();
  const cacheKey = profileCacheKey(firmWebsiteUrl, fullName, title);

  try {
    let cacheRow: { profile: Record<string, unknown>; fetched_at: string } | null = null;

    if (admin && !forceRefresh) {
      const { data: cached, error: cacheErr } = await admin
        .from("person_website_profile_cache")
        .select("profile, fetched_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();

      if (!cacheErr && cached?.fetched_at && cached.profile) {
        cacheRow = { profile: cached.profile as Record<string, unknown>, fetched_at: cached.fetched_at };
        const age = Date.now() - new Date(cacheRow.fetched_at).getTime();
        if (age >= 0 && age < CACHE_TTL_MS) {
          return setCors(res).status(200).json({ ...cacheRow.profile, _cached: true });
        }
      }

      if (firmInvestorId) {
        const { data: inv, error: invErr } = await admin
          .from("firm_investors")
          .select("id, profile_image_last_fetched_at")
          .eq("id", firmInvestorId)
          .is("deleted_at", null)
          .maybeSingle();

        if (!invErr && inv?.id && inv.profile_image_last_fetched_at) {
          const lastMs = new Date(inv.profile_image_last_fetched_at).getTime();
          if (!Number.isNaN(lastMs) && Date.now() - lastMs < SCRAPE_COOLDOWN_MS) {
            if (cacheRow?.profile) {
              return setCors(res).status(200).json({ ...cacheRow.profile, _cached: true });
            }
            return setCors(res).status(200).json(emptySkippedProfile());
          }
        }
      }
    }

    const profile = await resolvePersonWebsiteProfile({ firmWebsiteUrl, fullName, title });

    if (admin) {
      const host = normalizeHost(firmWebsiteUrl) || "unknown";
      await admin.from("person_website_profile_cache").upsert(
        {
          cache_key: cacheKey,
          firm_website_host: host,
          full_name_norm: fullName.toLowerCase().trim(),
          profile,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" },
      );

      if (firmInvestorId) {
        const { data: inv } = await admin
          .from("firm_investors")
          .select("id")
          .eq("id", firmInvestorId)
          .is("deleted_at", null)
          .maybeSingle();
        if (inv?.id) {
          await admin
            .from("firm_investors")
            .update({ profile_image_last_fetched_at: new Date().toISOString() })
            .eq("id", firmInvestorId);
        }
      }
    }

    return setCors(res).status(200).json({ ...profile, _cached: false });
  } catch (error) {
    return setCors(res).status(500).json({
      error: error instanceof Error ? error.message : "Profile lookup failed",
    });
  }
}
