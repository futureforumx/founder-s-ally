/** Company / deal website lines for Latest funding (separate from firm marks on Fresh funds). */

const INVALID_WEBSITE_HOST_PATTERNS = [
  /fontawesome/i,
  /googleapis/i,
  /gstatic/i,
  /cloudflare/i,
  /jsdelivr/i,
  /unpkg/i,
  /cdnjs/i,
  /bootstrap/i,
  /gravatar/i,
];

const INVALID_WEBSITE_PATH_PATTERNS = [
  /\/wp-content\//i,
  /\/wp-includes\//i,
];

const INVALID_WEBSITE_SUFFIX = /\.(?:css|js|mjs|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)(?:[?#].*)?$/i;

function hostLooksInvalid(host: string): boolean {
  return INVALID_WEBSITE_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

function pathLooksInvalid(pathname: string): boolean {
  return INVALID_WEBSITE_PATH_PATTERNS.some((pattern) => pattern.test(pathname))
    || INVALID_WEBSITE_SUFFIX.test(pathname);
}

export function normalizeWebsiteUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/, "")}`;

  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host || hostLooksInvalid(host) || pathLooksInvalid(parsed.pathname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function prettyWebsiteHost(url: string | null | undefined): string | null {
  const normalized = normalizeWebsiteUrl(url);
  if (!normalized) return null;
  try {
    const host = new URL(normalized).hostname.replace(/^www\./i, "");
    return host || null;
  } catch {
    return null;
  }
}

export function inferWebsiteUrlFromCompanyName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const domainMatch = trimmed.match(/\b([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:ai|app|co|com|dev|fm|health|io|net|org|so))\b/i);
  if (!domainMatch) return null;

  return normalizeWebsiteUrl(domainMatch[1].toLowerCase());
}
