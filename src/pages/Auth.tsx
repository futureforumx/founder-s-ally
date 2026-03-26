import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";
import { KeyRound, Loader2, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { validateSignupEmail } from "@/lib/signupEmailValidation";

export default function Auth() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [aiGuessedCompany, setAiGuessedCompany] = useState(false);
  const [aiGuessedWebsite, setAiGuessedWebsite] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupEmailError, setSignupEmailError] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpExpanded, setOtpExpanded] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpLoading, setOtpLoading] = useState<"idle" | "sending" | "verifying">("idle");
  const [otpMethod, setOtpMethod] = useState<"resend" | "supabase">("resend");

  useEffect(() => {
    if (!authLoading && user) navigate("/", { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    setSignupEmailError(null);
    setOtpCode("");
    setOtpExpanded(false);
    setOtpRequested(false);
    setOtpEmail("");
    setOtpLoading("idle");
    setOtpMethod("resend");
  }, [mode]);

  useEffect(() => {
    if (!otpRequested) return;
    if (email.trim() !== otpEmail) {
      setOtpRequested(false);
      setOtpCode("");
      setOtpEmail("");
      setOtpLoading("idle");
      setOtpMethod("resend");
    }
  }, [email, otpEmail, otpRequested]);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmail(val);
    setSignupEmailError(null);
    
    if (!aiGuessedCompany && companyName.length > 0) return;
    if (!aiGuessedWebsite && websiteUrl.length > 0) return;
    
    const parts = val.split('@');
    if (parts.length === 2 && parts[1].includes('.')) {
      const domain = parts[1];
      const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'me.com', 'mac.com'];
      if (!genericDomains.includes(domain.toLowerCase()) && domain.length > 3) {
        const namePart = domain.split('.')[0];
        const guessedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        
        if (!companyName || aiGuessedCompany) {
           setCompanyName(guessedName);
           setAiGuessedCompany(true);
        }
        if (!websiteUrl || aiGuessedWebsite) {
           setWebsiteUrl(`https://${domain}`);
           setAiGuessedWebsite(true);
        }
      } else {
        if (aiGuessedCompany) { setCompanyName(""); setAiGuessedCompany(false); }
        if (aiGuessedWebsite) { setWebsiteUrl(""); setAiGuessedWebsite(false); }
      }
    } else {
      if (aiGuessedCompany) { setCompanyName(""); setAiGuessedCompany(false); }
      if (aiGuessedWebsite) { setWebsiteUrl(""); setAiGuessedWebsite(false); }
    }
  };

  const handleSignupEmailBlur = async () => {
    if (mode !== "signup" || !email.trim()) return;
    const result = await validateSignupEmail(email);
    setSignupEmailError(result.ok ? null : (result as { ok: false; message: string }).message);
  };

  const getOtpErrorMessage = (err: any) => {
    const message = err?.message || "";

    if (
      message.includes("Signups not allowed for otp") ||
      message.includes("User not found") ||
      message.includes("Invalid login credentials")
    ) {
      return "We couldn't find an account for that email.";
    }

    return message || "Failed to send one-time code.";
  };

  const handleSendOtp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

    if (!validEmail) {
      toast.error("Enter a valid email address to receive a one-time code.");
      return;
    }

    setOtpLoading("sending");
    try {
      const { data, error } = await supabase.functions.invoke("send-login-otp", {
        body: {
          email: trimmedEmail,
          redirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setOtpRequested(true);
      setOtpEmail(trimmedEmail);
      setOtpMethod("resend");
      setOtpCode("");
      toast.success("A one-time code has been sent to your email.");
    } catch (err: any) {
      const message = err?.message || "";
      const shouldFallback =
        message.includes("Failed to send a request to the Edge Function") ||
        message.includes("Failed to fetch") ||
        message.includes("FunctionsFetchError");

      if (!shouldFallback) {
        toast.error(getOtpErrorMessage(err));
        return;
      }

      try {
        const { error } = await supabase.auth.signInWithOtp({
          email: trimmedEmail,
          options: {
            shouldCreateUser: false,
          },
        });
        if (error) throw error;

        setOtpRequested(true);
        setOtpEmail(trimmedEmail);
        setOtpMethod("supabase");
        setOtpCode("");
        toast.success("A one-time code has been sent to your email.");
      } catch (fallbackErr: any) {
        toast.error(getOtpErrorMessage(fallbackErr));
      }
    } finally {
      setOtpLoading("idle");
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.trim().length !== 6) {
      toast.error("Enter the 6-digit code from your email.");
      return;
    }

    setOtpLoading("verifying");
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: otpEmail,
        token: otpCode.trim(),
        type: otpMethod === "resend" ? "magiclink" : "email",
      });
      if (error) throw error;

      toast.success("Signed in with one-time code.");
    } catch (err: any) {
      toast.error(err.message || "Invalid one-time code.");
    } finally {
      setOtpLoading("idle");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup") {
      const result = await validateSignupEmail(email);
      if (!result.ok) {
        setSignupEmailError((result as { ok: false; message: string }).message);
        return;
      }
      setSignupEmailError(null);
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              full_name: `${firstName} ${lastName}`.trim()
            }
          }
        });
        if (error) throw error;
        
        if (companyName || websiteUrl) {
          const aiGuessed: string[] = [];
          if (aiGuessedCompany) aiGuessed.push('companyName');
          if (aiGuessedWebsite) aiGuessed.push('websiteUrl');
          localStorage.setItem("pending-company-seed", JSON.stringify({
            companyName: companyName,
            websiteUrl: websiteUrl,
            aiGuessed: aiGuessed
          }));
        }
        
        toast.success("Account created! Let's set up your profile.");
        navigate("/onboarding", { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate("/", { replace: true });
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const oauthRedirect = `${window.location.origin}/auth`;

  const handleGoogleSignIn = async () => {
    try {
      const { lovable } = await import("@/integrations/lovable/index");
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "Google sign-in failed");
    }
  };

  const handleLinkedInSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "linkedin_oidc",
        options: { redirectTo: oauthRedirect },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "LinkedIn sign-in failed");
    }
  };

  const handleXSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "twitter",
        options: { redirectTo: oauthRedirect },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "X sign-in failed");
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const inputBase =
    "h-10 w-full rounded-md border bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.98),_rgba(244,244,245,0.92)_45%,_rgba(228,228,231,0.82)_100%)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl overflow-hidden rounded-[32px] border border-zinc-200/80 bg-white shadow-[0_30px_120px_rgba(15,23,42,0.12)]">
        <div className="w-full lg:w-[460px] lg:border-r lg:border-zinc-200/80 xl:w-[520px]">
          <div className="font-clash flex h-full flex-col justify-center px-8 py-8 sm:px-10 lg:px-12">
        <div className="mb-8 flex flex-col items-start gap-4">
          <BrandLogo
            variant="black"
            className="w-[132px] sm:w-[148px]"
          />
        </div>

        {mode === "signup" ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Create your account
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Get started in a few steps. You can also continue with Google, LinkedIn, or X.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Sign in</h1>
            <p className="mt-2 text-sm text-zinc-500">Sign in to your command center</p>
          </>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {mode === "signup" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="auth-first-name" className="text-zinc-700">
                  First name
                </Label>
                <Input
                  id="auth-first-name"
                  type="text"
                  placeholder="Jane"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className={`${inputBase} border-zinc-300`}
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-last-name" className="text-zinc-700">
                  Last name
                </Label>
                <Input
                  id="auth-last-name"
                  type="text"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className={`${inputBase} border-zinc-300`}
                  autoComplete="family-name"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="auth-email" className="text-zinc-700">
              Email
            </Label>
            <Input
              id="auth-email"
              type="email"
              placeholder={mode === "signup" ? "you@company.com" : "you@company.com"}
              value={email}
              onChange={handleEmailChange}
              onBlur={mode === "signup" ? handleSignupEmailBlur : undefined}
              required
              aria-invalid={mode === "signup" && !!signupEmailError}
              className={`${inputBase} ${
                mode === "signup" && signupEmailError
                  ? "border-red-500 focus-visible:ring-red-500/20"
                  : "border-zinc-300"
              }`}
              autoComplete="email"
            />
            {mode === "signup" && signupEmailError ? (
              <p className="text-sm leading-snug text-red-600" role="alert">
                {signupEmailError}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-password" className="text-zinc-700">
              Password
            </Label>
            <Input
              id="auth-password"
              type="password"
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className={`${inputBase} border-zinc-300`}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>

          <Button
            type="submit"
            className="mt-2 h-11 w-full rounded-md bg-zinc-900 text-[15px] font-medium text-white hover:bg-zinc-800"
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "login" ? "Sign in" : "Continue"}
          </Button>

          {mode === "login" && (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOtpExpanded((prev) => !prev)}
                disabled={loading}
                className="h-11 w-full justify-between rounded-md border-zinc-300 bg-white px-4 text-zinc-900 hover:bg-zinc-100"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  {otpExpanded ? "One-time passcode" : "Use a one-time passcode"}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-zinc-500">
                  OTP
                </span>
              </Button>

              {otpExpanded && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
                  {!otpRequested ? (
                    <p className="text-sm leading-6 text-zinc-600">
                      We’ll send a 6-digit sign-in code to the email address above.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm leading-6 text-zinc-600">
                        Enter the 6-digit code sent to <span className="font-medium text-zinc-900">{otpEmail}</span>.
                      </p>
                      <InputOTP
                        maxLength={6}
                        value={otpCode}
                        onChange={setOtpCode}
                        containerClassName="mt-3 justify-start"
                      >
                        <InputOTPGroup>
                          <InputOTPSlot index={0} className="border-zinc-300 bg-white text-zinc-900" />
                          <InputOTPSlot index={1} className="border-zinc-300 bg-white text-zinc-900" />
                          <InputOTPSlot index={2} className="border-zinc-300 bg-white text-zinc-900" />
                          <InputOTPSlot index={3} className="border-zinc-300 bg-white text-zinc-900" />
                          <InputOTPSlot index={4} className="border-zinc-300 bg-white text-zinc-900" />
                          <InputOTPSlot index={5} className="border-zinc-300 bg-white text-zinc-900" />
                        </InputOTPGroup>
                      </InputOTP>
                    </>
                  )}
                  <div className="mt-3 flex items-stretch gap-2">
                    {otpRequested ? (
                      <Button
                        type="button"
                        onClick={handleVerifyOtp}
                        disabled={otpCode.length !== 6 || otpLoading !== "idle" || loading}
                        className="h-10 flex-1 rounded-md bg-zinc-900 text-white hover:bg-zinc-800"
                      >
                        {otpLoading === "verifying" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Verify code
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSendOtp}
                        disabled={otpLoading !== "idle" || loading}
                        className="h-10 min-w-0 flex-1 border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100"
                      >
                        {otpLoading === "sending" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Mail className="mr-2 h-4 w-4" />
                        )}
                        Email me a code
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setOtpExpanded(false);
                        setOtpRequested(false);
                        setOtpCode("");
                        setOtpEmail("");
                        setOtpMethod("resend");
                      }}
                      disabled={otpLoading !== "idle" || loading}
                      className="h-10 shrink-0 border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>

        <p className="mt-6 text-sm text-zinc-600">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900"
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-zinc-200" />
          </div>
          <div className="relative flex justify-center text-xs font-medium uppercase tracking-wide text-zinc-400">
            <span className="bg-white px-3">or</span>
          </div>
        </div>

        <div className="flex flex-row flex-nowrap gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            aria-label="Continue with Google"
            className="h-10 min-w-0 flex-1 border-zinc-300 bg-white px-2 text-zinc-800 hover:bg-zinc-50"
            onClick={handleGoogleSignIn}
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            <span className="ml-1.5 truncate text-xs sm:text-sm">Google</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Continue with LinkedIn"
            className="h-10 min-w-0 flex-1 border-zinc-300 bg-white px-2 text-zinc-800 hover:bg-zinc-50"
            onClick={handleLinkedInSignIn}
          >
            <svg className="h-4 w-4 shrink-0 text-[#0A66C2]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            <span className="ml-1.5 truncate text-xs sm:text-sm">LinkedIn</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Continue with X"
            className="h-10 min-w-0 flex-1 border-zinc-300 bg-white px-2 text-zinc-800 hover:bg-zinc-50"
            onClick={handleXSignIn}
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span className="ml-1.5 truncate text-xs sm:text-sm">X</span>
          </Button>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-zinc-500">
          Our privacy standards are worldclass. Find them{" "}
          <a
            href="https://tryvekta.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900"
          >
            here
          </a>
          .
        </p>

        {mode === "signup" && (
          <p className="mt-4 text-xs leading-relaxed text-zinc-500">
            By signing up, you agree to our{" "}
            <a href="#" className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2">
              Services Agreement
            </a>{" "}
            and{" "}
            <a href="#" className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2">
              Data Agreement
            </a>
            .
          </p>
        )}
          </div>
        </div>

        <div className="relative hidden flex-1 overflow-hidden bg-zinc-950 lg:block">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          >
            <source src="/auth-wave.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(10,10,10,0.76)_0%,rgba(24,24,27,0.28)_42%,rgba(255,255,255,0.08)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_32%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.12),_transparent_38%)]" />

          <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/8 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
              Live Founder Signal
            </div>

            <div className="max-w-xl space-y-5">
              <p className="text-sm uppercase tracking-[0.34em] text-white/55">Founder Intelligence</p>
              <h2 className="text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
                A calm front door for a fast-moving fundraising system.
              </h2>
              <p className="max-w-lg text-base leading-7 text-white/72">
                Search, sync, and operate from a workspace that feels composed even while the market moves underneath it.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
