import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appendPortfolioCompaniesJson,
  PORTFOLIO_COMPANIES_JSON_MARKER,
  splitBackgroundSummaryPortfolio,
} from "../src/lib/investorBackgroundPortfolio";

export type PersonWebsiteProfilePersistInput = {
  headshotUrl: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  bio: string | null;
  location: string | null;
  portfolioCompanies?: string[];
};

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Writes `resolvePersonWebsiteProfile` output onto `firm_investors` (same rules as POST `/api/person-website-profile`).
 * Only fills empty columns; never clears existing values from empty scrape fields.
 */
export async function persistPersonWebsiteProfileToFirmInvestor(
  admin: SupabaseClient,
  firmInvestorId: string,
  profile: PersonWebsiteProfilePersistInput,
): Promise<{ changed: boolean }> {
  if (!firmInvestorId) return { changed: false };

  const { data: inv } = await admin
    .from("firm_investors")
    .select("id, title, email, linkedin_url, x_url, bio, background_summary, city, state, country, avatar_url")
    .eq("id", firmInvestorId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!inv?.id) return { changed: false };

  const patch: Record<string, unknown> = {};
  if (!safeTrim(inv.title) && safeTrim(profile.title)) patch.title = profile.title;
  if (!safeTrim(inv.email) && safeTrim(profile.email)) patch.email = profile.email;
  if (!safeTrim(inv.linkedin_url) && safeTrim(profile.linkedinUrl)) patch.linkedin_url = profile.linkedinUrl;
  if (!safeTrim(inv.x_url) && safeTrim(profile.xUrl)) patch.x_url = profile.xUrl;
  if (!safeTrim(inv.background_summary) && safeTrim(profile.bio)) patch.background_summary = profile.bio;
  if (!safeTrim(inv.bio) && safeTrim(profile.bio)) patch.bio = profile.bio;
  const loc = safeTrim(profile.location);
  if (loc && !safeTrim(inv.city) && !safeTrim(inv.state)) {
    const comma = loc.match(/^([^,]+),\s*([A-Z]{2})\b/);
    if (comma) {
      patch.city = comma[1].trim();
      patch.state = comma[2].trim();
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

  if (Object.keys(patch).length === 0) return { changed: false };

  const { error } = await admin.from("firm_investors").update(patch).eq("id", firmInvestorId);
  if (error) {
    console.warn(`[persistPersonWebsiteProfile] update failed ${firmInvestorId}:`, error.message);
    return { changed: false };
  }
  return { changed: true };
}
