/**
 * Clerk default session JWT (for edge functions that only need `sub`).
 * Separate from the Supabase-signed JWT used for PostgREST RLS.
 */
let clerkSessionGetter: () => Promise<string | null> = async () => null;

export function registerClerkSessionTokenGetter(fn: () => Promise<string | null>) {
  clerkSessionGetter = fn;
}

export async function getClerkSessionToken(): Promise<string | null> {
  try {
    return await clerkSessionGetter();
  } catch {
    return null;
  }
}
