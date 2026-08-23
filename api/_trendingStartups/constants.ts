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
