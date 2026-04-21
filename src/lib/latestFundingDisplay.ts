/** Company / deal website lines for Latest funding (separate from firm marks on Fresh funds). */

export function normalizeWebsiteUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
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
