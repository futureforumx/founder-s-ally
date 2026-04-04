import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  is_actively_deploying?: boolean;
  founder_reputation_score?: number | null;
  headcount?: string | null;
  aum?: string | null;
  is_trending?: boolean;
  is_popular?: boolean;
  is_recent?: boolean;
  website_url?: string | null;
  /** Array of recent portfolio company names — used to compute deal velocity. */
  recent_deals?: string[] | null;
}

// Transform DB rows into DirectoryEntry-compatible shape
function mapDbInvestor(row: any): LiveInvestorEntry {
  return {
    id: row.id,
    name: row.firm_name,
    sector: row.thesis_verticals?.filter(Boolean).join(", ") || "Generalist",
    stage: row.preferred_stage || "Seed–Growth",
    description: row.sentiment_detail || `${row.firm_name} is an active investor focused on ${row.thesis_verticals?.slice(0, 2).join(" and ") || "technology"}.`,
    location: row.location || "",
    model: row.min_check_size && row.max_check_size
      ? `$${row.min_check_size >= 1_000_000 ? `${(row.min_check_size / 1_000_000).toFixed(0)}M` : `${(row.min_check_size / 1_000).toFixed(0)}K`}–$${row.max_check_size >= 1_000_000 ? `${(row.max_check_size / 1_000_000).toFixed(0)}M` : `${(row.max_check_size / 1_000).toFixed(0)}K`}`
      : "$1M–$10M",
    initial: row.firm_name?.charAt(0).toUpperCase() || "?",
    matchReason: null,
    category: "investor",
    dataSource: "verified",
    lastSynced: new Date(),
    logo_url: row.logo_url || null,
    firm_type: row.firm_type || "Institutional",
    is_actively_deploying: row.is_actively_deploying ?? true,
    founder_reputation_score: row.founder_reputation_score ?? null,
    headcount: row.headcount ?? null,
    aum: row.aum ?? null,
    is_trending: row.is_trending ?? false,
    is_popular: row.is_popular ?? false,
    is_recent: row.is_recent ?? false,
    website_url: row.website_url ?? null,
    recent_deals: row.recent_deals ?? null,
  };
}

// Columns actually consumed by mapDbInvestor() — nothing more.
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
  "geo_focus",
  "hq_city",
  "hq_state",
  "hq_country",
  "location",
  "min_check_size",
  "max_check_size",
  "logo_url",
  "firm_type",
  "is_actively_deploying",
  "founder_reputation_score",
  "headcount",
  "aum",
  "is_trending",
  "is_popular",
  "is_recent",
  "website_url",
  "linkedin_url",
  "recent_deals",
].join(",");

export function useInvestorDirectory() {
  return useQuery({
    queryKey: ["investor-directory"],
    queryFn: async (): Promise<LiveInvestorEntry[]> => {
      const { data, error } = await supabase
        .from("firm_records")
        .select(DIRECTORY_COLUMNS)
        .is("deleted_at", null) // filter at DB level — avoids pulling soft-deleted rows
        .order("firm_name");

      if (error) throw error;
      return (data || []).map(mapDbInvestor);
    },
    staleTime: 30 * 60 * 1000, // Investor list is stable — 30 min before background refresh
    gcTime: 60 * 60 * 1000,    // Keep in memory cache for 1 hour
    refetchOnWindowFocus: false, // Was: true — this was the primary seq-scan driver
    refetchInterval: 60 * 60 * 1000, // Was: 10 min — 1 hour is plenty for static directory
    placeholderData: (prev) => prev,
  });
}
