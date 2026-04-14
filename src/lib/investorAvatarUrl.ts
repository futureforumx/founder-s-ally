/**
 * R2-first investor avatars: UI uses a single stored URL (canonical `avatar_url`
 * on `firm_investors`, optionally `profile_image_url` during migration) and never
 * chains third-party resolvers (unavatar, gravatar, etc.).
 */

const BLOCKED_AVATAR_URL_RE =
  /unavatar\.io|gravatar\.com|ui-avatars\.com|googleusercontent\.com\/favicon|\/faviconV2\?|\/s2\/favicons/i;

export function isBlockedExternalAvatarUrl(url: string | null | undefined): boolean {
  const t = url?.trim();
  if (!t) return true;
  return BLOCKED_AVATAR_URL_RE.test(t);
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
  const a = fields.avatar_url?.trim() || null;
  if (a && !isBlockedExternalAvatarUrl(a)) return a;
  const p = fields.profile_image_url?.trim() || null;
  if (p && !isBlockedExternalAvatarUrl(p)) return p;
  return null;
}
