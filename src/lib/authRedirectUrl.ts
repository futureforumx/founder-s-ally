const CANONICAL_APP_ORIGIN = "https://vekta.so";

/**
 * Keep Supabase Auth callbacks on the app domain, even if an old Clerk domain is
 * used to start the flow. Preview and local hosts keep their own origin.
 */
export function authRedirectUrl(path = "/auth"): string | undefined {
  if (typeof window === "undefined") return undefined;

  const hostname = window.location.hostname.toLowerCase();
  const origin = hostname === "clerk.vekta.so" || hostname === "www.vekta.so"
    ? CANONICAL_APP_ORIGIN
    : window.location.origin;
  return new URL(path, origin).toString();
}
