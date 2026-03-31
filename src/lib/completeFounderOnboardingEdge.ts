import { FunctionsFetchError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase, getSupabaseAccessToken, isSupabaseConfigured } from "@/integrations/supabase/client";
import { getClerkSessionToken } from "@/lib/clerkSessionForEdge";
import { isFunctionsHttpError, readFunctionsHttpErrorMessage } from "@/lib/supabaseFunctionErrors";

export type CompleteFounderOnboardingPayload = {
  /** Clerk / app user id — must match JWT identity claims; avoids Supabase JWT `sub` UUID vs Clerk id mismatch. */
  userId?: string;
  companyId?: string;
  /** Whitelisted keys are applied on company_analyses (see edge function). */
  companyFields?: Record<string, unknown>;
  profile: {
    full_name?: string;
    title?: string | null;
    bio?: string | null;
    location?: string | null;
    avatar_url?: string | null;
    linkedin_url?: string | null;
    twitter_url?: string | null;
    user_type?: string;
    has_completed_onboarding: boolean;
    has_seen_settings_tour?: boolean;
    company_id?: string | null;
  };
  preferences?: {
    onboarding_data?: Record<string, unknown>;
    privacy_settings?: Record<string, unknown>;
    notification_settings?: Record<string, unknown>;
  };
};

/**
 * Saves profile + preferences + company fields via service-role edge function (bypasses PostgREST RLS).
 * Returns fallbackToClient: true when the function is not deployed (404), JWT cannot identify the user (403), or there is no user JWT (anon-only bearer would always fail resolveEdgeUserId).
 */
export async function completeFounderOnboardingEdge(
  payload: CompleteFounderOnboardingPayload,
): Promise<{ ok: true } | { ok: false; error: string; fallbackToClient: boolean }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: "Supabase not configured", fallbackToClient: true };
  }

  const userJwt =
    (await getSupabaseAccessToken())?.trim() || (await getClerkSessionToken())?.trim() || "";
  if (!userJwt) {
    return {
      ok: false,
      error:
        'Missing Supabase user JWT. Add Clerk JWT template "supabase" with sub matching your app user id, or set VITE_USE_CLERK_SESSION_JWT_FOR_SUPABASE=true when your session token is accepted by Supabase.',
      fallbackToClient: true,
    };
  }
  const anonKey =
    typeof import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY === "string"
      ? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
      : "";

  const { data, error } = await supabase.functions.invoke("complete-founder-onboarding", {
    body: payload,
    headers: {
      Authorization: `Bearer ${userJwt}`,
      ...(anonKey ? { apikey: anonKey } : {}),
    },
  });

  const p = (data || {}) as { success?: boolean; error?: string };
  if (p.success) return { ok: true };

  if (p.error) {
    const identityOrDeployHint =
      /jwt|identify this user|bearer token|does not identify/i.test(p.error);
    return { ok: false, error: p.error, fallbackToClient: identityOrDeployHint };
  }

  if (error) {
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      return { ok: false, error: error.message, fallbackToClient: true };
    }
    const jsonErr = await readFunctionsHttpErrorMessage(error);
    if (isFunctionsHttpError(error) && error.context.status === 404) {
      return {
        ok: false,
        error: jsonErr || "complete-founder-onboarding not deployed",
        fallbackToClient: true,
      };
    }
    if (isFunctionsHttpError(error) && error.context.status === 403) {
      return {
        ok: false,
        error: jsonErr || String(error),
        fallbackToClient: true,
      };
    }
    return {
      ok: false,
      error: jsonErr || String(error),
      fallbackToClient: false,
    };
  }

  return { ok: false, error: "Empty response from complete-founder-onboarding", fallbackToClient: true };
}
