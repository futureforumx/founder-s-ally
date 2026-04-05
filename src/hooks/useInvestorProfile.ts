import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FirmStrategyClassification } from "@/lib/firmStrategyClassifications";
import { pickFirmXUrl } from "@/lib/pickFirmXUrl";
import { sanitizeText } from "@/lib/sanitizeText";
import { generateInvestorBio, generateElevatorPitch } from "@/lib/generateFallbacks";

// ── Types ──
export interface InvestorPartner {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  is_active: boolean;
  avatar_url: string | null;
  email: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  website_url: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
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
  // Joined relations
  partners: InvestorPartner[];
  deals: FirmDeal[];
  // Provenance flag
  source: "live" | "json-fallback";
}

// ── JSON Fallback ──
let jsonCache: any = null;

async function loadJsonFallback(): Promise<any> {
  if (jsonCache) return jsonCache;
  const res = await fetch("/data/vc_mdm_output.json");
  jsonCache = await res.json();
  return jsonCache;
}

function mapJsonFirm(firm: any): InvestorProfile {
  return {
    id: firm.id,
    firm_name: firm.name,
    x_url: pickFirmXUrl(firm as Record<string, unknown>),
    linkedin_url: null,
    description: firm.description ?? null,
    email: null,
    address: null,
    hq_city: null,
    hq_state: null,
    hq_zip_code: null,
    hq_country: null,
    firm_type: null,
    aum: firm.aum ?? null,
    location: null,
    logo_url: firm.logo_url ?? null,
    website_url: null,
    lead_partner: null,
    lead_or_follow: null,
    preferred_stage: firm.stages?.[0] ?? null,
    thesis_verticals: firm.sectors ?? [],
    strategy_classifications: [],
    min_check_size: null,
    max_check_size: null,
    market_sentiment: null,
    sentiment_detail: firm.description ?? null,
    recent_deals: null,
    last_enriched_at: null,
    partners: [],
    deals: [],
    source: "json-fallback",
  };
}

// ── Fetcher ──
async function fetchInvestorProfile(firmId: string): Promise<InvestorProfile> {
  try {
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
        .select("id, full_name, first_name, last_name, title, is_active, avatar_url, email, linkedin_url, x_url, website_url, bio, city, state, country, personal_thesis_tags, stage_focus, check_size_min, check_size_max, sweet_spot")
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
    if (!firmRes.data) throw new Error("Firm not found in database");

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
      location: firm.location,
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
      partners: (partnersRes.data ?? []).map((p: any) => ({
        ...p,
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
  } catch (err) {
    console.warn(`[useInvestorProfile] Supabase fetch failed for ${firmId}, falling back to JSON`, err);
    const json = await loadJsonFallback();
    const match = json.firms?.find((f: any) => f.id === firmId);
    if (match) return mapJsonFirm(match);
    throw new Error(`Investor ${firmId} not found in database or fallback`);
  }
}

// ── By-name variant (resolves name → id, then fetches) ──
async function fetchInvestorByName(firmName: string): Promise<InvestorProfile> {
  try {
    const { data, error } = await supabase
      .from("firm_records")
      .select("id")
      .ilike("firm_name", firmName.trim())
      .is("deleted_at", null)
      .limit(1);

    if (error) throw error;
    if (data && data.length > 0) {
      return fetchInvestorProfile(data[0].id);
    }

    // Name not in DB — try JSON fallback
    const json = await loadJsonFallback();
    const match = json.firms?.find(
      (f: any) => f.name.toLowerCase().trim() === firmName.toLowerCase().trim()
    );
    if (match) return mapJsonFirm(match);
    throw new Error(`Investor "${firmName}" not found`);
  } catch (err) {
    console.warn(`[useInvestorProfile] By-name lookup failed for "${firmName}"`, err);
    // Last resort JSON
    const json = await loadJsonFallback();
    const match = json.firms?.find(
      (f: any) => f.name.toLowerCase().trim() === firmName.toLowerCase().trim()
    );
    if (match) return mapJsonFirm(match);
    throw err;
  }
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
