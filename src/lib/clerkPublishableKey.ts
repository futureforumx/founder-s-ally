/**
 * Resolves which Clerk publishable key the Vite app should use.
 * - In **development**, `VITE_CLERK_PUBLISHABLE_KEY_DEV` wins when set (use `pk_test_…` from Clerk Development).
 * - On **Vercel Preview** (`VERCEL_ENV=preview` at build), `VITE_CLERK_PUBLISHABLE_KEY_PREVIEW` wins when set
 *   so you can use `pk_test_…` on previews while Production keeps `VITE_CLERK_PUBLISHABLE_KEY` = `pk_live_…`.
 * - Otherwise production builds use `VITE_CLERK_PUBLISHABLE_KEY`.
 */

function trimKey(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

export type ClerkPublishableKeySource = "dev" | "preview_override" | "main";

export function resolveClerkPublishableKey(): { key: string; source: ClerkPublishableKeySource } {
  const dev = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_DEV;
  const main = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const previewOnly = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_PREVIEW;
  const vercelEnv = trimKey(import.meta.env.VITE_VERCEL_ENV);

  if (import.meta.env.DEV && trimKey(dev)) {
    return { key: trimKey(dev), source: "dev" };
  }

  if (import.meta.env.PROD && vercelEnv === "preview" && trimKey(previewOnly)) {
    return { key: trimKey(previewOnly), source: "preview_override" };
  }

  return { key: trimKey(main), source: "main" };
}

export function readClerkPublishableKey(): string {
  return resolveClerkPublishableKey().key;
}
