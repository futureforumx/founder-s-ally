/** Server / transport failures from the custom OTP function should use Supabase Auth. */
export function shouldFallbackLoginOtpToSupabase(status: number, message: string): boolean {
  if (status >= 500 || status === 401 || status === 403 || status === 429) return true;
  return /failed to send|not configured|temporarily unavailable|internal server|not responding/i.test(
    message,
  );
}

/** When both mailers fail, tell the user to use password or OAuth instead of a raw provider error. */
export function loginEmailCodeFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/confirmation email|error sending|failed to send|rate limit/i.test(message)) {
    return "Could not send a sign-in code. Use your password or continue with Google.";
  }
  return message || "Could not start sign-in. Please try again.";
}
