export type FreshCapitalPublicDestination = "new_funds" | "latest_funding";

export const FRESH_CAPITAL_PUBLIC_DESTINATIONS: {
  value: FreshCapitalPublicDestination;
  label: string;
}[] = [
  { value: "new_funds", label: "New Funds" },
  { value: "latest_funding", label: "Latest Funding" },
];

/** Built-in aliases that already exist in the app router. DB rows override destination. */
export const BUILTIN_FRESH_CAPITAL_PUBLIC_PATHS: Record<string, FreshCapitalPublicDestination> = {
  "fresh-capital": "new_funds",
  "fund-watch": "new_funds",
  freshcapital: "new_funds",
  fundwatch: "new_funds",
  newfunds: "new_funds",
};

/** Single-segment app routes that must not be claimed as Fresh Capital aliases. */
export const RESERVED_APP_PATH_SLUGS = new Set([
  "login",
  "register",
  "auth",
  "access",
  "referrals",
  "outbound",
  "welcome",
  "marketing",
  "intelligence",
  "onboarding",
  "onboarding-preview",
  "admin",
  "firms",
  "companies",
  "tools",
  "ai-agents",
  "api",
  "dashboard",
  "settings",
  "profile",
  "account",
  "invite",
  "invites",
  "waitlist",
  "index",
  "home",
  "app",
  "brand",
  "assets",
  "static",
  "health",
  "webhook",
  "webhooks",
  "tryvekta",
  "vekta",
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseFreshCapitalPublicDestination(
  raw: unknown,
): FreshCapitalPublicDestination | null {
  if (raw === "new_funds" || raw === "latest_funding") return raw;
  return null;
}

export function isReservedAppPathSlug(slug: string): boolean {
  return RESERVED_APP_PATH_SLUGS.has(slug);
}

export function formatFreshCapitalPublicPath(slug: string): string {
  return `/${slug}`;
}

/**
 * Accepts `/fresh-capital`, `fresh-capital`, or a full URL and returns a lowercase slug.
 */
export function normalizePublicPathSlug(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  let path = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      path = new URL(raw).pathname;
    }
  } catch {
    return null;
  }

  path = path.split("?")[0]?.split("#")[0] ?? path;
  path = path.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
  if (!path || path.includes("/")) return null;
  if (path.length > 64) return null;
  if (!SLUG_RE.test(path)) return null;
  return path;
}

export function destinationToFeedTab(
  destination: FreshCapitalPublicDestination,
): "fresh_funds" | "latest_funding" {
  return destination === "latest_funding" ? "latest_funding" : "fresh_funds";
}

export function validateFreshCapitalPublicPathInput(input: string): {
  slug: string | null;
  error: string | null;
} {
  const slug = normalizePublicPathSlug(input);
  if (!slug) {
    return {
      slug: null,
      error: "Use a path like /fresh-capital (letters, numbers, and hyphens only).",
    };
  }
  if (isReservedAppPathSlug(slug)) {
    return { slug: null, error: `/${slug} is already used by the app.` };
  }
  return { slug, error: null };
}
