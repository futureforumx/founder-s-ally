import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WaitlistSignupPayload {
  email: string;
  name?: string;
  role?: "founder" | "investor" | "operator" | "advisor";
  stage?: "pre-seed" | "seed" | "series-a" | "series-b+";
  urgency?:
    | "actively_raising"
    | "raising_6_months"
    | "actively_deploying"
    | "exploring"
    | "not_yet";
  intent?: string[];
  biggest_pain?: string;
  company_name?: string;
  linkedin_url?: string;
  source?: string;
  campaign?: string;
  referral_code?: string;
  metadata?: Record<string, unknown>;
}

export interface WaitlistSignupResponse {
  status: "created" | "existing";
  id: string;
  email: string;
  referral_code: string;
  referral_count: number;
  total_score: number;
  waitlist_position: number | null;
  referral_link: string;
}

export interface WaitlistMilestone {
  reward_key: string;
  reward_label: string;
  referral_threshold: number;
  description: string | null;
  reached: boolean;
}

export interface WaitlistStatusResponse {
  name: string | null;
  email: string;
  referral_code: string;
  referral_count: number;
  total_score: number;
  waitlist_position: number | null;
  total_waitlist_size: number;
  status: string;
  referral_link: string;
  milestones: WaitlistMilestone[];
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export async function waitlistSignup(
  payload: WaitlistSignupPayload,
): Promise<WaitlistSignupResponse> {
  const { data, error } = await supabase.functions.invoke("waitlist-signup", {
    body: payload,
  });

  if (error) throw new Error(error.message ?? "Waitlist signup failed");
  if (data?.error) throw new Error(data.error);
  return data as WaitlistSignupResponse;
}

export async function waitlistGetStatus(
  params: { email?: string; referral_code?: string },
): Promise<WaitlistStatusResponse> {
  const { data, error } = await supabase.functions.invoke("waitlist-status", {
    body: params,
  });

  if (error) throw new Error(error.message ?? "Waitlist status lookup failed");
  if (data?.error) throw new Error(data.error);
  return data as WaitlistStatusResponse;
}
