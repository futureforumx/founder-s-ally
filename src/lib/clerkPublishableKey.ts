/**
 * Resolves which Clerk publishable key the Vite app should use.
 * - In **development**, `VITE_CLERK_PUBLISHABLE_KEY_DEV` wins when set (use `pk_test_…` from Clerk Development).
 * - Production builds use `VITE_CLERK_PUBLISHABLE_KEY`.
 */
export function readClerkPublishableKey(): string {
  const dev = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_DEV;
  const main = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const pick = import.meta.env.DEV && dev && String(dev).trim() ? dev : main;
  return String(pick ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
}
