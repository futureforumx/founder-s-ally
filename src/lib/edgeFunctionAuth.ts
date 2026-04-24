import { getSupabaseAccessToken } from "@/integrations/supabase/client";
import { getClerkSessionToken } from "@/lib/clerkSessionForEdge";

/**
 * JWT for edge functions — uses WorkOS access token (registered by WorkOSAuthProvider).
 */
export async function getEdgeFunctionAuthToken(): Promise<string | null> {
  return (await getClerkSessionToken()) || (await getSupabaseAccessToken());
}
