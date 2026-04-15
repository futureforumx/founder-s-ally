/** Normalize host from URL or bare domain (lowercase, strip www, path, query). */
export function canonicalDomain(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let s = raw.trim().toLowerCase();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
