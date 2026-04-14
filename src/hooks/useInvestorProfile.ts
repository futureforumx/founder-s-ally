import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FirmStrategyClassification } from "@/lib/firmStrategyClassifications";
import { pickFirmXUrl } from "@/lib/pickFirmXUrl";
import { sanitizeText } from "@/lib/sanitizeText";
import { generateInvestorBio, generateElevatorPitch } from "@/lib/generateFallbacks";
import { resolveFirmDisplayLocation } from "@/lib/formatCanonicalHqLine";

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
  /** Public X (Twitter) profile URL or handle, from `firm_records.x_url`. */
  x_url: string | null;
  linkedin_url: string | null;
  description: string | null;
  email: string | null;
  address: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_zip_code: string | null;
  hq_country: string | null;
  firm_type: string | null;
  aum: string | null;
  location: string | null;
  logo_url: string | null;
  website_url: string | null;
  lead_partner: string | null;
  lead_or_follow: string | null;
  preferred_stage: string | null;
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
      .select("id, full_name, first_name, last_name, title, is_active, profile_image_url, avatar_url, profile_image_last_fetched_at, email, linkedin_url, x_url, website_url, bio, city, state, country, personal_thesis_tags, stage_focus, sector_focus, background_summary, check_size_min, check_size_max, sweet_spot")
      .eq("firm_id", firmId)
      .is("deleted_at", null)
      .eq("ready_for_live", true)
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
    x_url: pickFirmXUrl(firm as Record<string, unknown>),
    linkedin_url: typeof firm.linkedin_url === "string" ? firm.linkedin_url : null,
    description: sanitizeText(firm.sentiment_detail) || sanitizeText(firm.description) || generateElevatorPitch({
      firm_name: firm.firm_name,
      description: firm.description,
      stage_focus: firm.stage_focus,
      thesis_verticals: firm.thesis_verticals,
      hq_city: firm.hq_city,
      hq_state: firm.hq_state,
      hq_country: firm.hq_country,
      entity_type: firm.entity_type,
      min_check_size: firm.min_check_size,
      max_check_size: firm.max_check_size,
    }),
    email: firm.email,
    address: firm.address,
    hq_city: firm.hq_city,
    hq_state: firm.hq_state,
    hq_zip_code: firm.hq_zip_code,
    hq_country: firm.hq_country,
    firm_type: firm.firm_type,
    aum: firm.aum,
    location: resolveFirmDisplayLocation({
      hq_city: firm.hq_city,
      hq_state: firm.hq_state,
      hq_country: firm.hq_country,
      legacyLocation: firm.location,
    }),
    logo_url: firm.logo_url,
    website_url: firm.website_url,
    lead_partner: firm.lead_partner,
    lead_or_follow: firm.lead_or_follow,
    preferred_stage: firm.preferred_stage,
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
  const trimmed = firmName.trim();
  const { data, error } = await supabase
    .from("firm_records")
    .select("id")
    .ilike("firm_name", trimmed)
    .is("deleted_at", null)
    .limit(1);

  if (error) throw error;
  if (data && data.length > 0) {
    return fetchInvestorProfile(data[0].id);
  }

  const { data: partial, error: partialError } = await supabase
    .from("firm_records")
    .select("id")
    .ilike("firm_name", `%${trimmed}%`)
    .is("deleted_at", null)
    .limit(1);

  if (partialError) throw partialError;
  if (partial && partial.length > 0) {
    return fetchInvestorProfile(partial[0].id);
  }

  throw new Error(`Investor "${firmName}" not found in database`);
}

// ── Hooks ──

/** Fetch a full investor profile by UUID */
export function useInvestorProfile(firmId: string | null) {
  return useQuery<InvestorProfile>({
    queryKey: ["investor-profile", firmId],
    queryFn: () => fetchInvestorProfile(firmId!),
    enabled: !!firmId,
    placeholderData: (prev) => prev, // SWR: keep old data while refetching
  });
}

/** Fetch a full investor profile by firm name (resolves to ID internally) */
export function useInvestorProfileByName(firmName: string | null) {
  return useQuery<InvestorProfile>({
    queryKey: ["investor-profile-name", firmName?.toLowerCase().trim()],
    queryFn: () => fetchInvestorByName(firmName!),
    enabled: !!firmName,
    placeholderData: (prev) => prev,
  });
}
