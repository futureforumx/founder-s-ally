export {
  GRAVITY_EXPONENT,
  GRAVITY_OFFSET_HOURS,
  GROWTH_DELTA_OFFSET,
  MAX_DOMAIN_AGE_YEARS,
  MAX_EARLY_STAGE_EMPLOYEES,
  MAX_EARLY_STAGE_FUNDING_USD,
  MAX_GITHUB_REPO_AGE_MONTHS,
  MIN_ACCOUNT_AGE_DAYS,
  PLATFORM_WEIGHTS,
  PUBLIC_UNLOCKED_COUNT,
  SENTIMENT_MULTIPLIER,
  TRENDING_PAGE_LIMIT,
  TRENDING_REVALIDATE_SECONDS,
} from "./_trendingConstants.js";

import type {
  GRAVITY_EXPONENT,
  GRAVITY_OFFSET_HOURS,
  GROWTH_DELTA_OFFSET,
  MAX_DOMAIN_AGE_YEARS,
  MAX_EARLY_STAGE_EMPLOYEES,
  MAX_EARLY_STAGE_FUNDING_USD,
  MAX_GITHUB_REPO_AGE_MONTHS,
  PLATFORM_WEIGHTS,
  PUBLIC_UNLOCKED_COUNT,
  SENTIMENT_MULTIPLIER,
} from "./_trendingConstants.js";

export type SentimentTone = keyof typeof SENTIMENT_MULTIPLIER;
export type SignalKey = keyof typeof PLATFORM_WEIGHTS;

export type SignalBreakdown = Record<SignalKey, number>;

export type CompetitorCell = {
  name: string;
  overlap: string;
  note: string;
};

export type CatalystTeardown = {
  marketDrivers: string[];
  techStack: string[];
  competitors: CompetitorCell[];
};

export type RawStartupSignal = {
  id: string;
  name: string;
  brandAliases: string[];
  domain: string;
  website: string;
  logoUrl: string | null;
  microCategory: string;
  fundingStage: string;
  hqLocation: string;
  twitter: string | null;
  linkedin: string | null;
  github: string | null;
  /** When false, website / social URLs are demo placeholders and must not be linked. */
  profilesVerified?: boolean;
  accountCreatedAt: string;
  hoursElapsed: number;
  sentiment: SentimentTone;
  raw: SignalBreakdown;
  upvoteIps: string[];
  employeeCount: number;
  totalFundingUsd: number;
  domainRegisteredAt: string;
  githubRepoCreatedAt: string | null;
  mentionedByEarlyStageInvestors: boolean;
  current24h: SignalBreakdown;
  baseline30d: SignalBreakdown;
  velocity24h: number[];
  velocity7d: number[];
  velocity30d: number[];
  velocity90d: number[];
  catalyst: string;
  teardown: CatalystTeardown;
};

export type TrendingStartupRow = {
  id: string;
  rank: number;
  name: string;
  domain: string;
  website: string;
  logoUrl: string | null;
  microCategory: string;
  fundingStage: string;
  hqLocation: string;
  compositeScore: number;
  gravityScore: number;
  hoursElapsed: number;
  sentiment: SentimentTone;
  sentimentMultiplier: number;
  zScores: SignalBreakdown;
  weighted: SignalBreakdown;
  velocity24h: number[];
  velocity7d: number[];
  velocity30d: number[];
  velocity90d: number[];
  catalyst: string;
  twitter: string | null;
  linkedin: string | null;
  github: string | null;
  profilesVerified?: boolean;
  teardown: CatalystTeardown;
  locked: boolean;
};

export type TrendingCatalogResponse = {
  generatedAt: string;
  algorithm: {
    scoring: "relative_growth_delta";
    weights: typeof PLATFORM_WEIGHTS;
    gravityExponent: typeof GRAVITY_EXPONENT;
    gravityOffsetHours: typeof GRAVITY_OFFSET_HOURS;
    publicUnlockedCount: typeof PUBLIC_UNLOCKED_COUNT;
    growthDeltaOffset: typeof GROWTH_DELTA_OFFSET;
    earlyStageGate: {
      maxEmployees: typeof MAX_EARLY_STAGE_EMPLOYEES;
      maxTotalFundingUsd: typeof MAX_EARLY_STAGE_FUNDING_USD;
      maxDomainAgeYears: typeof MAX_DOMAIN_AGE_YEARS;
      maxGithubRepoAgeMonths: typeof MAX_GITHUB_REPO_AGE_MONTHS;
      socialRequiresEarlyStageInvestorMention: true;
    };
  };
  startups: TrendingStartupRow[];
};
