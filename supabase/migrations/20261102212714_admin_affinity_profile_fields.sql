ALTER TABLE public.startup_founders
  ADD COLUMN IF NOT EXISTS education text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.operator_profiles
  ADD COLUMN IF NOT EXISTS education text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE public.startup_founders
SET education = ARRAY[BTRIM(education_highlight)]::text[]
WHERE COALESCE(CARDINALITY(education), 0) = 0
  AND NULLIF(BTRIM(education_highlight), '') IS NOT NULL;
