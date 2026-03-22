import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Types ──
export interface InvestorPartner {
  id: string;
  full_name: string;
  title: string | null;
  is_active: boolean;
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
  aum: string | null;
  location: string | null;
  logo_url: string | null;
  website_url: string | null;
  lead_partner: string | null;
  lead_or_follow: string | null;
  preferred_stage: string | null;
  thesis_verticals: string[];
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
    aum: firm.aum ?? null,
    location: null,
    logo_url: firm.logo_url ?? null,
    website_url: null,
    lead_partner: null,
    lead_or_follow: null,
    preferred_stage: firm.stages?.[0] ?? null,
    thesis_verticals: firm.sectors ?? [],
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
        .from("investor_database")
        .select("*")
        .eq("id", firmId)
        .maybeSingle(),
      supabase
        .from("investor_partners")
        .select("id, full_name, title, is_active")
        .eq("firm_id", firmId)
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
      aum: firm.aum,
      location: firm.location,
      logo_url: firm.logo_url,
      website_url: firm.website_url,
      lead_partner: firm.lead_partner,
      lead_or_follow: firm.lead_or_follow,
      preferred_stage: firm.preferred_stage,
      thesis_verticals: firm.thesis_verticals ?? [],
      min_check_size: firm.min_check_size,
      max_check_size: firm.max_check_size,
      market_sentiment: firm.market_sentiment,
      sentiment_detail: firm.sentiment_detail,
      recent_deals: firm.recent_deals,
      last_enriched_at: firm.last_enriched_at,
      partners: (partnersRes.data ?? []) as InvestorPartner[],
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
      .from("investor_database")
      .select("id")
      .ilike("firm_name", firmName.trim())
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
