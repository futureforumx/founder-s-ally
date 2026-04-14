import { safeTrim } from "@/lib/utils";

/**
 * R2-first investor avatars: UI uses a single stored URL (canonical `avatar_url`
 * on `firm_investors`, optionally `profile_image_url` during migration) and never
 * chains third-party resolvers (unavatar, gravatar, etc.).
 */

const BLOCKED_AVATAR_URL_RE =
  /unavatar\.io|gravatar\.com|ui-avatars\.com|googleusercontent\.com\/favicon|\/faviconV2\?|\/s2\/favicons/i;

export function isBlockedExternalAvatarUrl(url: string | null | undefined): boolean {
  const t = safeTrim(url);
  if (!t) return true;
  return BLOCKED_AVATAR_URL_RE.test(t);
}

const HEADSHOT_CDN_BASE = safeTrim(
  typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_HEADSHOT_CDN_BASE
    ? String(import.meta.env.VITE_HEADSHOT_CDN_BASE)
    : "",
).replace(/\/$/, "");

/**
 * Lower sort keys load first in the UI chain so we avoid slow sequential fallbacks
 * (e.g. LinkedIn) when a mirrored R2 URL is also present.
 */
function investorAvatarUrlSortKey(url: string): number {
  const u = url.toLowerCase();
  if (HEADSHOT_CDN_BASE && url.startsWith(HEADSHOT_CDN_BASE)) return 0;
  if (u.includes(".r2.dev")) return 0;
  if (u.includes("r2.cloudflarestorage.com")) return 0;
  if (u.includes("supabase.co/storage/v1/object")) return 1;
  if (u.includes("imagedelivery.net")) return 1;
  if (u.includes("cloudinary.com")) return 2;
  if (u.includes("googleusercontent.com")) return 3;
  if (u.includes("twimg.com")) return 6;
  if (u.includes("licdn.com") || u.includes("linkedin.com")) return 9;
  return 5;
}

/** Stable reorder: try fastest / most reliable hosts before slow third-party CDNs. */
export function prioritizeInvestorAvatarUrls(urls: string[]): string[] {
  if (urls.length <= 1) return urls;
  return urls
    .map((url, index) => ({ url, index }))
    .sort((a, b) => {
      const d = investorAvatarUrlSortKey(a.url) - investorAvatarUrlSortKey(b.url);
      if (d !== 0) return d;
      return a.index - b.index;
    })
    .map((x) => x.url);
}

export type InvestorAvatarFields = {
  avatar_url?: string | null;
  profile_image_url?: string | null;
};

/**
 * Single display URL: prefer `avatar_url`, then legacy `profile_image_url`, skipping
 * known third-party resolver / favicon URLs.
 */
export function investorPrimaryAvatarUrl(fields: InvestorAvatarFields): string | null {
  const chain = investorAvatarUrlCandidates(fields);
  return chain[0] ?? null;
}

/**
 * Ordered list of displayable headshot URLs (avatar first, then profile), deduped.
 * Use with `InvestorPersonAvatar` so a broken `avatar_url` does not hide a good `profile_image_url`.
 */
export function investorAvatarUrlCandidates(fields: InvestorAvatarFields): string[] {
  const out: string[] = [];
  for (const u of [safeTrim(fields.avatar_url), safeTrim(fields.profile_image_url)]) {
    if (!u || isBlockedExternalAvatarUrl(u)) continue;
    if (!out.includes(u)) out.push(u);
  }
  return prioritizeInvestorAvatarUrls(out);
}

/** Same as `investorAvatarUrlCandidates`, then append extra URLs (e.g. additional merge fallbacks). */
export function investorAvatarDisplayChain(
  fields: InvestorAvatarFields & { extra_urls?: Array<string | null | undefined> | null },
): string[] {
  const out = [...investorAvatarUrlCandidates(fields)];
  for (const u of fields.extra_urls ?? []) {
    const t = safeTrim(u);
    if (!t || isBlockedExternalAvatarUrl(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return prioritizeInvestorAvatarUrls(out);
}

/**
 * True when `/api/mirror-firm-investor-headshots` would still have remote URLs to fetch and upload.
 * Matches server `pickMirrorSource` / `alreadyCanonicalR2Headshot` behavior except the public R2 base
 * (not available in the browser); `r2.cloudflarestorage.com` is treated as already mirrored.
 */
export function investorHeadshotNeedsOffloadedMirror(fields: InvestorAvatarFields): boolean {
  for (const u of [safeTrim(fields.avatar_url), safeTrim(fields.profile_image_url)]) {
    if (!u || isBlockedExternalAvatarUrl(u)) continue;
    if (u.includes("r2.cloudflarestorage.com")) continue;
    if (/^https?:\/\//i.test(u)) return true;
  }
  return false;
}
