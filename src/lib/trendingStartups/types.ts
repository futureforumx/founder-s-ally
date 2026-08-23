export const PLATFORM_WEIGHTS = {
  launch: 0.3,
  social: 0.3,
  developer: 0.2,
  traction: 0.2,
} as const;

export const SENTIMENT_MULTIPLIER = {
  negative: 0.5,
  neutral: 1,
  praise: 1.2,
} as const;

export const GRAVITY_EXPONENT = 1.5;
export const GRAVITY_OFFSET_HOURS = 2;
export const PUBLIC_UNLOCKED_COUNT = 20;
/** Emergency fallback TTL (seconds). Vite/Vercel analog of Next.js `export const revalidate = 86400`. */
export const TRENDING_REVALIDATE_SECONDS = 86_400;
export const TRENDING_PAGE_LIMIT = 20;
export const MIN_ACCOUNT_AGE_DAYS = 30;
export const MAX_EARLY_STAGE_EMPLOYEES = 50;
export const MAX_EARLY_STAGE_FUNDING_USD = 15_000_000;
export const MAX_DOMAIN_AGE_YEARS = 4;
export const MAX_GITHUB_REPO_AGE_MONTHS = 24;
export const GROWTH_DELTA_OFFSET = 100;

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
