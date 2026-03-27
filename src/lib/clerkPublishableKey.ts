/**
 * Resolves which Clerk publishable key the app should use.
 *
 * - In **development**, `VITE_CLERK_PUBLISHABLE_KEY_DEV` wins when set (use `pk_test_…` from Clerk’s Development instance).
 * - In **production** builds, only `VITE_CLERK_PUBLISHABLE_KEY` is used (`pk_live_…` on your real domain).
 *
 * This lets you keep production keys in `.env.local` while still running locally without swapping files.
 */
export function readClerkPublishableKey(): string {
  const strip = (s: string | undefined) => (s ?? "").trim().replace(/^["']|["']$/g, "");
  if (import.meta.env.DEV) {
    const dev = strip(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_DEV);
    if (dev) return dev;
  }
  return strip(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
}
