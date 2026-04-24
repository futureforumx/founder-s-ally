/** Marketing origin fallback when `window` is unavailable (SSR). */
export const PUBLIC_REFERRAL_SHARE_ORIGIN = "https://vekta.so";

/**
 * Resolves the invite URL shown to users: prefers API `referral_link`, otherwise
 * `${origin}/access?ref=` + `referral_code`.
 */
export function resolvePublicReferralLink(part: {
  referral_link?: string | null | undefined;
  referral_code?: string | null | undefined;
}): string {
  const fromApi = typeof part.referral_link === "string" ? part.referral_link.trim() : "";
  if (fromApi) return fromApi;
  const code = typeof part.referral_code === "string" ? part.referral_code.trim() : "";
  if (!code) return "";
  return `${PUBLIC_REFERRAL_SHARE_ORIGIN}/access?ref=${encodeURIComponent(code)}`;
}
