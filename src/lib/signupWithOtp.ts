import { resolveBrowserSupabaseConfig } from "@/lib/localSupabaseDefaults";

export interface SignupWithOtpInput {
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  resend?: boolean;
  token?: string;
}

export interface SignupWithOtpResult {
  success?: boolean;
  confirmed?: boolean;
  accessToken?: string;
  refreshToken?: string;
}

function browserSupabase() {
  return resolveBrowserSupabaseConfig(import.meta.env.MODE, {
    VITE_DEMO_MODE: import.meta.env.VITE_DEMO_MODE,
    VITE_USE_MOCK_SUPABASE: import.meta.env.VITE_USE_MOCK_SUPABASE,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
}

function supabaseOrigin(): string {
  return browserSupabase().url;
}

function publishableKey(): string {
  return browserSupabase().publishableKey;
}

function bearerToken(): string {
  const legacyKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (typeof legacyKey === "string" && legacyKey.trim().startsWith("eyJ")) {
    return legacyKey.trim();
  }
  return publishableKey();
}

export async function signupWithOtp(input: SignupWithOtpInput): Promise<SignupWithOtpResult> {
  const origin = supabaseOrigin();
  const key = publishableKey();

  if (!origin || !key) {
    throw new Error("Supabase is not configured for this build.");
  }

  const response = await fetch(`${origin}/functions/v1/signup-with-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${bearerToken()}`,
    },
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      firstName: input.firstName,
      lastName: input.lastName,
      resend: Boolean(input.resend),
      token: input.token,
      redirectTo: typeof window === "undefined" ? undefined : `${window.location.origin}/auth`,
    }),
  });

  const raw = await response.text();
  let parsed: SignupWithOtpResult & { error?: string } = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) as SignupWithOtpResult & { error?: string };
    } catch {
      parsed = { error: raw.slice(0, 500) };
    }
  }

  if (!response.ok || parsed.error) {
    throw new Error(parsed.error || `Could not send confirmation code (HTTP ${response.status}).`);
  }

  return parsed;
}
