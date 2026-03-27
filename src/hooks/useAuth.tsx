import {
  useEffect,
  useRef,
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useAuth as useClerkAuth, useUser, useClerk } from "@clerk/clerk-react";
import type { User, Session } from "@supabase/supabase-js";
import { setSupabaseAccessTokenGetter } from "@/integrations/supabase/client";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    setSupabaseAccessTokenGetter(async () => {
      if (!isLoaded || !isSignedIn) return null;
      const gt = getTokenRef.current;
      try {
        const t = await gt({ template: "supabase" });
        if (t) return t;
      } catch {
        /* template may not exist yet */
      }
      return (await gt()) ?? null;
    });
  }, [isLoaded, isSignedIn]);

  const user = useMemo(() => clerkUserToCompatUser(clerkUser), [clerkUser]);
  const session = useMemo(() => buildSession(isSignedIn && user ? user : null), [isSignedIn, user]);

  const value = useMemo<AuthCtx>(
    () => ({
      user: isSignedIn && user ? user : null,
      session: isSignedIn ? session : null,
      loading: !isLoaded,
      signOut: () => signOut(),
    }),
    [isLoaded, isSignedIn, user, session, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
