import { getSupabaseAccessToken } from "@/integrations/supabase/client";
import { getAuthSessionToken } from "@/lib/clerkSessionForEdge";
import { readAuthProvider } from "@/lib/authProvider";

/**
 * Active Clerk session JWT from the loaded Clerk.js runtime (`sub` = Clerk user id).
 * Prefer this over the registered getter so we never submit with a stale or null closure.
 */
export async function getClerkBrowserSessionToken(): Promise<string | null> {
  if (readAuthProvider() !== "clerk") return null;
  if (typeof window === "undefined") return null;
  type ClerkWin = {
    load?: () => Promise<unknown>;
    loaded?: boolean;
    session?: { getToken: (o?: { skipCache?: boolean }) => Promise<string | null> };
  };
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const clerk = (window as unknown as { Clerk?: ClerkWin }).Clerk;
      if (clerk?.load && clerk.loaded !== true) {
        await clerk.load();
      }
      if (clerk?.session?.getToken) {
        const t = await clerk.session.getToken({ skipCache: true });
        if (t) return t;
      }
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  return null;
}

/**
 * JWT for edge functions that map DB rows with `user_id` = Clerk id (`user_…`).
 * Prefer the Clerk **session** token so JWT `sub` matches `useAuth().user.id`.
 * The Clerk "supabase" template often uses a different `sub` (e.g. Supabase auth UUID), which breaks
 * company_analyses / profiles keyed by Clerk id.
 */
export async function getEdgeFunctionAuthToken(): Promise<string | null> {
  return (
    (await getClerkBrowserSessionToken()) ||
    (await getAuthSessionToken()) ||
    (await getSupabaseAccessToken())
  );
}
