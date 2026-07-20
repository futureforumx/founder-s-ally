import type { User, Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isSupabaseConfigured, setSupabaseAccessTokenGetter, supabaseAuth } from "@/integrations/supabase/client";
import { registerClerkSessionTokenGetter } from "@/lib/clerkSessionForEdge";
import { mixpanelIdentify, mixpanelReset } from "@/lib/mixpanel";
import { LoginOtpError, sendLoginOtp } from "@/lib/sendLoginOtp";

export type SignUpInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

export type SignUpResult = {
  /** True when Supabase created the user but email confirmation is still required. */
  needsEmailConfirmation: boolean;
};

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  signIn: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
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
  signInWithPassword: async () => {},
  signUp: async () => ({ needsEmailConfirmation: false }),
  verifyOtp: async () => {},
  signOut: async () => {},
  getAccessToken: async () => null,
});

// ---------------------------------------------------------------------------

function displayNameForUser(user: User): string {
  const metadata = user.user_metadata ?? {};
  const metadataName =
    typeof metadata.full_name === "string" ? metadata.full_name :
    typeof metadata.name === "string" ? metadata.name :
    "";
  if (metadataName.trim()) return metadataName.trim();
  const first = typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
  const last = typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
  const combined = [first, last].filter(Boolean).join(" ");
  return combined || user.email?.split("@")[0] || "";
}

function avatarForUser(user: User): string | undefined {
  const metadata = user.user_metadata ?? {};
  const avatar =
    typeof metadata.avatar_url === "string" ? metadata.avatar_url :
    typeof metadata.picture === "string" ? metadata.picture :
    "";
  return avatar.trim() || undefined;
}

const AUTH_SESSION_TIMEOUT_MS = 8_000;

function isGenericFetchFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === "Failed to fetch" || error.message === "Load failed";
}

function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const user = session?.user ?? null;

  useEffect(() => {
    let mounted = true;
    let resolvedInitial = false;

    const resolveInitial = (nextSession: Session | null) => {
      if (!mounted || resolvedInitial) return;
      resolvedInitial = true;
      setSession(nextSession);
      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (!resolvedInitial) {
        resolvedInitial = true;
        setLoading(false);
      }
    });

    const timeoutId = window.setTimeout(() => {
      if (!mounted || resolvedInitial) return;
      if (import.meta.env.DEV) {
        console.warn(
          `[auth] getSession exceeded ${AUTH_SESSION_TIMEOUT_MS}ms — clearing stuck session and continuing signed out`,
        );
      }
      void supabaseAuth.auth.signOut({ scope: "local" }).catch(() => {});
      resolveInitial(null);
    }, AUTH_SESSION_TIMEOUT_MS);

    supabaseAuth.auth
      .getSession()
      .then(({ data }) => {
        resolveInitial(data.session ?? null);
      })
      .catch(() => {
        resolveInitial(null);
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
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

    let customOtpError: unknown = null;
    try {
      await sendLoginOtp(normalizedEmail);
      return;
    } catch (error) {
      customOtpError = error;
      if (import.meta.env.DEV) {
        const willFallback = !(error instanceof LoginOtpError) || error.fallbackToSupabaseOtp;
        console.warn(
          willFallback
            ? "[auth] custom OTP email failed, falling back to Supabase OTP:"
            : "[auth] custom OTP email failed:",
          error,
        );
      }
      if (error instanceof LoginOtpError && !error.fallbackToSupabaseOtp) {
        throw error;
      }
    }

    let fallbackError: unknown = null;
    try {
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth` : undefined;
      const { error } = await supabaseAuth.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (!error) return;
      fallbackError = error;
    } catch (error) {
      fallbackError = error;
    }

    if (isGenericFetchFailure(fallbackError)) {
      if (customOtpError instanceof Error && customOtpError.message) {
        throw customOtpError;
      }
      throw new Error("Supabase Auth is not responding. Please try signing in again in a few minutes.");
    }

    if (fallbackError instanceof Error) {
      throw fallbackError;
    }

    throw new Error("Could not start sign-in. Please try again.");
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error("Enter your email address.");
    }
    if (!password) {
      throw new Error("Enter your password.");
    }

    try {
      const { error } = await supabaseAuth.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;
    } catch (error) {
      if (isGenericFetchFailure(error)) {
        throw new Error("Supabase Auth is not responding. Please try again in a few minutes.");
      }
      if (error instanceof Error) throw error;
      throw new Error("Could not sign in. Please try again.");
    }
  }, []);

  const signUp = useCallback(async (input: SignUpInput): Promise<SignUpResult> => {
    const email = input.email.trim().toLowerCase();
    const password = input.password;
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    if (!firstName) throw new Error("Enter your first name.");
    if (!lastName) throw new Error("Enter your last name.");
    if (!email) throw new Error("Enter your email address.");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");

    try {
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth` : undefined;
      const { data, error } = await supabaseAuth.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            name: fullName,
          },
        },
      });
      if (error) throw error;

      const identities = data.user?.identities;
      if (data.user && Array.isArray(identities) && identities.length === 0) {
        throw new Error("An account with this email already exists. Sign in instead.");
      }

      return { needsEmailConfirmation: !data.session };
    } catch (error) {
      if (isGenericFetchFailure(error)) {
        throw new Error("Supabase Auth is not responding. Please try again in a few minutes.");
      }
      if (error instanceof Error) throw error;
      throw new Error("Could not create your account. Please try again.");
    }
  }, []);

  const verifyOtp = useCallback(async (email: string, token: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedToken = token.replace(/\s+/g, "");
    if (!normalizedEmail || !normalizedToken) {
      throw new Error("Enter the code from your email.");
    }

    try {
      const { error } = await supabaseAuth.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type: "email",
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      if (isGenericFetchFailure(error)) {
        throw new Error("Supabase Auth is not responding. Please try again in a few minutes.");
      }
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
      signInWithPassword,
      signUp,
      verifyOtp,
      signOut,
      getAccessToken,
    }),
    [user, session, loading, signIn, signInWithPassword, signUp, verifyOtp, signOut, getAccessToken]
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
      signInWithPassword: async () => {},
      signUp: async () => ({ needsEmailConfirmation: false }),
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
