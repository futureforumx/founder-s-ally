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
import { useAuth as useWorkOSAuth } from "@workos-inc/authkit-react";
import type { User, Session } from "@supabase/supabase-js";
import { setSupabaseAccessTokenGetter } from "@/integrations/supabase/client";
import { registerAuthSessionTokenGetter } from "@/lib/clerkSessionForEdge";
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

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

const DEMO_USER = {
  id: "demo-user-id",
  email: "demo@vekta.app",
  app_metadata: {},
  user_metadata: { full_name: "Demo User" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
} as unknown as User;

export interface UserMetadata {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  linkedin_url?: string;
  twitter_url?: string;
  avatar_url?: string;
  [key: string]: unknown;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  provider: "workos" | "demo";
  user_metadata?: UserMetadata;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  provider: "workos",
  user_metadata: {},
});

function workosUserToCompatUser(workosUser: unknown): User | null {
  if (!workosUser || typeof workosUser !== "object") return null;
  const u = workosUser as Record<string, unknown>;
  const id = typeof u.id === "string" ? u.id : "";
  if (!id) return null;

  const email = typeof u.email === "string" ? u.email : "";
  const firstName = typeof u.firstName === "string" ? u.firstName : "";
  const lastName = typeof u.lastName === "string" ? u.lastName : "";

  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: email ? new Date().toISOString() : null,
    phone: "",
    confirmed_at: null,
    last_sign_in_at: null,
    app_metadata: {},
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      full_name: [firstName, lastName].filter(Boolean).join(" "),
    },
    identities: [],
    created_at: "",
    updated_at: "",
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
    registerAuthSessionTokenGetter(async () => null);
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
      provider: "demo",
      user_metadata: (user?.user_metadata as UserMetadata) ?? {},
    }),
    [user, session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function WorkOSAuthProvider({ children }: { children: ReactNode }) {
  const { isLoading, user, getAccessToken, signOut } = useWorkOSAuth();
  const tokenGetterRef = useRef(getAccessToken);
  tokenGetterRef.current = getAccessToken;

  useLayoutEffect(() => {
    registerAuthSessionTokenGetter(async () => {
      try {
        const token = await tokenGetterRef.current();
        return token?.trim() ? token : null;
      } catch {
        return null;
      }
    });

    setSupabaseAccessTokenGetter(async () => {
      try {
        const token = await tokenGetterRef.current();
        return token?.trim() ? token : null;
      } catch {
        return null;
      }
    });

    return () => {
      setSupabaseAccessTokenGetter(null);
      registerAuthSessionTokenGetter(async () => null);
    };
  }, []);

  const compatUser = useMemo(() => workosUserToCompatUser(user), [user]);
  const session = useMemo(() => buildSession(compatUser), [compatUser]);
  const userId = compatUser?.id ?? null;
  const email = compatUser?.email ?? "";

  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (!userId) {
      if (lastUserIdRef.current) {
        mixpanelReset();
      }
      lastUserIdRef.current = null;
      return;
    }

    if (lastUserIdRef.current === userId) return;

    const previous = lastUserIdRef.current;
    lastUserIdRef.current = userId;

    const fullName = (compatUser?.user_metadata as UserMetadata | undefined)?.full_name;
    mixpanelIdentify(userId, {
      $email: email || undefined,
      ...(fullName ? { $name: fullName } : {}),
    });

    if (!previous) {
      if (readSignupIntent() === "1") {
        trackMixpanelEvent("Sign Up", {
          user_id: userId,
          email,
          signup_method: "workos",
          ...utmFromLocation(),
        });
        clearSignupIntent();
      } else {
        trackMixpanelEvent("Sign In", {
          user_id: userId,
          login_method: "workos",
          success: true,
        });
      }
    }
  }, [isLoading, userId, email, compatUser]);

  const value = useMemo<AuthCtx>(
    () => ({
      user: compatUser,
      session,
      loading: isLoading,
      signOut: async () => {
        await signOut();
      },
      provider: "workos",
      user_metadata: (compatUser?.user_metadata as UserMetadata) ?? {},
    }),
    [compatUser, session, isLoading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (DEMO_MODE) return <DemoAuthProvider>{children}</DemoAuthProvider>;
  return <WorkOSAuthProvider>{children}</WorkOSAuthProvider>;
}

export const useAuth = () => useContext(AuthContext);
