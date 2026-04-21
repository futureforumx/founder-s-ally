import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, ChevronDown, Copy, Loader2, Mail, Share2, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { referralShareOutlineButtonClass } from "@/lib/referralShareUi";
import { PRODUCT_FEATURES_URL } from "@/lib/productLinks";
import { resolvePublicReferralLink } from "@/lib/publicReferralLink";
import { useReferralShareActions } from "@/hooks/useReferralShareActions";
import { trackWaitlistAnalytics } from "@/lib/waitlistAnalytics";
import { waitlistGetStatus, type WaitlistPathContext, type WaitlistStatusResponse } from "@/lib/waitlist";
import {
  computeWaitlistMovement,
  readWaitlistSnapshot,
  writeWaitlistSnapshot,
  waitlistIdentityKey,
  type WaitlistMovement,
} from "@/lib/waitlistMovement";
import {
  getPriorityAccessMotivationLines,
  getRankHeadline,
  getSpotsAheadLine,
  getUrgencyLine,
  getWaitlistBenefitCurrentBand,
  getWaitlistBenefitNextBand,
  getWaitlistBenefitTierRows,
  type PriorityMotivationLines,
  spotsToReachRank,
  summarizeDashboardStats,
} from "@/lib/waitlistDashboardMilestones";

const SHARE_YOUR_INVITE_SECTION_ID = "share-your-invite";

const shareSectionInviteLinkClass =
  "rounded-sm font-semibold text-primary underline-offset-2 outline-none transition-colors hover:text-primary/90 hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black";

const FIELD_SURFACE =
  "border-zinc-600 bg-[#242424] text-zinc-100 placeholder:text-zinc-500 ring-offset-[#242424] focus-visible:border-zinc-500 focus-visible:ring-zinc-400/50";

const inputClass = cn(FIELD_SURFACE, "h-11 w-full rounded-lg px-3.5 py-2 text-[0.9375rem] md:text-sm");

/** Lookup field only — purple focus ring + soft outer glow when focused */
const referralsLookupInputClass = cn(
  inputClass,
  "transition-[border-color,box-shadow,ring-color] duration-200 ease-out",
  "focus:border-purple-500/65 focus:outline-none focus:ring-2 focus:ring-purple-500/45 focus:ring-offset-2 focus:ring-offset-[#050505]",
  "focus:shadow-[0_0_26px_-4px_rgba(147,112,219,0.55),0_0_0_1px_rgba(147,112,219,0.25)]",
  "focus-visible:border-purple-500/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]",
  "focus-visible:shadow-[0_0_26px_-4px_rgba(147,112,219,0.55),0_0_0_1px_rgba(147,112,219,0.25)]",
);

const lookupCard = cn(
  "rounded-2xl border border-zinc-800/90 bg-[#050505]/90 shadow-xl shadow-black/40 backdrop-blur-sm",
  "px-5 py-7 sm:px-8 sm:py-8",
);

/** Tight points strip (sits under lookup summary) */
const compactMetricsCard = cn(
  "rounded-2xl border border-zinc-800/90 bg-[#050505]/90 shadow-md shadow-black/25 backdrop-blur-sm",
  "px-4 py-3 sm:px-5 sm:py-3",
);

const heroCard = cn(
  "rounded-2xl border border-zinc-700/50 bg-gradient-to-b from-zinc-900/80 via-[#080808] to-[#050505]",
  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]",
  "px-5 py-5 sm:px-7 sm:py-6",
);

const primaryCtaCard = cn(
  "rounded-2xl border border-primary/25 bg-[#0a0a0a]/95",
  "shadow-lg shadow-primary/10",
  "px-5 py-6 sm:px-7 sm:py-7",
);

const inviteCard = cn(
  "rounded-2xl border border-zinc-800/90 bg-[#080808]/95 shadow-xl shadow-black/50 backdrop-blur-sm",
  "ring-1 ring-inset ring-white/[0.04]",
  "px-5 py-7 sm:px-8 sm:py-8",
);

const explainerCard = cn(
  "rounded-xl border border-zinc-800/80 bg-[#0c0c0c]/90 px-4 py-5 sm:px-5",
);

const accent = "text-[#2EE6A6]";

/** Alternating copy-feedback lines after a successful clipboard write (no referral↔rank heuristics). */
const COPY_FEEDBACK_CUES = [
  "Link copied — share it now to move up",
  "Sharing updates your score and can move your spot",
] as const;

const COPY_FEEDBACK_CLEAR_MS = 4500;

/** Pull ?ref= / ?referral_code= from invite URLs (with or without https://). */
function extractReferralCodeFromUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.includes("@")) return null;
  const candidates = [t];
  if (!/^https?:\/\//i.test(t)) {
    candidates.push(`https://${t.replace(/^\/+/, "")}`);
  }
  for (const candidate of candidates) {
    try {
      const u = new URL(candidate);
      const ref =
        u.searchParams.get("ref")?.trim() || u.searchParams.get("referral_code")?.trim();
      if (ref) return ref.toUpperCase().replace(/\s+/g, "");
    } catch {
      continue;
    }
  }
  return null;
}

/** Email → lowercase; referral URL → code only; plain code → uppercase. */
function normalizeLookupQueryInput(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.includes("@")) return t.toLowerCase();
  const fromUrl = extractReferralCodeFromUrl(t);
  if (fromUrl) return fromUrl;
  return t.toUpperCase().replace(/\s+/g, "");
}

function parseLookupInput(raw: string): { email?: string; referral_code?: string } {
  const normalized = normalizeLookupQueryInput(raw);
  if (!normalized) return {};
  if (normalized.includes("@")) return { email: normalized };
  return { referral_code: normalized };
}

/** Single inline message for any lookup validation or API failure. */
const LOOKUP_INLINE_ERROR = "Please double check your code or email.";

/** Stable refetch payload from last successful status (email preferred when present). */
function waitlistLookupPayloadFromStatus(status: WaitlistStatusResponse): {
  email?: string;
  referral_code?: string;
} {
  const email = status.email?.trim();
  if (email) return { email: email.toLowerCase() };
  const code = status.referral_code?.trim();
  if (code) return { referral_code: code.toUpperCase().replace(/\s+/g, "") };
  return {};
}

const SILENT_REFRESH_POLL_MS = 45_000;

export function ReferralsPanel() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [status, setStatus] = useState<WaitlistStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** After a successful load, hide the large lookup form unless the user expands again. */
  const [lookupCollapsed, setLookupCollapsed] = useState(false);
  /** Background refresh (focus / polling / manual) — keeps dashboard mounted to avoid flicker. */
  const [silentRefreshing, setSilentRefreshing] = useState(false);
  const silentFetchInFlightRef = useRef(false);
  const statusRef = useRef<WaitlistStatusResponse | null>(null);
  const phaseRef = useRef<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const emailParam = searchParams.get("email")?.trim();
    const refParam = searchParams.get("ref")?.trim() || searchParams.get("referral_code")?.trim();
    if (emailParam) setQuery(emailParam);
    else if (refParam) setQuery(refParam);
  }, [searchParams]);

  useEffect(() => {
    if (phase === "success" && status) setLookupCollapsed(true);
  }, [phase, status]);

  useEffect(() => {
    if (phase === "error") setLookupCollapsed(false);
  }, [phase]);

  useEffect(() => {
    if (phase === "loading") setLookupCollapsed(false);
  }, [phase]);

  const referralLink = useMemo(() => resolvePublicReferralLink(status ?? {}), [status]);
  const { copied, copyFailed, copyReferralLink, xIntentHref, mailtoHref } =
    useReferralShareActions(referralLink);

  const [copyFeedbackLine, setCopyFeedbackLine] = useState<string | null>(null);
  const copyFeedbackCueRef = useRef(0);
  const copyFeedbackClearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyFeedbackClearTimerRef.current != null) window.clearTimeout(copyFeedbackClearTimerRef.current);
    };
  }, []);

  const executeStatusFetch = useCallback(
    async (parsed: { email?: string; referral_code?: string }, mode: "full" | "silent") => {
      if (!parsed.email && !parsed.referral_code) return;
      if (mode === "silent") {
        if (silentFetchInFlightRef.current) return;
        silentFetchInFlightRef.current = true;
        setSilentRefreshing(true);
      } else {
        setPhase("loading");
        setErrorMessage(null);
        setStatus(null);
      }

      try {
        const data = await waitlistGetStatus(parsed);
        setStatus(data);
        setPhase("success");
      } catch {
        if (mode === "full") {
          setStatus(null);
          setErrorMessage(LOOKUP_INLINE_ERROR);
          setPhase("error");
        } else {
          toast.error("Could not refresh status", { duration: 2800 });
        }
      } finally {
        if (mode === "silent") {
          silentFetchInFlightRef.current = false;
          setSilentRefreshing(false);
        }
      }
    },
    [],
  );

  const runLookup = useCallback(async () => {
    const parsed = parseLookupInput(query);
    if (!parsed.email && !parsed.referral_code) {
      setErrorMessage(LOOKUP_INLINE_ERROR);
      setPhase("error");
      return;
    }
    await executeStatusFetch(parsed, "full");
  }, [query, executeStatusFetch]);

  const refreshFromCurrentIdentity = useCallback(() => {
    const s = statusRef.current;
    if (!s || phaseRef.current !== "success") return;
    const payload = waitlistLookupPayloadFromStatus(s);
    if (!payload.email && !payload.referral_code) return;
    void executeStatusFetch(payload, "silent");
  }, [executeStatusFetch]);

  /** Tab focus — refresh when user returns after a successful load. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (phaseRef.current !== "success" || !statusRef.current) return;
      refreshFromCurrentIdentity();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refreshFromCurrentIdentity]);

  /** Lightweight polling while dashboard is open and tab visible. */
  useEffect(() => {
    if (phase !== "success" || status == null) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "hidden" && phaseRef.current === "success" && statusRef.current) {
        refreshFromCurrentIdentity();
      }
    }, SILENT_REFRESH_POLL_MS);
    return () => window.clearInterval(id);
  }, [phase, status, refreshFromCurrentIdentity]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runLookup();
  };

  const handleCopyInviteLink = useCallback(async () => {
    const ok = await copyReferralLink();
    if (!ok) return;
    const idx = copyFeedbackCueRef.current % COPY_FEEDBACK_CUES.length;
    copyFeedbackCueRef.current += 1;
    const msg = COPY_FEEDBACK_CUES[idx];
    setCopyFeedbackLine(msg);
    if (copyFeedbackClearTimerRef.current != null) window.clearTimeout(copyFeedbackClearTimerRef.current);
    copyFeedbackClearTimerRef.current = window.setTimeout(() => setCopyFeedbackLine(null), COPY_FEEDBACK_CLEAR_MS);
    toast.success("Copied", {
      description: msg,
      duration: 3200,
    });
  }, [copyReferralLink]);

  const dashboardLoaded = phase === "success" && status != null;
  const showCollapsedLookupBar = dashboardLoaded && lookupCollapsed;

  const lookupSummary =
    status?.email?.trim() || query.trim() || status?.referral_code?.trim() || "Your account";

  const waitlistIdentity = useMemo(
    () => (status ? waitlistIdentityKey(status) : ""),
    [status],
  );

  const rankCelebration = useMemo((): WaitlistMovement | null => {
    if (!status || !waitlistIdentity) return null;
    const prev = readWaitlistSnapshot(waitlistIdentity);
    const m = computeWaitlistMovement(prev, status);
    if (!m.shouldCelebrate || m.movedUpBy <= 0 || m.currentPosition == null) return null;
    return m;
  }, [status, waitlistIdentity]);

  useEffect(() => {
    if (!status || !waitlistIdentity) return;
    writeWaitlistSnapshot(waitlistIdentity, {
      waitlist_position: typeof status.waitlist_position === "number" ? status.waitlist_position : null,
      referral_count: typeof status.referral_count === "number" ? status.referral_count : 0,
    });
  }, [status, waitlistIdentity]);

  return (
    <div className="space-y-8">
      {showCollapsedLookupBar ? (
        <motion.section
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className={cn(lookupCard, "py-4 sm:px-6 sm:py-4")}
          aria-label="Lookup summary"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Dashboard loaded
              </p>
              <p className="mt-1 truncate text-sm font-medium text-zinc-100">{lookupSummary}</p>
              {silentRefreshing ? (
                <p className="mt-1.5 text-2xs font-medium text-zinc-500" aria-live="polite">
                  Updating…
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 justify-center px-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                disabled={silentRefreshing}
                onClick={() => refreshFromCurrentIdentity()}
              >
                {silentRefreshing ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                    Refreshing…
                  </>
                ) : (
                  "Refresh status"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 border-zinc-600 bg-zinc-900/50 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                disabled={silentRefreshing}
                onClick={() => setLookupCollapsed(false)}
              >
                Change email or code
              </Button>
            </div>
          </div>
        </motion.section>
      ) : (
        <section className={lookupCard} aria-labelledby="referrals-lookup-heading">
          <h2 id="referrals-lookup-heading" className="text-[1.125rem] font-semibold tracking-tight text-zinc-50">
            Welcome back
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[#a1a1aa]">
            Enter your waitlist email or referral code to load your priority dashboard.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            <div className="space-y-2.5">
              <label htmlFor="referrals-lookup" className="text-xs font-medium text-[#a1a1aa]">
                Email or referral code
              </label>
              <Input
                id="referrals-lookup"
                className={referralsLookupInputClass}
                autoComplete="email"
                placeholder="you@company.com or ABCD1234"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => setQuery((q) => normalizeLookupQueryInput(q))}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text/plain");
                  const extracted = extractReferralCodeFromUrl(pasted);
                  if (extracted && /\bhttps?:\/\//i.test(pasted.trim())) {
                    e.preventDefault();
                    setQuery(extracted);
                    return;
                  }
                  const normalized = normalizeLookupQueryInput(pasted);
                  if (pasted.trim() && normalized !== pasted.trim()) {
                    e.preventDefault();
                    setQuery(normalized);
                  }
                }}
              />
            </div>
            <Button
              type="submit"
              className="h-11 w-full font-semibold sm:w-auto sm:min-w-[220px]"
              disabled={phase === "loading"}
            >
              {phase === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading…
                </>
              ) : (
                "View my dashboard"
              )}
            </Button>
          </form>

          {phase === "error" && errorMessage ? (
            <div
              className="mt-5 rounded-lg border border-purple-500/35 bg-purple-950/40 px-3.5 py-2.5 text-sm text-purple-200"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : null}
        </section>
      )}

      {phase === "loading" ? (
        <div
          className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-800/80 bg-[#0a0a0a]/80 px-6 py-14 text-center"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm font-medium text-[#a1a1aa]">Pulling your waitlist status…</p>
        </div>
      ) : null}

      {phase === "success" && status ? (
        <>
          <WaitlistPointsSummary status={status} />
          <DashboardSuccess
            status={status}
            referralLink={referralLink}
            copied={copied}
            copyFailed={copyFailed}
            copyFeedbackLine={copyFeedbackLine}
            rankCelebration={rankCelebration}
            onCopyInviteLink={handleCopyInviteLink}
            xIntentHref={xIntentHref}
            mailtoHref={mailtoHref}
          />
        </>
      ) : null}
    </div>
  );
}

function HeroTierProgressCopy({ motivationLines }: { motivationLines: PriorityMotivationLines }) {
  return (
    <p className="font-semibold text-zinc-100 leading-relaxed">
      {motivationLines.line2ShareInviteSegments ? (
        <>
          {motivationLines.line2ShareInviteSegments.before}
          <a href={`#${SHARE_YOUR_INVITE_SECTION_ID}`} className={shareSectionInviteLinkClass}>
            {motivationLines.line2ShareInviteSegments.linkText}
          </a>
          {motivationLines.line2ShareInviteSegments.after}
        </>
      ) : (
        motivationLines.line2
      )}
    </p>
  );
}

function HeroBenefitTierStack({
  position,
  pathContext,
}: {
  position: number | null;
  pathContext?: WaitlistPathContext | null;
}) {
  const rows = useMemo(() => getWaitlistBenefitTierRows(position, pathContext), [position, pathContext]);
  const nextBand = pathContext?.next_tier
    ? pathContext.next_tier === "top10"
      ? 10
      : pathContext.next_tier === "top25"
        ? 25
        : pathContext.next_tier === "top50"
          ? 50
          : null
    : getWaitlistBenefitNextBand(position);
  const currentBand = pathContext?.current_tier
    ? pathContext.current_tier === "top10"
      ? 10
      : pathContext.current_tier === "top25"
        ? 25
        : pathContext.current_tier === "top50"
          ? 50
          : null
    : getWaitlistBenefitCurrentBand(position);
  const showUpNextCue = pathContext
    ? pathContext.next_tier === "top10" && pathContext.current_tier === "top25"
    : position != null && nextBand === 10 && currentBand === 25;

  return (
    <div className="flex w-full shrink-0 flex-col gap-1 sm:w-[min(12.5rem,100%)]">
      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.22em] text-zinc-500">Access tiers</p>
      <div role="list" aria-label="What each priority tier receives" className="flex flex-col gap-1">
        {rows.flatMap((row) => {
          const top10 = row.threshold === 10;
          const lockedTop10 = top10 && row.highlight !== "current";
          const isMuted = row.highlight === "muted";
          const isCurrent = row.highlight === "current";
          const isNext = row.highlight === "next";
          const isEntryTier = row.threshold === 50;
          const labelUpper = row.label.toUpperCase();

          const labelTone = cn(
            "text-[0.625rem] font-semibold uppercase tracking-[0.14em]",
            lockedTop10 && "text-zinc-500",
            isMuted && "text-zinc-500",
            isCurrent && "text-zinc-50",
            !isCurrent && !isMuted && !lockedTop10 && !top10 && "text-zinc-200",
            !isCurrent && !isMuted && !lockedTop10 && top10 && "text-primary",
          );

          const card = (
            <div
              key={row.threshold}
              role="listitem"
              className={cn(
                "rounded-md border px-2 py-1 text-left transition-[border-color,box-shadow,opacity]",
                lockedTop10 &&
                  "border-zinc-700 bg-transparent opacity-[0.72] shadow-none ring-0",
                row.highlight === "muted" &&
                  "border-zinc-800/35 bg-zinc-950/15 opacity-[0.42]",
                row.highlight === "neutral" &&
                  !lockedTop10 &&
                  "border-zinc-800/65 bg-zinc-950/35",
                isNext &&
                  !top10 &&
                  (isEntryTier
                    ? "border-primary/28 bg-primary/[0.04] opacity-90 ring-1 ring-primary/18 shadow-none"
                    : "border-primary/35 bg-primary/[0.05] ring-1 ring-primary/22 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"),
                isCurrent &&
                  "border-primary/60 bg-primary/[0.14] shadow-lg shadow-primary/25 ring-2 ring-primary/45",
              )}
            >
              <p className={cn("flex flex-wrap items-baseline gap-x-1.5", labelTone)}>
                <span>{labelUpper}</span>
                {isCurrent ? (
                  <span className="text-[0.5625rem] font-semibold uppercase tracking-[0.12em] text-primary">(You)</span>
                ) : null}
              </p>
              <p className={cn("mt-0.5 text-[0.6875rem] leading-snug", isMuted ? "text-zinc-600" : "text-zinc-400")}>
                {row.benefit}
              </p>
            </div>
          );

          if (row.threshold === 10 && showUpNextCue) {
            return [
              card,
              <div
                key="tier-next-cue"
                className="-my-px py-px text-[0.5625rem] font-medium uppercase tracking-[0.16em] text-zinc-600"
                aria-hidden
              >
                ↑ Next
              </div>,
            ];
          }
          return [card];
        })}
      </div>
    </div>
  );
}

function DashboardSuccess({
  status,
  referralLink,
  copied,
  copyFailed,
  copyFeedbackLine,
  rankCelebration,
  onCopyInviteLink,
  xIntentHref,
  mailtoHref,
}: {
  status: WaitlistStatusResponse;
  referralLink: string;
  copied: boolean;
  copyFailed: boolean;
  copyFeedbackLine: string | null;
  rankCelebration: WaitlistMovement | null;
  onCopyInviteLink: () => Promise<void>;
  xIntentHref: string | null;
  mailtoHref: string | null;
}) {
  const position = status.waitlist_position;
  const stats = summarizeDashboardStats(status);
  const yourReferrals = stats.referrals ?? 0;
  const headline = getRankHeadline(position);
  const spotsLine = getSpotsAheadLine(position);
  const motivationLines = getPriorityAccessMotivationLines(status);
  const urgency = getUrgencyLine();

  return (
    <div className="space-y-6">
      {rankCelebration ? (
        <motion.section
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-primary/35 bg-primary/[0.06] px-5 py-4 shadow-lg shadow-primary/5 sm:px-6"
          aria-live="polite"
          aria-label="Rank improvement"
        >
          <div className="flex gap-3">
            <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[1.0625rem] font-semibold leading-snug tracking-tight text-zinc-50">
                {rankCelebration.hasNewReferralCredit
                  ? `Referral credited — you moved up ${rankCelebration.movedUpBy} spot${rankCelebration.movedUpBy === 1 ? "" : "s"}`
                  : `You moved up ${rankCelebration.movedUpBy} spot${rankCelebration.movedUpBy === 1 ? "" : "s"}`}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#c4c4c4]">
                You&apos;re now #{rankCelebration.currentPosition} on the waitlist.
              </p>
              {rankCelebration.currentPosition != null && rankCelebration.currentPosition > 10 ? (
                <p className="mt-3 text-2xs uppercase tracking-[0.14em] text-zinc-600">
                  Keep sharing to reach the top 10.
                </p>
              ) : null}
            </div>
          </div>
        </motion.section>
      ) : null}

      {/* 1. Hero */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className={heroCard}
        aria-labelledby="waitlist-hero-heading"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p id="waitlist-hero-heading" className="text-[0.625rem] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Your priority
            </p>
            <p className="mt-3 text-[22px] font-semibold tracking-tight text-zinc-50">{headline}</p>
            {spotsLine && !(position != null && position > 10) ? (
              <p className="mt-2 text-sm font-medium text-[#c4c4c4]">{spotsLine}</p>
            ) : null}
            {motivationLines && position != null && position <= 10 ? (
              <div className="mt-3 text-sm leading-relaxed">
                <p className="font-semibold text-zinc-100">{motivationLines.line2}</p>
              </div>
            ) : null}
            <p className="mt-4 text-2xs uppercase tracking-wider text-zinc-600">{urgency}</p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-2 sm:items-end">
            {position != null && position > 1 ? (
              <p className="text-6xl font-bold tabular-nums leading-none tracking-tight text-zinc-50 sm:text-7xl">
                #{position}
              </p>
            ) : position === 1 ? (
              <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                <span className="text-sm font-semibold text-primary">#1</span>
              </div>
            ) : (
              <p className="text-lg font-medium text-zinc-400">…</p>
            )}
          </div>
        </div>

        <div className="mt-5 border-t border-zinc-800/90 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
            <div className="min-w-0 flex-1 text-sm leading-snug">
              {position == null ? (
                <p className="text-zinc-500">Priority access favors top waitlist spots.</p>
              ) : position === 1 ? (
                <p className="font-medium text-zinc-100">
                  You&apos;re first in line — invites help you stay ahead.
                </p>
              ) : position > 10 && motivationLines ? (
                <HeroTierProgressCopy motivationLines={motivationLines} />
              ) : (
                <p className="text-zinc-500">Keep sharing — you can still move up within the tier.</p>
              )}
              <div className="mt-3 space-y-1.5 text-center text-[0.8125rem] leading-snug text-zinc-400 sm:text-left">
                <p>+10 points per referral</p>
                {typeof status.path_context?.top10_cutoff_referral_count === "number" ? (
                  <p className="text-zinc-500">
                    Top 10 cutoff today: #{status.path_context.top10_cutoff_position ?? 10} has{" "}
                    {status.path_context.top10_cutoff_referral_count} referral
                    {status.path_context.top10_cutoff_referral_count === 1 ? "" : "s"}.
                  </p>
                ) : (
                  <p className="text-zinc-500">Cutoffs update live as people join.</p>
                )}
              </div>
            </div>
            <HeroBenefitTierStack position={position} pathContext={status.path_context} />
          </div>
        </div>

        <PathToTop10Disclosure position={position} yourReferrals={yourReferrals} pathContext={status.path_context} />
      </motion.section>

      <p className="text-center sm:text-left">
        <a
          href={PRODUCT_FEATURES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-primary underline-offset-4 transition-colors hover:text-primary/90 hover:underline"
        >
          See what you&apos;ll get access to →
        </a>
      </p>

      {/* 2. Primary CTA */}
      <motion.section
        id={SHARE_YOUR_INVITE_SECTION_ID}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className={primaryCtaCard}
        aria-label="Invite actions"
      >
        <p className="text-center text-2xs uppercase tracking-[0.18em] text-zinc-500 sm:text-left">Share your invite</p>
        <div className="mt-4 flex flex-col gap-3">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full gap-2 px-4 text-base font-semibold shadow-lg shadow-primary/20"
            onClick={() => void onCopyInviteLink()}
            disabled={!referralLink}
          >
            {copied ? <Check className="h-5 w-5 shrink-0" aria-hidden /> : <Copy className="h-5 w-5 shrink-0" aria-hidden />}
            Copy link → move up now
          </Button>
          <p className="text-center sm:text-left">
            <a
              href={PRODUCT_FEATURES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-2xs font-medium text-primary underline-offset-4 transition-colors hover:text-primary/90 hover:underline"
            >
              See what you unlock with early access
            </a>
          </p>
          {copyFeedbackLine ? (
            <p className={cn("text-center text-[0.8125rem] font-medium leading-snug sm:text-left", accent)} aria-live="polite">
              {copyFeedbackLine}
            </p>
          ) : null}
          <div className="flex gap-2">
            {xIntentHref ? (
              <a
                href={xIntentHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "inline-flex h-11 flex-1 items-center justify-center gap-2 text-sm font-semibold no-underline",
                  referralShareOutlineButtonClass,
                )}
                onClick={() => trackWaitlistAnalytics("referral_link_shared", { channel: "twitter" })}
              >
                <Share2 className="h-4 w-4 shrink-0" aria-hidden />
                <span className="sr-only">Share on X</span>
                <span aria-hidden>X</span>
              </a>
            ) : null}
            {mailtoHref ? (
              <a
                href={mailtoHref}
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "inline-flex h-11 flex-1 items-center justify-center gap-2 text-sm font-semibold no-underline",
                  referralShareOutlineButtonClass,
                )}
                onClick={() => trackWaitlistAnalytics("referral_link_shared", { channel: "email" })}
              >
                <Mail className="h-4 w-4 shrink-0" aria-hidden />
                Email
              </a>
            ) : null}
          </div>
          <p className="mt-1 text-center text-[0.8125rem] leading-snug text-zinc-500 sm:text-left">
            Most users who get access invite 2–3 people.
          </p>
        </div>
      </motion.section>

      {/* 3. Invite link */}
      {referralLink ? (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className={inviteCard}
          id="waitlist-invite-module"
          aria-labelledby="invite-heading"
        >
          <h3 id="invite-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Your private invite link
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#a1a1aa]">
            Each successful signup moves you up the waitlist.
          </p>
          <Input
            readOnly
            value={referralLink}
            className={cn(inputClass, "mt-5 font-mono text-[0.8125rem]")}
            onFocus={(e) => e.target.select()}
            aria-describedby="invite-link-hint"
          />
          <p id="invite-link-hint" className="mt-2 text-2xs text-zinc-600">
            Tap above to select, or use Copy link → move up now.
          </p>
          {copyFailed ? (
            <p className={cn("mt-4 text-2xs leading-relaxed", accent)}>
              Could not copy — select the link above and copy manually.
            </p>
          ) : null}
        </motion.section>
      ) : null}

      {/* 4. How it works (short) */}
      <section className={explainerCard} aria-label="How referrals work">
        <div className="space-y-2 text-sm leading-relaxed text-[#b4b4b4]">
          <p>Each signup moves you up the list.</p>
          <p>First 10 referrals: +10 pts each.</p>
        </div>
      </section>
    </div>
  );
}

/** Expandable trigger + trimmed ladder (embedded in priority hero card). */
function PathToTop10Disclosure({
  position,
  yourReferrals,
  pathContext,
}: {
  position: number | null;
  yourReferrals: number;
  pathContext?: WaitlistPathContext | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4 border-t border-zinc-800/90 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-primary underline-offset-4 transition-colors hover:text-primary/90 hover:underline sm:justify-start"
        aria-expanded={open}
        aria-controls="waitlist-path-to-top10-panel"
        id="waitlist-path-to-top10-trigger"
      >
        <span>See your path to Top 10 →</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-primary transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      <div
        id="waitlist-path-to-top10-panel"
        role="region"
        aria-labelledby="waitlist-path-to-top10-trigger"
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cn(
              "transition-opacity duration-200 ease-out motion-reduce:transition-none",
              open ? "opacity-100" : "opacity-0",
            )}
            aria-hidden={!open}
          >
            <PathToTop10Ladder position={position} yourReferrals={yourReferrals} pathContext={pathContext} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Vertical step ladder: Top 10 cutoff → next rank above you → You (embedded in accordion). */
function PathToTop10Ladder({
  position,
  yourReferrals,
  pathContext,
}: {
  position: number | null;
  yourReferrals: number;
  pathContext?: WaitlistPathContext | null;
}) {
  const pc = pathContext ?? null;
  const spotsToTop10 =
    pc != null
      ? typeof pc.spots_to_top10 === "number" && pc.spots_to_top10 >= 0
        ? pc.spots_to_top10
        : null
      : typeof position === "number" && position > 10
        ? spotsToReachRank(position, 10)
        : null;

  const top10CutoffRefs = pc?.top10_cutoff_referral_count;
  const midPos = pc?.next_comparison_position;
  const midRef = pc?.next_comparison_referral_count;
  const legacyMidRank = typeof position === "number" && position > 1 ? position - 1 : null;
  const showMidRung =
    pc != null
      ? midPos != null &&
        midPos !== 10 &&
        position != null &&
        midPos === position - 1
      : true;

  const headline = (() => {
    if (position === 1) {
      return (
        <>
          You&apos;re <span className="text-primary">#1</span> — stay ahead with invites
        </>
      );
    }
    if (position == null) {
      return (
        <>
          Climb toward <span className="text-primary">Top 10</span>
        </>
      );
    }
    if (position <= 10) {
      return (
        <>
          You&apos;re in <span className="text-primary">Top 10</span>
        </>
      );
    }
    if (spotsToTop10 != null && spotsToTop10 > 0) {
      return (
        <>
          You&apos;re {spotsToTop10} spot{spotsToTop10 === 1 ? "" : "s"} from{" "}
          <span className="text-primary">Top 10</span>
        </>
      );
    }
    return (
      <>
        Move toward <span className="text-primary">Top 10</span>
      </>
    );
  })();

  const youReferralPhrase =
    yourReferrals === 1 ? "1 referral" : `${yourReferrals} referrals`;

  const supportingSentence =
    position === 1
      ? "Keep inviting — the line still moves behind you."
      : position != null && position <= 10 && position > 1
        ? "Invites still help you climb inside the priority tier."
        : "A few successful invites can move you closer to Top 10.";

  return (
    <div className="pt-3" aria-labelledby="path-to-top10-heading">
      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.22em] text-zinc-400">
        YOUR PATH TO TOP 10
      </p>
      <h2
        id="path-to-top10-heading"
        className="mt-2 text-base font-semibold leading-snug tracking-tight text-zinc-50 sm:text-lg"
      >
        {headline}
      </h2>
      <p className="mt-2 max-w-md text-[0.8125rem] leading-snug text-zinc-500">{supportingSentence}</p>

      <div className="relative mt-5">
        <div
          className="pointer-events-none absolute left-[13px] top-5 bottom-5 w-px bg-gradient-to-b from-primary/45 via-zinc-600/90 to-zinc-700"
          aria-hidden
        />

        {/* Step 1 — Top 10 cutoff (live from path_context when deployed) */}
        <div className="relative z-10 flex gap-4">
          <div className="flex w-7 shrink-0 justify-center pt-1">
            <span
              className="h-3 w-3 shrink-0 rounded-full bg-primary ring-4 ring-primary/25"
              aria-hidden
            />
          </div>
          <div className="min-w-0 flex-1 pb-6">
            <p className="text-2xs font-medium uppercase tracking-wide text-zinc-500">#10 cutoff</p>
            <p className="mt-1 text-xl font-semibold tabular-nums leading-none tracking-tight text-zinc-50">
              {top10CutoffRefs != null ? (
                <>
                  {top10CutoffRefs} referral{top10CutoffRefs === 1 ? "" : "s"}
                </>
              ) : pc != null ? (
                <span className="text-[0.9375rem] font-medium leading-snug text-zinc-500">
                  Cutoff loads from your live status — refresh if this is blank.
                </span>
              ) : (
                <span className="text-[0.9375rem] font-medium leading-snug text-zinc-500">
                  Live cutoff appears after your status loads.
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Step 2 — Next rank above you (live) or legacy benchmark */}
        {showMidRung ? (
          <div className="relative z-10 flex gap-4">
            <div className="flex w-7 shrink-0 justify-center pt-1">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-500" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 pb-6">
              <p className="text-2xs font-medium uppercase tracking-wide text-zinc-500">
                #{midPos ?? legacyMidRank ?? "—"}{" "}
                <span className="text-zinc-600">(next up)</span>
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums leading-none tracking-tight text-zinc-50">
                {pc != null && midRef != null ? (
                  <>
                    {midRef} referral{midRef === 1 ? "" : "s"}
                  </>
                ) : pc != null ? (
                  <span className="text-[0.9375rem] font-medium leading-snug text-zinc-500">
                    Rank above you — referral bar unavailable
                  </span>
                ) : legacyMidRank != null ? (
                  <span className="text-[0.9375rem] font-medium leading-snug text-zinc-500">
                    One rank above you (#{legacyMidRank}) — referral count varies
                  </span>
                ) : (
                  <span className="text-[0.9375rem] font-medium leading-snug text-zinc-500">
                    Next spot above you in line
                  </span>
                )}
              </p>
            </div>
          </div>
        ) : null}

        {/* Step 3 — You */}
        <div className="relative z-10 flex gap-4">
          <div className="flex w-7 shrink-0 justify-center pt-1">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary/75 bg-[#101010] ring-2 ring-primary/35"
              aria-hidden
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-semibold uppercase tracking-wide text-primary">You</p>
            <p className="mt-1 text-xl font-semibold tabular-nums leading-none tracking-tight text-zinc-50">
              {youReferralPhrase}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  density = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  density?: "default" | "compact";
  className?: string;
}) {
  const compact = density === "compact";
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800/80 bg-[#101010] text-center",
        compact ? "px-2 py-2 sm:px-2.5 sm:py-2" : "px-2.5 py-3 sm:px-3 sm:py-3.5",
        className,
      )}
    >
      <p
        className={cn(
          "font-semibold uppercase tracking-wider text-zinc-500",
          compact ? "text-[0.5625rem] tracking-[0.14em]" : "text-[0.625rem]",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "font-semibold tabular-nums text-zinc-100",
          compact ? "mt-1 text-sm leading-none sm:text-[0.9375rem]" : "mt-1.5 text-base sm:text-lg",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function WaitlistPointsSummary({ status }: { status: WaitlistStatusResponse }) {
  const stats = summarizeDashboardStats(status);
  return (
    <section className={compactMetricsCard} aria-label="Points summary">
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        <MetricCell
          density="compact"
          label="Referrals"
          value={
            stats.referrals != null ? (
              <span className="tabular-nums">{stats.referrals}</span>
            ) : (
              "—"
            )
          }
        />
        <MetricCell
          density="compact"
          className={stats.totalPoints != null ? "animate-referrals-total-points-soft-pulse" : undefined}
          label="Total points"
          value={
            stats.totalPoints != null ? (
              <span className="tabular-nums text-primary">{stats.totalPoints}</span>
            ) : (
              "—"
            )
          }
        />
        <MetricCell
          density="compact"
          label="Earn per referral"
          value={<span className="tabular-nums text-primary">{stats.earnPerReferralDisplay}</span>}
        />
      </div>
    </section>
  );
}
