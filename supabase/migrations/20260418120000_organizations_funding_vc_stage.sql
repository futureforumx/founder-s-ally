-- Canonical funding / stage signals for directory companies (organizations).
-- Aligns with Network company cards and future enrichment jobs.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS "fundingStatus" text,
  ADD COLUMN IF NOT EXISTS "vcBacked" boolean,
  ADD COLUMN IF NOT EXISTS "investmentStage" text;

COMMENT ON COLUMN public.organizations."fundingStatus" IS
  'Coarse capital posture (normalized by 20260418140000): bootstrapped, vc_backed, acquired, public, unknown.';

COMMENT ON COLUMN public.organizations."vcBacked" IS
  'True when the company has taken VC / institutional equity; false when known not VC-backed; NULL still unknown.';

COMMENT ON COLUMN public.organizations."investmentStage" IS
  'Latest known primary round label, e.g. Pre-seed, Seed, Series A (distinct from YC cohort in ycBatch).';

-- YC signal → treat as VC-backed (best-effort backfill for existing rows)
UPDATE public.organizations
SET
  "vcBacked" = true,
  "fundingStatus" = 'vc_backed'
WHERE ("isYcBacked" = true OR ("ycBatch" IS NOT NULL AND btrim("ycBatch") <> ''))
  AND "vcBacked" IS NULL
  AND "fundingStatus" IS NULL;

-- Remaining rows: at least populate funding_status so the column is meaningful until enrichment
UPDATE public.organizations
SET "fundingStatus" = 'unknown'
WHERE "fundingStatus" IS NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_funding_status
  ON public.organizations ("fundingStatus")
  WHERE "fundingStatus" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_vc_backed
  ON public.organizations ("vcBacked")
  WHERE "vcBacked" IS NOT NULL;
