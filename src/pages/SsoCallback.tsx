import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import { readSsoReturnPath } from "@/lib/clerkSocialLink";

/**
 * OAuth redirect target for Clerk `createExternalAccount` (e.g. LinkedIn / X linking during onboarding).
 * Add `/sso-callback` to Clerk Dashboard → Paths → Allowed redirect URLs if required.
 */
export default function SsoCallback() {
  const fallback = readSsoReturnPath();
  return <AuthenticateWithRedirectCallback signInFallbackRedirectUrl={fallback} signUpFallbackRedirectUrl={fallback} />;
}
