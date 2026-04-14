/**
 * Public firm inboxes that are authoritative but often missing from HTML
 * (SPA sites, images-only footers, bot-blocked pages, etc.).
 * Keys: registrable hostname or full hostname after stripping `www.`.
 */
const FIRM_CONTACT_EMAIL_BY_HOST: Readonly<Record<string, string>> = {
  "12-48.com": "info@12-48.com",
};

function normalizeHost(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

/** Same idea as `registrableHost` in `api/_firmWebsiteContact.ts` — good enough for known .com overrides. */
function registrableHost(hostname: string): string {
  const parts = normalizeHost(hostname).split(".").filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join(".") : normalizeHost(hostname);
}

export function resolveFirmContactEmailByWebsiteUrl(websiteUrl: string | null | undefined): string | null {
  const raw = typeof websiteUrl === "string" ? websiteUrl.trim() : "";
  if (!raw) return null;
  try {
    const hostname = normalizeHost(new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`).hostname);
    return FIRM_CONTACT_EMAIL_BY_HOST[hostname] ?? FIRM_CONTACT_EMAIL_BY_HOST[registrableHost(hostname)] ?? null;
  } catch {
    return null;
  }
}
