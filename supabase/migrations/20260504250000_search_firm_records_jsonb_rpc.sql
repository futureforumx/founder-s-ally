-- PostgREST fails to resolve overloaded `search_firm_records(text,int,bool)` vs `(int,text,bool)`
-- and reports schema-cache errors for `(p_limit, p_query, p_ready_for_live)`.
-- Single jsonb argument → one catalog entry, stable RPC.

DROP FUNCTION IF EXISTS public.search_firm_records(text, integer, boolean);
DROP FUNCTION IF EXISTS public.search_firm_records(integer, text, boolean);

CREATE OR REPLACE FUNCTION public.search_firm_records(args jsonb)
RETURNS SETOF public.firm_records
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_raw text;
  v_nq text;
  v_tsquery tsquery;
  v_collapsed_q text;
  p_limit int;
  p_ready_for_live boolean;
BEGIN
  p_limit := COALESCE(NULLIF((args->>'p_limit'), '')::integer, 40);
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 40;
  END IF;

  IF NOT (args ? 'p_ready_for_live') OR jsonb_typeof(args->'p_ready_for_live') = 'null' THEN
    p_ready_for_live := NULL;
  ELSE
    p_ready_for_live := (args->>'p_ready_for_live')::boolean;
  END IF;

  v_raw := nullif(trim(coalesce(args->>'p_query', '')), '');
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

COMMENT ON FUNCTION public.search_firm_records(jsonb) IS
  'Fuzzy firm search (name, aliases, alternate_names, whitespace-insensitive substring, FTS). Args: { "p_query", "p_limit"?, "p_ready_for_live"? }.';

GRANT EXECUTE ON FUNCTION public.search_firm_records(jsonb) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
