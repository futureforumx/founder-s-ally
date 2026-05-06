-- Broaden `search_firm_records` so admin / API callers find firms when:
-- - display text differs by spacing ("1000 Angels" vs "1000Angels")
-- - a label only exists on `alternate_names` (not indexed in `search_vector` today)

-- Parameter order must be (integer, text, boolean): PostgREST sends JSON keys alphabetically
-- (p_limit, p_query, p_ready_for_live) → positional args; (text, integer, boolean) breaks RPC resolution.
CREATE OR REPLACE FUNCTION public.search_firm_records(
  p_limit integer DEFAULT 40,
  p_query text DEFAULT NULL,
  p_ready_for_live boolean DEFAULT NULL
)
RETURNS SETOF public.firm_records
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_raw text;
  v_nq text;
  v_tsquery tsquery;
  v_collapsed_q text;
BEGIN
  v_raw := nullif(trim(coalesce(p_query, '')), '');
  IF v_raw IS NULL THEN
    RETURN;
  END IF;

  v_nq := public.firm_search_normalize(v_raw, true);
  IF v_nq = '' THEN
    RETURN;
  END IF;

  v_tsquery := plainto_tsquery(
    'simple',
    regexp_replace(regexp_replace(v_nq, '[^\w]+', ' ', 'g'), '\s+', ' & ', 'g')
  );

  v_collapsed_q := regexp_replace(lower(trim(v_raw)), '\s', '', 'g');

  RETURN QUERY
  SELECT fr.*
  FROM public.firm_records fr
  WHERE fr.deleted_at IS NULL
    AND (p_ready_for_live IS NULL OR fr.ready_for_live IS NOT DISTINCT FROM p_ready_for_live)
    AND (
      fr.normalized_name = v_nq
      OR EXISTS (
        SELECT 1
        FROM unnest(coalesce(fr.aliases, '{}'::text[])) a(alias)
        WHERE public.firm_search_normalize(alias, true) = v_nq
      )
      OR position(lower(v_raw) IN lower(fr.firm_name)) > 0
      OR EXISTS (
        SELECT 1
        FROM unnest(coalesce(fr.aliases, '{}'::text[])) a(alias)
        WHERE position(lower(v_raw) IN lower(alias)) > 0
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(coalesce(fr.alternate_names, '{}'::text[])) an(alt)
        WHERE alt IS NOT NULL
          AND length(trim(alt)) > 0
          AND (
            position(lower(v_raw) IN lower(alt)) > 0
            OR (
              char_length(v_collapsed_q) >= 4
              AND regexp_replace(lower(trim(alt)), '\s', '', 'g') LIKE '%' || v_collapsed_q || '%'
            )
          )
      )
      OR (
        char_length(v_collapsed_q) >= 4
        AND regexp_replace(lower(fr.firm_name), '\s', '', 'g') LIKE '%' || v_collapsed_q || '%'
      )
      OR (
        char_length(v_collapsed_q) >= 4
        AND fr.legal_name IS NOT NULL
        AND regexp_replace(lower(fr.legal_name), '\s', '', 'g') LIKE '%' || v_collapsed_q || '%'
      )
      OR (fr.normalized_name IS NOT NULL AND fr.normalized_name <> '' AND fr.normalized_name % v_nq)
      OR similarity(nullif(fr.normalized_name, ''), v_nq) > 0.22
      OR EXISTS (
        SELECT 1
        FROM unnest(coalesce(fr.aliases, '{}'::text[])) a(alias)
        WHERE similarity(nullif(public.firm_search_normalize(alias, true), ''), v_nq) > 0.28
      )
      OR (fr.search_vector IS NOT NULL AND v_tsquery IS NOT NULL AND fr.search_vector @@ v_tsquery)
    )
  ORDER BY
    CASE
      WHEN fr.normalized_name = v_nq THEN 0
      WHEN EXISTS (
        SELECT 1
        FROM unnest(coalesce(fr.aliases, '{}'::text[])) a(alias)
        WHERE public.firm_search_normalize(alias, true) = v_nq
      ) THEN 1
      WHEN lower(fr.firm_name) = lower(v_raw) THEN 2
      ELSE 3
    END ASC,
    greatest(
      coalesce(similarity(nullif(fr.normalized_name, ''), v_nq), 0),
      coalesce((
        SELECT max(similarity(nullif(public.firm_search_normalize(alias, true), ''), v_nq))
        FROM unnest(coalesce(fr.aliases, '{}'::text[])) AS a(alias)
      ), 0)
    ) DESC,
    coalesce(ts_rank_cd(fr.search_vector, v_tsquery), 0) DESC,
    fr.firm_name ASC
  LIMIT greatest(coalesce(nullif(p_limit, 0), 40), 1);
END;
$$;

COMMENT ON FUNCTION public.search_firm_records(integer, text, boolean) IS
  'Fuzzy firm search (name, aliases, alternate_names, whitespace-insensitive substring, FTS). Used by directory + admin.';
