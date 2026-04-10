export function extractCompanyDomain(websiteUrl?: string | null): string | null {
  if (!websiteUrl) return null;

  try {
    const normalized = websiteUrl.trim();
    if (!normalized) return null;

    return new URL(normalized.startsWith("http") ? normalized : `https://${normalized}`)
      .hostname.replace(/^www\./i, "")
      .toLowerCase();
  } catch {
    return null;
  }
}

export function buildCompanyLogoCandidates({
  logoUrl,
  websiteUrl,
  size = 128,
}: {
  logoUrl?: string | null;
  websiteUrl?: string | null;
  size?: number;
}): string[] {
  const domain = extractCompanyDomain(websiteUrl);
  const candidates = [
    logoUrl?.trim() || null,
    domain
      ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=${size}`
      : null,
    domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}` : null,
    domain ? `https://${domain}/favicon.ico` : null,
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
}

export function getPrimaryCompanyLogoUrl({
  logoUrl,
  websiteUrl,
  size = 128,
}: {
  logoUrl?: string | null;
  websiteUrl?: string | null;
  size?: number;
}): string | null {
  return buildCompanyLogoCandidates({ logoUrl, websiteUrl, size })[0] ?? null;
}
