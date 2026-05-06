import { supabasePublicDirectory } from "@/integrations/supabase/client";

export type InvestorWaitlistSignupBody = {
  firstName: string;
  lastName: string;
  firm: string;
  email: string;
  /**
   * `fundraising_page` → Loops mailing list `cmoth451907f70i3f3exm618d` + `source: FUNDRAISING PAGE`.
   * `"onboarding_waitlist"` or omit → onboarding funnel (`userGroup` + source `onboarding_waitlist`).
   */
  signupContext?: "fundraising_page" | "onboarding_waitlist";
};

function messageFromFunctionsResult(data: unknown, error: unknown): string {
  if (data && typeof data === "object" && "error" in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e.trim();
  }
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return "Please try again in a moment.";
}

/**
 * Public signup for `investor-waitlist` (Loops). Uses {@link supabasePublicDirectory} so we always send the
 * project's anon key — never a user JWT — which avoids Edge Function gateway rejections on unauthenticated pages.
 */
export async function submitInvestorWaitlistSignup(body: InvestorWaitlistSignupBody): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const signupContext =
    body.signupContext === "fundraising_page" ?
      ("fundraising_page" as const)
    : body.signupContext === "onboarding_waitlist" ?
      ("onboarding_waitlist" as const)
    : undefined;

  const { data, error } = await supabasePublicDirectory.functions.invoke("investor-waitlist", {
    body: {
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      firm: body.firm.trim(),
      email: body.email.trim().toLowerCase(),
      ...(signupContext ? { signupContext } : {}),
    },
  });

  if (!error) return { ok: true as const };
  return { ok: false as const, message: messageFromFunctionsResult(data, error) };
}
