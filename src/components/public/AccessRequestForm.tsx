import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Check, Copy, Loader2 } from "lucide-react";
import { waitlistSignup, type WaitlistSignupPayload, type WaitlistSignupResponse } from "@/lib/waitlist";
import { normalizeLinkedInProfileUrl } from "@/lib/normalizeLinkedInProfileUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FormStatus = "idle" | "submitting" | "success" | "error";

const accessEmailSchema = z.string().trim().toLowerCase().email();

const EMAIL_FORMAT_INLINE = "You sure that's right?";

/** Dark field fill for /access form; light text for contrast on #242424. */
const ACCESS_FIELD_SURFACE =
  "border-zinc-600 bg-[#242424] text-zinc-100 placeholder:text-zinc-500 ring-offset-[#242424] focus-visible:border-zinc-500 focus-visible:ring-zinc-400/50";

const accessInputClassName = cn(ACCESS_FIELD_SURFACE, "md:text-sm");
const accessSelectClassName = cn(
  "flex h-10 w-full rounded-md px-3 py-2 text-sm",
  ACCESS_FIELD_SURFACE,
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
);
const accessTextareaClassName = cn(
  "w-full rounded-md px-3 py-2 text-sm",
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

const SHARE_ORIGIN = "https://vekta.so";

function vektaReferralShareUrl(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return SHARE_ORIGIN;
  return `${SHARE_ORIGIN}?ref=${encodeURIComponent(trimmed)}`;
}

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
    { value: "pre-seed", label: "Pre-seed" },
    { value: "seed", label: "Seed" },
    { value: "series-a-plus", label: "Series A+" },
  ],
  investor: [
    { value: "angel", label: "Angel" },
    { value: "pre-seed-seed", label: "Pre-seed / Seed" },
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

const PRIORITY_CHOICES: Record<AccessRole, { id: string; label: string }[]> = {
  founder: [
    { id: "find_investors", label: "Find investors" },
    { id: "get_warm_intros", label: "Get warm intros" },
    { id: "track_competitors", label: "Track competitors" },
    { id: "monitor_market_trends", label: "Monitor market trends" },
    { id: "build_relationships", label: "Build relationships" },
  ],
  investor: [
    { id: "source_deals", label: "Source deals" },
    { id: "find_founders", label: "Find founders" },
    { id: "track_markets", label: "Track markets" },
    { id: "monitor_sectors", label: "Monitor sectors" },
    { id: "build_relationships", label: "Build relationships" },
  ],
  operator: [
    { id: "find_opportunities", label: "Find opportunities" },
    { id: "track_companies", label: "Track companies" },
    { id: "build_relationships", label: "Build relationships" },
    { id: "monitor_markets", label: "Monitor markets" },
    { id: "get_warm_intros", label: "Get warm intros" },
  ],
  advisor: [
    { id: "find_founders", label: "Find founders" },
    { id: "get_warm_intros", label: "Get warm intros" },
    { id: "build_relationships", label: "Build relationships" },
    { id: "track_companies", label: "Track companies" },
    { id: "source_deals", label: "Source deals" },
  ],
  other: [
    { id: "build_relationships", label: "Build relationships" },
    { id: "explore_platform", label: "Explore the platform" },
    { id: "track_markets", label: "Track markets" },
    { id: "other", label: "Other" },
  ],
};

function priorityHelperCopy(role: AccessRole | ""): string {
  if (!role) return "Select your role, then choose at least one priority.";
  switch (role) {
    case "founder":
      return "Choose what matters most for your raise and execution right now.";
    case "investor":
      return "Choose what matters most for sourcing and portfolio work right now.";
    case "operator":
      return "Choose where you want leverage and signal across companies.";
    case "advisor":
      return "Choose how you prefer to add value and open doors.";
    case "other":
      return "Choose what you’re most curious about on Vekta.";
    default:
      return "Select at least one.";
  }
}

function buildMetadata(params: {
  firstName: string;
  lastName: string;
  pathname: string;
  referralFromUrl: string | null;
  priorityAccess: boolean | null;
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
  if (params.referralFromUrl) meta.referral_code_used = params.referralFromUrl;
  if (params.priorityAccess === true || params.priorityAccess === false) {
    meta.priority_access_requested = params.priorityAccess;
  }
  return meta;
}

function combineName(first: string, last: string): string {
  return [first.trim(), last.trim()].filter(Boolean).join(" ");
}

function stageFieldLabel(role: AccessRole | ""): string | null {
  if (!role || role === "other") return null;
  return role === "operator" || role === "advisor" ? "Role type" : "Stage";
}

function stagePlaceholder(role: AccessRole): string {
  return role === "operator" || role === "advisor" ? "Select role type" : "Select stage";
}

export function AccessRequestForm() {
  const [searchParams] = useSearchParams();
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
  const [intentSet, setIntentSet] = useState<Record<string, boolean>>({});
  const [biggestPain, setBiggestPain] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  /** Empty until user selects a radio (required). */
  const [priorityChoice, setPriorityChoice] = useState<"" | "yes" | "no" | "prefer_not">("");

  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);
  const [result, setResult] = useState<WaitlistSignupResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (!role) return;

    if (role === "other") {
      setStage("");
    } else {
      const opts = STAGE_CHOICES[role];
      setStage((prev) => (opts.some((o) => o.value === prev) ? prev : ""));
    }

    const allowedIds = new Set(PRIORITY_CHOICES[role].map((p) => p.id));
    setIntentSet((prev) => {
      const next: Record<string, boolean> = {};
      for (const [id, on] of Object.entries(prev)) {
        if (on && allowedIds.has(id)) next[id] = true;
      }
      return next;
    });
  }, [role]);

  const toggleIntent = (id: string) => {
    setIntentSet((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setEmailFieldError(null);

    if (!firstName.trim()) {
      setErrorMessage("Please enter your first name.");
      setStatus("error");
      return;
    }
    if (!lastName.trim()) {
      setErrorMessage("Please enter your last name.");
      setStatus("error");
      return;
    }
    if (!email.trim()) {
      setEmailFieldError(null);
      setErrorMessage("Please enter your email.");
      setStatus("error");
      return;
    }
    const emailParsed = accessEmailSchema.safeParse(email);
    if (!emailParsed.success) {
      setEmailFieldError(EMAIL_FORMAT_INLINE);
      setStatus("error");
      return;
    }
    const emailNorm = emailParsed.data;
    if (!role) {
      setErrorMessage("Please select your role.");
      setStatus("error");
      return;
    }
    if (role !== "other" && !stage.trim()) {
      const kind = role === "operator" || role === "advisor" ? "role type" : "stage";
      setErrorMessage(`Please select your ${kind}.`);
      setStatus("error");
      return;
    }
    const intent = PRIORITY_CHOICES[role as AccessRole].filter((p) => intentSet[p.id]).map((p) => p.id);
    if (intent.length === 0) {
      setErrorMessage("Please select at least one priority.");
      setStatus("error");
      return;
    }
    if (!companyName.trim()) {
      setErrorMessage("Please enter your company name or website.");
      setStatus("error");
      return;
    }
    if (!linkedinUrl.trim()) {
      setErrorMessage("Please enter your LinkedIn URL.");
      setStatus("error");
      return;
    }
    const linkedinNormalized = normalizeLinkedInProfileUrl(linkedinUrl);
    const linkedinOk =
      linkedinNormalized.includes("linkedin.com/in/") || linkedinNormalized.includes("linkedin.com/company/");
    if (!linkedinOk) {
      setErrorMessage("Please enter a valid LinkedIn profile URL, path, or handle.");
      setStatus("error");
      return;
    }
    setLinkedinUrl(linkedinNormalized);
    if (!priorityChoice) {
      setErrorMessage("Please answer priority access.");
      setStatus("error");
      return;
    }

    const pathname = typeof window !== "undefined" ? window.location.pathname : "/access";
    const priorityAccess: boolean | null =
      priorityChoice === "yes" ? true : priorityChoice === "no" ? false : null;

    const payload: WaitlistSignupPayload = {
      email: emailNorm,
      name: combineName(firstName, lastName) || undefined,
      role: role as WaitlistSignupPayload["role"],
      ...(role !== "other" && stage.trim() ? { stage: stage.trim() } : {}),
      intent,
      ...(biggestPain.trim() ? { biggest_pain: biggestPain.trim() } : {}),
      company_name: companyName.trim(),
      linkedin_url: linkedinNormalized,
      source: "access_page",
      campaign: "access_page_v1",
      ...(referralFromUrl ? { referral_code: referralFromUrl } : {}),
      metadata: buildMetadata({
        firstName,
        lastName,
        pathname,
        referralFromUrl,
        priorityAccess,
      }),
    };

    setStatus("submitting");
    try {
      const data = await waitlistSignup(payload);
      setResult(data);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  const shareUrl = result?.referral_code ? vektaReferralShareUrl(result.referral_code) : "";

  const copyReferralLink = useCallback(async () => {
    if (!shareUrl) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }, [shareUrl]);

  if (status === "success" && result) {
    const positionLabel =
      result.waitlist_position != null ? `#${result.waitlist_position}` : "We’ll email you with your position soon.";

    return (
      <div className={ACCESS_FORM_CARD_CLASS}>
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">You’re on the list</h2>
          <p className="mt-2 text-sm text-[#b3b3b3]">
            Thanks{firstName.trim() ? `, ${firstName.trim()}` : ""}. We’ve saved your request and will follow up by email.
          </p>

          <dl className="mt-8 space-y-4 rounded-xl border border-zinc-800 bg-[#121212] px-4 py-5 text-left text-sm">
            <div className="flex flex-col gap-1">
              <dt className="text-2xs font-medium uppercase tracking-wide text-[#b3b3b3]">Waitlist position</dt>
              <dd className="text-lg font-semibold text-zinc-100">{positionLabel}</dd>
            </div>
            {shareUrl ? (
              <div className="flex flex-col gap-2">
                <dt className="text-2xs font-medium uppercase tracking-wide text-[#b3b3b3]">Your referral link</dt>
                <dd className="break-all rounded-lg border border-zinc-700 bg-[#242424] px-3 py-2 font-mono text-xs text-zinc-100">
                  {shareUrl}
                </dd>
                <Button type="button" variant="outline" size="sm" className="w-fit gap-2" onClick={copyReferralLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
                {copyFailed ? (
                  <p className={cn("text-2xs", accessInlineHighlightClass)}>Could not copy — select the link and copy manually.</p>
                ) : null}
              </div>
            ) : null}
          </dl>

          <p className="mt-6 text-xs leading-relaxed text-[#b3b3b3]">
            Share your link with founders and investors who should be on Vekta. Referrals help us prioritize access for
            people you trust.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={ACCESS_FORM_CARD_CLASS}>
      <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-5">
        {errorMessage && status === "error" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-1">
            <label className={accessLabelClass} htmlFor="access-first">
              First name <span className={accessInlineHighlightClass}>*</span>
            </label>
            <Input
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
            id="access-email"
            className={accessInputClassName}
            type="email"
            inputMode="email"
            autoComplete="email"
            aria-invalid={emailFieldError ? true : undefined}
            aria-describedby={emailFieldError ? "access-email-error" : undefined}
            title="Enter a valid email (e.g. name@company.com)"
            pattern="[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+"
            value={email}
            onChange={(e) => {
              const v = e.target.value;
              setEmail(v);
              if (emailFieldError && accessEmailSchema.safeParse(v).success) {
                setEmailFieldError(null);
              }
            }}
            onBlur={() => {
              const v = email.trim();
              if (!v) {
                setEmailFieldError(null);
                return;
              }
              if (!accessEmailSchema.safeParse(email).success) {
                setEmailFieldError(EMAIL_FORMAT_INLINE);
              } else {
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
        </div>

        <div className="space-y-2">
          <label className={accessLabelClass} htmlFor="access-role">
            Role <span className={accessInlineHighlightClass}>*</span>
          </label>
          <select
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

        {role && role !== "other" ? (
          <div className="space-y-2">
            <label className={accessLabelClass} htmlFor="access-stage">
              {stageFieldLabel(role)} <span className={accessInlineHighlightClass}>*</span>
            </label>
            <select
              id="access-stage"
              className={accessSelectClassName}
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
        ) : null}

        {role ? (
          <fieldset className="space-y-2">
            <legend className={accessLabelClass}>
              Biggest priorities <span className={accessInlineHighlightClass}>*</span>
            </legend>
            <p className={accessHelperClass}>{priorityHelperCopy(role)}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRIORITY_CHOICES[role].map((p) => (
                <label key={p.id} className={accessChoiceLabelClass}>
                  <input
                    type="checkbox"
                    checked={Boolean(intentSet[p.id])}
                    onChange={() => toggleIntent(p.id)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="space-y-2">
          <label className={accessLabelClass} htmlFor="access-pain">
            Biggest pain / hardest part right now <span className="font-normal text-[#b3b3b3]/70">(optional)</span>
          </label>
          <textarea
            id="access-pain"
            rows={3}
            className={accessTextareaClassName}
            placeholder="A sentence is enough, if you’d like to share."
            value={biggestPain}
            onChange={(e) => setBiggestPain(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className={accessLabelClass} htmlFor="access-company">
            Company name or website <span className={accessInlineHighlightClass}>*</span>
          </label>
          <Input
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
          <label className={accessLabelClass} htmlFor="access-li">
            LinkedIn URL <span className={accessInlineHighlightClass}>*</span>
          </label>
          <Input
            id="access-li"
            className={accessInputClassName}
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="LinkedIn url or name"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            onBlur={() => setLinkedinUrl((v) => normalizeLinkedInProfileUrl(v))}
            required
          />
        </div>

        <fieldset className="space-y-2">
          <legend className={accessLabelClass}>
            Priority access <span className={accessInlineHighlightClass}>*</span>
          </legend>
          <p className={accessHelperClass}>Earlier access for an active raise or mandate.</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className={accessChoiceLabelClass}>
              <input
                type="radio"
                name="priority-access"
                required
                checked={priorityChoice === "yes"}
                onChange={() => setPriorityChoice("yes")}
              />
              Yes
            </label>
            <label className={accessChoiceLabelClass}>
              <input
                type="radio"
                name="priority-access"
                checked={priorityChoice === "no"}
                onChange={() => setPriorityChoice("no")}
              />
              No
            </label>
            <label className={accessChoiceLabelClass}>
              <input
                type="radio"
                name="priority-access"
                checked={priorityChoice === "prefer_not"}
                onChange={() => setPriorityChoice("prefer_not")}
              />
              Prefer not to say
            </label>
          </div>
        </fieldset>

        <Button type="submit" className="w-full" disabled={status === "submitting"}>
          {status === "submitting" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting…
            </>
          ) : (
            "Request access"
          )}
        </Button>
      </form>
    </div>
  );
}
