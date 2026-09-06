/** Server / transport failures from the custom OTP function should use Supabase Auth. */
export function shouldFallbackLoginOtpToSupabase(status: number, message: string): boolean {
  if (status >= 500 || status === 401 || status === 403 || status === 429) return true;
  return /failed to send|not configured|temporarily unavailable|internal server|not responding/i.test(
    message,
  );
}
