/**
 * Client-side waitlist rank movement vs last seen snapshot (localStorage).
 * Compare previous `waitlist_position` / `referral_count` from last /referrals check.
 * No backend writes — suitable for MVP celebration UI and future email copy derivation.
 */

import type { WaitlistStatusResponse } from "@/lib/waitlist";

const STORAGE_PREFIX = "vekta:waitlist:lastSeen:v1:";

export type WaitlistSnapshot = {
  waitlist_position: number | null;
  referral_count: number;
  updatedAt: number;
};

/** Serializable movement summary — reusable for UI, toast, or email hooks later. */
export type WaitlistMovement = {
  movedUpBy: number;
  previousPosition: number | null;
  currentPosition: number | null;
  previousReferralCount: number | null;
  currentReferralCount: number | null;
  hasNewReferralCredit: boolean;
  /** True when rank number strictly improved (lower = better). */
  shouldCelebrate: boolean;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Stable key: prefer email from API; else referral code. */
export function waitlistIdentityKey(status: Pick<WaitlistStatusResponse, "email" | "referral_code">): string {
  const email = status.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  const code = status.referral_code?.trim().toUpperCase().replace(/\s+/g, "");
  return code ? `ref:${code}` : "";
}

export function waitlistSnapshotStorageKey(identityKey: string): string {
  return `${STORAGE_PREFIX}${identityKey}`;
}

export function readWaitlistSnapshot(identityKey: string): WaitlistSnapshot | null {
  if (typeof window === "undefined" || !identityKey) return null;
  try {
    const raw = window.localStorage.getItem(waitlistSnapshotStorageKey(identityKey));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const pos = parsed.waitlist_position;
    const rc = parsed.referral_count;
    const ts = parsed.updatedAt;
    if (typeof rc !== "number" || typeof ts !== "number") return null;
    const waitlist_position =
      pos === null || typeof pos === "number" ? (pos as number | null) : null;
    return { waitlist_position, referral_count: rc, updatedAt: ts };
  } catch {
    return null;
  }
}

export function writeWaitlistSnapshot(identityKey: string, snapshot: Omit<WaitlistSnapshot, "updatedAt">): void {
  if (typeof window === "undefined" || !identityKey) return;
  try {
    const full: WaitlistSnapshot = {
      ...snapshot,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(waitlistSnapshotStorageKey(identityKey), JSON.stringify(full));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Compare last seen snapshot to current API status.
 * Celebration only when `waitlist_position` improves (numeric decrease).
 */
export function computeWaitlistMovement(
  previous: WaitlistSnapshot | null,
  current: Pick<WaitlistStatusResponse, "waitlist_position" | "referral_count">,
): WaitlistMovement {
  const currentPosition = typeof current.waitlist_position === "number" ? current.waitlist_position : null;
  const currentReferralCount = typeof current.referral_count === "number" ? current.referral_count : null;

  if (previous === null || currentPosition === null) {
    return {
      movedUpBy: 0,
      previousPosition: previous?.waitlist_position ?? null,
      currentPosition,
      previousReferralCount: previous != null ? previous.referral_count : null,
      currentReferralCount,
      hasNewReferralCredit: false,
      shouldCelebrate: false,
    };
  }

  const prevPos = previous.waitlist_position;
  const prevRef = previous.referral_count;

  if (prevPos === null || typeof prevPos !== "number") {
    return {
      movedUpBy: 0,
      previousPosition: prevPos,
      currentPosition,
      previousReferralCount: prevRef,
      currentReferralCount,
      hasNewReferralCredit: false,
      shouldCelebrate: false,
    };
  }

  const improved = prevPos > currentPosition;
  const movedUpBy = improved ? prevPos - currentPosition : 0;
  const hasNewReferralCredit =
    currentReferralCount !== null && currentReferralCount > prevRef && improved;

  return {
    movedUpBy,
    previousPosition: prevPos,
    currentPosition,
    previousReferralCount: prevRef,
    currentReferralCount,
    hasNewReferralCredit,
    shouldCelebrate: improved,
  };
}

/** Optional: payload shape for a future transactional email / notification. */
export function movementToEmailPayload(m: WaitlistMovement): Record<string, string | number | boolean | null> {
  return {
    movedUpBy: m.movedUpBy,
    previousPosition: m.previousPosition,
    currentPosition: m.currentPosition,
    previousReferralCount: m.previousReferralCount,
    currentReferralCount: m.currentReferralCount,
    hasNewReferralCredit: m.hasNewReferralCredit,
    headline: m.hasNewReferralCredit
      ? `Referral credited — you moved up ${m.movedUpBy} spot${m.movedUpBy === 1 ? "" : "s"}`
      : `You moved up ${m.movedUpBy} spot${m.movedUpBy === 1 ? "" : "s"}`,
    subtext: m.currentPosition != null ? `You're now #${m.currentPosition} on the waitlist.` : "",
  };
}
