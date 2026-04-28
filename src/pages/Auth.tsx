import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const ERROR_MESSAGES: Record<string, string> = {
  callback_failed: "Sign-in couldn't be completed. Please try again.",
  workos_error: "WorkOS returned an error. Please try again.",
  access_denied: "Access was denied. Please try again or contact support.",
};

export default function Auth() {
  const { user, loading, isConfigured, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [startingSignIn, setStartingSignIn] = useState(false);

  const errorKey = searchParams.get("error") ?? "";
  const errorMessage = ERROR_MESSAGES[errorKey] ?? (errorKey ? "An error occurred. Please try again." : null);

  // If the user is already authenticated, send them straight to the app
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname === "www.vekta.so") {
      const nextUrl = new URL(window.location.href);
      nextUrl.hostname = "vekta.so";
      window.location.replace(nextUrl.toString());
      return;
    }
    if (!loading && user) {
      console.log("[auth] already authenticated — navigating to /");
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
          onClick={async () => {
            // Synchronous diagnostics — written before any async work
            console.log("[auth] calling SDK signIn()");
            try {
              window.localStorage.setItem("_auth_debug_clicked_at", new Date().toISOString());
              window.localStorage.setItem("_auth_debug_preRedirect_href", window.location.href);
              // Clear stale callback diagnostics from prior attempts
              ["_auth_debug_mainjs_href", "_auth_debug_mainjs_search", "_auth_debug_mainjs_at",
               "_auth_debug_callback_at", "_auth_debug_callback_url", "_auth_debug_callback_search",
               "_auth_debug_callback_code_present", "_auth_debug_callback_error_present",
               "_auth_debug_authorize_url", "_auth_debug_authorize_hostname",
               "_auth_debug_error"].forEach((k) => window.localStorage.removeItem(k));
            } catch { /* ignore if storage unavailable */ }

            setStartingSignIn(true);
            await signIn(); // SDK handles PKCE + redirect to api.workos.com internally
          }}
          disabled={startingSignIn}
        >
          {startingSignIn ? "Starting sign-in..." : "Continue with WorkOS"}
        </button>
      </div>
    </div>
  );
}
