import { getSupabaseAccessToken } from "@/integrations/supabase/client";
import { getClerkSessionToken } from "@/lib/clerkSessionForEdge";

/** JWT for edge functions - uses the current Supabase Auth session token. */
export async function getEdgeFunctionAuthToken(): Promise<string | null> {
  return (await getClerkSessionToken()) || (await getSupabaseAccessToken());
}
