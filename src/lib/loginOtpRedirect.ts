/** Allowlisted Auth callback used on vekta.so. */
export const PRODUCTION_AUTH_CALLBACK_URL = "https://vekta.so/auth";

/**
 * Redirect passed to `send-login-otp` / `signup-with-otp` `generateLink`.
 * The email only contains the 6-digit code; `verifyOtp` does not need the
 * current origin. Local and preview hosts are often missing from the
 * Supabase allowlist, which makes the live sign-in-code path fail.
 */
export function loginOtpRedirectTo(_windowOrigin?: string): string {
  return PRODUCTION_AUTH_CALLBACK_URL;
}
