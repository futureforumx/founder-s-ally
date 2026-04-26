import { safeTrim } from "./utils.js";

/**
 * Hosts where direct browser `<img src>` often fails (403 / empty / tracking pixel).
 * Used for: (1) building a multi-step display URL chain, (2) same-origin API allowlist.
 */
export function shouldProxyHeadshotHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return false;
  if (h.endsWith(".licdn.com") || h === "media.licdn.com" || h === "dms.licdn.com") return true;
  if (h === "linkedin.com" || h.endsWith(".linkedin.com")) return true;
  if (/^i[0-9]\.wp\.com$/i.test(h)) return true;
  if (h.endsWith(".cloudinary.com") || h.endsWith(".imgix.net") || h.endsWith(".storyblok.com")) return true;
  return false;
}

/**
 * For hotlink-problem hosts, return URLs to try in order:
 * 1) images.weserv.nl (public image CDN — works without deploying our API)
 * 2) Same-origin `/api/proxy-external-image` (Vercel + Vite dev)
 * 3) Original URL (last resort; may work with no-referrer)
 */
export function expandHeadshotDisplayUrls(raw: string | null | undefined): string[] {
  const u = safeTrim(raw);
  if (!u) return [];
  const abs = u.startsWith("//") ? `https:${u}` : u;
  let host: string;
  try {
    host = new URL(abs).hostname;
  } catch {
    return [abs];
  }
  if (!shouldProxyHeadshotHostname(host)) return [abs];
  const enc = encodeURIComponent(abs);
  return [
    `https://images.weserv.nl/?url=${enc}&w=320&h=320&fit=cover`,
    `/api/proxy-external-image?u=${enc}`,
    abs,
  ];
}

/** @deprecated Prefer expandHeadshotDisplayUrls + chain in InvestorPersonAvatar */
export function headshotSrcForImgDisplay(raw: string | null | undefined): string | null {
  const xs = expandHeadshotDisplayUrls(raw);
  return xs[0] ?? null;
}
