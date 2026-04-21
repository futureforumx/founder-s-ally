/**
 * Frontend-only waitlist dashboard milestone + copy helpers.
 * Tier thresholds: "Top N" means waitlist position rank ≤ N.
 *
 * Backend scoring (see `calc_waitlist_referral_score`): referrals 1–10 earn 10 pts each;
 * additional referrals earn 5 pts each. Total score also includes qualification points.
 */

import type { WaitlistPathContext, WaitlistStatusResponse } from "@/lib/waitlist";

/** Descending thresholds: loose → strict (position must be ≤ threshold to qualify). */
export const WAITLIST_RANK_TIERS_DESC = [100, 50, 25, 10, 5, 1] as const;

/** Display label for UI milestone chips. */
export function formatTierLabel(threshold: number): string {
  return `Top ${threshold}`;
}

/** Smallest threshold T such that position ≤ T (best tier achieved). Null if position > 100. */
export function getCurrentTierThreshold(position: number): number | null {
  const eligible = WAITLIST_RANK_TIERS_DESC.filter((t) => position <= t);
  if (eligible.length === 0) return null;
  return Math.min(...eligible);
}

/** Next stricter tier to aim for (lower rank number). Null when already at Top 1 tier or position 1. */
export function getNextStricterTierThreshold(position: number): number | null {
  if (position <= 1) return null;
  const current = getCurrentTierThreshold(position);
  if (current === null) return 100;
  const idx = WAITLIST_RANK_TIERS_DESC.findIndex((t) => t === current);
  if (idx < 0 || idx >= WAITLIST_RANK_TIERS_DESC.length - 1) return null;
  return WAITLIST_RANK_TIERS_DESC[idx + 1];
}

export function spotsAheadOfYou(position: number): number {
  return Math.max(0, position - 1);
}

/** Positions to climb until rank ≤ targetRank (e.g. reach Top 5 → targetRank 5). */
export function spotsToReachRank(position: number, targetRank: number): number {
  return Math.max(0, position - targetRank);
}

export function getNextMilestone(position: number | null): {
  label: string;
  targetRank: number;
  spotsToGo: number;
} | null {
  if (position == null) return null;
  const nextT = getNextStricterTierThreshold(position);
  if (nextT === null) return null;
  return {
    label: formatTierLabel(nextT),
    targetRank: nextT,
    spotsToGo: spotsToReachRank(position, nextT),
  };
}

/**
 * Progress toward the next tier, 0–1.
 * Undefined when position is beyond Top 100 (no current tier) — show indeterminate cue instead.
 */
export function getProgressToNextMilestone(position: number | null): number | undefined {
  if (position == null || position <= 1) return 1;

  const nextT = getNextStricterTierThreshold(position);
  if (nextT === null) return 1;

  const currentTier = getCurrentTierThreshold(position);
  if (currentTier === null) return undefined;

  const span = currentTier - nextT;
  if (span <= 0) return 1;
  const raw = (currentTier - position) / span;
  return Math.max(0, Math.min(1, raw));
}

/** Benefit cohorts on referrals hero (rank ≤ threshold). Display order: best → entry. */
export const WAITLIST_BENEFIT_TIER_DEFS = [
  {
    threshold: 10 as const,
    label: "Top 10",
    benefit: "Personalized onboarding + priority access",
  },
  {
    threshold: 25 as const,
    label: "Top 25%",
    benefit: "Early access + priority queue",
  },
  {
    threshold: 50 as const,
    label: "Top 50%",
    benefit: "Access in first release wave",
  },
] as const;

export type WaitlistBenefitTierThreshold = (typeof WAITLIST_BENEFIT_TIER_DEFS)[number]["threshold"];

/** Row emphasis for compact tier list UI. */
export type WaitlistBenefitTierHighlight = "current" | "next" | "muted" | "neutral";

export type WaitlistBenefitTierRow = {
  threshold: WaitlistBenefitTierThreshold;
  label: string;
  benefit: string;
  highlight: WaitlistBenefitTierHighlight;
};

/** Strictest band among {10, 25, 50} the user sits in, or null when outside Top 50. */
export function getWaitlistBenefitCurrentBand(position: number | null): WaitlistBenefitTierThreshold | null {
  if (position == null || position > 50) return null;
  if (position <= 10) return 10;
  if (position <= 25) return 25;
  return 50;
}

/** Next tighter band toward Top 10 within this ladder, or null when already in Top 10 here. */
export function getWaitlistBenefitNextBand(position: number | null): WaitlistBenefitTierThreshold | null {
  if (position == null || position <= 10) return null;
  if (position <= 25) return 10;
  if (position <= 50) return 25;
  return 50;
}

function pathTierToBand(t: WaitlistPathContext["current_tier"]): WaitlistBenefitTierThreshold | null {
  if (t === "top10") return 10;
  if (t === "top25") return 25;
  if (t === "top50") return 50;
  return null;
}

function pathNextTierToBand(t: WaitlistPathContext["next_tier"]): WaitlistBenefitTierThreshold | null {
  if (t === "top10") return 10;
  if (t === "top25") return 25;
  if (t === "top50") return 50;
  return null;
}

/** Three-row presentation for hero tier benefits — prefers live `path_context` when present. */
export function getWaitlistBenefitTierRows(
  position: number | null,
  pathContext?: WaitlistPathContext | null,
): WaitlistBenefitTierRow[] {
  const current =
    pathContext?.current_tier != null
      ? pathTierToBand(pathContext.current_tier)
      : getWaitlistBenefitCurrentBand(position);
  const next =
    pathContext?.next_tier != null ? pathNextTierToBand(pathContext.next_tier) : getWaitlistBenefitNextBand(position);

  return WAITLIST_BENEFIT_TIER_DEFS.map(({ threshold, label, benefit }) => {
    let highlight: WaitlistBenefitTierHighlight = "neutral";
    if (current != null && threshold > current) highlight = "muted";
    else if (current !== null && threshold === current) highlight = "current";
    else if (next !== null && threshold === next) highlight = "next";
    else if (current === null && next !== null && threshold < next)
      highlight = "muted"; // e.g. backend tier `general`: lock stricter bands below the next target
    return { threshold, label, benefit, highlight };
  });
}

export function getRankHeadline(position: number | null): string {
  if (position == null) return "Calculating your place…";
  if (position <= 1) return "You're at the front of the line";
  return `You're #${position} on the waitlist`;
}

export function getSpotsAheadLine(position: number | null): string | null {
  if (position == null || position <= 1) return null;
  const ahead = spotsAheadOfYou(position);
  if (ahead === 0) return null;
  const noun = ahead === 1 ? "spot" : "spots";
  return `Only ${ahead} ${noun} ahead of you`;
}

/** Unlock / perk line tied to next milestone (marketing — frontend only). */
export function getMilestoneUnlockCopy(position: number | null): string {
  if (position == null) return "Priority invites favor early supporters.";
  if (position <= 1) return "You're first in line for access.";
  const nextT = getNextStricterTierThreshold(position);
  if (nextT === 5 || nextT === 1) return "Top 5 get early access · Top users get priority invites";
  if (nextT != null && nextT <= 10) return "Top 10 get priority invites";
  return "Top users get access first";
}

export type PriorityMotivationLines = {
  line2: string;
  /** When set, line2 should be rendered as before + linked linkText + after (jump to share section). */
  line2ShareInviteSegments?: { before: string; linkText: string; after: string };
};

/** Two-line hero copy focused on sharing / top 10 (position > 1 only). Uses live path_context when available. */
export function getPriorityAccessMotivationLines(
  status: Pick<WaitlistStatusResponse, "waitlist_position" | "path_context"> | null,
): PriorityMotivationLines | null {
  const position = status?.waitlist_position ?? null;
  if (position == null || position <= 1) return null;
  if (position <= 10) {
    return {
      line2: "You're in the tier — a few invites still move you up.",
    };
  }

  const pc = status?.path_context;
  const referralsNeeded =
    typeof pc?.referrals_needed_for_top10 === "number" && pc.referrals_needed_for_top10 > 0
      ? pc.referrals_needed_for_top10
      : null;

  if (referralsNeeded != null) {
    const rw = referralsNeeded === 1 ? "referral" : "referrals";
    const linkText = `${referralsNeeded} more ${rw}`;
    return {
      line2: `${linkText} to match today's #10 referral count — rank still follows total score.`,
      line2ShareInviteSegments: {
        before: "",
        linkText,
        after: " to match today's #10 referral count — rank still follows total score.",
      },
    };
  }

  const hasPathContext = pc != null;
  const spotsFromRpc =
    typeof pc?.spots_to_top10 === "number" && pc.spots_to_top10 >= 0 ? pc.spots_to_top10 : null;

  if (hasPathContext && spotsFromRpc != null) {
    const spotWord = spotsFromRpc === 1 ? "spot" : "spots";
    return {
      line2: `You're ${spotsFromRpc} ${spotWord} from Top 10`,
    };
  }

  if (hasPathContext) {
    return {
      line2: "Keep sharing — Top 10 spots and cutoffs shift as people join.",
    };
  }

  const spotsFallback = spotsToReachRank(position, 10);
  const spotWord = spotsFallback === 1 ? "spot" : "spots";
  return {
    line2: `You're ${spotsFallback} ${spotWord} from Top 10`,
  };
}

/** Marginal points for the *next* referral from DB formula (tiers at 10 referrals). */
export function getMarginalReferralPoints(referralCount: number): number {
  return referralCount < 10 ? 10 : 5;
}

export function formatEarnPerReferralLine(referralCount: number): string {
  const pts = getMarginalReferralPoints(referralCount);
  return `+${pts} pts`;
}

/** Pull narrative urgency (premium, subtle). */
export function getUrgencyLine(): string {
  return "Priority invites are rolling out soon.";
}

export function summarizeDashboardStats(status: WaitlistStatusResponse): {
  referrals: number | null;
  totalPoints: number | null;
  earnPerReferralDisplay: string;
} {
  const referrals = typeof status.referral_count === "number" ? status.referral_count : null;
  const totalPoints = typeof status.total_score === "number" ? status.total_score : null;
  const earnPerReferralDisplay =
    referrals != null ? formatEarnPerReferralLine(referrals) : "+10 pts";
  return { referrals, totalPoints, earnPerReferralDisplay };
}
