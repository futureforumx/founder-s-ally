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
}

// Transform DB rows into DirectoryEntry-compatible shape
function mapDbInvestor(row: any): LiveInvestorEntry {
  return {
    id: row.id,
    name: row.firm_name,
    sector: row.thesis_verticals?.join(", ") || "Multi-stage",
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
  };
}

export function useInvestorDirectory() {
  return useQuery({
    queryKey: ["investor-directory"],
    queryFn: async (): Promise<LiveInvestorEntry[]> => {
      const { data, error } = await supabase
        .from("investor_database")
        .select("*")
        .order("firm_name");

      if (error) throw error;
      return (data || []).map(mapDbInvestor);
    },
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 min
    gcTime: 30 * 60 * 1000, // Cache for 30 min
    refetchOnWindowFocus: true, // SWR: refetch silently when user comes back
    refetchInterval: 10 * 60 * 1000, // Background refresh every 10 min
    placeholderData: (prev) => prev, // Keep old data while refetching (SWR)
  });
}
