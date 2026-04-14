import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { resolvePersonWebsiteProfile } from "./_personWebsiteProfile.js";
import {
  appendPortfolioCompaniesJson,
  PORTFOLIO_COMPANIES_JSON_MARKER,
  splitBackgroundSummaryPortfolio,
} from "../src/lib/investorBackgroundPortfolio";

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
  // Title is intentionally excluded from cache identity so a title update doesn't invalidate
  // otherwise identical person-page cache and trigger cooldown "empty" responses.
  void title;
  const payload = `${host}\n${fullName.toLowerCase().trim()}`;
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

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function ensureFirmInvestorIdByHostAndName(
  admin: ReturnType<typeof supabaseAdmin>,
  firmWebsiteUrl: string,
  fullName: string,
  fallbackTitle: string | null,
): Promise<string | null> {
  if (!admin) return null;
  const host = normalizeHost(firmWebsiteUrl);
  const name = safeTrim(fullName);
  if (!host || !name) return null;

  const { data: firms } = await admin
    .from("firm_records")
    .select("id, website_url")
    .is("deleted_at", null)
    .ilike("website_url", `%${host}%`)
    .limit(10);
  if (!firms?.length) return null;

  let firmId: string | null = null;
  for (const row of firms as Array<{ id: string; website_url: string | null }>) {
    const rowHost = normalizeHost(row.website_url ?? "");
    if (rowHost && rowHost === host) {
      firmId = row.id;
      break;
    }
  }
  if (!firmId) return null;

  const { data: existing } = await admin
    .from("firm_investors")
    .select("id")
    .eq("firm_id", firmId)
    .ilike("full_name", name)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const parts = name.split(/\s+/).filter(Boolean);
  const insertRow: Record<string, unknown> = {
    firm_id: firmId,
    full_name: name,
    first_name: parts[0] ?? null,
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
    title: safeTrim(fallbackTitle) || null,
    is_active: true,
    ready_for_live: true,
    enrichment_status: "partial",
    source_count: 1,
    last_enriched_at: new Date().toISOString(),
  };
  const { data: inserted } = await admin
    .from("firm_investors")
    .insert(insertRow)
    .select("id")
    .single();
  return inserted?.id ?? null;
}

async function persistProfileToFirmInvestor(
  admin: ReturnType<typeof supabaseAdmin>,
  firmInvestorId: string,
  profile: {
    headshotUrl: string | null;
    title: string | null;
    email: string | null;
    linkedinUrl: string | null;
    xUrl: string | null;
    bio: string | null;
    location: string | null;
    portfolioCompanies?: string[];
  },
): Promise<void> {
  if (!admin || !firmInvestorId) return;
  const { data: inv } = await admin
    .from("firm_investors")
    .select("id, title, email, linkedin_url, x_url, bio, background_summary, city, state, country, avatar_url")
    .eq("id", firmInvestorId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!inv?.id) return;

  const patch: Record<string, unknown> = {
    profile_image_last_fetched_at: new Date().toISOString(),
  };
  if (!safeTrim(inv.title) && safeTrim(profile.title)) patch.title = profile.title;
  if (!safeTrim(inv.email) && safeTrim(profile.email)) patch.email = profile.email;
  if (!safeTrim(inv.linkedin_url) && safeTrim(profile.linkedinUrl)) patch.linkedin_url = profile.linkedinUrl;
  if (!safeTrim(inv.x_url) && safeTrim(profile.xUrl)) patch.x_url = profile.xUrl;
  if (!safeTrim(inv.background_summary) && safeTrim(profile.bio)) patch.background_summary = profile.bio;
  if (!safeTrim(inv.bio) && safeTrim(profile.bio)) patch.bio = profile.bio;
  const loc = safeTrim(profile.location);
  if (loc) {
    if (!safeTrim(inv.city) && !safeTrim(inv.state)) {
      const comma = loc.match(/^([^,]+),\s*([A-Z]{2})\b/);
      if (comma) {
        patch.city = comma[1].trim();
        patch.state = comma[2].trim();
      }
    }
  }
  const headshot = safeTrim(profile.headshotUrl);
  if (headshot && !safeTrim(inv.avatar_url)) patch.avatar_url = headshot;

  const scrapedPortfolio = (profile.portfolioCompanies ?? []).map((s) => safeTrim(s)).filter(Boolean);
  if (scrapedPortfolio.length) {
    const existingSummary = safeTrim(inv.background_summary);
    const { narrative: existingNarrative, companies: existingCos } =
      splitBackgroundSummaryPortfolio(existingSummary);
    const hasMarker = existingSummary.includes(PORTFOLIO_COMPANIES_JSON_MARKER);
    if (!hasMarker || existingCos.length === 0) {
      const narrativeBase =
        existingNarrative ||
        safeTrim(inv.bio) ||
        safeTrim(profile.bio) ||
        null;
      const merged = appendPortfolioCompaniesJson(narrativeBase, scrapedPortfolio);
      if (merged && merged !== existingSummary) patch.background_summary = merged;
    }
  }

  await admin.from("firm_investors").update(patch).eq("id", firmInvestorId);
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
  const firmInvestorIdRaw = typeof body.firmInvestorId === "string" ? body.firmInvestorId.trim() : null;
  const forceRefresh = body.forceRefresh === true;

  if (!firmWebsiteUrl || !fullName) {
    return setCors(res).status(400).json({
      error: "firmWebsiteUrl and fullName are required",
    });
  }

  const admin = supabaseAdmin();
  const fullNameNorm = fullName.toLowerCase().trim();
  let resolvedFirmInvestorId = safeTrim(firmInvestorIdRaw) || null;
  if (admin && !resolvedFirmInvestorId) {
    resolvedFirmInvestorId = await ensureFirmInvestorIdByHostAndName(admin, firmWebsiteUrl, fullName, title);
  }
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
          if (resolvedFirmInvestorId) {
            await persistProfileToFirmInvestor(
              admin,
              resolvedFirmInvestorId,
              cacheRow.profile as {
                headshotUrl: string | null;
                title: string | null;
                email: string | null;
                linkedinUrl: string | null;
                xUrl: string | null;
                bio: string | null;
                location: string | null;
                portfolioCompanies?: string[];
              },
            );
          }
          return setCors(res).status(200).json({ ...cacheRow.profile, _cached: true });
        }
      }

      // Fallback for legacy title-sensitive cache keys: latest row by (host, full name).
      if (!cacheRow) {
        const host = normalizeHost(firmWebsiteUrl) || "unknown";
        const { data: altCached, error: altErr } = await admin
          .from("person_website_profile_cache")
          .select("profile, fetched_at")
          .eq("firm_website_host", host)
          .eq("full_name_norm", fullNameNorm)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!altErr && altCached?.fetched_at && altCached.profile) {
          cacheRow = { profile: altCached.profile as Record<string, unknown>, fetched_at: altCached.fetched_at };
        }
      }

      if (resolvedFirmInvestorId) {
        const { data: inv, error: invErr } = await admin
          .from("firm_investors")
          .select("id, profile_image_last_fetched_at")
          .eq("id", resolvedFirmInvestorId)
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
          full_name_norm: fullNameNorm,
          profile,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" },
      );

      if (resolvedFirmInvestorId) await persistProfileToFirmInvestor(admin, resolvedFirmInvestorId, profile);
    }

    return setCors(res).status(200).json({ ...profile, _cached: false });
  } catch (error) {
    return setCors(res).status(500).json({
      error: error instanceof Error ? error.message : "Profile lookup failed",
    });
  }
}
