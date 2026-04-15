-- Normalize organizations funding columns to controlled enums + CHECK constraints.
-- Run after 20260418120000_organizations_funding_vc_stage.sql and after optional TS backfill.

-- Normalize empty strings
UPDATE public.organizations
SET "fundingStatus" = 'unknown'
WHERE "fundingStatus" IS NOT NULL AND trim("fundingStatus") = '';

UPDATE public.organizations
SET "investmentStage" = NULL
WHERE "investmentStage" IS NOT NULL AND trim("investmentStage") = '';

-- ── fundingStatus: bootstrapped | vc_backed | acquired | public | unknown ──
UPDATE public.organizations
SET "fundingStatus" = 'vc_backed'
WHERE lower(trim("fundingStatus")) IN ('angel_backed', 'angel', 'venture_backed', 'vc-backed');

UPDATE public.organizations
SET "fundingStatus" = 'bootstrapped'
WHERE lower(trim("fundingStatus")) IN ('grant_non_dilutive', 'grant', 'non_dilutive', 'bootstrap');

UPDATE public.organizations
SET "fundingStatus" = 'public'
WHERE lower(trim("fundingStatus")) IN ('ipo', 'listed');

UPDATE public.organizations
SET "fundingStatus" = 'unknown'
WHERE "fundingStatus" IS NOT NULL
  AND lower(trim("fundingStatus")) NOT IN ('bootstrapped', 'vc_backed', 'acquired', 'public', 'unknown');

-- ── investmentStage: pre_seed | seed | series_* | growth | late_stage | unknown ──
UPDATE public.organizations
SET "investmentStage" = 'pre_seed'
WHERE "investmentStage" IS NOT NULL
  AND lower(replace(trim("investmentStage"), ' ', '')) IN ('pre_seed', 'pre-seed', 'preseed');

UPDATE public.organizations
SET "investmentStage" = 'seed'
WHERE "investmentStage" IS NOT NULL
  AND (
    lower(trim("investmentStage")) IN ('seed', 'series f')
    OR lower(trim("investmentStage")) ~ '^series\s*f\b'
  );

UPDATE public.organizations
SET "investmentStage" = 'series_a'
WHERE "investmentStage" IS NOT NULL
  AND lower(trim("investmentStage")) ~ '^series\s*a';

UPDATE public.organizations
SET "investmentStage" = 'series_b'
WHERE "investmentStage" IS NOT NULL
  AND lower(trim("investmentStage")) ~ '^series\s*b';

UPDATE public.organizations
SET "investmentStage" = 'series_c_plus'
WHERE "investmentStage" IS NOT NULL
  AND (
    lower(trim("investmentStage")) ~ '^series\s*c'
    OR lower(trim("investmentStage")) ~ '^series\s*[d-z]\b'
  );

UPDATE public.organizations
SET "investmentStage" = 'growth'
WHERE "investmentStage" IS NOT NULL AND lower(trim("investmentStage")) = 'growth';

UPDATE public.organizations
SET "investmentStage" = 'late_stage'
WHERE "investmentStage" IS NOT NULL
  AND lower(trim("investmentStage")) IN ('late_stage', 'late-stage', 'late stage');

UPDATE public.organizations
SET "investmentStage" = 'unknown'
WHERE "investmentStage" IS NOT NULL
  AND lower(trim("investmentStage")) NOT IN (
    'pre_seed', 'seed', 'series_a', 'series_b', 'series_c_plus', 'growth', 'late_stage', 'unknown'
  );

COMMENT ON COLUMN public.organizations."fundingStatus" IS
  'Enum: bootstrapped | vc_backed | acquired | public | unknown';

COMMENT ON COLUMN public.organizations."investmentStage" IS
  'Enum: pre_seed | seed | series_a | series_b | series_c_plus | growth | late_stage | unknown';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_funding_status_enum;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_funding_status_enum
  CHECK ("fundingStatus" IS NULL OR "fundingStatus" IN ('bootstrapped', 'vc_backed', 'acquired', 'public', 'unknown'));

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_investment_stage_enum;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_investment_stage_enum
  CHECK (
    "investmentStage" IS NULL
    OR "investmentStage" IN (
      'pre_seed',
      'seed',
      'series_a',
      'series_b',
      'series_c_plus',
      'growth',
      'late_stage',
      'unknown'
    )
  );
