import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FirmStrategyClassification } from "@/lib/firmStrategyClassifications";
import { pickFirmXUrl } from "@/lib/pickFirmXUrl";
import { sanitizeText } from "@/lib/sanitizeText";
import { generateInvestorBio } from "@/lib/generateFallbacks";
import { resolveFirmDisplayLocation } from "@/lib/formatCanonicalHqLine";
import { safeLower, safeTrim } from "@/lib/utils";
import { rpcSearchFirmRecords } from "@/lib/firmSearchRpc";
import { resolveDirectoryFirmTypeKey } from "@/lib/resolveDirectoryFirmType";

// ── Types ──
export interface InvestorPartner {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  is_active: boolean;
  profile_image_url?: string | null;
  avatar_url: string | null;
  email: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  website_url: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  stage_focus?: string[] | null;
  sector_focus?: string[] | null;
  personal_thesis_tags?: string[] | null;
  background_summary?: string | null;
  education_summary?: string | null;
  /** Present when loaded from `firm_investors` (Supabase). */
  check_size_min?: number | null;
  check_size_max?: number | null;
  sweet_spot?: string | null;
}

export interface FirmDeal {
  id: string;
  company_name: string;
  amount: string | null;
  stage: string | null;
  date_announced: string | null;
}

export interface InvestorProfile {
  id: string;
  firm_name: string;
  /** Legal / formal name when it differs from marketing `firm_name` (`firm_records.legal_name`). */
  legal_name: string | null;
  /** Public X (Twitter) profile URL or handle, from `firm_records.x_url`. */
  x_url: string | null;
  linkedin_url: string | null;
  /** Long-form firm copy (`firm_records.description` / `sentiment_detail`). */
  description: string | null;
  /** Short line under the firm name (`firm_records.elevator_pitch`), max ~200 chars when set. */
  elevator_pitch: string | null;
  email: string | null;
  address: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_zip_code: string | null;
  hq_country: string | null;
  /** Multi-office / scrape payload (`firm_records.locations` jsonb). */
  locations: Record<string, unknown> | null;
  firm_type: string | null;
  aum: string | null;
  location: string | null;
  logo_url: string | null;
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  lead_partner: string | null;
  lead_or_follow: string | null;
  preferred_stage: string | null;
  /** `firm_records.stage_focus` as plain strings for display fallbacks. */
  stage_focus: string[];
  thesis_verticals: string[];
  /** Multi-tag strategy taxonomy (`firm_records.strategy_classifications`). */
  strategy_classifications: FirmStrategyClassification[];
  min_check_size: number | null;
  max_check_size: number | null;
  market_sentiment: string | null;
  sentiment_detail: string | null;
  recent_deals: string[] | null;
  last_enriched_at: string | null;
  /** `firm_records.prisma_firm_id` — the cuid that links to `vc_firms.id` / `vc_funds.firm_id`. */
  prisma_firm_id: string | null;
  /** Whether the firm is currently deploying capital (`firm_records.is_actively_deploying`). */
  is_actively_deploying: boolean | null;
  /** Actual firm headcount from `firm_records.total_headcount` (not DB row count). */
  total_headcount: number | null;
  // Joined relations
  partners: InvestorPartner[];
  deals: FirmDeal[];
  // Provenance flag
  source: "live";
}

// ── Fetcher ──
async function fetchInvestorProfile(firmId: string): Promise<InvestorProfile> {
  // Parallel fetch: firm + partners + deals
  const [firmRes, partnersRes, dealsRes] = await Promise.all([
    supabase
      .from("firm_records")
      .select("*")
      .eq("id", firmId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("firm_investors")
      .select("id, full_name, first_name, last_name, title, is_active, profile_image_url, avatar_url, profile_image_last_fetched_at, email, linkedin_url, x_url, website_url, bio, city, state, country, personal_thesis_tags, stage_focus, sector_focus, background_summary, education_summary, check_size_min, check_size_max, sweet_spot")
      .eq("firm_id", firmId)
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("firm_recent_deals")
      .select("id, company_name, amount, stage, date_announced")
      .eq("firm_id", firmId)
      .order("date_announced", { ascending: false }),
  ]);

  if (firmRes.error) throw firmRes.error;
  if (!firmRes.data) throw new Error(`Firm not found in database: ${firmId}`);

  const firm = firmRes.data;
  return {
    id: firm.id,
    firm_name: firm.firm_name,
    legal_name: typeof firm.legal_name === "string" ? firm.legal_name : null,
    x_url: pickFirmXUrl(firm as Record<string, unknown>),
    linkedin_url: typeof firm.linkedin_url === "string" ? firm.linkedin_url : null,
    description: sanitizeText(firm.description) || sanitizeText(firm.sentiment_detail) || null,
    elevator_pitch: sanitizeText(firm.elevator_pitch) || null,
    email: firm.email,
    address: firm.address,
    hq_city: firm.hq_city,
    hq_state: firm.hq_state,
    hq_zip_code: firm.hq_zip_code,
    hq_country: firm.hq_country,
    locations: firm.locations && typeof firm.locations === "object" ? (firm.locations as Record<string, unknown>) : null,
    firm_type: resolveDirectoryFirmTypeKey(firm.firm_name, firm.firm_type, firm.entity_type),
    aum: firm.aum,
    location: resolveFirmDisplayLocation({
      hq_city: firm.hq_city,
      hq_state: firm.hq_state,
      hq_country: firm.hq_country,
      legacyLocation: firm.location,
    }),
    logo_url: firm.logo_url,
    website_url: firm.website_url,
    facebook_url: typeof firm.facebook_url === "string" ? firm.facebook_url : null,
    instagram_url: typeof firm.instagram_url === "string" ? firm.instagram_url : null,
    youtube_url: typeof firm.youtube_url === "string" ? firm.youtube_url : null,
    lead_partner: firm.lead_partner,
    lead_or_follow: firm.lead_or_follow,
    preferred_stage: firm.preferred_stage,
    stage_focus: Array.isArray(firm.stage_focus)
      ? (firm.stage_focus as unknown[]).map((s) => String(s))
      : [],
    thesis_verticals: firm.thesis_verticals ?? [],
    strategy_classifications: (firm.strategy_classifications ?? []) as FirmStrategyClassification[],
    min_check_size: firm.min_check_size,
    max_check_size: firm.max_check_size,
    market_sentiment: firm.market_sentiment,
    sentiment_detail: firm.sentiment_detail,
    recent_deals: firm.recent_deals,
    last_enriched_at: firm.last_enriched_at,
    prisma_firm_id: typeof firm.prisma_firm_id === "string" ? firm.prisma_firm_id : null,
    is_actively_deploying: typeof firm.is_actively_deploying === "boolean" ? firm.is_actively_deploying : null,
    total_headcount: typeof firm.total_headcount === "number" ? firm.total_headcount : null,
    partners: (partnersRes.data ?? []).map((p: any) => ({
      ...p,
      profile_image_last_fetched_at: p.profile_image_last_fetched_at ?? null,
      bio: sanitizeText(p.bio) || generateInvestorBio({
        full_name: p.full_name,
        first_name: p.first_name,
        last_name: p.last_name,
        title: p.title,
        firm_name: firm.firm_name,
        personal_thesis_tags: p.personal_thesis_tags,
        stage_focus: p.stage_focus,
        check_size_min: p.check_size_min,
        check_size_max: p.check_size_max,
        sweet_spot: p.sweet_spot,
        city: p.city,
        state: p.state,
        country: p.country,
      }),
    })) as InvestorPartner[],
    deals: (dealsRes.data ?? []) as FirmDeal[],
    source: "live",
  };
}

// ── By-name variant (resolves name → id, then fetches) ──
async function fetchInvestorByName(firmName: string): Promise<InvestorProfile> {
  const trimmed = safeTrim(firmName);

  const rpcRows = await rpcSearchFirmRecords(trimmed, 15, null);
  const rpcFirst = rpcRows[0] as { id?: string } | undefined;
  if (rpcFirst?.id) {
    return fetchInvestorProfile(String(rpcFirst.id));
  }

  const { data, error } = await supabase
    .from("firm_records")
    .select("id, firm_name, hq_city, hq_state, hq_country, location, ready_for_live")
    .ilike("firm_name", `%${trimmed}%`)
    .is("deleted_at", null)
    .limit(20);

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    firm_name: string | null;
    hq_city: string | null;
    hq_state: string | null;
    hq_country: string | null;
    location: string | null;
    ready_for_live: boolean | null;
  }>;

  if (rows.length > 0) {
    const queryNorm = safeLower(trimmed).replace(/[^a-z0-9]/g, "");
    const queryWords = safeLower(trimmed).split(/\s+/).filter(Boolean);
    const LEGAL_SUFFIX_HINT_RE = /\b(capital|ventures?|partners?|management|funds?)\b/i;

    const scored = rows
      .map((row) => {
        const name = safeTrim(row.firm_name);
        const nameNorm = safeLower(name).replace(/[^a-z0-9]/g, "");
        const nameWords = safeLower(name).split(/\s+/).filter(Boolean);

        let score = 0;
        if (nameNorm === queryNorm) score += 120;
        else if (nameNorm.startsWith(queryNorm)) score += 90;
        else if (nameNorm.includes(queryNorm)) score += 60;

        // For short brand queries like "Mucker", prefer canonical legal suffix variants.
        if (queryWords.length <= 1 && nameWords.length > queryWords.length && LEGAL_SUFFIX_HINT_RE.test(name)) {
          score += 35;
        }

        const overlap = queryWords.filter((w) => nameWords.includes(w)).length;
        score += overlap * 12;

        if (row.ready_for_live === true) score += 8;
        if (safeTrim(row.hq_city) || safeTrim(row.hq_state) || safeTrim(row.hq_country) || safeTrim(row.location)) {
          score += 10;
        }

        return { id: row.id, score, name };
      })
      .sort((a, b) => b.score - a.score);

    if (scored[0]?.id) {
      return fetchInvestorProfile(scored[0].id);
    }
  }

  throw new Error(`Investor "${firmName}" not found in database`);
}

// ── Hooks ──

/** Fetch a full investor profile by UUID */
const INVESTOR_PROFILE_STALE_MS = 5 * 60_000;

export function useInvestorProfile(firmId: string | null) {
  return useQuery<InvestorProfile>({
    queryKey: ["investor-profile", firmId],
    queryFn: () => fetchInvestorProfile(firmId!),
    enabled: !!firmId,
    staleTime: INVESTOR_PROFILE_STALE_MS,
    placeholderData: (prev) => prev, // SWR: keep old data while refetching
  });
}

/** Fetch a full investor profile by firm name (resolves to ID internally) */
export function useInvestorProfileByName(firmName: string | null) {
  return useQuery<InvestorProfile>({
    queryKey: ["investor-profile-name", safeLower(firmName)],
    queryFn: () => fetchInvestorByName(safeTrim(firmName)),
    enabled: !!firmName,
    staleTime: INVESTOR_PROFILE_STALE_MS,
    placeholderData: (prev) => prev,
  });
}
