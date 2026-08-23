import { normalizeBrand, normalizeDomain } from "./entityResolution.js";
import {
  MAX_DOMAIN_AGE_YEARS,
  MAX_EARLY_STAGE_EMPLOYEES,
  MAX_EARLY_STAGE_FUNDING_USD,
  MAX_GITHUB_REPO_AGE_MONTHS,
} from "./constants.js";
import type { RawStartupSignal, SignalBreakdown } from "./types.js";

const MS_PER_DAY = 86_400_000;

/** Established unicorns / public tech that must never enter the early-stage board. */
export const ESTABLISHED_TECH_BRANDS = [
  "vercel",
  "figma",
  "anthropic",
  "supabase",
  "linear",
  "stripe",
  "notion",
  "openai",
  "cursor",
  "anysphere",
  "ramp",
  "databricks",
  "cloudflare",
  "rippling",
  "deel",
  "mercury",
  "perplexity",
  "glean",
  "clerk",
  "elevenlabs",
  "langchain",
  "replit",
  "abridge",
] as const;

export const ESTABLISHED_TECH_DOMAINS = [
  "vercel.com",
  "figma.com",
  "anthropic.com",
  "supabase.com",
  "linear.app",
  "stripe.com",
  "notion.so",
  "openai.com",
  "cursor.com",
  "ramp.com",
  "databricks.com",
  "cloudflare.com",
  "rippling.com",
  "deel.com",
  "mercury.com",
  "perplexity.ai",
  "glean.com",
  "clerk.com",
  "elevenlabs.io",
  "langchain.com",
  "replit.com",
  "abridge.com",
] as const;

const ESTABLISHED_BRAND_SET = new Set(ESTABLISHED_TECH_BRANDS);
const ESTABLISHED_DOMAIN_SET = new Set(ESTABLISHED_TECH_DOMAINS);

export function yearsBetween(iso: string, now: Date): number {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - then) / (MS_PER_DAY * 365.25);
}

export function monthsBetween(iso: string, now: Date): number {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - then) / (MS_PER_DAY * 30.4375);
}

export function isEstablishedTechCompany(row: Pick<RawStartupSignal, "name" | "domain" | "brandAliases">): boolean {
  const domain = normalizeDomain(row.domain);
  if (domain && ESTABLISHED_DOMAIN_SET.has(domain)) return true;
  const names = [row.name, ...(row.brandAliases ?? [])];
  return names.some((name) => ESTABLISHED_BRAND_SET.has(normalizeBrand(name)));
}

export function failsEarlyStageSizeGate(row: Pick<RawStartupSignal, "employeeCount" | "totalFundingUsd">): boolean {
  return row.employeeCount > MAX_EARLY_STAGE_EMPLOYEES || row.totalFundingUsd > MAX_EARLY_STAGE_FUNDING_USD;
}

export function failsDomainAgeGate(row: Pick<RawStartupSignal, "domainRegisteredAt">, now: Date): boolean {
  return yearsBetween(row.domainRegisteredAt, now) > MAX_DOMAIN_AGE_YEARS;
}

export function isRecentGithubRepo(createdAt: string | null | undefined, now: Date): boolean {
  if (!createdAt) return false;
  return monthsBetween(createdAt, now) <= MAX_GITHUB_REPO_AGE_MONTHS;
}

export function passesEarlyStageGate(row: RawStartupSignal, now: Date): boolean {
  if (isEstablishedTechCompany(row)) return false;
  if (failsEarlyStageSizeGate(row)) return false;
  if (failsDomainAgeGate(row, now)) return false;
  return true;
}

/** Social only counts when a curated early-stage investor mentioned the company. */
export function socialSignalWeightActive(row: Pick<RawStartupSignal, "mentionedByEarlyStageInvestors">): boolean {
  return row.mentionedByEarlyStageInvestors === true;
}

/** Developer velocity only counts for repos created in the last 24 months. */
export function developerSignalWeightActive(
  row: Pick<RawStartupSignal, "githubRepoCreatedAt">,
  now: Date,
): boolean {
  return isRecentGithubRepo(row.githubRepoCreatedAt, now);
}

export function applyEarlyStageSignalMask(
  deltas: SignalBreakdown,
  row: RawStartupSignal,
  now: Date,
): SignalBreakdown {
  return {
    launch: deltas.launch,
    social: socialSignalWeightActive(row) ? deltas.social : 0,
    developer: developerSignalWeightActive(row, now) ? deltas.developer : 0,
    traction: deltas.traction,
  };
}
