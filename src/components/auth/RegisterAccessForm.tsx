import { useState, type ElementType, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Lock, Mail, Shield, User } from "lucide-react";
import { GoogleGlyph, LinkedInGlyph } from "@/components/auth/oauthGlyphs";
import { useAuth, type OAuthProvider } from "@/hooks/useAuth";
import { saveRegistrationPrefill } from "@/lib/registrationPrefill";
import { waitlistSignup } from "@/lib/waitlist";
import { cn } from "@/lib/utils";

const inputClassName =
  "h-12 w-full border border-zinc-700 bg-[#121212] pl-10 pr-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400";

const inputPlainClassName =
  "h-12 w-full border border-zinc-700 bg-[#121212] px-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400";

const primaryButtonClassName =
  "inline-flex h-12 w-full items-center justify-center gap-2 bg-white px-4 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-70";

const labelClassName = "block text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500";

const oauthButtonClassName =
  "inline-flex h-12 w-full items-center justify-center gap-2.5 border border-zinc-700 bg-[#121212] px-4 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:border-zinc-500 hover:bg-[#161616] disabled:cursor-not-allowed disabled:opacity-70";

export type RegisterAccessFormProps = {
  source?: string;
  campaign?: string;
  headingAs?: ElementType;
  headingClassName?: string;
  idPrefix?: string;
  externalError?: string | null;
  onClearExternalError?: () => void;
  onSignInClick: () => void;
};

export function RegisterAccessForm({
  source = "register",
  campaign,
  headingAs: Heading = "h2",
  headingClassName,
  idPrefix = "register",
  externalError,
  onClearExternalError,
  onSignInClick,
}: RegisterAccessFormProps) {
  const { isConfigured, signInWithOAuth, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const errorMessage = localError ?? externalError ?? null;

  const clearErrors = () => {
    setLocalError(null);
    onClearExternalError?.();
  };

  const inboundReferralCode =
    searchParams.get("ref")?.trim() || searchParams.get("referral_code")?.trim() || undefined;

  const startOAuth = async (provider: OAuthProvider) => {
    clearErrors();
    setOauthLoading(provider);
    try {
      await signInWithOAuth(provider, {
        intent: "request-access",
        referralCode: inboundReferralCode,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : provider === "google"
            ? "Could not start Google sign-in."
            : "Could not start LinkedIn sign-in.";
      setLocalError(message);
      setOauthLoading(null);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError("Passwords do not match.");
      return;
    }
    clearErrors();
    setSubmitting(true);
    try {
      saveRegistrationPrefill({ firstName, lastName, email });
      await signUp({ email, password, firstName, lastName });
      const signupResult = await waitlistSignup({
        email,
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        source,
        campaign,
        referral_code: inboundReferralCode,
        metadata: { first_name: firstName.trim(), last_name: lastName.trim(), terms_accepted: true },
      });
      const referralCode = signupResult.referral_code?.trim() || "";
      const confirmationState = {
        email: email.trim().toLowerCase(),
        confirmationEmailSent: signupResult.confirmation_email_sent === true,
        referralCode,
        referralLink: referralCode
          ? `${window.location.origin}/register?ref=${encodeURIComponent(referralCode)}`
          : "",
      };
      try {
        window.sessionStorage.setItem("vekta.waitlistConfirmation", JSON.stringify(confirmationState));
      } catch {
        // Route state still carries the confirmation details when storage is unavailable.
      }
      navigate("/register/confirmation", {
        replace: true,
        state: confirmationState,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not submit your request. Please try again.";
      setLocalError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className="space-y-3 text-left">
        <Heading className={cn("text-3xl font-semibold tracking-tight text-white sm:text-4xl", headingClassName)}>
          Request access.
        </Heading>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
          Authentication temporarily unavailable
        </p>
        <div className="border border-zinc-800 bg-zinc-950/80 px-4 py-3">
          <p className="text-sm text-zinc-400">
            Supabase is not configured for this build, so the access request flow cannot start.
          </p>
        </div>
      </div>
    );
  }

  const busy = submitting || Boolean(oauthLoading);

  return (
    <div className="font-sans">
      <div className="space-y-2 text-left">
        <Heading className={cn("text-3xl font-semibold tracking-tight text-white sm:text-4xl", headingClassName)}>
          Request access.
        </Heading>
        <p className="text-sm text-zinc-500">Submit your details and the Vekta team will review your request.</p>
      </div>

      {errorMessage ? (
        <div className="mt-4 border border-red-900/60 bg-red-950/40 px-4 py-3 text-left">
          <p className="text-xs text-red-400">{errorMessage}</p>
        </div>
      ) : null}

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2 text-left">
            <label htmlFor={`${idPrefix}-first-name`} className={labelClassName}>
              First name
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                id={`${idPrefix}-first-name`}
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
            <label htmlFor={`${idPrefix}-last-name`} className={labelClassName}>
              Last name
            </label>
            <input
              id={`${idPrefix}-last-name`}
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
          <label htmlFor={`${idPrefix}-email`} className={labelClassName}>
            Email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              id={`${idPrefix}-email`}
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
          <label htmlFor={`${idPrefix}-password`} className={labelClassName}>
            Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              id={`${idPrefix}-password`}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              className={inputClassName}
              minLength={8}
              required
            />
          </div>
        </div>

        <div className="space-y-2 text-left">
          <label htmlFor={`${idPrefix}-confirm-password`} className={labelClassName}>
            Confirm password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              id={`${idPrefix}-confirm-password`}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm password"
              className={inputClassName}
              minLength={8}
              required
            />
          </div>
        </div>

        <div className="flex items-center gap-3 text-left">
          <input
            id={`${idPrefix}-accept-terms`}
            type="checkbox"
            checked={acceptedTerms}
            onChange={(event) => setAcceptedTerms(event.target.checked)}
            className="h-5 w-5 shrink-0 cursor-pointer accent-white"
            required
          />
          <label htmlFor={`${idPrefix}-accept-terms`} className="text-sm text-zinc-400">
            I agree to the{" "}
            <a
              href="https://tryvekta.com/terms-of-service"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-200 underline decoration-zinc-500 underline-offset-2 transition hover:text-white"
            >
              Terms of Service.
            </a>
          </label>
        </div>

        <button type="submit" className={primaryButtonClassName} disabled={busy || !acceptedTerms}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting request...
            </>
          ) : (
            <>
              <Shield className="h-3.5 w-3.5" aria-hidden />
              Request access
            </>
          )}
        </button>
      </form>

      <div className="mt-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">Or</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>
        <button type="button" disabled={busy} onClick={() => void startOAuth("google")} className={oauthButtonClassName}>
          {oauthLoading === "google" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleGlyph className="h-4 w-4 shrink-0" />
          )}
          Request with Google
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void startOAuth("linkedin_oidc")}
          className={oauthButtonClassName}
        >
          {oauthLoading === "linkedin_oidc" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LinkedInGlyph className="h-4 w-4 shrink-0 text-[#0A66C2]" />
          )}
          Request with LinkedIn
        </button>
        <p className="pt-2 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <button type="button" onClick={onSignInClick} className="font-medium text-zinc-200 transition hover:text-white">
            Sign in.
          </button>
        </p>
      </div>
    </div>
  );
}
