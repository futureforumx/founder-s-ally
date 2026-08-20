import { useQuery } from "@tanstack/react-query";
import { supabasePublicDirectory, supabaseVcDirectory } from "@/integrations/supabase/client";
import { generateElevatorPitch } from "@/lib/generateFallbacks";
import { resolveDirectoryFirmTypeKey } from "@/lib/resolveDirectoryFirmType";
import { resolveFirmDisplayLocation } from "@/lib/formatCanonicalHqLine";
import { pickHqLineFromLocationsJson } from "@/lib/firmLocationsJson";
import { listedInvestmentCount, deployingNameKey } from "@/lib/activelyDeploying";

export interface LiveInvestorEntry {
  id: string;
  name: string;
  sector: string;
  stage: string;
  description: string;
  location: string;
  model: string;
  initial: string;
  matchReason: string | null;
  category: "investor";
  dataSource: "verified" | "live";
  lastSynced: Date;
  logo_url?: string | null;
  firm_type?: string;
  /** `firm_records` intel — drives directory “investment focus” pill. */
  strategy_classifications?: string[] | null;
  thesis_orientation?: string | null;
  sector_scope?: string | null;
  thesis_verticals?: string[] | null;
  geo_focus?: string[] | null;
  is_actively_deploying?: boolean;
  has_fresh_capital?: boolean | null;
  likely_actively_deploying?: boolean | null;
  active_fund_vintage?: number | null;
  last_fund_announcement_date?: string | null;
  most_recent_investment_date?: string | null;
  listed_investment_count?: number | null;
  founder_reputation_score?: number | null;
  headcount?: string | null;
  aum?: string | null;
  is_trending?: boolean;
  is_popular?: boolean;
  is_recent?: boolean;
  website_url?: string | null;
  /** Array of recent portfolio company names — used to compute deal velocity. */
  recent_deals?: string[] | null;
  /** News-derived funding intel (90d) when synced onto `firm_records`. */
  funding_intel_activity_score?: number | null;
}

export interface LiveInvestorPersonEntry {
  id: string;
  firm_id: string;
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
  stage_focus: string[];
  sector_focus: string[];
  personal_thesis_tags: string[];
  check_size_min: number | null;
  check_size_max: number | null;
  sweet_spot: string | null;
  firm: {
    id: string;
    firm_name: string;
    logo_url: string | null;
    website_url: string | null;
    thesis_verticals: string[];
    strategy_classifications?: string[] | null;
    thesis_orientation?: string | null;
    sector_scope?: string | null;
    geo_focus?: string[] | null;
    stage_focus: string[];
    location: string | null;
    firm_type: string | null;
    entity_type?: string | null;
    is_actively_deploying: boolean | null;
    has_fresh_capital?: boolean | null;
    likely_actively_deploying?: boolean | null;
    active_fund_vintage?: number | null;
    last_fund_announcement_date?: string | null;
    most_recent_investment_date?: string | null;
    listed_investment_count?: number | null;
    founder_reputation_score: number | null;
    headcount: string | null;
    aum: string | null;
    is_trending: boolean | null;
    is_popular: boolean | null;
    is_recent: boolean | null;
    recent_deals: string[] | null;
    funding_intel_activity_score?: number | null;
  } | null;
  /** Person-row intel when synced from Prisma → `firm_investors`. */
  funding_intel_activity_score?: number | null;
}

/** Transform a `firm_records` row into the directory card shape (also used for RPC search hits). */
export function mapDbInvestor(row: any): LiveInvestorEntry {
  const firmName = String(row.firm_name ?? "").trim() || "Unknown firm";
  const location =
    resolveFirmDisplayLocation({
      hq_city: row.hq_city,
      hq_state: row.hq_state,
      hq_country: row.hq_country,
      legacyLocation: row.location,
    }) ??
    pickHqLineFromLocationsJson(row.locations) ??
    "";
  return {
    id: String(row.id ?? ""),
    name: firmName,
    sector: row.thesis_verticals?.filter(Boolean).join(", ") || "Generalist",
    stage: String(row.preferred_stage ?? "").trim() || "Seed–Growth",
    description: row.elevator_pitch || row.sentiment_detail || row.description || generateElevatorPitch({
      firm_name: firmName,
      description: row.description,
      stage_focus: row.stage_focus,
      thesis_verticals: row.thesis_verticals,
      hq_city: row.hq_city,
      hq_state: row.hq_state,
      hq_country: row.hq_country,
      entity_type: row.entity_type,
    }) || `${firmName} is an active investment firm.`,
    location,
    model: row.min_check_size && row.max_check_size
      ? `$${row.min_check_size >= 1_000_000 ? `${(row.min_check_size / 1_000_000).toFixed(0)}M` : `${(row.min_check_size / 1_000).toFixed(0)}K`}–$${row.max_check_size >= 1_000_000 ? `${(row.max_check_size / 1_000_000).toFixed(0)}M` : `${(row.max_check_size / 1_000).toFixed(0)}K`}`
      : "$1M–$10M",
    initial: firmName.charAt(0).toUpperCase() || "?",
    matchReason: null,
    category: "investor",
    dataSource: "verified",
    lastSynced: new Date(),
    logo_url: row.logo_url || null,
    firm_type: resolveDirectoryFirmTypeKey(firmName, row.firm_type, row.entity_type),
    strategy_classifications: Array.isArray(row.strategy_classifications)
      ? row.strategy_classifications.filter(Boolean)
      : null,
    thesis_orientation: row.thesis_orientation ?? null,
    sector_scope: row.sector_scope ?? null,
    thesis_verticals: Array.isArray(row.thesis_verticals) ? row.thesis_verticals.filter(Boolean) : [],
    geo_focus: Array.isArray(row.geo_focus) ? row.geo_focus.filter(Boolean) : null,
    is_actively_deploying: row.is_actively_deploying === true,
    has_fresh_capital: row.has_fresh_capital === true,
    likely_actively_deploying: row.likely_actively_deploying === true,
    active_fund_vintage: typeof row.active_fund_vintage === "number" ? row.active_fund_vintage : null,
    last_fund_announcement_date:
      typeof row.last_fund_announcement_date === "string" ? row.last_fund_announcement_date : null,
    most_recent_investment_date:
      typeof row.most_recent_investment_date === "string" ? row.most_recent_investment_date : null,
    listed_investment_count: listedInvestmentCount(row.last_5_investments) ?? listedInvestmentCount(row.recent_deals),
    founder_reputation_score: row.founder_reputation_score ?? null,
    headcount: row.headcount ?? null,
    aum: row.aum ?? null,
    is_trending: row.is_trending ?? false,
    is_popular: row.is_popular ?? false,
    is_recent: row.is_recent ?? false,
    website_url: row.website_url ?? null,
    recent_deals: row.recent_deals ?? null,
    funding_intel_activity_score:
      typeof row.funding_intel_activity_score === "number" ? row.funding_intel_activity_score : null,
  };
}

// Columns consumed by mapDbInvestor() / directory intel pill — keep in sync with `LiveInvestorEntry`.
// Excludes: sector_embedding (vector) and audit-only columns.
const DIRECTORY_COLUMNS = [
  "id",
  "firm_name",
  "thesis_verticals",
  "preferred_stage",
  "sentiment_detail",
  "description",
  "elevator_pitch",
  "stage_min",
  "stage_max",
  "sector_scope",
  "thesis_orientation",
  "strategy_classifications",
  "geo_focus",
  "hq_city",
  "hq_state",
  "hq_country",
  "location",
  "locations",
  "min_check_size",
  "max_check_size",
  "logo_url",
  "firm_type",
  "entity_type",
  "is_actively_deploying",
  "has_fresh_capital",
  "likely_actively_deploying",
  "active_fund_vintage",
  "last_fund_announcement_date",
  "most_recent_investment_date",
  "last_5_investments",
  "founder_reputation_score",
  "headcount",
  "aum",
  "is_trending",
  "is_popular",
  "is_recent",
  "website_url",
  "linkedin_url",
  "recent_deals",
  "funding_intel_activity_score",
  "stage_focus",
].join(",");

/** PostgREST / Supabase default max rows per request — without paging, late-alphabet firms never load. */
const FIRM_DIRECTORY_PAGE_SIZE = 1000;
const FUND_ACTIVITY_PAGE_SIZE = 1000;
const FRESH_FUND_VINTAGE_YEARS = 2;

type DirectoryFundSignal = {
  likelyActivelyDeploying: boolean;
  vintageYear: number | null;
};

/** Same `vc_funds` signals the Activity tab uses — firm_records flags can lag. */
async function fetchDirectoryFundSignals(): Promise<Map<string, DirectoryFundSignal>> {
  const out = new Map<string, DirectoryFundSignal>();
  const vintageFloor = new Date().getFullYear() - FRESH_FUND_VINTAGE_YEARS;
  let from = 0;
  for (;;) {
    const { data, error } = await supabasePublicDirectory
      .from("vc_funds")
      .select("firm_record_id, likely_actively_deploying, vintage_year")
      .is("deleted_at", null)
      .or(`likely_actively_deploying.eq.true,vintage_year.gte.${vintageFloor}`)
      .range(from, from + FUND_ACTIVITY_PAGE_SIZE - 1);
    if (error) break;
    const chunk = (data ?? []) as Array<{
      firm_record_id?: string | null;
      likely_actively_deploying?: boolean | null;
      vintage_year?: number | null;
    }>;
    for (const row of chunk) {
      const id = typeof row.firm_record_id === "string" ? row.firm_record_id : "";
      if (!id) continue;
      const vintage = typeof row.vintage_year === "number" ? row.vintage_year : null;
      const freshVintage = vintage != null && vintage >= vintageFloor;
      const prev = out.get(id);
      out.set(id, {
        likelyActivelyDeploying:
          prev?.likelyActivelyDeploying === true ||
          row.likely_actively_deploying === true ||
          freshVintage,
        vintageYear: Math.max(vintage ?? 0, prev?.vintageYear ?? 0) || vintage || prev?.vintageYear || null,
      });
    }
    if (chunk.length < FUND_ACTIVITY_PAGE_SIZE) break;
    from += FUND_ACTIVITY_PAGE_SIZE;
  }
  return out;
}

function applyDirectoryFundSignal<T extends {
  is_actively_deploying?: boolean | null;
  likely_actively_deploying?: boolean | null;
  active_fund_vintage?: number | null;
}>(row: T, firmId: string | null | undefined, signals: Map<string, DirectoryFundSignal>): T {
  if (!firmId) return row;
  const signal = signals.get(firmId);
  if (!signal) return row;
  return {
    ...row,
    likely_actively_deploying: row.likely_actively_deploying === true || signal.likelyActivelyDeploying,
    is_actively_deploying: row.is_actively_deploying === true || signal.likelyActivelyDeploying,
    active_fund_vintage: row.active_fund_vintage ?? signal.vintageYear,
  };
}

function addDeployingNameKeys(into: Set<string>, name: string | null | undefined, aliases?: unknown) {
  const key = deployingNameKey(name);
  if (key) into.add(key);
  if (!Array.isArray(aliases)) return;
  for (const alias of aliases) {
    const ak = deployingNameKey(typeof alias === "string" ? alias : null);
    if (ak) into.add(ak);
  }
}

async function fetchActiveDeployingNameKeys(): Promise<string[]> {
  const keys = new Set<string>();
  const vintageFloor = new Date().getFullYear() - FRESH_FUND_VINTAGE_YEARS;
  const fundFirmIds: string[] = [];
  const seenFundIds = new Set<string>();

  let from = 0;
  for (;;) {
    const { data, error } = await supabasePublicDirectory
      .from("vc_funds")
      .select("firm_record_id, likely_actively_deploying, vintage_year")
      .is("deleted_at", null)
      .or(`likely_actively_deploying.eq.true,vintage_year.gte.${vintageFloor}`)
      .range(from, from + FUND_ACTIVITY_PAGE_SIZE - 1);
    if (error) break;
    const chunk = (data ?? []) as Array<{
      firm_record_id?: string | null;
      likely_actively_deploying?: boolean | null;
      vintage_year?: number | null;
    }>;
    for (const row of chunk) {
      const id = typeof row.firm_record_id === "string" ? row.firm_record_id : "";
      if (!id || seenFundIds.has(id)) continue;
      const vintage = typeof row.vintage_year === "number" ? row.vintage_year : null;
      const active =
        row.likely_actively_deploying === true || (vintage != null && vintage >= vintageFloor);
      if (!active) continue;
      seenFundIds.add(id);
      fundFirmIds.push(id);
    }
    if (chunk.length < FUND_ACTIVITY_PAGE_SIZE) break;
    from += FUND_ACTIVITY_PAGE_SIZE;
  }

  for (let i = 0; i < fundFirmIds.length; i += 100) {
    const slice = fundFirmIds.slice(i, i + 100);
    const { data, error } = await supabasePublicDirectory
      .from("firm_records")
      .select("firm_name, aliases")
      .in("id", slice)
      .is("deleted_at", null);
    if (error) continue;
    for (const row of (data ?? []) as Array<{ firm_name?: string | null; aliases?: string[] | null }>) {
      addDeployingNameKeys(keys, row.firm_name, row.aliases);
    }
  }

  from = 0;
  for (;;) {
    const { data, error } = await supabasePublicDirectory
      .from("firm_records")
      .select("firm_name, aliases")
      .is("deleted_at", null)
      .or("is_actively_deploying.eq.true,has_fresh_capital.eq.true,likely_actively_deploying.eq.true")
      .range(from, from + FIRM_DIRECTORY_PAGE_SIZE - 1);
    if (error) break;
    const chunk = (data ?? []) as Array<{ firm_name?: string | null; aliases?: string[] | null }>;
    for (const row of chunk) addDeployingNameKeys(keys, row.firm_name, row.aliases);
    if (chunk.length < FIRM_DIRECTORY_PAGE_SIZE) break;
    from += FIRM_DIRECTORY_PAGE_SIZE;
  }

  return [...keys];
}

async function fetchAllReadyLiveFirmRows(): Promise<any[]> {
  const acc: any[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabaseVcDirectory
      .from("firm_records")
      .select(DIRECTORY_COLUMNS)
      .is("deleted_at", null)
      .eq("ready_for_live", true)
      .order("firm_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + FIRM_DIRECTORY_PAGE_SIZE - 1);

    if (error) throw error;
    const chunk = data ?? [];
    acc.push(...chunk);
    if (chunk.length < FIRM_DIRECTORY_PAGE_SIZE) break;
    from += FIRM_DIRECTORY_PAGE_SIZE;
  }
  return acc;
}

export function useInvestorDirectory() {
  return useQuery({
    queryKey: ["investor-directory", "paged-vc-client", "fund-activity"],
    queryFn: async (): Promise<LiveInvestorEntry[]> => {
      const [rows, fundSignals] = await Promise.all([
        fetchAllReadyLiveFirmRows(),
        fetchDirectoryFundSignals(),
      ]);
      return rows.map((row) => applyDirectoryFundSignal(mapDbInvestor(row), String(row.id ?? ""), fundSignals));
    },
    staleTime: 30 * 60 * 1000, // Investor list is stable — 30 min before background refresh
    gcTime: 60 * 60 * 1000,    // Keep in memory cache for 1 hour
    refetchOnWindowFocus: false, // Was: true — this was the primary seq-scan driver
    refetchInterval: 60 * 60 * 1000, // Was: 10 min — 1 hour is plenty for static directory
    placeholderData: (prev) => prev,
  });
}

/** Normalized firm names that should show “Actively deploying” on directory cards. */
export function useDirectoryDeployingNameSet() {
  return useQuery({
    queryKey: ["directory-active-deploying-names"],
    queryFn: fetchActiveDeployingNameKeys,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}

export function useInvestorPeopleDirectory(limit = 5000) {
  return useQuery({
    queryKey: ["investor-people-directory", limit, "fund-activity"],
    queryFn: async (): Promise<LiveInvestorPersonEntry[]> => {
      const [{ data, error }, fundSignals] = await Promise.all([
        supabaseVcDirectory
        .from("firm_investors")
        .select(
          [
            "id",
            "firm_id",
            "full_name",
            "first_name",
            "last_name",
            "title",
            "is_active",
            "avatar_url",
            "email",
            "linkedin_url",
            "x_url",
            "website_url",
            "bio",
            "city",
            "state",
            "country",
            "stage_focus",
            "sector_focus",
            "personal_thesis_tags",
            "check_size_min",
            "check_size_max",
            "sweet_spot",
            "funding_intel_activity_score",
            "firm:firm_records!firm_investors_firm_id_fkey(",
            "id,firm_name,logo_url,website_url,thesis_verticals,strategy_classifications,thesis_orientation,sector_scope,geo_focus,stage_focus,hq_city,hq_state,hq_country,location,locations,firm_type,entity_type,",
            "is_actively_deploying,has_fresh_capital,likely_actively_deploying,active_fund_vintage,last_fund_announcement_date,most_recent_investment_date,last_5_investments,founder_reputation_score,headcount,aum,is_trending,is_popular,is_recent,recent_deals,funding_intel_activity_score",
            ")",
          ].join(","),
        )
        .is("deleted_at", null)
        .eq("ready_for_live", true)
        .order("full_name")
        .limit(limit),
        fetchDirectoryFundSignals(),
      ]);

      if (error) throw error;

      return (data ?? [])
        .filter(
          (row: any) =>
            row?.firm && typeof row.full_name === "string" && row.full_name.trim().length > 0,
        )
        .map((row: any) => {
          const firmName = row.firm?.firm_name ?? "";
          const firm = row.firm
            ? applyDirectoryFundSignal(
                {
                  id: row.firm.id,
                  firm_name: row.firm.firm_name,
                  logo_url: row.firm.logo_url ?? null,
                  website_url: row.firm.website_url ?? null,
                  thesis_verticals: Array.isArray(row.firm.thesis_verticals) ? row.firm.thesis_verticals.filter(Boolean) : [],
                  strategy_classifications: Array.isArray(row.firm.strategy_classifications)
                    ? row.firm.strategy_classifications.filter(Boolean)
                    : null,
                  thesis_orientation: row.firm.thesis_orientation ?? null,
                  sector_scope: row.firm.sector_scope ?? null,
                  geo_focus: Array.isArray(row.firm.geo_focus) ? row.firm.geo_focus.filter(Boolean) : null,
                  stage_focus: Array.isArray(row.firm.stage_focus) ? row.firm.stage_focus.filter(Boolean) : [],
                  location:
                    resolveFirmDisplayLocation({
                      hq_city: row.firm.hq_city,
                      hq_state: row.firm.hq_state,
                      hq_country: row.firm.hq_country,
                      legacyLocation: row.firm.location,
                    }) ??
                    pickHqLineFromLocationsJson(row.firm.locations) ??
                    null,
                  firm_type: resolveDirectoryFirmTypeKey(firmName, row.firm.firm_type, row.firm.entity_type),
                  entity_type: row.firm.entity_type ?? null,
                  is_actively_deploying:
                    typeof row.firm.is_actively_deploying === "boolean" ? row.firm.is_actively_deploying : null,
                  has_fresh_capital: row.firm.has_fresh_capital === true,
                  likely_actively_deploying: row.firm.likely_actively_deploying === true,
                  active_fund_vintage:
                    typeof row.firm.active_fund_vintage === "number" ? row.firm.active_fund_vintage : null,
                  last_fund_announcement_date:
                    typeof row.firm.last_fund_announcement_date === "string"
                      ? row.firm.last_fund_announcement_date
                      : null,
                  most_recent_investment_date:
                    typeof row.firm.most_recent_investment_date === "string"
                      ? row.firm.most_recent_investment_date
                      : null,
                  listed_investment_count:
                    listedInvestmentCount(row.firm.last_5_investments) ??
                    listedInvestmentCount(row.firm.recent_deals),
                  founder_reputation_score:
                    typeof row.firm.founder_reputation_score === "number" ? row.firm.founder_reputation_score : null,
                  headcount: row.firm.headcount ?? null,
                  aum: row.firm.aum ?? null,
                  is_trending: typeof row.firm.is_trending === "boolean" ? row.firm.is_trending : null,
                  is_popular: typeof row.firm.is_popular === "boolean" ? row.firm.is_popular : null,
                  is_recent: typeof row.firm.is_recent === "boolean" ? row.firm.is_recent : null,
                  recent_deals: Array.isArray(row.firm.recent_deals) ? row.firm.recent_deals.filter(Boolean) : null,
                  funding_intel_activity_score:
                    typeof row.firm.funding_intel_activity_score === "number"
                      ? row.firm.funding_intel_activity_score
                      : null,
                },
                row.firm.id,
                fundSignals,
              )
            : null;
          return {
            id: row.id,
            firm_id: row.firm_id,
            full_name: row.full_name,
            first_name: row.first_name ?? null,
            last_name: row.last_name ?? null,
            title: row.title ?? null,
            is_active: row.is_active ?? true,
            avatar_url: row.avatar_url ?? null,
            email: row.email ?? null,
            linkedin_url: row.linkedin_url ?? null,
            x_url: row.x_url ?? null,
            website_url: row.website_url ?? null,
            bio:
              row.bio ||
              generateInvestorBio({
                full_name: row.full_name,
                first_name: row.first_name,
                last_name: row.last_name,
                title: row.title,
                firm_name: row.firm?.firm_name,
                personal_thesis_tags: row.personal_thesis_tags,
                stage_focus: row.stage_focus,
                check_size_min: row.check_size_min,
                check_size_max: row.check_size_max,
                sweet_spot: row.sweet_spot,
                city: row.city,
                state: row.state,
                country: row.country,
              }),
            city: row.city ?? null,
            state: row.state ?? null,
            country: row.country ?? null,
            stage_focus: Array.isArray(row.stage_focus) ? row.stage_focus.filter(Boolean) : [],
            sector_focus: Array.isArray(row.sector_focus) ? row.sector_focus.filter(Boolean) : [],
            personal_thesis_tags: Array.isArray(row.personal_thesis_tags) ? row.personal_thesis_tags.filter(Boolean) : [],
            check_size_min: typeof row.check_size_min === "number" ? row.check_size_min : null,
            check_size_max: typeof row.check_size_max === "number" ? row.check_size_max : null,
            sweet_spot: row.sweet_spot ?? null,
            firm,
            funding_intel_activity_score:
              typeof row.funding_intel_activity_score === "number" ? row.funding_intel_activity_score : null,
          };
        });
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: 60 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}
