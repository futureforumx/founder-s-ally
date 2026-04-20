/**
 * Placeholder for post-signup confirmation email (Resend / backend).
 * Wire this to your provider when ready — subject/body copy per product spec.
 */
export function requestWaitlistConfirmationEmailStub(params: {
  email: string;
  waitlist_position: number | null;
  referral_link: string;
}): void {
  if (import.meta.env.DEV) {
    console.info("[waitlist] confirmation email stub (not sent)", {
      subject_preview: `You're in — and you're #${params.waitlist_position ?? "..."}`,
      ...params,
    });
  }
}
