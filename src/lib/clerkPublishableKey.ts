/**
 * Resolves which Clerk publishable key the Vite app should use.
 * - In **development**, `VITE_CLERK_PUBLISHABLE_KEY_DEV` wins when set (use `pk_test_…` from Clerk Development).
 * - On **Vercel Preview** (`VERCEL_ENV=preview` at build), `VITE_CLERK_PUBLISHABLE_KEY_PREVIEW` wins when set
 *   so you can use `pk_test_…` on previews while Production keeps `VITE_CLERK_PUBLISHABLE_KEY` = `pk_live_…`.
 * - **Runtime:** In production, if the page is served from `*.vercel.app` and `VITE_CLERK_PUBLISHABLE_KEY_PREVIEW`
 *   is present in the bundle, we use it. That fixes preview deploys when `VERCEL_ENV` was not wired into the build.
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

function isVercelDeploymentHostname(hostname: string): boolean {
  return hostname === "vercel.app" || hostname.endsWith(".vercel.app");
}

/**
 * Use this (not `resolveClerkPublishableKey` alone) anywhere the key is needed at runtime in the browser,
 * so Vercel preview hostnames pick up `VITE_CLERK_PUBLISHABLE_KEY_PREVIEW`.
 */
export function readClerkPublishableKeyWithSource(): { key: string; source: ClerkPublishableKeySource } {
  if (import.meta.env.DEV) {
    return resolveClerkPublishableKey();
  }
  if (typeof window !== "undefined" && import.meta.env.PROD) {
    const previewKey = trimKey(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_PREVIEW);
    if (previewKey && isVercelDeploymentHostname(window.location.hostname)) {
      return { key: previewKey, source: "preview_override" };
    }
  }
  return resolveClerkPublishableKey();
}

export function readClerkPublishableKey(): string {
  return readClerkPublishableKeyWithSource().key;
}
