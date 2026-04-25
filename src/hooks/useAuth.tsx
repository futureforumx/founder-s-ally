import { useAuth as useWorkOSAuth } from "@workos-inc/authkit-react";
import type { User, Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { setSupabaseAccessTokenGetter } from "@/integrations/supabase/client";
import { registerClerkSessionTokenGetter } from "@/lib/clerkSessionForEdge";
import { mixpanelIdentify, mixpanelReset } from "@/lib/mixpanel";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  signIn: () => void;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  getAccessToken: async () => null,
  signIn: () => {},
});

const hasWorkOSConfig = Boolean(String(import.meta.env.VITE_WORKOS_CLIENT_ID ?? "").trim());

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
  const { user: workosUser, isLoading, signOut: workosSignOut, signIn: workosSignIn, getAccessToken } = useWorkOSAuth();

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
      signOut: () => workosSignOut({ returnPathname: "/auth" }),
      getAccessToken: safeGetAccessToken,
      signIn: () => void workosSignIn(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, session, isLoading, workosSignOut, workosSignIn]
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
      signOut: async () => {},
      getAccessToken: async () => null,
      signIn: () => {},
    }),
    [],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!hasWorkOSConfig) {
    return <PublicAuthProvider>{children}</PublicAuthProvider>;
  }
  return <WorkOSAuthProvider>{children}</WorkOSAuthProvider>;
}

export const useAuth = () => useContext(AuthContext);
