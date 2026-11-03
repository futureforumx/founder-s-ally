-- Employment entries remain profile-local; employer names do not create company records.
ALTER TABLE public.startup_founders
  ADD COLUMN IF NOT EXISTS employment_history jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.operator_profiles
  ADD COLUMN IF NOT EXISTS employment_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Migrate founder startup/company links and the previously stored single current employer.
WITH employment_rows AS (
  SELECT
    f.id,
    1 AS position,
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'employer_type', 'company',
      'employer_name', s.company_name,
      'title', COALESCE(f.role, ''),
      'relationship', CASE WHEN f.role ILIKE '%founder%' THEN 'founded' ELSE 'hired' END,
      'is_current', COALESCE(f.is_currently_at_startup, NULLIF(BTRIM(f.current_employer_name), '') IS NULL)
    ) AS entry
  FROM public.startup_founders f
  JOIN public.startups s ON s.id = f.startup_id
  WHERE f.employment_history = '[]'::jsonb
  UNION ALL
  SELECT
    f.id,
    2 AS position,
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'employer_type', COALESCE(NULLIF(f.current_employer_type, ''), 'company'),
      'employer_name', BTRIM(f.current_employer_name),
      'title', COALESCE(f.current_employer_title, ''),
      'relationship', 'hired',
      'is_current', COALESCE(NOT f.is_currently_at_startup, true)
    ) AS entry
  FROM public.startup_founders f
  LEFT JOIN public.startups s ON s.id = f.startup_id
  WHERE f.employment_history = '[]'::jsonb
    AND NULLIF(BTRIM(f.current_employer_name), '') IS NOT NULL
    AND (s.company_name IS NULL OR LOWER(BTRIM(s.company_name)) <> LOWER(BTRIM(f.current_employer_name)))
), aggregated AS (
  SELECT id, jsonb_agg(entry ORDER BY position) AS entries
  FROM employment_rows
  GROUP BY id
)
UPDATE public.startup_founders f
SET employment_history = aggregated.entries
FROM aggregated
WHERE f.id = aggregated.id;

-- Operators may have a linked startup, an explicitly saved employer, or the older
-- current_company_name value from network enrichment. Keep each as a profile entry.
WITH employment_rows AS (
  SELECT
    o.id,
    1 AS position,
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'employer_type', 'company',
      'employer_name', s.company_name,
      'title', COALESCE(o.title, ''),
      'relationship', CASE WHEN o.title ILIKE '%founder%' THEN 'founded' ELSE 'hired' END,
      'is_current', COALESCE(o.is_currently_at_startup, NULLIF(BTRIM(o.current_employer_name), '') IS NULL)
    ) AS entry
  FROM public.operator_profiles o
  JOIN public.startups s ON s.id = o.startup_id
  WHERE o.employment_history = '[]'::jsonb
  UNION ALL
  SELECT
    o.id,
    2 AS position,
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'employer_type', COALESCE(NULLIF(o.current_employer_type, ''), 'company'),
      'employer_name', BTRIM(o.current_employer_name),
      'title', COALESCE(o.current_employer_title, ''),
      'relationship', 'hired',
      'is_current', COALESCE(NOT o.is_currently_at_startup, true)
    ) AS entry
  FROM public.operator_profiles o
  LEFT JOIN public.startups s ON s.id = o.startup_id
  WHERE o.employment_history = '[]'::jsonb
    AND NULLIF(BTRIM(o.current_employer_name), '') IS NOT NULL
    AND (s.company_name IS NULL OR LOWER(BTRIM(s.company_name)) <> LOWER(BTRIM(o.current_employer_name)))
  UNION ALL
  SELECT
    o.id,
    3 AS position,
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'employer_type', 'company',
      'employer_name', BTRIM(o.current_company_name),
      'title', COALESCE(o.title, ''),
      'relationship', CASE WHEN o.title ILIKE '%founder%' THEN 'founded' ELSE 'hired' END,
      'is_current', true
    ) AS entry
  FROM public.operator_profiles o
  WHERE o.employment_history = '[]'::jsonb
    AND o.startup_id IS NULL
    AND NULLIF(BTRIM(o.current_employer_name), '') IS NULL
    AND NULLIF(BTRIM(o.current_company_name), '') IS NOT NULL
), aggregated AS (
  SELECT id, jsonb_agg(entry ORDER BY position) AS entries
  FROM employment_rows
  GROUP BY id
)
UPDATE public.operator_profiles o
SET employment_history = aggregated.entries
FROM aggregated
WHERE o.id = aggregated.id;

COMMENT ON COLUMN public.startup_founders.employment_history IS
  'Founder employment history. Each entry stores employer label, type, title, relationship, and current status without creating employer records.';
COMMENT ON COLUMN public.operator_profiles.employment_history IS
  'Operator employment history. Each entry stores employer label, type, title, relationship, and current status without creating employer records.';
