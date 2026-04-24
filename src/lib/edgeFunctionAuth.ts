import { getSupabaseAccessToken } from "@/integrations/supabase/client";
import { getAuthSessionToken } from "@/lib/clerkSessionForEdge";

/**
 * JWT for edge functions. Returns the WorkOS access token registered by WorkOSAuthProvider,
 * falling back to the Supabase bearer (publishable key).
 *
 * The token `sub` matches `useAuth().user.id` so DB rows keyed by user_id resolve correctly.
 */
export async function getEdgeFunctionAuthToken(): Promise<string | null> {
  return (await getAuthSessionToken()) || (await getSupabaseAccessToken());
}

/**
 * @deprecated Use getEdgeFunctionAuthToken() instead.
 * Kept for call-sites that import getClerkBrowserSessionToken by name.
 */
export async function getClerkBrowserSessionToken(): Promise<string | null> {
  return getEdgeFunctionAuthToken();
}
