import type { User, Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isSupabaseConfigured, setSupabaseAccessTokenGetter, supabaseAuth } from "@/integrations/supabase/client";
import { registerClerkSessionTokenGetter } from "@/lib/clerkSessionForEdge";
import { mixpanelIdentify, mixpanelReset } from "@/lib/mixpanel";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  signIn: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  isConfigured: false,
  signIn: async () => {},
  verifyOtp: async () => {},
  signOut: async () => {},
  getAccessToken: async () => null,
});

// ---------------------------------------------------------------------------

function authRedirectUrl() {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/auth`;
}

function displayNameForUser(user: User): string {
  const metadata = user.user_metadata ?? {};
  const metadataName =
    typeof metadata.full_name === "string" ? metadata.full_name :
    typeof metadata.name === "string" ? metadata.name :
    "";
  return metadataName.trim() || user.email?.split("@")[0] || "";
}

function avatarForUser(user: User): string | undefined {
  const metadata = user.user_metadata ?? {};
  const avatar =
    typeof metadata.avatar_url === "string" ? metadata.avatar_url :
    typeof metadata.picture === "string" ? metadata.picture :
    "";
  return avatar.trim() || undefined;
}

function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const user = session?.user ?? null;

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setLoading(false);
    });

    supabaseAuth.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data, error } = await supabaseAuth.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  }, []);

  useEffect(() => {
    const getter = async () => getAccessToken();
    setSupabaseAccessTokenGetter(getter);
    registerClerkSessionTokenGetter(getter);
    return () => {
      setSupabaseAccessTokenGetter(null);
      registerClerkSessionTokenGetter(async () => null);
    };
  }, [getAccessToken]);

  useEffect(() => {
    if (!user) {
      mixpanelReset();
      return;
    }
    const displayName = displayNameForUser(user);
    mixpanelIdentify(user.id, {
      $email: user.email,
      ...(displayName ? { $name: displayName } : {}),
    });
  }, [user]);

  useEffect(() => {
    if (!user || !session?.access_token) return;

    const displayName = displayNameForUser(user);
    fetch("/api/ensure-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        _uid: user.id,
        email: user.email,
        display_name: displayName,
        avatar_url: avatarForUser(user),
      }),
    }).catch((error) => {
      if (import.meta.env.DEV) {
        console.warn("[auth] ensure-user failed:", error);
      }
    });
  }, [session?.access_token, user]);

  const signIn = useCallback(async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error("Enter your email address.");
    }

    const { error } = await supabaseAuth.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: authRedirectUrl(),
        shouldCreateUser: true,
      },
    });

    if (error) {
      throw error;
    }
  }, []);

  const verifyOtp = useCallback(async (email: string, token: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedToken = token.replace(/\s+/g, "");
    if (!normalizedEmail || !normalizedToken) {
      throw new Error("Enter the code from your email.");
    }

    const { error } = await supabaseAuth.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedToken,
      type: "email",
    });

    if (error) {
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabaseAuth.auth.signOut();
    if (error) throw error;
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      session,
      loading,
      isConfigured: true,
      signIn,
      verifyOtp,
      signOut,
      getAccessToken,
    }),
    [user, session, loading, signIn, verifyOtp, signOut, getAccessToken]
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
      verifyOtp: async () => {},
      signOut: async () => {},
      getAccessToken: async () => null,
    }),
    [],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured) {
    return <PublicAuthProvider>{children}</PublicAuthProvider>;
  }
  return <SupabaseAuthProvider>{children}</SupabaseAuthProvider>;
}

export const useAuth = () => useContext(AuthContext);
