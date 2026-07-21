import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Lock, Mail, Shield, User } from "lucide-react";
import { useAuth, type OAuthProvider } from "@/hooks/useAuth";
import { getAuthPageBackgroundVideoUrl } from "@/lib/authPageVideoUrl";

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function LinkedInGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
      />
    </svg>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  callback_failed: "Sign-in couldn't be completed. Please try again.",
  otp_failed: "That code could not be verified. Please request a new one and try again.",
  access_denied: "Access was denied. Please try again or contact support.",
  timeout: "Authentication took too long. Please try signing in again.",
};

type AuthMode = "sign-in" | "sign-up";

const PENDING_SIGNUP_EMAIL_KEY = "vekta.pending-signup-email";

function pendingSignupEmail(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(PENDING_SIGNUP_EMAIL_KEY) ?? "";
}

const inputClassName =
  "h-12 w-full border border-zinc-700 bg-[#121212] pl-10 pr-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400";

const inputPlainClassName =
  "h-12 w-full border border-zinc-700 bg-[#121212] px-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400";

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
    signUp,
    resendSignupConfirmation,
    verifySignupConfirmation,
    verifyOtp,
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [useEmailCode, setUseEmailCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(pendingSignupEmail);
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [signupConfirmationPending, setSignupConfirmationPending] = useState(
    () => pendingSignupEmail().length > 0,
  );
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

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setLocalError(null);
    setInfoMessage(null);
    setOtpSent(false);
    setOtpCode("");
    setSignupConfirmationPending(false);
    window.sessionStorage.removeItem(PENDING_SIGNUP_EMAIL_KEY);
    setUseEmailCode(false);
    clearLoginErrorParam();
  };

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
              await signInWithOAuth("google");
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
              await signInWithOAuth("linkedin_oidc");
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
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => switchMode(isSignUp ? "sign-in" : "sign-up")}
            className="font-medium text-zinc-200 transition hover:text-white"
          >
            {isSignUp ? "Sign in." : "Sign up."}
          </button>
        </p>
      </div>
    );

    return (
      <>
        <div className="space-y-2 text-left">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {signupConfirmationPending ? "Check your email." : isSignUp ? "Create account." : "Welcome back."}
          </h1>
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

        {otpSent && !isSignUp && (
          <div className="mt-4 border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-left">
            <p className="text-xs text-emerald-300">
              Check {email.trim().toLowerCase()} for your sign-in code, then enter it below.
            </p>
          </div>
        )}

        {isSignUp ? (
          signupConfirmationPending ? (
            <form
              className="mt-6 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                clearLoginErrorParam();
                setLocalError(null);
                setInfoMessage(null);
                setVerifyingCode(true);
                try {
                  const signedIn = await verifySignupConfirmation(email, otpCode);
                  window.sessionStorage.removeItem(PENDING_SIGNUP_EMAIL_KEY);
                  if (!signedIn) {
                    setSignupConfirmationPending(false);
                    setMode("sign-in");
                    setOtpCode("");
                    setInfoMessage("Account confirmed. Sign in with your password.");
                  }
                } catch (error) {
                  const rawMessage = error instanceof Error ? error.message : "";
                  const message = /expired|invalid/i.test(rawMessage)
                    ? "That code has expired or was replaced. Enter the newest code from your email."
                    : rawMessage || "That code could not be verified.";
                  setLocalError(message);
                } finally {
                  setVerifyingCode(false);
                }
              }}
            >
              <div className="space-y-2 text-left">
                <label htmlFor="signup-confirmation-code" className={labelClassName}>
                  Confirmation code
                </label>
                <input
                  id="signup-confirmation-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  className="h-14 w-full border border-zinc-700 bg-[#121212] px-4 text-center text-lg tracking-[0.36em] text-zinc-100 outline-none transition placeholder:text-sm placeholder:tracking-normal placeholder:text-zinc-600 focus:border-zinc-400"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className={primaryButtonClassName}
                disabled={verifyingCode || otpCode.length !== 6}
              >
                {verifyingCode ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirming account...
                  </>
                ) : (
                  "Confirm account"
                )}
              </button>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-left">
                <button
                  type="button"
                  onClick={async () => {
                    setLocalError(null);
                    setInfoMessage(null);
                    setSubmitting(true);
                    try {
                      await resendSignupConfirmation(email);
                      setOtpCode("");
                      setInfoMessage(
                        `A new confirmation code was sent to ${email.trim().toLowerCase()}. Only the newest code will work.`,
                      );
                    } catch (error) {
                      const message =
                        error instanceof Error ? error.message : "Could not resend the confirmation code.";
                      setLocalError(message);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  disabled={submitting}
                  className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Sending..." : "Resend code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSignupConfirmationPending(false);
                    setOtpCode("");
                    window.sessionStorage.removeItem(PENDING_SIGNUP_EMAIL_KEY);
                    setLocalError(null);
                    setInfoMessage(null);
                  }}
                  className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-300"
                >
                  Use a different email
                </button>
              </div>
            </form>
          ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              clearLoginErrorParam();
              setLocalError(null);
              setInfoMessage(null);
              setSubmitting(true);
              try {
                const result = await signUp({ email, password, firstName, lastName });
                if (result.needsEmailConfirmation) {
                  setSignupConfirmationPending(true);
                  setOtpCode("");
                  window.sessionStorage.setItem(PENDING_SIGNUP_EMAIL_KEY, email.trim().toLowerCase());
                  setInfoMessage(`We sent a six-digit confirmation code to ${email.trim().toLowerCase()}.`);
                  setPassword("");
                }
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : "Could not create your account. Please try again.";
                setLocalError(message);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 text-left">
                <label htmlFor="first-name" className={labelClassName}>
                  First name
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    id="first-name"
                    type="text"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="Jane"
                    className={inputClassName}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2 text-left">
                <label htmlFor="last-name" className={labelClassName}>
                  Last name
                </label>
                <input
                  id="last-name"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Doe"
                  className={inputPlainClassName}
                  required
                />
              </div>
            </div>

            <div className="space-y-2 text-left">
              <label htmlFor="signup-email" className={labelClassName}>
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  id="signup-email"
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

            <div className="space-y-2 text-left">
              <label htmlFor="signup-password" className={labelClassName}>
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  className={inputClassName}
                  required
                />
              </div>
            </div>

            <button type="submit" className={primaryButtonClassName} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  <Shield className="h-3.5 w-3.5" aria-hidden />
                  Create account
                </>
              )}
            </button>
            {oauthButtons}
          </form>
          )
        ) : (
          <>
            <form
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
                  <div className="flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setUseEmailCode(true);
                        setOtpSent(false);
                        setOtpCode("");
                        setLocalError(null);
                        setInfoMessage(null);
                      }}
                      className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-300"
                    >
                      Use email code instead
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
                      setLocalError(null);
                      setInfoMessage(null);
                    }}
                    className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-300"
                  >
                    Use password instead
                  </button>
                </div>
              )}

              <button type="submit" className={primaryButtonClassName} disabled={submitting}>
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
            </form>

            {oauthButtons}

            {otpSent && useEmailCode && (
              <form
                className="mt-5 space-y-4 border-t border-zinc-800 pt-5"
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
              </form>
            )}

          </>
        )}
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

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center overflow-y-auto py-2">
          {formPanel}
        </div>

        <footer className="mx-auto mt-10 w-full max-w-sm text-center text-[10px] text-zinc-700">
          <p>Protected by first-party data controls</p>
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
