/**
 * url-parser.ts — URL classification + domain extraction.
 */

export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
}

export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    u.hash = "";
    // strip tracking params
    const params = Array.from(u.searchParams.keys());
    for (const k of params) if (/^(utm_|ref|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    return u.toString().replace(/\/$/, "");
  } catch { return null; }
}

/** Classify a URL against known venture intelligence sources. */
export function classifyUrl(url: string | null | undefined): string | null {
  const d = extractDomain(url);
  if (!d) return null;
  if (d === "crunchbase.com" || d.endsWith(".crunchbase.com")) return "crunchbase";
  if (d === "cbinsights.com" || d.endsWith(".cbinsights.com")) return "cbinsights";
  if (d === "tracxn.com"     || d.endsWith(".tracxn.com")) return "tracxn";
  if (d === "signal.nfx.com" || d === "nfx.com") return "signal_nfx";
  if (d === "openvc.app") return "openvc";
  if (d === "vcsheet.com") return "vcsheet";
  if (d === "startups.gallery") return "startups_gallery";
  if (d === "wellfound.com") return "wellfound";
  if (d === "angel.co" || d === "angellist.com") return "angellist";
  if (d === "linkedin.com" || d.endsWith(".linkedin.com")) return "linkedin";
  if (d === "pitchbook.com") return "pitchbook";
  if (d === "medium.com" || d.endsWith(".medium.com")) return "medium";
  if (d === "substack.com" || d.endsWith(".substack.com")) return "substack";
  if (d === "twitter.com" || d === "x.com") return "x";
  return null;
}

/** Extract the Crunchbase / CBInsights / Tracxn slug from a profile URL. */
export function extractSlug(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    // /organization/foo, /investor/foo, /a/investors/foo, /profiles/i/XXX
    return parts[parts.length - 1] || null;
  } catch { return null; }
}
