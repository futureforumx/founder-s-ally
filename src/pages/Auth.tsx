import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const LOGIN_ATTEMPT_KEY = "workos-login-attempt-at";
const LOGIN_LOOP_WINDOW_MS = 15_000;

const ERROR_MESSAGES: Record<string, string> = {
  callback_failed: "Sign-in couldn't be completed. Please try again.",
  workos_error: "WorkOS returned an error. Please try again.",
  access_denied: "Access was denied. Please try again or contact support.",
};

export default function Auth() {
  const { user, loading, isConfigured, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loopDetected, setLoopDetected] = useState(false);
  const [startingSignIn, setStartingSignIn] = useState(false);

  const errorKey = searchParams.get("error") ?? "";
  const errorMessage = ERROR_MESSAGES[errorKey] ?? (errorKey ? "An error occurred. Please try again." : null);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[auth] /login route —", { loading, userPresent: Boolean(user), errorKey });
    }
  }, [loading, user, errorKey]);

  // If the user is already authenticated, send them straight to the app
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname === "www.vekta.so") {
      const nextUrl = new URL(window.location.href);
      nextUrl.hostname = "vekta.so";
      window.location.replace(nextUrl.toString());
      return;
    }
    if (!loading && user) {
      try { window.sessionStorage.removeItem(LOGIN_ATTEMPT_KEY); } catch { /* ignore */ }
      if (import.meta.env.DEV) {
        console.log("[auth] already authenticated — navigating to /");
      }
      navigate("/", { replace: true });
    }
  }, [loading, user, navigate]);

  if (!isConfigured) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#050506] p-6 text-center">
        <div className="max-w-md space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
          <p className="text-sm font-semibold text-zinc-100">Authentication is temporarily unavailable</p>
          <p className="text-sm text-zinc-400">
            WorkOS is not configured for this build, so the sign-in flow cannot start.
          </p>
        </div>
      </div>
    );
  }

  if (loopDetected) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#050506] p-6 text-center">
        <div className="max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
          <p className="text-sm font-semibold text-zinc-100">Sign-in needs another try</p>
          <p className="text-sm text-zinc-400">
            WorkOS redirected back before the login screen completed. Retrying automatically would loop, so the
            sign-in flow is paused here.
          </p>
          <button
            className="inline-flex items-center justify-center rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-white"
            onClick={() => {
              setLoopDetected(false);
              setStartingSignIn(false);
            }}
          >
            Back to sign-in
          </button>
        </div>
      </div>
    );
  }

  async function startSignIn() {
    setStartingSignIn(true);
    try {
      const lastAttempt = Number(window.sessionStorage.getItem(LOGIN_ATTEMPT_KEY) || "0");
      if (lastAttempt && Date.now() - lastAttempt < LOGIN_LOOP_WINDOW_MS) {
        setLoopDetected(true);
        setStartingSignIn(false);
        return;
      }
      window.sessionStorage.setItem(LOGIN_ATTEMPT_KEY, String(Date.now()));
    } catch {
      // Continue even if sessionStorage is unavailable.
    }

    if (import.meta.env.DEV) {
      console.log("[auth] initiating WorkOS sign-in redirect");
    }
    try {
      await signIn();
    } catch {
      setStartingSignIn(false);
    }
  }

  // Show spinner while checking existing session
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#050506]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#050506] p-6 text-center">
      <div className="max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
        <p className="text-sm font-semibold text-zinc-100">Sign in to continue</p>
        <p className="text-sm text-zinc-400">
          Continue to WorkOS to access your Vekta workspace.
        </p>

        {errorMessage && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-left">
            <p className="text-xs text-red-400">{errorMessage}</p>
          </div>
        )}

        <button
          className="inline-flex items-center justify-center rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
          onClick={() => { void startSignIn(); }}
          disabled={startingSignIn}
        >
          {startingSignIn ? "Starting sign-in..." : "Continue with WorkOS"}
        </button>
      </div>
    </div>
  );
}
