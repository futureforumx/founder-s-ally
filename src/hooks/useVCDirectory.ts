import { useState, useEffect, useMemo, useCallback } from "react";
import { supabaseVcDirectory } from "@/integrations/supabase/client";

// ── JSON Schema Types ──
export interface VCFirm {
  id: string;
  name: string;
  description: string | null;
  aum: string | null;
  sweet_spot: string | null;
  stages: string[] | null;
  sectors: string[] | null;
  logo_url: string | null;
  website_url: string | null;
}

// ── Enums ──
export type VerificationStatus = "VERIFIED" | "UNVERIFIED" | "STALE" | "DISPUTED";
export type InvestorType =
  | "GENERAL_PARTNER" | "VENTURE_PARTNER" | "PARTNER" | "PRINCIPAL"
  | "ASSOCIATE" | "ANALYST" | "SCOUT" | "ANGEL" | "ADVISOR" | "OPERATOR" | "OTHER";
export type SeniorityLevel =
  | "C_SUITE" | "MANAGING_PARTNER" | "GENERAL_PARTNER" | "PARTNER"
  | "VENTURE_PARTNER" | "PRINCIPAL" | "ASSOCIATE" | "ANALYST" | "SCOUT" | "OTHER";
export type AffiliationType = "EMPLOYEE" | "VENTURE_PARTNER" | "SCOUT" | "ADVISOR" | "LP" | "EIR" | "ANGEL" | "OTHER";
export type ContactabilityStatus = "OPEN" | "WARM_INTRO_ONLY" | "CLOSED" | "UNKNOWN";
export type LeadFollowPreference = "LEAD_ONLY" | "LEAD_PREFERRED" | "FOLLOW_ONLY" | "FLEXIBLE";
export type ContentType =
  | "BLOG_POST" | "TWEET" | "LINKEDIN_POST" | "PODCAST" | "VIDEO"
  | "NEWSLETTER" | "PRESS" | "INTERVIEW" | "RESEARCH" | "OTHER";

// ── Nested object types ──
export interface VCPersonLocation {
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country: string | null;
  raw_location: string | null;
}

export interface VCPersonAffiliation {
  firm_id: string;
  firm_name: string;
  title: string | null;
  affiliation_type: AffiliationType | null;
  seniority: SeniorityLevel | null;
  start_date: string | null;    // ISO date
  end_date: string | null;
  is_primary: boolean;
}

export interface VCPersonPriorCompany {
  company_name: string;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface VCPersonPriorRole {
  role_title: string;
  organization_name: string;
  start_date: string | null;
  end_date: string | null;
}

export interface VCPersonEducation {
  institution: string;
  degree: string | null;
  field_of_study: string | null;
  start_year: number | null;
  end_year: number | null;
}

export interface VCPersonAreasOfExpertise {
  sectors: string[];
  functions: string[];
  themes: string[];
}

export interface VCPersonCheckSize {
  min_usd: number | null;
  max_usd: number | null;
  average_usd: number | null;
}

export interface VCPersonCoInvestors {
  firms: string[];
  investors: string[];
  recent_coinvestors: string[];
  coinvestment_count: number | null;
  last_coinvestment_at: string | null;
}

export interface VCPersonTrends {
  current_themes: string[];
  market_interests: string[];
  focus_shifts: string[];
  latest_insights_summary: string | null;
}

export interface VCPersonActivity {
  last_seen_active_at: string | null;
  recent_content_count_90d: number | null;
  recent_investments_count_12m: number | null;
  active_deployment_signal: boolean | null;
  data_freshness_score: number | null;  // 0–1
}

export interface VCPersonInvestment {
  company_name: string;
  company_id: string | null;
  sector: string | null;
  stage: string | null;
  check_size: number | null;
  location: string | null;
  date: string | null;
  lead_or_follow: string | null;
  source_url: string | null;
}

export interface VCPersonNotableInvestment {
  company_name: string;
  company_id: string | null;
  sector: string | null;
  stage: string | null;
  outcome: string | null;
  source_url: string | null;
}

export interface VCPersonScores {
  match_score: number | null;
  reputation_score: number | null;
  founder_sentiment_score: number | null;
  industry_reputation_score: number | null;
  responsiveness_score: number | null;
  founder_satisfaction_score: number | null;
  value_add_score: number | null;
  network_strength_score: number | null;
  active_deployment_score: number | null;
  confidence_score: number | null;
  score_explanations: Record<string, string> | null;
}

export interface VCPersonContent {
  title: string;
  published_at: string | null;
  content_type: ContentType;
  source_name: string | null;
  source_url: string | null;
  summary: string | null;
  themes: string[];
}

export interface VCPersonDataProvenanceUrls {
  firm_website: string | null;
  personal_website: string | null;
  crunchbase: string | null;
  angellist: string | null;
  openvc: string | null;
  signal_nfx: string | null;
  vcsheet: string | null;
  vcprodatabase: string | null;
  trustfinta: string | null;
  other_links: string[];
}

export interface VCPersonContactDetails {
  email: string | null;
  phone: string | null;
  x_url: string | null;
  linkedin_url: string | null;
  personal_website_url: string | null;
  preferred_contact_method: string | null;
  contactability_status: ContactabilityStatus;
  assistant_contact: string | null;
}

export interface VCPersonInvestingPreferences {
  stages: string[];
  sectors: string[];
  geographies: string[];
  business_models: string[];
  investment_criteria_qualities: string[];
  check_size: VCPersonCheckSize;
  lead_or_follow: LeadFollowPreference | null;
  ownership_target_pct: number | null;
  board_seat_preference: string | null;
  solo_founder_preference: string | null;
  thesis_summary: string | null;
}

// ── Main VCPerson interface (mirrors vc_people table) ──
export interface VCPerson {
  // ── Identity ──
  id: string;                             // primary key / slug
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  preferred_name: string | null;
  slug: string | null;
  profile_image_url: string | null;
  avatar_url: string | null;              // legacy alias
  is_active: boolean;
  investor_type: InvestorType | null;
  source_confidence: number | null;       // 0–1
  verification_status: VerificationStatus;
  last_verified_at: string | null;        // ISO timestamp

  // ── Location ──
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  raw_location: string | null;
  timezone: string | null;

  // ── Background ──
  background_summary: string | null;
  bio: string | null;                     // legacy alias
  notable_credentials: string[];
  personal_qualities: string[];
  areas_of_expertise: VCPersonAreasOfExpertise | null;
  prior_companies: VCPersonPriorCompany[] | null;
  prior_roles: VCPersonPriorRole[] | null;
  education: VCPersonEducation[] | null;
  education_summary: string | null;       // legacy alias

  // ── Affiliation ──
  firm_id: string;                        // primary firm (legacy key)
  primary_firm_name: string | null;
  title: string | null;
  role: string | null;
  seniority: SeniorityLevel | null;
  affiliation_type: AffiliationType | null;
  affiliation_start_date: string | null;
  affiliation_end_date: string | null;
  is_primary_affiliation: boolean;
  affiliations: VCPersonAffiliation[] | null;

  // ── Contact ──
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  website_url: string | null;
  preferred_contact_method: string | null;
  contactability_status: ContactabilityStatus;
  assistant_contact: string | null;
  warm_intro_preferred: boolean;
  cold_outreach_ok: boolean;

  // ── Investing preferences ──
  stage_focus: string[] | null;
  sector_focus: string[] | null;
  geography_focus: string[];
  business_models: string[];
  investment_criteria_qualities: string[];
  check_size_min: number | null;
  check_size_max: number | null;
  check_size_avg_usd: number | null;
  lead_or_follow: LeadFollowPreference | null;
  ownership_target_pct: number | null;
  board_seat_preference: string | null;
  solo_founder_preference: string | null;
  personal_thesis_tags: string[];
  thesis_summary: string | null;
  investment_style: string | null;

  // ── Network ──
  co_investors: VCPersonCoInvestors | null;

  // ── Trends ──
  trends: VCPersonTrends | null;

  // ── Activity ──
  activity: VCPersonActivity | null;
  last_active_date: string | null;        // legacy alias
  recent_deal_count: number | null;       // legacy alias

  // ── Investments ──
  recent_investments: VCPersonInvestment[] | null;
  notable_investments: VCPersonNotableInvestment[] | null;

  // ── Scores ──
  scores: VCPersonScores | null;
  match_score: number | null;             // scalar copy for sorting
  reputation_score: number | null;
  responsiveness_score: number | null;
  value_add_score: number | null;
  network_strength: number | null;
  founder_sentiment_score: number | null;
  founder_satisfaction_score: number | null;
  active_deployment_score: number | null;
  confidence_score: number | null;

  // ── Content ──
  published_content: VCPersonContent[] | null;

  // ── Provenance ──
  data_provenance_urls: VCPersonDataProvenanceUrls | null;
  data_source: string | null;
  import_record_id: string | null;
}

interface VCData {
  firms: VCFirm[];
  people: VCPerson[];
}

type DirectoryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      is: (column: string, value: null) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
};

// ── Singleton Cache ──
let cachedData: VCData | null = null;
let loadingPromise: Promise<VCData> | null = null;

function deriveWebsiteUrlFromFirmId(id: string | null | undefined): string | null {
  if (!id) return null;
  const normalized = id.trim().toLowerCase().replace(/^https?:\/\//, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) return null;
  return `https://${normalized}`;
}

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeFirmRow(row: Record<string, unknown>): VCFirm | null {
  const id = typeof row.id === "string" ? row.id : null;
  const name =
    typeof row.firm_name === "string"
      ? row.firm_name
      : typeof row.name === "string"
        ? row.name
        : null;
  if (!id || !name) return null;

  const websiteRaw =
    typeof row.website_url === "string"
      ? row.website_url
      : typeof row.website === "string"
        ? row.website
        : null;

  return {
    id,
    name,
    description:
      typeof row.description === "string"
        ? row.description
        : typeof row.sentiment_detail === "string"
          ? row.sentiment_detail
          : null,
    aum:
      typeof row.aum === "string"
        ? row.aum
        : typeof row.aum_usd === "number"
          ? `$${Math.round(row.aum_usd).toLocaleString()}`
          : null,
    sweet_spot: typeof row.sweet_spot === "string" ? row.sweet_spot : null,
    stages:
      toStringArray(row.stages) ??
      toStringArray(row.stage_focus) ??
      (typeof row.preferred_stage === "string" && row.preferred_stage.trim()
        ? [row.preferred_stage.trim()]
        : null),
    sectors:
      toStringArray(row.sectors) ??
      toStringArray(row.sector_focus) ??
      toStringArray(row.thesis_verticals) ??
      null,
    logo_url: typeof row.logo_url === "string" ? row.logo_url : null,
    website_url: websiteRaw || deriveWebsiteUrlFromFirmId(id),
  };
}

function normalizePersonRow(row: Record<string, unknown>): VCPerson | null {
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return null;

  const firstName = typeof row.first_name === "string" ? row.first_name : null;
  const lastName = typeof row.last_name === "string" ? row.last_name : null;
  const fullNameRaw = typeof row.full_name === "string" ? row.full_name.trim() : "";
  const fullName = fullNameRaw || `${firstName ?? ""} ${lastName ?? ""}`.trim();
  if (!fullName) return null;

  const firmId =
    typeof row.firm_id === "string"
      ? row.firm_id
      : typeof row.vc_firm_id === "string"
        ? row.vc_firm_id
        : "";
  if (!firmId) return null;

  return {
    ...(row as VCPerson),
    id,
    firm_id: firmId,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    profile_image_url:
      typeof row.profile_image_url === "string"
        ? row.profile_image_url
        : typeof row.avatar_url === "string"
          ? row.avatar_url
          : null,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    verification_status:
      row.verification_status === "VERIFIED" ||
      row.verification_status === "UNVERIFIED" ||
      row.verification_status === "STALE" ||
      row.verification_status === "DISPUTED"
        ? row.verification_status
        : "UNVERIFIED",
    investor_type:
      typeof row.investor_type === "string" && row.investor_type.trim().length > 0
        ? (row.investor_type as VCPerson["investor_type"])
        : "OTHER",
    contactability_status:
      row.contactability_status === "OPEN" ||
      row.contactability_status === "WARM_INTRO_ONLY" ||
      row.contactability_status === "CLOSED" ||
      row.contactability_status === "UNKNOWN"
        ? row.contactability_status
        : "UNKNOWN",
    warm_intro_preferred: typeof row.warm_intro_preferred === "boolean" ? row.warm_intro_preferred : true,
    cold_outreach_ok: typeof row.cold_outreach_ok === "boolean" ? row.cold_outreach_ok : false,
    notable_credentials: toStringArray(row.notable_credentials) ?? [],
    personal_qualities: toStringArray(row.personal_qualities) ?? [],
    geography_focus: toStringArray(row.geography_focus) ?? [],
    business_models: toStringArray(row.business_models) ?? [],
    investment_criteria_qualities: toStringArray(row.investment_criteria_qualities) ?? [],
    personal_thesis_tags: toStringArray(row.personal_thesis_tags) ?? [],
  };
}

async function loadStaticVCData(): Promise<VCData> {
  const res = await fetch("/data/vc_mdm_output.json");
  if (!res.ok) throw new Error(`VC data HTTP ${res.status}`);
  const d = (await res.json()) as VCData;
  const firms = (d.firms || [])
    .filter((firm) => typeof firm.name === "string" && firm.name.trim().length > 0)
    .map((firm) => ({
      ...firm,
      website_url: firm.website_url ?? deriveWebsiteUrlFromFirmId(firm.id),
    }));
  return { firms, people: d.people || [] };
}

async function loadVCData(): Promise<VCData> {
  if (cachedData) return cachedData;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const directory = supabaseVcDirectory as unknown as DirectoryClient;
    try {
      const [firmRes, peopleRes] = await Promise.all([
        directory.from("vc_firms").select("*").is("deleted_at", null),
        directory.from("vc_people").select("*").is("deleted_at", null),
      ]);

      if (firmRes.error) throw new Error(firmRes.error.message);
      if (peopleRes.error) throw new Error(peopleRes.error.message);

      const firms = (firmRes.data || [])
        .map((row) => normalizeFirmRow((row || {}) as Record<string, unknown>))
        .filter((row): row is VCFirm => Boolean(row));

      const people = (peopleRes.data || [])
        .map((row) => normalizePersonRow((row || {}) as Record<string, unknown>))
        .filter((row): row is VCPerson => Boolean(row));

      cachedData = { firms, people };
      return cachedData;
    } catch (err) {
      console.error("[useVCDirectory] Failed live vc_* load, falling back to static JSON:", err);
      try {
        const fallback = await loadStaticVCData();
        cachedData = fallback;
        return fallback;
      } catch (fallbackErr) {
        console.error("[useVCDirectory] Failed static fallback load:", fallbackErr);
        return { firms: [], people: [] };
      }
    }
  })();
  return loadingPromise;
}

export function useVCDirectory() {
  const [data, setData] = useState<VCData | null>(cachedData);
  const [loading, setLoading] = useState(!cachedData);

  useEffect(() => {
    if (cachedData) { setData(cachedData); setLoading(false); return; }
    loadVCData().then((d) => { setData(d); setLoading(false); });
  }, []);

  const firmMap = useMemo(() => {
    if (!data) return new Map<string, VCFirm>();
    const m = new Map<string, VCFirm>();
    for (const f of data.firms) m.set(f.id, f);
    return m;
  }, [data]);

  const peopleByFirm = useMemo(() => {
    if (!data) return new Map<string, VCPerson[]>();
    const m = new Map<string, VCPerson[]>();
    for (const p of data.people) {
      const arr = m.get(p.firm_id) || [];
      arr.push(p);
      m.set(p.firm_id, arr);
    }
    return m;
  }, [data]);

  const getFirmById = useCallback((id: string) => firmMap.get(id) || null, [firmMap]);
  const getPersonById = useCallback((id: string) => data?.people.find((p) => p.id === id) || null, [data]);
  const getPartnersForFirm = useCallback((firmId: string) => peopleByFirm.get(firmId) || [], [peopleByFirm]);
  const getFirmForPerson = useCallback((personId: string) => {
    const person = data?.people.find((p) => p.id === personId);
    return person ? firmMap.get(person.firm_id) || null : null;
  }, [data, firmMap]);

  // All unique stages across firms
  const allStages = useMemo(() => {
    if (!data) return [] as string[];
    const s = new Set<string>();
    for (const f of data.firms) f.stages?.forEach((st) => s.add(st));
    return Array.from(s).sort();
  }, [data]);

  // All unique sectors
  const allSectors = useMemo(() => {
    if (!data) return [] as string[];
    const s = new Set<string>();
    for (const f of data.firms) f.sectors?.forEach((sc) => s.add(sc));
    return Array.from(s).sort();
  }, [data]);

  return {
    firms: data?.firms || [],
    people: data?.people || [],
    loading,
    firmMap,
    peopleByFirm,
    getFirmById,
    getPersonById,
    getPartnersForFirm,
    getFirmForPerson,
    allStages,
    allSectors,
  };
}
