import { useAuth as useWorkOSAuth } from "@workos-inc/authkit-react";
import type { User, Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { setSupabaseAccessTokenGetter } from "@/integrations/supabase/client";
import { registerClerkSessionTokenGetter } from "@/lib/clerkSessionForEdge";
import { mixpanelIdentify, mixpanelReset } from "@/lib/mixpanel";
import { hasWorkOSConfig, resolveWorkOSClientId, resolveWorkOSRedirectUri, resolveWorkOSApiHostname } from "@/lib/workosConfig";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  isConfigured: false,
  signIn: async () => {},
  signOut: async () => {},
  getAccessToken: async () => null,
});

// ---------------------------------------------------------------------------
// PKCE helpers (mirrors what @workos-inc/authkit-js does internally so the
// SDK can complete the code exchange using the same codeVerifier we stored).
// ---------------------------------------------------------------------------

/** Generates a cryptographically random code verifier (43 chars, URL-safe). */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** Computes the S256 code challenge for a given verifier. */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Build a WorkOS authorization URL and redirect the browser to it.
 *
 * This bypasses the SDK's internal `signIn` (which calls `window.location.assign`
 * with no pre-redirect logging) so we can:
 *   1. Log the exact URL before the browser leaves
 *   2. Use `window.location.href` (semantically clearer than assign)
 *   3. Surface errors instead of silently eating them
 *
 * The SDK will complete the code exchange on the callback page because it reads
 * the codeVerifier from sessionStorage["workos:code-verifier"] — the same key
 * we write here.
 */
async function redirectToWorkOS(): Promise<void> {
  const clientId = resolveWorkOSClientId();
  if (!clientId) {
    throw new Error("WorkOS client ID is not configured — cannot start sign-in");
  }

  // Generate PKCE challenge pair
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store verifier so the SDK (and our beforeunload backup) can find it
  try {
    window.sessionStorage.setItem("workos:code-verifier", codeVerifier);
  } catch {
    // sessionStorage unavailable — the beforeunload backup in main.tsx uses localStorage
  }

  // Build authorization URL against WorkOS API
  const apiHostname = resolveWorkOSApiHostname();
  const baseUrl = apiHostname ? `https://${apiHostname}` : "https://api.workos.com";
  const redirectUri = resolveWorkOSRedirectUri() ?? `${window.location.origin}/auth`;

  const params = new URLSearchParams({
    provider: "authkit",
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    screen_hint: "sign-in",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authorizationUrl = `${baseUrl}/user_management/authorize?${params.toString()}`;

  // Log before leaving — confirm we are going to api.workos.com, NOT to /auth
  console.log("[auth] FINAL WORKOS AUTHORIZE URL", authorizationUrl);
  console.log("[auth] FINAL WORKOS HOSTNAME", new URL(authorizationUrl).hostname);
  console.log("[auth] FINAL REDIRECT_URI", new URL(authorizationUrl).searchParams.get("redirect_uri"));

  // Navigate — use href for clarity; assign and href are equivalent for absolute URLs
  window.location.href = authorizationUrl;
}

// ---------------------------------------------------------------------------

function workosUserToCompatUser(
  workosUser: NonNullable<ReturnType<typeof useWorkOSAuth>["user"]>
): User {
  const displayName = [workosUser.firstName, workosUser.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    id: workosUser.id,
    aud: "authenticated",
    role: "authenticated",
    email: workosUser.email,
    email_confirmed_at: workosUser.emailVerified ? new Date().toISOString() : undefined,
    phone: "",
    confirmed_at: workosUser.emailVerified ? new Date().toISOString() : undefined,
    last_sign_in_at: workosUser.lastSignInAt ?? null,
    app_metadata: {},
    user_metadata: {
      full_name: displayName || undefined,
      avatar_url: workosUser.profilePictureUrl || undefined,
    },
    identities: [],
    created_at: workosUser.createdAt,
    updated_at: workosUser.updatedAt,
    is_anonymous: false,
    factors: null,
  } as User;
}

function WorkOSAuthProvider({ children }: { children: ReactNode }) {
  const { user: workosUser, isLoading, signOut: workosSignOut, getAccessToken } = useWorkOSAuth();

  const user = useMemo(
    () => (workosUser ? workosUserToCompatUser(workosUser) : null),
    [workosUser]
  );

  const session = useMemo((): Session | null => {
    if (!user) return null;
    return {
      access_token: "",
      refresh_token: "",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user,
    } as Session;
  }, [user]);

  useEffect(() => {
    const getter = async () => {
      if (!workosUser) return null;
      try {
        return await getAccessToken();
      } catch {
        return null;
      }
    };
    setSupabaseAccessTokenGetter(getter);
    registerClerkSessionTokenGetter(getter);
    return () => {
      setSupabaseAccessTokenGetter(null);
      registerClerkSessionTokenGetter(async () => null);
    };
  }, [workosUser, getAccessToken]);

  useEffect(() => {
    if (!workosUser) {
      mixpanelReset();
      return;
    }
    const displayName = [workosUser.firstName, workosUser.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    mixpanelIdentify(workosUser.id, {
      $email: workosUser.email,
      ...(displayName ? { $name: displayName } : {}),
    });
  }, [workosUser]);

  const safeGetAccessToken = async (): Promise<string | null> => {
    if (!workosUser) return null;
    try {
      return await getAccessToken();
    } catch {
      return null;
    }
  };

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      session,
      loading: isLoading,
      isConfigured: true,
      signIn: redirectToWorkOS,
      signOut: () => workosSignOut({ returnPathname: "/login" }),
      getAccessToken: safeGetAccessToken,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, session, isLoading, workosSignOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function PublicAuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    setSupabaseAccessTokenGetter(null);
    registerClerkSessionTokenGetter(async () => null);
    mixpanelReset();

    return () => {
      setSupabaseAccessTokenGetter(null);
      registerClerkSessionTokenGetter(async () => null);
    };
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user: null,
      session: null,
      loading: false,
      isConfigured: false,
      signIn: async () => {},
      signOut: async () => {},
      getAccessToken: async () => null,
    }),
    [],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!hasWorkOSConfig()) {
    return <PublicAuthProvider>{children}</PublicAuthProvider>;
  }
  return <WorkOSAuthProvider>{children}</WorkOSAuthProvider>;
}

export const useAuth = () => useContext(AuthContext);
