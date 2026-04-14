import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { safeTrim } from "@/lib/utils";

type SB = SupabaseClient<Database>;

/** Ranked `firm_records` rows (Supabase RPC `search_firm_records`). */
export async function rpcSearchFirmRecords(
  query: string,
  limit = 40,
  readyForLive: boolean | null = true,
  client: SB = supabase,
): Promise<Record<string, unknown>[]> {
  const q = safeTrim(query);
  if (q.length < 2) return [];
  const { data, error } = await client.rpc("search_firm_records", {
    p_query: q,
    p_limit: limit,
    p_ready_for_live: readyForLive,
  });
  if (error) {
    console.warn("search_firm_records", error.message);
    return [];
  }
  return (data ?? []) as Record<string, unknown>[];
}

export type FirmInvestorSearchHit = {
  id: string;
  firm_id: string;
  full_name: string;
  title: string | null;
  avatar_url: string | null;
  profile_image_url: string | null;
  firm_name: string;
  match_rank: number;
  sim_score: number;
};

/** Partners / firm_investors hits joined to firm name (RPC `search_firm_investors`). */
export async function rpcSearchFirmInvestors(query: string, limit = 30, client: SB = supabase): Promise<FirmInvestorSearchHit[]> {
  const q = safeTrim(query);
  if (q.length < 2) return [];
  const { data, error } = await client.rpc("search_firm_investors", {
    p_query: q,
    p_limit: limit,
  });
  if (error) {
    console.warn("search_firm_investors", error.message);
    return [];
  }
  return (data ?? []) as FirmInvestorSearchHit[];
}
