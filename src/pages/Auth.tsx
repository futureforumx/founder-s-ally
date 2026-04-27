import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const LOGIN_ATTEMPT_KEY = "workos-login-attempt-at";
const LOGIN_LOOP_WINDOW_MS = 15_000;

export default function Auth() {
  const { user, loading, isConfigured, signIn } = useAuth();
  const navigate = useNavigate();
  const [loopDetected, setLoopDetected] = useState(false);
  const [startingSignIn, setStartingSignIn] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname === "www.vekta.so") {
      const nextUrl = new URL(window.location.href);
      nextUrl.hostname = "vekta.so";
      window.location.replace(nextUrl.toString());
      return;
    }

    if (!loading && user) {
      try {
        window.sessionStorage.removeItem(LOGIN_ATTEMPT_KEY);
      } catch {
        // Ignore storage failures and continue the auth flow.
      }
      navigate("/", { replace: true });
      return;
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

    try {
      await signIn();
    } catch {
      setStartingSignIn(false);
    }
  }

  if (!loading && !user && isConfigured) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#050506] p-6 text-center">
        <div className="max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
          <p className="text-sm font-semibold text-zinc-100">Sign in to continue</p>
          <p className="text-sm text-zinc-400">
            Continue to WorkOS to access your Vekta workspace.
          </p>
          <button
            className="inline-flex items-center justify-center rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
            onClick={() => {
              void startSignIn();
            }}
            disabled={startingSignIn}
          >
            {startingSignIn ? "Starting sign-in..." : "Continue with WorkOS"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#050506]">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
    </div>
  );
}
