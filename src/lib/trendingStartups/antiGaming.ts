import { passesEarlyStageGate } from "./earlyStageGate";
import { MIN_ACCOUNT_AGE_DAYS, type RawStartupSignal, type SignalBreakdown } from "./types";

const MS_PER_DAY = 86_400_000;
const DUPLICATE_IP_SHARE = 0.5;

export function accountAgeDays(createdAt: string, now: Date): number {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return 0;
  return (now.getTime() - created) / MS_PER_DAY;
}

export function isTooNewAccount(createdAt: string, now: Date): boolean {
  return accountAgeDays(createdAt, now) < MIN_ACCOUNT_AGE_DAYS;
}

export function dominantIpShare(upvoteIps: string[]): number {
  if (upvoteIps.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ip of upvoteIps) {
    const key = ip.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return 0;
  return Math.max(...counts.values()) / upvoteIps.length;
}

export function hasDuplicateIpSpike(upvoteIps: string[]): boolean {
  return dominantIpShare(upvoteIps) > DUPLICATE_IP_SHARE && upvoteIps.length >= 8;
}

export function sanitizeRawSignals(row: RawStartupSignal): SignalBreakdown {
  if (!hasDuplicateIpSpike(row.upvoteIps)) return row.raw;
  return { ...row.raw, launch: Math.round(row.raw.launch * 0.15) };
}

export function shouldExcludeStartup(row: RawStartupSignal, now: Date): boolean {
  return isTooNewAccount(row.accountCreatedAt, now) || !passesEarlyStageGate(row, now);
}
