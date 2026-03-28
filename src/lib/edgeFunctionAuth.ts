import { getSupabaseAccessToken } from "@/integrations/supabase/client";
import { getClerkSessionToken } from "@/lib/clerkSessionForEdge";

/**
 * JWT for edge functions that map DB rows with `user_id` = Clerk id (`user_…`).
 * Prefer the Clerk **session** token so JWT `sub` matches `useAuth().user.id`.
 * The Clerk "supabase" template often uses a different `sub` (e.g. Supabase auth UUID), which breaks
 * company_analyses / profiles keyed by Clerk id.
 */
export async function getEdgeFunctionAuthToken(): Promise<string | null> {
  return (await getClerkSessionToken()) || (await getSupabaseAccessToken());
}
