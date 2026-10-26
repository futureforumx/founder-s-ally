import { loginOtpRedirectTo } from "@/lib/loginOtpRedirect";
import { resolveBrowserSupabaseConfig } from "@/lib/localSupabaseDefaults";

function browserSupabase() {
  return resolveBrowserSupabaseConfig(import.meta.env.MODE, {
    VITE_DEMO_MODE: import.meta.env.VITE_DEMO_MODE,
    VITE_USE_MOCK_SUPABASE: import.meta.env.VITE_USE_MOCK_SUPABASE,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
}

function publishableKey(): string {
  return browserSupabase().publishableKey;
}

function supabaseOrigin(): string {
  return browserSupabase().url;
}

function isLikelyJwt(token: string): boolean {
  return token.startsWith("eyJ");
}

function bearerToken(): string {
  const explicitAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (typeof explicitAnon === "string") {
    const trimmed = explicitAnon.trim();
    if (trimmed && isLikelyJwt(trimmed)) return trimmed;
  }
  return publishableKey();
}

function authRedirectUrl(): string {
  if (typeof window === "undefined") return loginOtpRedirectTo();
  return loginOtpRedirectTo(window.location.origin);
}

const OTP_REQUEST_TIMEOUT_MS = 30_000;

export class LoginOtpError extends Error {
  readonly fallbackToSupabaseOtp: boolean;

  constructor(message: string, options: { fallbackToSupabaseOtp?: boolean } = {}) {
    super(message);
    this.name = "LoginOtpError";
    this.fallbackToSupabaseOtp = Boolean(options.fallbackToSupabaseOtp);
  }
}

function requestFailureMessage(error: unknown): string {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";

  if (name === "AbortError") {
    return "The sign-in email service timed out. Please try again in a moment.";
  }

  return "Could not reach the sign-in email service. Please try again in a moment.";
}

export async function sendLoginOtp(email: string): Promise<void> {
  const origin = supabaseOrigin();
  const key = publishableKey();
  const normalizedEmail = email.trim().toLowerCase();

  if (!origin || !key) {
    throw new LoginOtpError("Supabase is not configured for this build.");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), OTP_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${origin}/functions/v1/send-login-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${bearerToken()}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        email: normalizedEmail,
        redirectTo: authRedirectUrl(),
      }),
    });
  } catch (error) {
    throw new LoginOtpError(requestFailureMessage(error), { fallbackToSupabaseOtp: true });
  } finally {
    window.clearTimeout(timeoutId);
  }

  const raw = await response.text();
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { error: raw.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const message =
      parsed &&
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof (parsed as { error: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : `Could not send sign-in code (HTTP ${response.status}).`;
    throw new LoginOtpError(message);
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    parsed !== null &&
    "error" in parsed &&
    typeof (parsed as { error: unknown }).error === "string"
  ) {
    throw new LoginOtpError((parsed as { error: string }).error);
  }
}
