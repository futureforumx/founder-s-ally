import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";

function publishableKey(): string {
  const k = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return typeof k === "string" ? k.trim() : "";
}

/** Legacy anon / service JWTs start with eyJ; new API keys use sb_publishable_ / sb_secret_ and are not JWTs. */
function isLikelySupabaseJwt(token: string): boolean {
  return token.startsWith("eyJ");
}

/**
 * Bearer token the Edge Function **gateway** accepts when JWT verification is on.
 * Prefer optional legacy anon JWT; else use publishable key only if it is already a JWT.
 */
function edgeFunctionBearerJwt(): string | undefined {
  const explicit = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (typeof explicit === "string") {
    const t = explicit.trim();
    if (t && isLikelySupabaseJwt(t)) return t;
  }
  const pub = publishableKey();
  if (pub && isLikelySupabaseJwt(pub)) return pub;
  return undefined;
}

function waitlistEdgeRequestHeaders(): Record<string, string> {
  const key = publishableKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: key,
  };
  const bearer = edgeFunctionBearerJwt();
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }
  return headers;
}

function supabaseOrigin(): string {
  const u = import.meta.env.VITE_SUPABASE_URL;
  return typeof u === "string" ? u.replace(/\/$/, "") : "";
}

/**
 * Read JSON error body from FunctionsHttpError (or duck-typed equivalent —
 * duplicate @supabase packages can break `instanceof`).
 */
async function messageFromFunctionsHttpError(error: unknown): Promise<string | null> {
  const res =
    error instanceof FunctionsHttpError
      ? (error.context as Response)
      : error &&
          typeof error === "object" &&
          (error as { name?: string }).name === "FunctionsHttpError" &&
          (error as { context?: unknown }).context &&
          typeof ((error as { context: Response }).context as Response).json === "function"
        ? (error as { context: Response }).context
        : null;
  if (!res || typeof res.json !== "function") return null;
  try {
    const body: unknown = await res.clone().json();
    if (body && typeof body === "object" && "error" in body) {
      const msg = (body as { error: unknown }).error;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Real projects: call Edge Functions with `fetch` + anon/publishable JWT only.
 * `supabase.functions.invoke` uses `fetchWithAuth`, which can still surface
 * edge cases with bundled auth; this path never sends a Clerk session token.
 */
async function invokeWaitlistFunction<T>(name: string, body: unknown): Promise<T> {
  if (!isSupabaseConfigured) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      const detail = await messageFromFunctionsHttpError(error);
      throw new Error(detail ?? error.message ?? `${name} failed`);
    }
    if (data && typeof data === "object" && data !== null && "error" in data) {
      const e = (data as { error?: unknown }).error;
      if (typeof e === "string") throw new Error(e);
    }
    return data as T;
  }

  const origin = supabaseOrigin();
  const key = publishableKey();
  if (!origin || !key) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  const res = await fetch(`${origin}/functions/v1/${name}`, {
    method: "POST",
    headers: waitlistEdgeRequestHeaders(),
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = { error: raw.slice(0, 500) };
    }
  }

  if (!res.ok) {
    const fromBody =
      parsed &&
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof (parsed as { error: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : null;
    if (res.status === 401) {
      const hint401 =
        publishableKey().startsWith("sb_publishable_") && !edgeFunctionBearerJwt()
          ? " Publishable keys are not JWTs. Fix: run `npm run supabase:functions` (deploys waitlist-signup/status with --no-verify-jwt; needs SUPABASE_ACCESS_TOKEN in .env.local), or set VITE_SUPABASE_ANON_KEY to the legacy anon JWT (Dashboard → Settings → API), or turn off “Verify JWT” for this function in the dashboard."
          : "";
      throw new Error((fromBody ?? `${name} failed (HTTP 401)`) + hint401);
    }
    throw new Error(fromBody ?? `${name} failed (HTTP ${res.status})`);
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    parsed !== null &&
    "error" in parsed &&
    typeof (parsed as { error: unknown }).error === "string"
  ) {
    throw new Error((parsed as { error: string }).error);
  }

  return parsed as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WaitlistSignupPayload {
  email: string;
  name?: string;
  role?: "founder" | "investor" | "operator" | "advisor" | "other";
  /** Normalized server-side; free-form values allowed from custom forms. */
  stage?: string;
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
  const data = await invokeWaitlistFunction<WaitlistSignupResponse>("waitlist-signup", payload);
  return data;
}

export async function waitlistGetStatus(
  params: { email?: string; referral_code?: string },
): Promise<WaitlistStatusResponse> {
  return invokeWaitlistFunction<WaitlistStatusResponse>("waitlist-status", params);
}
