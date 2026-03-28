import {
  useLayoutEffect,
  useRef,
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth as useClerkAuth, useUser, useClerk } from "@clerk/clerk-react";
import type { User, Session } from "@supabase/supabase-js";
import { setSupabaseAccessTokenGetter } from "@/integrations/supabase/client";
import { registerClerkSessionTokenGetter } from "@/lib/clerkSessionForEdge";

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
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

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
      // PostgREST RLS needs a JWT Supabase can verify (Clerk "supabase" template).
      // Clerk's default session token is Clerk-signed — PostgREST returns "No suitable key or wrong key type".
      try {
        const supabaseJwt = await gt({ template: "supabase" });
        if (supabaseJwt) return supabaseJwt;
      } catch {
        /* template missing or misconfigured */
      }
      console.warn(
        '[Supabase + Clerk] No JWT from template "supabase". Row-level security on tables will fail until you add it: Clerk Dashboard → JWT Templates → name exactly `supabase`, then Supabase → Authentication → Sign In / Providers → Clerk. Docs: https://supabase.com/docs/guides/auth/third-party/clerk',
      );
      return null;
    });
    return () => setSupabaseAccessTokenGetter(null);
  }, [isLoaded, isSignedIn]);

  const user = useMemo(() => clerkUserToCompatUser(clerkUser), [clerkUser]);
  const session = useMemo(() => buildSession(isSignedIn && user ? user : null), [isSignedIn, user]);

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
