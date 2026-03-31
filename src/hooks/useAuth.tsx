import {
  useEffect,
  useLayoutEffect,
  useRef,
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth as useClerkAuth, useUser, useClerk, useSession } from "@clerk/clerk-react";
import type { User, Session } from "@supabase/supabase-js";
import { setSupabaseAccessTokenGetter } from "@/integrations/supabase/client";
import { registerClerkSessionTokenGetter } from "@/lib/clerkSessionForEdge";
import {
  mixpanelIdentify,
  mixpanelReset,
  trackMixpanelEvent,
} from "@/lib/mixpanel";

const MP_SIGNUP_INTENT_KEY = "vekta_mp_signup_intent";

function readSignupIntent(): string | null {
  try {
    return sessionStorage.getItem(MP_SIGNUP_INTENT_KEY);
  } catch {
    return null;
  }
}

function clearSignupIntent(): void {
  try {
    sessionStorage.removeItem(MP_SIGNUP_INTENT_KEY);
  } catch {
    /* ignore */
  }
}

function utmFromLocation(): {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
} {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const utm_source = p.get("utm_source") ?? undefined;
  const utm_medium = p.get("utm_medium") ?? undefined;
  const utm_campaign = p.get("utm_campaign") ?? undefined;
  return { utm_source, utm_medium, utm_campaign };
}

function authMethodLabel(
  clerkUser: NonNullable<ReturnType<typeof useUser>["user"]>
): string {
  const oauth = clerkUser.externalAccounts?.[0]?.provider;
  if (oauth) return oauth;
  if (clerkUser.primaryEmailAddressId) return "email";
  return "unknown";
}

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

const DEMO_USER = {
  id: "demo-user-id",
  email: "demo@vekta.app",
  app_metadata: {},
  user_metadata: { full_name: "Demo User" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
} as unknown as User;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

function clerkUserToCompatUser(clerkUser: ReturnType<typeof useUser>["user"]): User | null {
  if (!clerkUser) return null;
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? "";
  return {
    id: clerkUser.id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at:
      clerkUser.primaryEmailAddress?.verification?.status === "verified"
        ? new Date().toISOString()
        : null,
    phone: "",
    confirmed_at: null,
    last_sign_in_at: null,
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: clerkUser.createdAt?.toISOString?.() ?? "",
    updated_at: clerkUser.updatedAt?.toISOString?.() ?? "",
    is_anonymous: false,
    factors: null,
  } as User;
}

function buildSession(u: User | null): Session | null {
  if (!u) return null;
  return {
    access_token: "",
    refresh_token: "",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: u,
  } as Session;
}

function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [user] = useState<User | null>(DEMO_USER);
  const [session] = useState<Session | null>(() => buildSession(DEMO_USER));
  const [loading] = useState(false);

  useEffect(() => {
    setSupabaseAccessTokenGetter(null);
  }, []);

  useEffect(() => {
    mixpanelIdentify(DEMO_USER.id, {
      $email: DEMO_USER.email,
      $name: (DEMO_USER.user_metadata as { full_name?: string })?.full_name ?? "Demo User",
    });
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      session,
      loading,
      signOut: async () => {},
    }),
    [user, session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ClerkAuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, sessionId } = useClerkAuth();
  const { session: clerkSession } = useSession();
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const clerkSessionRef = useRef(clerkSession);
  clerkSessionRef.current = clerkSession;

  // Register before paint so edge-function calls right after sign-in see real tokens (not stale null getters).
  useLayoutEffect(() => {
    registerClerkSessionTokenGetter(async () => {
      if (!isLoaded || !isSignedIn) return null;
      try {
        return (await getTokenRef.current()) ?? null;
      } catch {
        return null;
      }
    });

    setSupabaseAccessTokenGetter(async () => {
      if (!isLoaded || !isSignedIn) return null;
      const gt = getTokenRef.current;
      // Prefer the Clerk "supabase" JWT template (legacy, but still tried first for explicit opt-in setups).
      // Fall back to the plain Clerk session token — accepted by Supabase when Clerk is configured as
      // third-party auth (Supabase Dashboard → Authentication → Third-party auth → Clerk).
      // This covers both PostgREST (direct DB with RLS) and the direct DB fallback path if edge functions fail.
      try {
        const templateJwt = await gt({ template: "supabase" });
        if (templateJwt) return templateJwt;
      } catch {
        /* template not configured — fall through to session JWT */
      }
      try {
        const s = clerkSessionRef.current;
        const sessionJwt = s ? await s.getToken() : ((await gt()) ?? null);
        if (sessionJwt) return sessionJwt;
      } catch {
        /* no session token */
      }
      console.warn(
        "[Supabase + Clerk] No Supabase-compatible JWT. Configure Clerk as third-party auth in Supabase Dashboard → Authentication → Third-party auth. Docs: https://supabase.com/docs/guides/auth/third-party/clerk",
      );
      return null;
    });
    return () => setSupabaseAccessTokenGetter(null);
  }, [isLoaded, isSignedIn, clerkSession?.id]);

  const user = useMemo(() => clerkUserToCompatUser(clerkUser), [clerkUser]);
  const session = useMemo(() => buildSession(isSignedIn && user ? user : null), [isSignedIn, user]);

  const sessionBootstrapRef = useRef(false);
  const lastSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!sessionBootstrapRef.current) {
      sessionBootstrapRef.current = true;
      lastSessionIdRef.current = sessionId ?? null;
      return;
    }

    if (!isSignedIn || !sessionId) {
      if (lastSessionIdRef.current) {
        mixpanelReset();
      }
      lastSessionIdRef.current = null;
      return;
    }

    if (!clerkUser) return;
    if (lastSessionIdRef.current === sessionId) return;

    lastSessionIdRef.current = sessionId;

    const email = clerkUser.primaryEmailAddress?.emailAddress ?? "";
    if (readSignupIntent() === "1") {
      trackMixpanelEvent("Sign Up", {
        user_id: clerkUser.id,
        email,
        signup_method: authMethodLabel(clerkUser),
        ...utmFromLocation(),
      });
      clearSignupIntent();
    } else {
      trackMixpanelEvent("Sign In", {
        user_id: clerkUser.id,
        login_method: authMethodLabel(clerkUser),
        success: true,
      });
    }
  }, [isLoaded, isSignedIn, sessionId, clerkUser]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !clerkUser) return;
    const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim();
    mixpanelIdentify(clerkUser.id, {
      $email: clerkUser.primaryEmailAddress?.emailAddress,
      ...(displayName ? { $name: displayName } : {}),
    });
  }, [isLoaded, isSignedIn, clerkUser]);

  const value = useMemo<AuthCtx>(
    () => ({
      user: isSignedIn && user ? user : null,
      session: isSignedIn ? session : null,
      loading: !isLoaded,
      signOut: () => signOut({ redirectUrl: "/auth" }),
    }),
    [isLoaded, isSignedIn, user, session, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (DEMO_MODE) return <DemoAuthProvider>{children}</DemoAuthProvider>;
  return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
}

export const useAuth = () => useContext(AuthContext);
