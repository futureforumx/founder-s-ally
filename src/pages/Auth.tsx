import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const ERROR_MESSAGES: Record<string, string> = {
  callback_failed: "Sign-in couldn't be completed. Please try again.",
  otp_failed: "That code could not be verified. Please request a new one and try again.",
  access_denied: "Access was denied. Please try again or contact support.",
  timeout: "Authentication took too long. Please try signing in again.",
};

export default function Auth() {
  const { user, loading, isConfigured, signIn, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [startingSignIn, setStartingSignIn] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

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
      console.log("[auth] already authenticated - navigating to /");
      navigate("/", { replace: true });
    }
  }, [loading, user, navigate]);

  if (!isConfigured) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#050506] p-6 text-center">
        <div className="max-w-md space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
          <p className="text-sm font-semibold text-zinc-100">Authentication is temporarily unavailable</p>
          <p className="text-sm text-zinc-400">
            Supabase is not configured for this build, so the sign-in flow cannot start.
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
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
        <p className="text-sm font-semibold text-zinc-100">Sign in to continue</p>
        <p className="text-sm text-zinc-400">
          Enter your email and we'll send a secure Supabase sign-in code.
        </p>

        {(errorMessage || localError) && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-left">
            <p className="text-xs text-red-400">{localError ?? errorMessage}</p>
          </div>
        )}

        {otpSent && (
          <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-left">
            <p className="text-xs text-emerald-300">
              Check {email.trim().toLowerCase()} for your sign-in code. The magic link in that email works too.
            </p>
          </div>
        )}

        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setLocalError(null);
            setStartingSignIn(true);
            try {
              await signIn(email);
              setOtpSent(true);
            } catch (error) {
              const message = error instanceof Error ? error.message : "Could not start sign-in. Please try again.";
              setLocalError(message);
            } finally {
              setStartingSignIn(false);
            }
          }}
        >
          <label className="sr-only" htmlFor="email">Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className="h-11 w-full rounded-full border border-zinc-800 bg-zinc-950 pl-10 pr-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-500"
              required
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-zinc-100 px-4 text-sm font-medium text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
            disabled={startingSignIn}
          >
            {startingSignIn ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending code...
              </>
            ) : (
              "Send sign-in code"
            )}
          </button>
        </form>

        {otpSent && (
          <form
            className="space-y-3 border-t border-zinc-900 pt-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setLocalError(null);
              setVerifyingCode(true);
              try {
                await verifyOtp(email, otpCode);
              } catch (error) {
                const message = error instanceof Error ? error.message : "That code could not be verified.";
                setLocalError(message);
              } finally {
                setVerifyingCode(false);
              }
            }}
          >
            <label className="sr-only" htmlFor="otp-code">Sign-in code</label>
            <input
              id="otp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value)}
              placeholder="6-digit code"
              className="h-11 w-full rounded-full border border-zinc-800 bg-zinc-950 px-4 text-center text-sm tracking-[0.28em] text-zinc-100 outline-none transition placeholder:tracking-normal placeholder:text-zinc-600 focus:border-zinc-500"
              required
            />
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-zinc-700 px-4 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={verifyingCode}
            >
              {verifyingCode ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify code"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
