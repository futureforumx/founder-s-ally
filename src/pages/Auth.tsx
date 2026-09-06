import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Lock, Mail, Shield } from "lucide-react";
import { RegisterAccessForm } from "@/components/auth/RegisterAccessForm";
import { GoogleGlyph, LinkedInGlyph } from "@/components/auth/oauthGlyphs";
import { useAuth, type OAuthProvider } from "@/hooks/useAuth";
import { getAuthPageBackgroundVideoUrl } from "@/lib/authPageVideoUrl";

const ERROR_MESSAGES: Record<string, string> = {
  callback_failed: "Sign-in couldn't be completed. Please try again.",
  request_failed: "Your connected account was verified, but the access request could not be submitted. Please try again.",
  otp_failed: "That code could not be verified. Please request a new one and try again.",
  access_denied: "Access was denied. Please try again or contact support.",
  timeout: "Authentication took too long. Please try signing in again.",
};

type AuthMode = "sign-in" | "sign-up";

const RESEND_CODE_COOLDOWN_SECONDS = 30;

const inputClassName =
  "h-12 w-full border border-zinc-700 bg-[#121212] pl-10 pr-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400";

const primaryButtonClassName =
  "inline-flex h-12 w-full items-center justify-center gap-2 bg-white px-4 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-70";

const labelClassName = "block text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500";

export default function Auth() {
  const {
    user,
    loading,
    isConfigured,
    signIn,
    signInWithPassword,
    signInWithOAuth,
    resetPassword,
    verifyOtp,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>(() =>
    location.pathname.startsWith("/register") ? "sign-up" : "sign-in",
  );
  const [useEmailCode, setUseEmailCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resendingCode, setResendingCode] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoSrc = useMemo(() => getAuthPageBackgroundVideoUrl(), []);

  const errorKey = searchParams.get("error") ?? "";
  const errorMessage = ERROR_MESSAGES[errorKey] ?? (errorKey ? "An error occurred. Please try again." : null);
  const activeErrorMessage = localError ?? errorMessage;

  const clearLoginErrorParam = () => {
    if (!searchParams.has("error")) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("error");
    setSearchParams(nextParams, { replace: true });
  };

  const resetTransientAuthState = () => {
    setLocalError(null);
    setInfoMessage(null);
    setOtpSent(false);
    setOtpCode("");
    setUseEmailCode(false);
    setResendCooldown(0);
  };

  // Tick down the resend-code cooldown once a second while it is active.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    resetTransientAuthState();
    clearLoginErrorParam();
    const targetPath = next === "sign-up" ? "/register" : "/login";
    if (location.pathname !== targetPath) {
      navigate({ pathname: targetPath, search: location.search }, { replace: true });
    }
  };

  // Keep mode in sync with the URL (direct navigation, back/forward).
  useEffect(() => {
    const pathMode: AuthMode = location.pathname.startsWith("/register") ? "sign-up" : "sign-in";
    setMode((current) => (current === pathMode ? current : pathMode));
  }, [location.pathname]);

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

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.defaultMuted = true;
    el.muted = true;
    const kick = () => {
      void el.play().catch(() => {
        /* Autoplay can be blocked; black panel remains. */
      });
    };
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) kick();
    else el.addEventListener("loadeddata", kick, { once: true });
    return () => el.removeEventListener("loadeddata", kick);
  }, [videoSrc]);

  const formPanel = (() => {
    if (!isConfigured) {
      return (
        <div className="space-y-3 text-left">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Welcome back.</h1>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            Authentication temporarily unavailable
          </p>
          <div className="border border-zinc-800 bg-zinc-950/80 px-4 py-3">
            <p className="text-sm text-zinc-400">
              Supabase is not configured for this build, so the sign-in flow cannot start.
            </p>
          </div>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      );
    }

    const isSignUp = mode === "sign-up";

    if (isSignUp) {
      return (
        <RegisterAccessForm
          source="register"
          headingAs="h1"
          idPrefix="register"
          externalError={activeErrorMessage}
          onClearExternalError={() => {
            setLocalError(null);
            clearLoginErrorParam();
          }}
          onSignInClick={() => switchMode("sign-in")}
        />
      );
    }

    const oauthButtons = (
      <div className="mt-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">Or</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>
        <button
          type="button"
          disabled={Boolean(oauthLoading) || submitting}
          onClick={async () => {
            clearLoginErrorParam();
            setLocalError(null);
            setInfoMessage(null);
            setOauthLoading("google");
            try {
              await signInWithOAuth("google", {
                intent: "sign-in",
                referralCode:
                  searchParams.get("ref")?.trim() || searchParams.get("referral_code")?.trim() || undefined,
              });
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Could not start Google sign-in.";
              setLocalError(message);
              setOauthLoading(null);
            }
          }}
          className="inline-flex h-12 w-full items-center justify-center gap-2.5 border border-zinc-700 bg-[#121212] px-4 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:border-zinc-500 hover:bg-[#161616] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {oauthLoading === "google" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleGlyph className="h-4 w-4 shrink-0" />
          )}
          Continue with Google
        </button>
        <button
          type="button"
          disabled={Boolean(oauthLoading) || submitting}
          onClick={async () => {
            clearLoginErrorParam();
            setLocalError(null);
            setInfoMessage(null);
            setOauthLoading("linkedin_oidc");
            try {
              await signInWithOAuth("linkedin_oidc", {
                intent: "sign-in",
                referralCode:
                  searchParams.get("ref")?.trim() || searchParams.get("referral_code")?.trim() || undefined,
              });
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Could not start LinkedIn sign-in.";
              setLocalError(message);
              setOauthLoading(null);
            }
          }}
          className="inline-flex h-12 w-full items-center justify-center gap-2.5 border border-zinc-700 bg-[#121212] px-4 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:border-zinc-500 hover:bg-[#161616] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {oauthLoading === "linkedin_oidc" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LinkedInGlyph className="h-4 w-4 shrink-0 text-[#0A66C2]" />
          )}
          Continue with LinkedIn
        </button>
        <p className="pt-2 text-center text-sm text-zinc-500">
          Don't have an account?{" "}
          <button
            type="button"
            onClick={() => switchMode("sign-up")}
            className="font-medium text-zinc-200 transition hover:text-white"
          >
            Sign up.
          </button>
        </p>
      </div>
    );

    return (
      <>
        <div className="space-y-2 text-left">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Welcome back.</h1>
        </div>

        {activeErrorMessage && (
          <div className="mt-4 border border-red-900/60 bg-red-950/40 px-4 py-3 text-left">
            <p className="text-xs text-red-400">{activeErrorMessage}</p>
          </div>
        )}

        {infoMessage && (
          <div className="mt-4 border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-left">
            <p className="text-xs text-emerald-300">{infoMessage}</p>
          </div>
        )}

        {otpSent && (
          <div className="mt-4 border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-left">
            <p className="text-xs text-emerald-300">
              Check {email.trim().toLowerCase()} for your sign-in code, then enter it below.
            </p>
          </div>
        )}

        <form
              id="signin-form"
              className="mt-6 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                clearLoginErrorParam();
                setLocalError(null);
                setInfoMessage(null);
                setSubmitting(true);
                try {
                  if (useEmailCode) {
                    setOtpSent(false);
                    await signIn(email);
                    setOtpSent(true);
                    setOtpCode("");
                    setResendCooldown(RESEND_CODE_COOLDOWN_SECONDS);
                  } else {
                    await signInWithPassword(email, password);
                  }
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : "Could not start sign-in. Please try again.";
                  setLocalError(message);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <div className="space-y-2 text-left">
                <label htmlFor="email" className={labelClassName}>
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    className={inputClassName}
                    required
                  />
                </div>
              </div>

              {!useEmailCode && (
                <div className="space-y-2 text-left">
                  <label htmlFor="password" className={labelClassName}>
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Password"
                      className={inputClassName}
                      required
                    />
                  </div>
                </div>
              )}
            </form>

            {otpSent && useEmailCode && (
              <form
                className="mt-4 space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  clearLoginErrorParam();
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
                <div className="space-y-2 text-left">
                  <label htmlFor="otp-code" className={labelClassName}>
                    Sign-in code
                  </label>
                  <input
                    id="otp-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                    placeholder="6-digit code"
                    className="h-12 w-full border border-zinc-700 bg-[#121212] px-4 text-center text-sm tracking-[0.28em] text-zinc-100 outline-none transition placeholder:tracking-normal placeholder:text-zinc-600 focus:border-zinc-400"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 border border-zinc-600 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={verifyingCode}
                >
                  {verifyingCode ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify code"
                  )}
                </button>
                <div className="text-left">
                  {resendCooldown > 0 ? (
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-600">
                      Resend code in {resendCooldown}s
                    </p>
                  ) : (
                    <button
                      type="button"
                      disabled={resendingCode}
                      onClick={async () => {
                        clearLoginErrorParam();
                        setLocalError(null);
                        setInfoMessage(null);
                        setResendingCode(true);
                        try {
                          await signIn(email);
                          setOtpCode("");
                          setResendCooldown(RESEND_CODE_COOLDOWN_SECONDS);
                        } catch (error) {
                          const message =
                            error instanceof Error ? error.message : "Could not resend the code. Please try again.";
                          setLocalError(message);
                        } finally {
                          setResendingCode(false);
                        }
                      }}
                      className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {resendingCode ? "Resending..." : "Resend code"}
                    </button>
                  )}
                </div>
              </form>
            )}

            <div className="mt-4 space-y-4">
              {!useEmailCode && (
                <div className="flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setUseEmailCode(true);
                        setOtpSent(false);
                        setOtpCode("");
                        setResendCooldown(0);
                        setLocalError(null);
                        setInfoMessage(null);
                      }}
                      className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-300"
                    >
                      Send email code
                    </button>
                    <button
                      type="button"
                      disabled={resettingPassword || submitting}
                      onClick={async () => {
                        clearLoginErrorParam();
                        setLocalError(null);
                        setInfoMessage(null);
                        setResettingPassword(true);
                        try {
                          await resetPassword(email);
                          setInfoMessage(`Password reset email sent to ${email.trim().toLowerCase()}.`);
                        } catch (error) {
                          const message =
                            error instanceof Error
                              ? error.message
                              : "Could not send a password reset email.";
                          setLocalError(message);
                        } finally {
                          setResettingPassword(false);
                        }
                      }}
                      className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {resettingPassword ? "Sending..." : "Forgot password?"}
                    </button>
                </div>
              )}

              {useEmailCode && (
                <div className="text-left">
                  <button
                    type="button"
                    onClick={() => {
                      setUseEmailCode(false);
                      setOtpSent(false);
                      setOtpCode("");
                      setResendCooldown(0);
                      setLocalError(null);
                      setInfoMessage(null);
                    }}
                    className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-300"
                  >
                    Use password instead
                  </button>
                </div>
              )}

              {!(otpSent && useEmailCode) && (
                <button type="submit" form="signin-form" className={primaryButtonClassName} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {useEmailCode ? "Sending code..." : "Signing in..."}
                    </>
                  ) : (
                    <>
                      <Shield className="h-3.5 w-3.5" aria-hidden />
                      {useEmailCode ? "Send sign-in code" : "Sign in"}
                    </>
                  )}
                </button>
              )}
            </div>

            {oauthButtons}
      </>
    );
  })();

  return (
    <div className="fixed inset-0 flex bg-black font-sans text-zinc-100">
      <section className="relative z-10 flex h-full w-full shrink-0 flex-col justify-between border-r border-zinc-900 bg-black px-8 py-10 sm:px-10 lg:w-[400px] xl:w-[440px]">
        <div className="mb-8 lg:hidden">
          <img
            src="/brand/vekta-login-wordmark.png"
            alt="Vekta"
            className="h-10 w-auto object-contain"
            width={149}
            height={69}
          />
        </div>

        <div className="scrollbar-hide mx-auto flex w-full max-w-sm flex-1 flex-col justify-center overflow-y-auto py-2">
          {formPanel}
        </div>

        <footer className="mx-auto mt-10 w-full max-w-sm text-center text-[10px] text-zinc-700">
          <p>© 2026 Kova Ventures. All rights reserved.</p>
        </footer>
      </section>

      <div className="relative hidden min-h-0 min-w-0 flex-1 overflow-hidden bg-black lg:block" aria-hidden>
        <video
          ref={videoRef}
          key={videoSrc}
          className="auth-hero-native-video absolute inset-0 h-full w-full scale-[1.02] object-cover"
          src={videoSrc}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-black/30" />

        <div className="absolute right-8 top-5 xl:right-12 xl:top-6">
          <img
            src="/brand/vekta-login-wordmark.png"
            alt=""
            className="h-12 w-auto object-contain drop-shadow-[0_2px_20px_rgba(0,0,0,0.85)] xl:h-14"
            width={149}
            height={69}
          />
        </div>
      </div>
    </div>
  );
}
