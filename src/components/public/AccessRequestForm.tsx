import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { z } from "zod";
import {
  Check,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  FOUNDER_WAITLIST_SECTOR_OPTIONS,
  getFounderWaitlistSectorLabel,
  isFounderWaitlistSectorValue,
} from "@/config/founderWaitlistSector";
import { getFounderWaitlistSectorSignalHint } from "@/config/founderWaitlistSectorSignals";
import { trackMixpanelEvent } from "@/lib/mixpanel";
import {
  waitlistSignup,
  type WaitlistSignupPayload,
  type WaitlistSignupResponse,
} from "@/lib/waitlist";
import { normalizeSocialProfileInput } from "@/lib/normalizeSocialProfileInput";
import { requestWaitlistConfirmationEmailStub } from "@/lib/waitlistConfirmationEmailStub";
import { resolvePublicReferralLink } from "@/lib/publicReferralLink";
import { trackWaitlistAnalytics } from "@/lib/waitlistAnalytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FormStatus = "idle" | "submitting" | "success" | "error";

const accessEmailSchema = z.string().trim().toLowerCase().email();

const EMAIL_FORMAT_INLINE = "You sure that's right?";

/** Informational only — never blocks submit. Exact domain match after valid email parse. */
const PERSONAL_EMAIL_HINT =
  "This works, but a work email improves your waitlist position.";
const SOCIAL_PROFILE_ERROR = "Enter a valid LinkedIn or X profile link, or an X @handle.";

const PERSONAL_EMAIL_DOMAINS = new Set(["gmail.com", "yahoo.com", "outlook.com"]);

function isLikelyPersonalEmail(raw: string): boolean {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return false;
  if (!accessEmailSchema.safeParse(trimmed).success) return false;
  const at = trimmed.lastIndexOf("@");
  if (at === -1) return false;
  const domain = trimmed.slice(at + 1);
  return PERSONAL_EMAIL_DOMAINS.has(domain);
}

/** Dark field fill for /access form; light text for contrast on #242424. */
const ACCESS_FIELD_SURFACE =
  "border-zinc-600 bg-[#242424] text-zinc-100 placeholder:text-zinc-500 ring-offset-[#242424] focus-visible:border-zinc-500 focus-visible:ring-zinc-400/50";

const accessInputClassName = cn(ACCESS_FIELD_SURFACE, "md:text-sm");
const accessSelectClassName = cn(
  "flex h-10 w-full rounded-md px-3 py-2 text-sm",
  ACCESS_FIELD_SURFACE,
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
);
const ACCESS_FORM_CARD_CLASS = cn(
  "rounded-2xl border border-zinc-800 bg-[#000000] shadow-lg shadow-black/50 backdrop-blur-sm",
  "p-6 sm:p-8",
);

const accessLabelClass = "text-xs font-medium text-[#b3b3b3]";
const accessHelperClass = "text-2xs text-[#b3b3b3]/85";
/** Required asterisks and field-level inline messages */
const accessInlineHighlightClass = "text-[#2EE6A6]";
const accessChoiceLabelClass = "flex cursor-pointer items-center gap-2 text-sm text-[#b3b3b3]";

const SECTOR_HELPER_COPY = "Used to personalize investor matches and market signals.";
const ACCESS_SUBMISSION_CACHE_KEY = "vekta_access_request_submission_v1";

type AccessRole = "founder" | "investor" | "operator" | "advisor" | "other";

const ROLE_OPTIONS: { value: AccessRole; label: string }[] = [
  { value: "founder", label: "Founder" },
  { value: "investor", label: "Investor" },
  { value: "operator", label: "Operator" },
  { value: "advisor", label: "Advisor" },
  { value: "other", label: "Other" },
];

const STAGE_CHOICES: Record<Exclude<AccessRole, "other">, { value: string; label: string }[]> = {
  founder: [
    { value: "idea", label: "Idea" },
    { value: "pre-seed", label: "Pre-Seed" },
    { value: "seed", label: "Seed" },
    { value: "series-a", label: "Series A" },
    { value: "series-b", label: "Series B" },
    { value: "series-c-plus", label: "Series C+" },
  ],
  investor: [
    { value: "angel", label: "Angel" },
    { value: "pre-seed", label: "Pre-Seed" },
    { value: "seed", label: "Seed" },
    { value: "series-a-plus", label: "Series A+" },
    { value: "multi-stage", label: "Multi-stage" },
  ],
  operator: [
    { value: "startup_operator", label: "Startup operator" },
    { value: "functional_leader", label: "Functional leader" },
    { value: "advisor_consultant", label: "Advisor / consultant" },
    { value: "other", label: "Other" },
  ],
  advisor: [
    { value: "advisor_consultant", label: "Advisor / consultant" },
    { value: "fractional_operator", label: "Fractional operator" },
    { value: "scout_platform", label: "Scout / platform" },
    { value: "other", label: "Other" },
  ],
};

function buildMetadata(params: {
  firstName: string;
  lastName: string;
  pathname: string;
  referralFromUrl: string | null;
  customSector?: string;
  investor_stages?: string[];
  socialProfilePlatform?: string;
}): Record<string, unknown> {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const sp = new URLSearchParams(search);
  const utm_source = sp.get("utm_source") ?? undefined;
  const utm_medium = sp.get("utm_medium") ?? undefined;
  const utm_campaign = sp.get("utm_campaign") ?? undefined;

  const meta: Record<string, unknown> = {
    pathname: params.pathname,
    first_name: params.firstName.trim(),
    last_name: params.lastName.trim(),
  };
  if (utm_source) meta.utm_source = utm_source;
  if (utm_medium) meta.utm_medium = utm_medium;
  if (utm_campaign) meta.utm_campaign = utm_campaign;
  if (params.referralFromUrl) meta.referral_code = params.referralFromUrl;
  if (params.customSector?.trim()) meta.sector_other = params.customSector.trim();
  if (params.investor_stages?.length) meta.investor_stages = params.investor_stages;
  if (params.socialProfilePlatform) meta.social_profile_platform = params.socialProfilePlatform;
  return meta;
}

function buildReferralDashboardPath(part: {
  email?: string | null | undefined;
  referral_code?: string | null | undefined;
}): string {
  const params = new URLSearchParams();
  const code = typeof part.referral_code === "string" ? part.referral_code.trim() : "";
  const email = typeof part.email === "string" ? part.email.trim() : "";

  if (code) {
    params.set("ref", code.toUpperCase().replace(/\s+/g, ""));
  } else if (email) {
    params.set("email", email.toLowerCase());
  }

  const query = params.toString();
  return query ? `/referrals?${query}` : "/referrals";
}

function isWaitlistSignupResponse(value: unknown): value is WaitlistSignupResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<WaitlistSignupResponse>;
  return (
    (response.status === "created" || response.status === "existing") &&
    typeof response.id === "string" &&
    typeof response.email === "string" &&
    typeof response.referral_code === "string"
  );
}

function readCachedAccessSubmission(): WaitlistSignupResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACCESS_SUBMISSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { result?: unknown };
    return isWaitlistSignupResponse(parsed.result) ? parsed.result : null;
  } catch {
    return null;
  }
}

function writeCachedAccessSubmission(result: WaitlistSignupResponse): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ACCESS_SUBMISSION_CACHE_KEY,
      JSON.stringify({
        saved_at: new Date().toISOString(),
        result,
      }),
    );
  } catch {
    // localStorage can be blocked in embedded/private contexts; the live submit still succeeds.
  }
}

function combineName(first: string, last: string): string {
  return [first.trim(), last.trim()].filter(Boolean).join(" ");
}

function founderSectorDisplayLabel(slug: string, customSector: string): string | null {
  const value = slug.trim();
  if (!value) return null;
  if (value === "other") return customSector.trim() || "your sector";
  return getFounderWaitlistSectorLabel(value);
}

function stageFieldLabel(role: AccessRole | ""): string | null {
  if (!role || role === "other") return null;
  return "Stage";
}

function stagePlaceholder(role: AccessRole): string {
  return "Select stage";
}

export function AccessRequestForm() {
  const [searchParams] = useSearchParams();
  const cachedSubmission = useMemo(() => readCachedAccessSubmission(), []);
  const referralFromUrl = useMemo(() => {
    const ref = searchParams.get("ref")?.trim();
    if (ref) return ref;
    return searchParams.get("referral_code")?.trim() || null;
  }, [searchParams]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccessRole | "">("");
  const [stage, setStage] = useState("");
  /** Investor stage focus — multi-select (keys are STAGE_CHOICES.investor values). */
  const [investorStages, setInvestorStages] = useState<Record<string, boolean>>({});
  /** Canonical founder sector slug; cleared when stage/role hides the field. */
  const [sector, setSector] = useState("");
  const [customSector, setCustomSector] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [socialProfileInput, setSocialProfileInput] = useState("");
  const [socialProfileError, setSocialProfileError] = useState<string | null>(null);

  const [status, setStatus] = useState<FormStatus>(() => (cachedSubmission ? "success" : "idle"));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);
  const [emailAlreadyRegistered, setEmailAlreadyRegistered] = useState(false);
  const [result, setResult] = useState<WaitlistSignupResponse | null>(() => cachedSubmission);

  const reduceMotion = useReducedMotion();
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const roleSelectRef = useRef<HTMLSelectElement>(null);
  const stageSelectRef = useRef<HTMLSelectElement>(null);
  const customSectorRef = useRef<HTMLInputElement>(null);
  const firstInvestorStageRef = useRef<HTMLInputElement>(null);
  const companyNameRef = useRef<HTMLInputElement>(null);
  const socialProfileRef = useRef<HTMLInputElement>(null);
  const sectorSectionRef = useRef<HTMLDivElement>(null);
  const sectorSelectRef = useRef<HTMLSelectElement>(null);
  const sectorWasVisibleRef = useRef(false);

  const signupSuccessAnalyticsFiredForId = useRef<string | null>(
    cachedSubmission ? `${cachedSubmission.status}:${cachedSubmission.id}` : null,
  );
  const referralVisitTrackedRef = useRef(false);

  const referralLink = useMemo(() => resolvePublicReferralLink(result ?? {}), [result]);

  const showPersonalEmailHint = useMemo(() => isLikelyPersonalEmail(email), [email]);
  const normalizedSocialProfile = useMemo(
    () => normalizeSocialProfileInput(socialProfileInput),
    [socialProfileInput],
  );
  const showSocialProfileAccepted = Boolean(socialProfileInput.trim() && normalizedSocialProfile && !socialProfileError);

  const emailAriaDescribedBy = useMemo(() => {
    const ids: string[] = [];
    if (emailFieldError) ids.push("access-email-error");
    if (!emailFieldError && showPersonalEmailHint) ids.push("access-email-personal-hint");
    if (emailAlreadyRegistered) ids.push("access-email-existing");
    return ids.length ? ids.join(" ") : undefined;
  }, [emailFieldError, showPersonalEmailHint, emailAlreadyRegistered]);

  const socialProfileAriaDescribedBy = useMemo(() => {
    const ids = ["access-social-helper"];
    if (socialProfileError) ids.push("access-social-error");
    else if (showSocialProfileAccepted) ids.push("access-social-success");
    return ids.join(" ");
  }, [socialProfileError, showSocialProfileAccepted]);

  useEffect(() => {
    if (referralVisitTrackedRef.current) return;
    const refParam =
      searchParams.get("ref")?.trim() || searchParams.get("referral_code")?.trim() || null;
    if (!refParam) return;
    referralVisitTrackedRef.current = true;
    trackWaitlistAnalytics("referral_visit", {
      ref_code: refParam,
      path: typeof window !== "undefined" ? window.location.pathname : "/access",
    });
  }, [searchParams]);

  useEffect(() => {
    if (!role) return;

    if (role === "other" || role === "operator" || role === "advisor") {
      setStage("");
      setInvestorStages({});
    } else if (role === "investor") {
      setStage("");
    } else {
      setInvestorStages({});
      const opts = STAGE_CHOICES[role];
      setStage((prev) => (opts.some((o) => o.value === prev) ? prev : ""));
    }

  }, [role]);

  useEffect(() => {
    if (role !== "founder" || !stage.trim()) {
      setSector("");
      setCustomSector("");
    }
  }, [role, stage]);

  useEffect(() => {
    if (sector !== "other") {
      setCustomSector("");
    }
  }, [sector]);

  useEffect(() => {
    const showSector = role === "founder" && !!stage.trim();
    const appeared = showSector && !sectorWasVisibleRef.current;
    sectorWasVisibleRef.current = showSector;
    if (!appeared) return;

    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        sectorSectionRef.current?.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "nearest",
          inline: "nearest",
        });
        sectorSelectRef.current?.focus({ preventScroll: true });
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [role, stage, reduceMotion]);

  useEffect(() => {
    if (status !== "success" || !result?.id) return;
    const analyticsKey = `${result.status}:${result.id}`;
    if (signupSuccessAnalyticsFiredForId.current === analyticsKey) return;
    signupSuccessAnalyticsFiredForId.current = analyticsKey;
    trackWaitlistAnalytics(
      result.status === "existing" ? "waitlist_signup_existing" : "waitlist_signup_success",
      {
        signup_id: result.id,
        waitlist_position: result.waitlist_position ?? null,
        referral_count:
          typeof result.referral_count === "number" ? result.referral_count : undefined,
        total_score: typeof result.total_score === "number" ? result.total_score : undefined,
        has_referral_link: Boolean(referralLink),
        role: role || undefined,
      },
    );
    if (result.status === "created") {
      requestWaitlistConfirmationEmailStub({
        email: result.email,
        waitlist_position: result.waitlist_position,
        referral_link: referralLink,
      });
    }
  }, [status, result, referralLink, role]);

  const founderEarlyAccessCta =
    role === "founder" && !!sector.trim() && isFounderWaitlistSectorValue(sector.trim());
  const selectedFounderSectorLabel =
    role === "founder" ? founderSectorDisplayLabel(sector, customSector) : null;

  const toggleInvestorStage = (value: string) => {
    setInvestorStages((prev) => ({ ...prev, [value]: !prev[value] }));
  };

  const focusAndScrollField = (node: HTMLElement | null) => {
    if (!node) return;
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        node.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "center",
          inline: "nearest",
        });
        node.focus({ preventScroll: true });
      }, 0);
    });
  };

  const stopForField = (message: string, node: HTMLElement | null) => {
    setErrorMessage(message);
    setStatus("error");
    focusAndScrollField(node);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setEmailFieldError(null);
    setSocialProfileError(null);

    if (!firstName.trim()) {
      stopForField("Please enter your first name.", firstNameRef.current);
      return;
    }
    if (!lastName.trim()) {
      stopForField("Please enter your last name.", lastNameRef.current);
      return;
    }
    if (!email.trim()) {
      setEmailFieldError(null);
      stopForField("Please enter your email.", emailRef.current);
      return;
    }
    const emailParsed = accessEmailSchema.safeParse(email);
    if (!emailParsed.success) {
      setEmailFieldError(EMAIL_FORMAT_INLINE);
      stopForField(EMAIL_FORMAT_INLINE, emailRef.current);
      return;
    }
    const emailNorm = emailParsed.data;
    if (!role) {
      stopForField("Please select your role.", roleSelectRef.current);
      return;
    }
    if (role !== "other" && role !== "operator" && role !== "advisor") {
      if (role === "investor") {
        const selectedInvestor = STAGE_CHOICES.investor.map((o) => o.value).filter((v) => investorStages[v]);
        if (selectedInvestor.length === 0) {
          stopForField("Please select at least one stage.", firstInvestorStageRef.current);
          return;
        }
      } else if (!stage.trim()) {
        stopForField("Please select your stage.", stageSelectRef.current);
        return;
      }
    }
    if (role === "founder" && sector.trim() && !isFounderWaitlistSectorValue(sector.trim())) {
      stopForField("Please select a valid sector.", sectorSelectRef.current);
      return;
    }
    if (role === "founder" && sector === "other" && !customSector.trim()) {
      stopForField("Please enter your sector.", customSectorRef.current);
      return;
    }
    if (!companyName.trim()) {
      stopForField(
        role === "investor"
          ? "Please enter your firm name or website."
          : "Please enter your company name or website.",
        companyNameRef.current,
      );
      return;
    }
    const socialProfile = normalizeSocialProfileInput(socialProfileInput);
    if (!socialProfile) {
      setSocialProfileError(SOCIAL_PROFILE_ERROR);
      stopForField(SOCIAL_PROFILE_ERROR, socialProfileRef.current);
      return;
    }
    setSocialProfileError(null);
    setSocialProfileInput(socialProfile.normalized);

    const pathname = typeof window !== "undefined" ? window.location.pathname : "/access";

    const investorStageList =
      role === "investor"
        ? STAGE_CHOICES.investor.map((o) => o.value).filter((v) => investorStages[v])
        : [];

    const payload: WaitlistSignupPayload = {
      email: emailNorm,
      name: combineName(firstName, lastName) || undefined,
      role: role as WaitlistSignupPayload["role"],
      ...(role !== "other" && role === "investor" && investorStageList.length > 0
        ? { stage: investorStageList.join(", ") }
        : role !== "other" && role !== "investor" && role !== "operator" && role !== "advisor" && stage.trim()
          ? { stage: stage.trim() }
          : {}),
      ...(role === "founder" && sector.trim() ? { sector: sector.trim() } : {}),
      company_name: companyName.trim(),
      linkedin_url: socialProfile.normalized,
      source: "access_page",
      campaign: "access_page_v1",
      ...(referralFromUrl ? { referral_code: referralFromUrl } : {}),
      metadata: buildMetadata({
        firstName,
        lastName,
        pathname,
        referralFromUrl,
        customSector: role === "founder" && sector === "other" ? customSector : undefined,
        socialProfilePlatform: socialProfile.platform,
        ...(role === "investor" && investorStageList.length > 0 ? { investor_stages: investorStageList } : {}),
      }),
    };

    setStatus("submitting");
    try {
      const data = await waitlistSignup(payload);
      writeCachedAccessSubmission(data);
      if (data.status === "existing") {
        setEmailAlreadyRegistered(true);
        setResult(data);
        setStatus("success");
        return;
      }
      setEmailAlreadyRegistered(false);
      setResult(data);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  if (status === "success" && result) {
    const referralDashboardTo = buildReferralDashboardPath(result);

    return (
      <div className={ACCESS_FORM_CARD_CLASS}>
        <div className="mx-auto max-w-md px-1 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-6 w-6" strokeWidth={2.5} />
          </div>

          <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-primary/95">
            Request received
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
            Form submitted
          </h2>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-[#b3b3b3]">
            Your request has been saved. You can view your waitlist position, referral link, and leaderboard details next.
          </p>

          <Button asChild size="lg" className="mt-7 w-full">
            <Link to={referralDashboardTo}>Check your leaderboard here</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={ACCESS_FORM_CARD_CLASS}>
      <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-5" noValidate>
        {errorMessage && status === "error" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {errorMessage}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-1">
            <label className={accessLabelClass} htmlFor="access-first">
              First name <span className={accessInlineHighlightClass}>*</span>
            </label>
            <Input
              ref={firstNameRef}
              id="access-first"
              className={accessInputClassName}
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <label className={accessLabelClass} htmlFor="access-last">
              Last name <span className={accessInlineHighlightClass}>*</span>
            </label>
            <Input
              ref={lastNameRef}
              id="access-last"
              className={accessInputClassName}
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className={accessLabelClass} htmlFor="access-email">
            Work email <span className={accessInlineHighlightClass}>*</span>
          </label>
          <Input
            ref={emailRef}
            id="access-email"
            className={accessInputClassName}
            type="email"
            inputMode="email"
            autoComplete="email"
            aria-invalid={emailFieldError ? true : undefined}
            aria-describedby={emailAriaDescribedBy}
            title="Enter a valid email (e.g. name@company.com)"
            value={email}
            onChange={(e) => {
              const v = e.target.value;
              setEmail(v);
              if (emailAlreadyRegistered) setEmailAlreadyRegistered(false);
              if (emailFieldError && (!v.trim() || accessEmailSchema.safeParse(v).success)) {
                setEmailFieldError(null);
              }
            }}
            required
          />
          {emailFieldError ? (
            <p id="access-email-error" className={cn("text-2xs", accessInlineHighlightClass)} role="alert">
              {emailFieldError}
            </p>
          ) : null}
          {!emailFieldError && showPersonalEmailHint ? (
            <p id="access-email-personal-hint" className={cn("text-2xs", accessInlineHighlightClass)} role="status">
              {PERSONAL_EMAIL_HINT}
            </p>
          ) : null}
          {emailAlreadyRegistered ? (
            <p id="access-email-existing" className="text-2xs text-[#b3b3b3]" role="status">
              Looks like you've already registered.{" "}
              <Link
                to={buildReferralDashboardPath({ email })}
                className={cn("underline underline-offset-2", accessInlineHighlightClass)}
              >
                Check your waitlist status here.
              </Link>
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className={accessLabelClass} htmlFor="access-role">
            Role <span className={accessInlineHighlightClass}>*</span>
          </label>
          <select
            ref={roleSelectRef}
            id="access-role"
            className={accessSelectClassName}
            value={role}
            onChange={(e) => setRole(e.target.value as AccessRole | "")}
            required
          >
            <option value="" disabled>
              Select role
            </option>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {role && role !== "other" && role !== "operator" && role !== "advisor" ? (
          <div className={cn("w-full", role === "founder" && "space-y-3")}>
            {role === "investor" ? (
              <fieldset className="space-y-2">
                <legend className={accessLabelClass}>
                  {stageFieldLabel(role)} <span className={accessInlineHighlightClass}>*</span>
                </legend>
                <p className={accessHelperClass}>Select all stages you deploy at.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {STAGE_CHOICES.investor.map((o) => (
                    <label key={o.value} className={accessChoiceLabelClass}>
                      <input
                        ref={o.value === STAGE_CHOICES.investor[0]?.value ? firstInvestorStageRef : undefined}
                        type="checkbox"
                        checked={Boolean(investorStages[o.value])}
                        onChange={() => toggleInvestorStage(o.value)}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <div className="space-y-2">
                <label className={accessLabelClass} htmlFor="access-stage">
                  {stageFieldLabel(role)} <span className={accessInlineHighlightClass}>*</span>
                </label>
                <select
                  ref={stageSelectRef}
                  id="access-stage"
                  className={cn(accessSelectClassName, "w-full")}
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    {stagePlaceholder(role)}
                  </option>
                  {STAGE_CHOICES[role].map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {role === "founder" && stage.trim() ? (
                <motion.div
                  key="access-sector-panel"
                  ref={sectorSectionRef}
                  initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    reduceMotion
                      ? { duration: 0.12 }
                      : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
                  }
                  className="space-y-2 border-t border-zinc-800/80 pt-3"
                >
                  <div className="space-y-1">
                    <label className={cn(accessLabelClass, "flex flex-wrap items-baseline gap-x-2 gap-y-0.5")} htmlFor="access-sector">
                      <span className="inline-flex items-center gap-1.5">
                        Sector
                        {founderEarlyAccessCta ? (
                          <CheckCircle2 className={cn("h-3.5 w-3.5 shrink-0", accessInlineHighlightClass)} strokeWidth={2} aria-hidden />
                        ) : null}
                      </span>
                      <span className="font-normal text-[#b3b3b3]/70">(optional)</span>
                    </label>
                    <p id="access-sector-helper" className={cn(accessHelperClass, "max-w-prose leading-snug")}>
                      {SECTOR_HELPER_COPY}
                    </p>
                  </div>
                  <select
                    ref={sectorSelectRef}
                    id="access-sector"
                    className={cn(
                      accessSelectClassName,
                      "w-full transition-[border-color,box-shadow] duration-150",
                      founderEarlyAccessCta && "border-primary/40 shadow-[0_0_0_1px_rgba(46,230,166,0.08)]",
                    )}
                    value={sector}
                    aria-describedby={
                      founderEarlyAccessCta
                        ? "access-sector-helper access-sector-reinforce access-sector-intel-hint"
                        : "access-sector-helper"
                    }
                    onChange={(e) => {
                      const next = e.target.value;
                      const from = sector || null;
                      const to = next || null;
                      if (from !== to) {
                        trackMixpanelEvent("access_waitlist_sector_changed", {
                          path: typeof window !== "undefined" ? window.location.pathname : "/access",
                          from_sector: from,
                          to_sector: to,
                        });
                      }
                      setSector(next);
                    }}
                  >
                    <option value="" disabled>
                      Select your sector
                    </option>
                    {FOUNDER_WAITLIST_SECTOR_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {sector === "other" ? (
                      <motion.div
                        key="access-sector-other"
                        initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: reduceMotion ? 0.01 : 0.16, ease: "easeOut" }}
                        className="space-y-2"
                      >
                        <label className={accessLabelClass} htmlFor="access-sector-other-input">
                          Your sector <span className={accessInlineHighlightClass}>*</span>
                        </label>
                        <Input
                          ref={customSectorRef}
                          id="access-sector-other-input"
                          className={accessInputClassName}
                          placeholder="Tell us your sector"
                          value={customSector}
                          onChange={(e) => setCustomSector(e.target.value)}
                          required
                        />
                      </motion.div>
                    ) : null}
                  {founderEarlyAccessCta ? (
                      <motion.div
                        key={sector.trim()}
                        role="status"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: reduceMotion ? 0.01 : 0.14 }}
                        className="space-y-1"
                      >
                        <p id="access-sector-reinforce" className="text-2xs leading-snug text-[#b3b3b3]/95">
                          We’ll tailor investor matches and market signals to{" "}
                          <span className={cn("font-medium", accessInlineHighlightClass)}>
                            {selectedFounderSectorLabel}
                          </span>
                          .
                        </p>
                        <motion.p
                          id="access-sector-intel-hint"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{
                            duration: reduceMotion ? 0.01 : 0.12,
                            delay: reduceMotion ? 0 : 0.04,
                          }}
                          className="text-[10px] leading-snug text-[#b3b3b3]/65 sm:text-[11px]"
                        >
                          {getFounderWaitlistSectorSignalHint(sector.trim())}
                        </motion.p>
                      </motion.div>
                    ) : null}
                </motion.div>
              ) : null}
          </div>
        ) : null}

        {role ? (
          <>
            <div className="space-y-2">
              <label className={accessLabelClass} htmlFor="access-company">
                {role === "investor" ? "Firm name or website" : "Company name or website"}{" "}
                <span className={accessInlineHighlightClass}>*</span>
              </label>
              <Input
                ref={companyNameRef}
                id="access-company"
                className={accessInputClassName}
                autoComplete="organization"
                placeholder="Acme Inc or acme.com"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className={accessLabelClass} htmlFor="access-social-profile">
                LinkedIn or X profile <span className={accessInlineHighlightClass}>*</span>
              </label>
              <Input
                ref={socialProfileRef}
                id="access-social-profile"
                className={cn(
                  accessInputClassName,
                  socialProfileError && "border-destructive/60 focus-visible:ring-destructive/40",
                  showSocialProfileAccepted && "border-primary/45 focus-visible:ring-primary/40",
                )}
                type="text"
                inputMode="url"
                autoComplete="url"
                placeholder="Paste profile link or @handle"
                value={socialProfileInput}
                aria-invalid={socialProfileError ? true : undefined}
                aria-describedby={socialProfileAriaDescribedBy}
                onChange={(e) => {
                  const next = e.target.value;
                  setSocialProfileInput(next);
                  if (socialProfileError && (!next.trim() || normalizeSocialProfileInput(next))) {
                    setSocialProfileError(null);
                  }
                }}
                required
              />
              <p id="access-social-helper" className={cn(accessHelperClass, "leading-snug")}>
                Use a LinkedIn/X URL or X handle. Example: linkedin.com/in/jane-doe or @janedoe
              </p>
              {socialProfileError ? (
                <p id="access-social-error" className="text-2xs text-destructive" role="alert">
                  {SOCIAL_PROFILE_ERROR}
                </p>
              ) : showSocialProfileAccepted ? (
                <p id="access-social-success" className={cn("text-2xs", accessInlineHighlightClass)} role="status">
                  Profile accepted
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        <Button type="submit" className="w-full touch-manipulation" disabled={status === "submitting"}>
          {status === "submitting" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting…
            </>
          ) : founderEarlyAccessCta ? (
            "Get early access"
          ) : (
            "Request access"
          )}
        </Button>
      </form>
    </div>
  );
}
