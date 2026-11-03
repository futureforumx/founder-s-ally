ALTER TABLE public.operator_profiles
  ADD COLUMN IF NOT EXISTS stage_focuses text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE public.operator_profiles
SET stage_focuses = ARRAY(
  SELECT BTRIM(focus)
  FROM UNNEST(STRING_TO_ARRAY(stage_focus, ',')) AS split(focus)
  WHERE NULLIF(BTRIM(focus), '') IS NOT NULL
)
WHERE COALESCE(CARDINALITY(stage_focuses), 0) = 0
  AND NULLIF(BTRIM(stage_focus), '') IS NOT NULL;
