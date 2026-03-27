import { formatSocialUrl } from "@/lib/socialFormat";

/** Session key: where to send the user after OAuth callback (pathname + search). */
export const CLERK_SSO_RETURN_PATH_KEY = "vekta_sso_return_path";

type ExternalAccountLike = { provider: string; username?: string | null };
type UserWithExternals = { externalAccounts?: ExternalAccountLike[] } | null | undefined;

export function rememberSsoReturnPath() {
  sessionStorage.setItem(CLERK_SSO_RETURN_PATH_KEY, `${window.location.pathname}${window.location.search}`);
}

export function readSsoReturnPath(): string {
  return sessionStorage.getItem(CLERK_SSO_RETURN_PATH_KEY) || "/onboarding";
}

/** Clerk external account `provider` values vary by connection type / dashboard version. */
export function clerkUserHasLinkedIn(user: { externalAccounts?: Array<{ provider: string }> } | null | undefined): boolean {
  if (!user?.externalAccounts?.length) return false;
  return user.externalAccounts.some((a) => {
    const p = (a.provider || "").toLowerCase();
    return p === "linkedin" || p === "linkedin_oidc" || p.includes("linkedin");
  });
}

export function clerkUserHasXOrTwitter(user: { externalAccounts?: Array<{ provider: string }> } | null | undefined): boolean {
  if (!user?.externalAccounts?.length) return false;
  return user.externalAccounts.some((a) => {
    const p = (a.provider || "").toLowerCase();
    return p === "x" || p === "twitter" || p.includes("twitter");
  });
}

/** Vanity URL / handle from Clerk after OAuth, for sync edge functions when the text field is empty. */
export function clerkSuggestedLinkedInUrl(user: UserWithExternals): string | null {
  const acc = user?.externalAccounts?.find((a) => {
    const p = (a.provider || "").toLowerCase();
    return p === "linkedin" || p === "linkedin_oidc" || p.includes("linkedin");
  });
  const u = acc?.username?.trim();
  if (!u) return null;
  return formatSocialUrl("linkedin_personal", u);
}

export function clerkSuggestedXUrl(user: UserWithExternals): string | null {
  const acc = user?.externalAccounts?.find((a) => {
    const p = (a.provider || "").toLowerCase();
    return p === "x" || p === "twitter" || p.includes("twitter");
  });
  const u = acc?.username?.trim();
  if (!u) return null;
  return formatSocialUrl("x", u);
}
