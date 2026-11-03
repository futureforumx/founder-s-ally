-- Replace the retired combined stage with the three more specific stages.
WITH affected AS (
  SELECT
    id,
    CASE
      WHEN COALESCE(CARDINALITY(stage_focuses), 0) > 0 THEN stage_focuses
      ELSE STRING_TO_ARRAY(COALESCE(stage_focus, ''), ',')
    END AS current_stages
  FROM public.operator_profiles
  WHERE EXISTS (
    SELECT 1
    FROM UNNEST(COALESCE(stage_focuses, ARRAY[]::text[])) AS stage(value)
    WHERE LOWER(BTRIM(stage.value)) = 'series b+'
  ) OR EXISTS (
    SELECT 1
    FROM UNNEST(STRING_TO_ARRAY(COALESCE(stage_focus, ''), ',')) AS stage(value)
    WHERE LOWER(BTRIM(stage.value)) = 'series b+'
  )
), expanded AS (
  SELECT affected.id, BTRIM(replacement.value) AS value,
         original.position, replacement.replacement_position
  FROM affected
  CROSS JOIN LATERAL UNNEST(affected.current_stages) WITH ORDINALITY AS original(value, position)
  CROSS JOIN LATERAL UNNEST(
    CASE WHEN LOWER(BTRIM(original.value)) = 'series b+'
      THEN ARRAY['Series B', 'Series C', 'Growth']::text[]
      ELSE ARRAY[BTRIM(original.value)]::text[]
    END
  ) WITH ORDINALITY AS replacement(value, replacement_position)
  WHERE NULLIF(BTRIM(replacement.value), '') IS NOT NULL
), deduplicated AS (
  SELECT id, value, MIN(position) AS position, MIN(replacement_position) AS replacement_position
  FROM expanded
  GROUP BY id, value
), normalized AS (
  SELECT id, ARRAY_AGG(value ORDER BY position, replacement_position) AS stages
  FROM deduplicated
  GROUP BY id
)
UPDATE public.operator_profiles AS profile
SET stage_focuses = normalized.stages,
    stage_focus = normalized.stages[1]
FROM normalized
WHERE profile.id = normalized.id;
