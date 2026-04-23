/**
 * Default app session token getter (for edge functions that only need `sub`).
 * Separate from the Supabase-signed JWT used for PostgREST RLS.
 */
let authSessionGetter: () => Promise<string | null> = async () => null;

export function registerAuthSessionTokenGetter(fn: () => Promise<string | null>) {
  authSessionGetter = fn;
}

export async function getAuthSessionToken(): Promise<string | null> {
  try {
    return await authSessionGetter();
  } catch {
    return null;
  }
}

export const registerClerkSessionTokenGetter = registerAuthSessionTokenGetter;
export const getClerkSessionToken = getAuthSessionToken;
