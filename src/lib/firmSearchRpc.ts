import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { safeTrim } from "@/lib/utils";

type SB = SupabaseClient<Database>;

/** PostgREST PGRST202 / missing-RPC retry — match message, details, and code. */
function searchFirmRecordsWrongRpcShape(error: { message?: string; code?: string; details?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const t = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    t.includes("schema cache") ||
    t.includes("could not find the function") ||
    t.includes("does not exist")
  );
}

/** Ranked `firm_records` rows (Supabase RPC `search_firm_records`). */
export async function rpcSearchFirmRecords(
  query: string,
  limit = 40,
  readyForLive: boolean | null = true,
  client: SB = supabase,
): Promise<Record<string, unknown>[]> {
  const q = safeTrim(query);
  if (q.length < 2) return [];
  const legacyArgs = {
    p_query: q,
    p_limit: limit,
    p_ready_for_live: readyForLive,
  };
  /** Prefer jsonb RPC (`search_firm_records(args jsonb)`) — latest migrations drop named-arg overloads. */
  let { data, error } = await client.rpc("search_firm_records", { args: legacyArgs });
  if (error && searchFirmRecordsWrongRpcShape(error)) {
    ({ data, error } = await client.rpc("search_firm_records", legacyArgs));
  }
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
