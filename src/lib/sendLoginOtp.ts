function publishableKey(): string {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return typeof key === "string" ? key.trim() : "";
}

function supabaseOrigin(): string {
  const url = import.meta.env.VITE_SUPABASE_URL;
  return typeof url === "string" ? url.replace(/\/$/, "") : "";
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
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/auth`;
}

export async function sendLoginOtp(email: string): Promise<void> {
  const origin = supabaseOrigin();
  const key = publishableKey();
  const normalizedEmail = email.trim().toLowerCase();

  if (!origin || !key) {
    throw new Error("Supabase is not configured for this build.");
  }

  const response = await fetch(`${origin}/functions/v1/send-login-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${bearerToken()}`,
    },
    body: JSON.stringify({
      email: normalizedEmail,
      redirectTo: authRedirectUrl(),
    }),
  });

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
    throw new Error(message);
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
}
