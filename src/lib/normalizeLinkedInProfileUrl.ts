/**
 * Normalizes LinkedIn profile inputs to `https://www.linkedin.com/in/{slug}`.
 * Accepts full URLs, `linkedin.com/in/…`, `www.…`, `in/slug`, or a bare vanity slug.
 */
export function normalizeLinkedInProfileUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";

  if (/^in\//i.test(t)) {
    const slug = t.replace(/^in\//i, "").split(/[/?#]/)[0]?.trim();
    if (slug) return `https://www.linkedin.com/in/${slug}`;
  }

  let href = t;
  if (!/^https?:\/\//i.test(href)) {
    href = `https://${href.replace(/^\/+/, "")}`;
  }

  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "linkedin.com") {
      return maybeBareLinkedInSlug(t);
    }

    const path = u.pathname.replace(/\/+/g, "/").replace(/\/$/, "");
    const lower = path.toLowerCase();

    if (lower.startsWith("/in/")) {
      const slug = path.slice(4).split("/")[0]?.split("?")[0]?.split("#")[0];
      if (slug) return `https://www.linkedin.com/in/${decodeURIComponent(slug)}`;
    }
    if (lower.startsWith("/company/")) {
      const slug = path.slice("/company/".length).split("/")[0]?.split("?")[0]?.split("#")[0];
      if (slug) return `https://www.linkedin.com/company/${decodeURIComponent(slug)}`;
    }

    return `https://www.linkedin.com${path || "/"}`;
  } catch {
    return maybeBareLinkedInSlug(t);
  }
}

function maybeBareLinkedInSlug(t: string): string {
  if (/\s|[/]|:/.test(t) || /linkedin/i.test(t) || /^[^@\s]+@[^@\s]+$/.test(t)) {
    return t;
  }
  if (!/^[a-zA-Z0-9._@-]{2,100}$/.test(t)) {
    return t;
  }
  const clean = t.replace(/^@/, "");
  const parts = clean.split(".");
  const first = parts[0] ?? "";
  const tld = (parts[1] ?? "").toLowerCase();
  const commonTlds = new Set(["com", "net", "org", "io", "co", "edu", "gov", "ai", "so", "app", "dev"]);
  if (
    parts.length === 2 &&
    /^[a-z]{2,4}$/i.test(parts[1] ?? "") &&
    commonTlds.has(tld) &&
    /^[a-z0-9-]+$/i.test(first)
  ) {
    return t;
  }
  return `https://www.linkedin.com/in/${clean}`;
}
