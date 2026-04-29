import { type SVGProps, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { z } from "zod";
import {
  Check,
  CheckCircle2,
  Copy,
  Facebook,
  Instagram,
  Linkedin,
  Loader2,
  Mail,
  Share2,
  Youtube,
} from "lucide-react";
import {
  FOUNDER_WAITLIST_SECTOR_OPTIONS,
  getFounderWaitlistSectorLabel,
  isFounderWaitlistSectorValue,
} from "@/config/founderWaitlistSector";
import { getFounderWaitlistSectorSignalHint } from "@/config/founderWaitlistSectorSignals";
import { FounderWaitlistSnapshotPanel } from "@/components/public/FounderWaitlistSnapshotPanel";
import { trackMixpanelEvent } from "@/lib/mixpanel";
import {
  fetchFounderWaitlistSnapshot,
  type FounderWaitlistSnapshot,
  waitlistSignup,
  type WaitlistSignupPayload,
  type WaitlistSignupResponse,
} from "@/lib/waitlist";
import { normalizeSocialProfileInput } from "@/lib/normalizeSocialProfileInput";
import { requestWaitlistConfirmationEmailStub } from "@/lib/waitlistConfirmationEmailStub";
import { referralShareOutlineButtonClass } from "@/lib/referralShareUi";
import { resolvePublicReferralLink } from "@/lib/publicReferralLink";
import { trackWaitlistAnalytics } from "@/lib/waitlistAnalytics";
import { useReferralShareActions } from "@/hooks/useReferralShareActions";
import { Button, buttonVariants } from "@/components/ui/button";
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

const SECTOR_HELPER_COPY = "Used to personalize investor matches and market signals.";

const SUCCESS_VALUE_PREVIEW_BULLETS = [
  "Relevant investors in your space",
  "Warm intro paths where they exist",
  "Real-time market signals",
] as const;

function DiscordLogoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" focusable="false" {...props}>
      <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.25-.194.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.548-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  );
}

function WhatsAppLogoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" focusable="false" {...props}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.58-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Zm-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884Zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.304-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function XLogoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" focusable="false" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

const WAITLIST_SOCIAL_ACTION_URLS = {
  linkedin: "https://www.linkedin.com/company/tryvekta",
  x: "https://x.com/vektaforall",
  instagram: "https://www.instagram.com/tryvekta",
  facebook: "https://www.facebook.com/tryvekta/",
  youtube: "https://www.youtube.com/@tryvekta",
  discord: "https://discord.com/invite/Xa87TYG8Q",
  whatsapp: "https://www.whatsapp.com/channel/0029VbC0Pfj8qJ02YTpCSf3D",
} as const;

const WAITLIST_SOCIAL_ACTIONS = [
  { id: "linkedin", points: 5, url: WAITLIST_SOCIAL_ACTION_URLS.linkedin, label: "Follow on LinkedIn", Icon: Linkedin },
  { id: "x", points: 5, url: WAITLIST_SOCIAL_ACTION_URLS.x, label: "Follow on X", Icon: XLogoIcon },
  { id: "instagram", points: 5, url: WAITLIST_SOCIAL_ACTION_URLS.instagram, label: "Follow on Instagram", Icon: Instagram },
  { id: "facebook", points: 5, url: WAITLIST_SOCIAL_ACTION_URLS.facebook, label: "Follow on Facebook", Icon: Facebook },
  { id: "youtube", points: 5, url: WAITLIST_SOCIAL_ACTION_URLS.youtube, label: "Subscribe on YouTube", Icon: Youtube },
  { id: "discord", points: 5, url: WAITLIST_SOCIAL_ACTION_URLS.discord, label: "Join Discord", Icon: DiscordLogoIcon },
  { id: "whatsapp", points: 5, url: WAITLIST_SOCIAL_ACTION_URLS.whatsapp, label: "Join WhatsApp", Icon: WhatsAppLogoIcon },
] as const;

type WaitlistSocialActionId = (typeof WAITLIST_SOCIAL_ACTIONS)[number]["id"];
type SocialPointBurst = { actionId: WaitlistSocialActionId; points: number; nonce: number };

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
  /** Investor stage focus — multi-select (keys are STAGE_CHOICES.investor values). */
  const [investorStages, setInvestorStages] = useState<Record<string, boolean>>({});
  /** Canonical founder sector slug; cleared when stage/role hides the field. */
  const [sector, setSector] = useState("");
  const [customSector, setCustomSector] = useState("");
  const [intentSet, setIntentSet] = useState<Record<string, boolean>>({});
  const [biggestPain, setBiggestPain] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [socialProfileInput, setSocialProfileInput] = useState("");
  const [socialProfileError, setSocialProfileError] = useState<string | null>(null);

  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);
  const [emailAlreadyRegistered, setEmailAlreadyRegistered] = useState(false);
  const [result, setResult] = useState<WaitlistSignupResponse | null>(null);
  const [completedSocialActions, setCompletedSocialActions] = useState<Record<WaitlistSocialActionId, boolean>>(
    {} as Record<WaitlistSocialActionId, boolean>,
  );
  const [scorePulseKey, setScorePulseKey] = useState(0);
  const [socialPointBurst, setSocialPointBurst] = useState<SocialPointBurst | null>(null);

  const reduceMotion = useReducedMotion();
  const sectorSectionRef = useRef<HTMLDivElement>(null);
  const sectorSelectRef = useRef<HTMLSelectElement>(null);
  const sectorWasVisibleRef = useRef(false);

  const [founderSnapshot, setFounderSnapshot] = useState<FounderWaitlistSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotFetchFailed, setSnapshotFetchFailed] = useState(false);
  const snapshotFetchedForSignupId = useRef<string | null>(null);
  const signupSuccessAnalyticsFiredForId = useRef<string | null>(null);
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

  const { copied, copyFailed, copyReferralLink, xIntentHref, mailtoHref } = useReferralShareActions(referralLink);

  const socialActionBonus = useMemo(
    () =>
      WAITLIST_SOCIAL_ACTIONS.reduce(
        (sum, action) => sum + (completedSocialActions[action.id] ? action.points : 0),
        0,
      ),
    [completedSocialActions],
  );

  const displayedScore =
    result && typeof result.total_score === "number" ? result.total_score + socialActionBonus : null;

  useEffect(() => {
    if (!socialPointBurst) return;
    const timeout = window.setTimeout(() => setSocialPointBurst(null), reduceMotion ? 450 : 950);
    return () => window.clearTimeout(timeout);
  }, [reduceMotion, socialPointBurst]);

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

    if (role === "other") {
      setStage("");
      setInvestorStages({});
    } else if (role === "investor") {
      setStage("");
    } else {
      setInvestorStages({});
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
    if (signupSuccessAnalyticsFiredForId.current === result.id) return;
    signupSuccessAnalyticsFiredForId.current = result.id;
    trackWaitlistAnalytics("waitlist_signup_success", {
      signup_id: result.id,
      waitlist_position: result.waitlist_position ?? null,
      referral_count:
        typeof result.referral_count === "number" ? result.referral_count : undefined,
      total_score: typeof result.total_score === "number" ? result.total_score : undefined,
      has_referral_link: Boolean(referralLink),
      role: role || undefined,
    });
    requestWaitlistConfirmationEmailStub({
      email: result.email,
      waitlist_position: result.waitlist_position,
      referral_link: referralLink,
    });
  }, [status, result, referralLink, role]);

  useEffect(() => {
    if (status !== "success" || !result?.id || role !== "founder") return;
    if (snapshotFetchedForSignupId.current === result.id) return;
    snapshotFetchedForSignupId.current = result.id;

    const pathname = typeof window !== "undefined" ? window.location.pathname : "/access";
    trackMixpanelEvent("snapshot_generation_started", {
      path: pathname,
      signup_id: result.id,
      sector: sector.trim() || undefined,
      stage: stage.trim() || undefined,
    });

    setSnapshotLoading(true);
    setSnapshotFetchFailed(false);
    fetchFounderWaitlistSnapshot({
      sector: sector.trim() || undefined,
      stage: stage.trim() || undefined,
    })
      .then((data) => {
        setFounderSnapshot(data);
        trackMixpanelEvent("snapshot_generation_succeeded", {
          path: pathname,
          signup_id: result.id,
          match_count: data.investorMatches?.length ?? 0,
        });
      })
      .catch((err) => {
        console.warn("[AccessRequestForm] fetchFounderWaitlistSnapshot failed", err);
        setSnapshotFetchFailed(true);
        trackMixpanelEvent("snapshot_generation_failed", { path: pathname, signup_id: result.id });
      })
      .finally(() => setSnapshotLoading(false));
  }, [status, result?.id, role, sector, stage]);

  const founderEarlyAccessCta =
    role === "founder" && !!sector.trim() && isFounderWaitlistSectorValue(sector.trim());

  const toggleIntent = (id: string) => {
    setIntentSet((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleInvestorStage = (value: string) => {
    setInvestorStages((prev) => ({ ...prev, [value]: !prev[value] }));
  };

  const completeSocialAction = (action: (typeof WAITLIST_SOCIAL_ACTIONS)[number]) => {
    if (completedSocialActions[action.id]) return;

    setCompletedSocialActions((prev) => ({ ...prev, [action.id]: true }));
    setScorePulseKey((prev) => prev + 1);
    setSocialPointBurst({ actionId: action.id, points: action.points, nonce: Date.now() });
    trackWaitlistAnalytics("waitlist_social_action_completed", {
      action_id: action.id,
      points: action.points,
      optimistic: true,
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setEmailFieldError(null);
    setSocialProfileError(null);

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
    if (role !== "other") {
      if (role === "investor") {
        const selectedInvestor = STAGE_CHOICES.investor.map((o) => o.value).filter((v) => investorStages[v]);
        if (selectedInvestor.length === 0) {
          setErrorMessage("Please select at least one stage.");
          setStatus("error");
          return;
        }
      } else if (!stage.trim()) {
        const kind = role === "operator" || role === "advisor" ? "role type" : "stage";
        setErrorMessage(`Please select your ${kind}.`);
        setStatus("error");
        return;
      }
    }
    if (role === "founder" && sector.trim() && !isFounderWaitlistSectorValue(sector.trim())) {
      setErrorMessage("Please select a valid sector.");
      setStatus("error");
      return;
    }
    if (role === "founder" && sector === "other" && !customSector.trim()) {
      setErrorMessage("Please enter your sector.");
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
      setErrorMessage(
        role === "investor"
          ? "Please enter your firm name or website."
          : "Please enter your company name or website.",
      );
      setStatus("error");
      return;
    }
    const socialProfile = normalizeSocialProfileInput(socialProfileInput);
    if (!socialProfile) {
      setSocialProfileError(SOCIAL_PROFILE_ERROR);
      setErrorMessage(SOCIAL_PROFILE_ERROR);
      setStatus("error");
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
        : role !== "other" && role !== "investor" && stage.trim()
          ? { stage: stage.trim() }
          : {}),
      ...(role === "founder" && sector.trim() ? { sector: sector.trim() } : {}),
      intent,
      ...(biggestPain.trim() ? { biggest_pain: biggestPain.trim() } : {}),
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
      if (data.status === "existing") {
        setEmailAlreadyRegistered(true);
        setStatus("idle");
        return;
      }
      setResult(data);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  if (status === "success" && result) {
    const submittedSectorSlug =
      role === "founder" && sector.trim() && isFounderWaitlistSectorValue(sector.trim()) ? sector.trim() : null;
    const submittedSectorLabel = submittedSectorSlug ? getFounderWaitlistSectorLabel(submittedSectorSlug) : null;
    const referralDashboardTo = buildReferralDashboardPath(result);

    return (
      <div className={ACCESS_FORM_CARD_CLASS}>
        <div className="mx-auto max-w-md px-1 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-6 w-6" strokeWidth={2.5} />
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">You’re on the waitlist</h2>

          <div className="mt-6 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#b3b3b3]">Your position</p>
            {result.waitlist_position != null ? (
              <p className="text-4xl font-bold tabular-nums tracking-tight text-zinc-50 sm:text-5xl">
                #{result.waitlist_position}
              </p>
            ) : (
              <p className="text-lg font-medium leading-snug text-zinc-200">We’re calculating your position</p>
            )}
          </div>

          <p className="mt-8 text-base font-semibold text-zinc-100">Move up the list by inviting others</p>

          <div className="mt-5 space-y-2 text-sm text-[#c4c4c4]">
            <p>
              Successful referrals:{" "}
              <span className="font-semibold text-zinc-100">
                {typeof result.referral_count === "number" ? result.referral_count : "—"}
              </span>
            </p>
            {displayedScore != null ? (
              <p>
                Score:{" "}
                <motion.span
                  key={scorePulseKey}
                  initial={reduceMotion ? false : { scale: 1, color: "#f4f4f5" }}
                  animate={reduceMotion ? undefined : { scale: [1, 1.12, 1], color: ["#f4f4f5", "#2EE6A6", "#f4f4f5"] }}
                  transition={{ duration: reduceMotion ? 0 : 0.45, ease: "easeOut" }}
                  className="inline-block font-semibold text-zinc-100"
                >
                  {displayedScore}
                </motion.span>
              </p>
            ) : null}
          </div>

          {referralLink ? (
            <div className="mt-8 space-y-4 rounded-xl border border-zinc-800 bg-[#121212] px-4 py-5 text-left">
              <p className="text-2xs font-medium uppercase tracking-wide text-[#b3b3b3]">Your referral link</p>
              <p className="break-all rounded-lg border border-zinc-700 bg-[#242424] px-3 py-2 font-mono text-xs leading-relaxed text-zinc-100">
                {referralLink}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  variant="default"
                  className="w-full gap-2 sm:min-w-[152px] sm:flex-1"
                  onClick={copyReferralLink}
                >
                  {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  {copied ? "Copied!" : "Copy link"}
                </Button>
                {xIntentHref ? (
                  <a
                    href={xIntentHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "lg" }),
                      "inline-flex h-11 w-full gap-2 text-sm font-medium no-underline sm:flex-1",
                      referralShareOutlineButtonClass,
                    )}
                    onClick={() => trackWaitlistAnalytics("referral_link_shared", { channel: "twitter" })}
                  >
                    <Share2 className="h-4 w-4 shrink-0" aria-hidden />
                    Share on X
                  </a>
                ) : null}
                {mailtoHref ? (
                  <a
                    href={mailtoHref}
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "lg" }),
                      "inline-flex h-11 w-full gap-2 text-sm font-medium no-underline sm:flex-1",
                      referralShareOutlineButtonClass,
                    )}
                    onClick={() => trackWaitlistAnalytics("referral_link_shared", { channel: "email" })}
                  >
                    <Mail className="h-4 w-4 shrink-0" aria-hidden />
                    Share via email
                  </a>
                ) : null}
              </div>
              {copyFailed ? (
                <p className={cn("text-2xs", accessInlineHighlightClass)}>
                  Could not copy — select the link and copy manually.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 rounded-xl border border-zinc-800 bg-[#121212] px-4 py-5 text-left shadow-lg shadow-black/30">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-100">Earn more points</p>
              <p className="text-2xs text-[#b3b3b3]">Get 5 points for each platform you follow.</p>
            </div>
            <div
              className="mt-4 grid w-full gap-1.5 sm:gap-2"
              style={{ gridTemplateColumns: `repeat(${WAITLIST_SOCIAL_ACTIONS.length}, minmax(0, 1fr))` }}
            >
              {WAITLIST_SOCIAL_ACTIONS.map((action) => {
                const completed = Boolean(completedSocialActions[action.id]);
                const Icon = action.Icon;
                const title = completed ? `${action.label} completed` : `${action.label} (+${action.points} pts)`;

                return (
                  <a
                    key={action.id}
                    href={action.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${action.label} in a new window for +${action.points} points${completed ? " — completed" : ""}`}
                    aria-disabled={completed}
                    title={title}
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "group relative aspect-square h-auto min-w-0 w-full rounded-lg border-zinc-800 bg-[#181818] p-0 text-zinc-200 no-underline transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-[#202020] hover:text-primary hover:shadow-lg hover:shadow-primary/10 focus-visible:ring-primary/40",
                      completed &&
                        "border-primary/25 bg-[rgba(46,230,166,0.07)] text-primary hover:translate-y-0 hover:border-primary/25 hover:bg-[rgba(46,230,166,0.07)] hover:shadow-none",
                    )}
                    onClick={() => completeSocialAction(action)}
                  >
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                    <AnimatePresence initial={false}>
                      {socialPointBurst?.actionId === action.id ? (
                        <motion.span
                          key={socialPointBurst.nonce}
                          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.85 }}
                          animate={
                            reduceMotion
                              ? { opacity: [0, 1, 0] }
                              : { opacity: [0, 1, 1, 0], y: [-2, -18, -24], scale: [0.9, 1.12, 1] }
                          }
                          exit={{ opacity: 0 }}
                          transition={{ duration: reduceMotion ? 0.45 : 0.85, ease: "easeOut" }}
                          className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/30 bg-[#0d1f18] px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary shadow-lg shadow-primary/20"
                        >
                          +{socialPointBurst.points}
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                    {completed ? (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-primary">
                        <Check className="h-2.5 w-2.5" aria-hidden />
                      </span>
                    ) : null}
                  </a>
                );
              })}
            </div>
          </div>

          <p className="mt-6 text-center">
            <Link
              to={referralDashboardTo}
              className="text-sm font-medium text-primary underline-offset-4 transition-colors hover:underline"
            >
              View your full referral dashboard
            </Link>
          </p>

          {role === "founder" ? (
            <>
              <p className="mt-10 text-pretty text-sm font-medium leading-relaxed text-zinc-200">
                Here’s a first look based on your stage and sector.
              </p>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-[#b3b3b3]">
                {submittedSectorLabel ? (
                  <>
                    We’ll send you tailored investor and market insights for{" "}
                    <span className={cn("font-medium", accessInlineHighlightClass)}>{submittedSectorLabel}</span>.
                  </>
                ) : (
                  "We’ll send you tailored investor and market insights based on your sector."
                )}
              </p>
              <div className="mt-6 text-left">
                <FounderWaitlistSnapshotPanel
                  loading={snapshotLoading}
                  snapshot={founderSnapshot}
                  fetchFailed={snapshotFetchFailed}
                  onMatchClick={(p) =>
                    trackMixpanelEvent("snapshot_match_clicked", {
                      path: typeof window !== "undefined" ? window.location.pathname : "/access",
                      firm_name: p.firmName,
                      has_url: Boolean(p.url),
                    })
                  }
                />
              </div>
            </>
          ) : (
            <p className="mt-10 text-pretty text-sm leading-relaxed text-[#b3b3b3]">
              We’ve saved your request and will follow up by email.
            </p>
          )}

          <div className="mt-8 rounded-xl border border-zinc-800/90 bg-[#121212]/80 px-4 py-4 text-left">
            <p className="text-2xs font-medium uppercase tracking-wide text-[#b3b3b3]">What you’ll get</p>
            <ul className="mt-2 space-y-1.5 text-sm text-[#c4c4c4]">
              {SUCCESS_VALUE_PREVIEW_BULLETS.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/80" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
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
            aria-describedby={emailAriaDescribedBy}
            title="Enter a valid email (e.g. name@company.com)"
            value={email}
            onChange={(e) => {
              const v = e.target.value;
              setEmail(v);
              if (emailAlreadyRegistered) setEmailAlreadyRegistered(false);
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
                            {getFounderWaitlistSectorLabel(sector.trim())}
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

        {role ? (
          <>
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
                {role === "investor" ? "Firm name or website" : "Company name or website"}{" "}
                <span className={accessInlineHighlightClass}>*</span>
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
              <label className={accessLabelClass} htmlFor="access-social-profile">
                LinkedIn or X profile <span className={accessInlineHighlightClass}>*</span>
              </label>
              <Input
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
                  if (socialProfileError && normalizeSocialProfileInput(next)) {
                    setSocialProfileError(null);
                  }
                }}
                onBlur={() => {
                  const normalized = normalizeSocialProfileInput(socialProfileInput);
                  if (!normalized) {
                    setSocialProfileError(SOCIAL_PROFILE_ERROR);
                    return;
                  }
                  setSocialProfileInput(normalized.normalized);
                  setSocialProfileError(null);
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

        <Button type="submit" className="w-full" disabled={status === "submitting"}>
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
