-- Fuzzy / normalized / alias-based firm + investor name search
-- - firm_search_normalize() for query + stored names (number words, punctuation, optional suffix strip)
-- - firm_records.normalized_name, search_vector + trigger
-- - firm_investors.normalized_full_name + trigger
-- - RPCs: search_firm_records, search_firm_investors (pg_trgm + FTS ranking)
-- Uses existing firm_records.aliases text[] (see 20260331120000_firm_records_aliases_and_dedup.sql)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Normalization (shared; p_strip_suffix=false for person names) ────────────

CREATE OR REPLACE FUNCTION public.firm_search_normalize(p_input text, p_strip_suffix boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text;
  changed boolean;
BEGIN
  IF p_input IS NULL THEN
    RETURN '';
  END IF;

  t := lower(trim(p_input));
  IF t = '' THEN
    RETURN '';
  END IF;

  t := replace(t, '&', ' and ');
  t := regexp_replace(t, '[^a-z0-9]+', ' ', 'g');
  t := regexp_replace(t, '\s+', ' ', 'g');
  t := trim(t);
  IF t = '' THEN
    RETURN '';
  END IF;

  t := ' ' || t || ' ';

  -- Spelled-out numbers → digits (padded tokens; longer words first)
  t := regexp_replace(t, '\s+twelve\s+', ' 12 ', 'gi');
  t := regexp_replace(t, '\s+eleven\s+', ' 11 ', 'gi');
  t := regexp_replace(t, '\s+thirteen\s+', ' 13 ', 'gi');
  t := regexp_replace(t, '\s+fourteen\s+', ' 14 ', 'gi');
  t := regexp_replace(t, '\s+fifteen\s+', ' 15 ', 'gi');
  t := regexp_replace(t, '\s+ten\s+', ' 10 ', 'gi');
  t := regexp_replace(t, '\s+nine\s+', ' 9 ', 'gi');
  t := regexp_replace(t, '\s+eight\s+', ' 8 ', 'gi');
  t := regexp_replace(t, '\s+seven\s+', ' 7 ', 'gi');
  t := regexp_replace(t, '\s+six\s+', ' 6 ', 'gi');
  t := regexp_replace(t, '\s+five\s+', ' 5 ', 'gi');
  t := regexp_replace(t, '\s+four\s+', ' 4 ', 'gi');
  t := regexp_replace(t, '\s+three\s+', ' 3 ', 'gi');
  t := regexp_replace(t, '\s+two\s+', ' 2 ', 'gi');
  t := regexp_replace(t, '\s+one\s+', ' 1 ', 'gi');
  t := regexp_replace(t, '\s+zero\s+', ' 0 ', 'gi');

  t := trim(regexp_replace(t, '\s+', ' ', 'g'));

  IF p_strip_suffix THEN
    LOOP
      changed := false;
      IF t ~* '\s(ventures|venture|capital|partners?|partner|management|funds?|fund|investments?|investment|holdings?|holding|advisors?|advisory|vc|v\.c\.|group|lp|llc|inc|corp|corporation|plc)\s*$' THEN
        t := regexp_replace(
          t,
          '\s(ventures|venture|capital|partners?|partner|management|funds?|fund|investments?|investment|holdings?|holding|advisors?|advisory|vc|v\.c\.|group|lp|llc|inc|corp|corporation|plc)\s*$',
          '',
          'gi'
        );
        changed := true;
      END IF;
      t := trim(regexp_replace(t, '\s+', ' ', 'g'));
      EXIT WHEN NOT changed;
    END LOOP;
  END IF;

  RETURN trim(regexp_replace(t, '\s+', ' ', 'g'));
END;
$$;

COMMENT ON FUNCTION public.firm_search_normalize(text, boolean) IS
  'Lowercase, strip punctuation to spaces, map common English number words to digits, collapse spaces, optionally strip corporate suffix tokens for fuzzy matching.';

-- ── firm_records: derived search fields ──────────────────────────────────────

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS normalized_name text,
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.firm_records_refresh_search_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  alias_blob text;
BEGIN
  NEW.normalized_name := public.firm_search_normalize(COALESCE(NEW.firm_name, ''), true);
  alias_blob := coalesce(array_to_string(NEW.aliases, ' '), '');
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.normalized_name, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(alias_blob, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(NEW.legal_name, '')), 'C');
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_firm_records_search_fields ON public.firm_records;
CREATE TRIGGER trg_firm_records_search_fields
  BEFORE INSERT OR UPDATE OF firm_name, aliases, legal_name
  ON public.firm_records
  FOR EACH ROW
  EXECUTE PROCEDURE public.firm_records_refresh_search_fields();

UPDATE public.firm_records
SET firm_name = firm_name
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_records_normalized_name_trgm
  ON public.firm_records USING gin (normalized_name gin_trgm_ops)
  WHERE deleted_at IS NULL AND normalized_name IS NOT NULL AND normalized_name <> '';

CREATE INDEX IF NOT EXISTS idx_firm_records_search_vector
  ON public.firm_records USING gin (search_vector)
  WHERE deleted_at IS NULL;

-- ── firm_investors ───────────────────────────────────────────────────────────

ALTER TABLE public.firm_investors
  ADD COLUMN IF NOT EXISTS normalized_full_name text;

CREATE OR REPLACE FUNCTION public.firm_investors_refresh_normalized_name()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.normalized_full_name := public.firm_search_normalize(COALESCE(NEW.full_name, ''), false);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_firm_investors_normalized_name ON public.firm_investors;
CREATE TRIGGER trg_firm_investors_normalized_name
  BEFORE INSERT OR UPDATE OF full_name
  ON public.firm_investors
  FOR EACH ROW
  EXECUTE PROCEDURE public.firm_investors_refresh_normalized_name();

UPDATE public.firm_investors
SET full_name = full_name
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_investors_normalized_full_name_trgm
  ON public.firm_investors USING gin (normalized_full_name gin_trgm_ops)
  WHERE deleted_at IS NULL AND normalized_full_name IS NOT NULL AND normalized_full_name <> '';

-- ── Seed aliases: 7-Eleven Ventures (canonical display unchanged) ───────────

UPDATE public.firm_records
SET aliases = coalesce(
  (
    SELECT array_agg(v ORDER BY v)
    FROM (
      SELECT DISTINCT u AS v
      FROM unnest(
        coalesce(aliases, '{}'::text[])
        || ARRAY[
          '7 eleven',
          'seven eleven',
          '7/11',
          '7-11',
          '711',
          'seven 11',
          '7 11',
          '7eleven',
          '7-ventures',
          'seven eleven partners'
        ]
      ) AS t(u)
    ) s
  ),
  '{}'::text[]
)
WHERE deleted_at IS NULL
  AND (
    firm_name ILIKE '7-eleven%'
    OR firm_name ILIKE 'seven eleven%'
  );

-- ── RPC: firm search ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_firm_records(
  p_query text,
  p_limit integer DEFAULT 40,
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

-- ── RPC: investor (person) search ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_firm_investors(
  p_query text,
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  id uuid,
  firm_id uuid,
  full_name text,
  title text,
  avatar_url text,
  profile_image_url text,
  firm_name text,
  match_rank integer,
  sim_score double precision
)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT
      nullif(trim(coalesce(p_query, '')), '') AS raw,
      public.firm_search_normalize(coalesce(p_query, ''), false) AS nq
  ),
  base AS (
    SELECT
      fi.id,
      fi.firm_id,
      fi.full_name,
      fi.title,
      fi.avatar_url,
      fi.profile_image_url,
      fr.firm_name,
      fi.normalized_full_name AS pnorm,
      (SELECT nq FROM q) AS nq,
      (SELECT raw FROM q) AS raw
    FROM public.firm_investors fi
    INNER JOIN public.firm_records fr ON fr.id = fi.firm_id AND fr.deleted_at IS NULL
    CROSS JOIN q
    WHERE fi.deleted_at IS NULL
      AND coalesce(fi.ready_for_live, false) = true
      AND q.raw IS NOT NULL
      AND q.nq IS NOT NULL
      AND q.nq <> ''
      AND (
        fi.normalized_full_name = q.nq
        OR position(lower(q.raw) IN lower(fi.full_name)) > 0
        OR (fi.normalized_full_name IS NOT NULL AND fi.normalized_full_name % q.nq)
        OR similarity(nullif(fi.normalized_full_name, ''), q.nq) > 0.25
        OR public.firm_search_normalize(fr.firm_name, true) = q.nq
        OR position(lower(q.raw) IN lower(fr.firm_name)) > 0
        OR similarity(nullif(public.firm_search_normalize(fr.firm_name, true), ''), q.nq) > 0.22
      )
  )
  SELECT
    b.id,
    b.firm_id,
    b.full_name,
    b.title,
    b.avatar_url,
    b.profile_image_url,
    b.firm_name,
    CASE
      WHEN b.pnorm = b.nq THEN 0
      WHEN lower(b.full_name) = lower(b.raw) THEN 1
      ELSE 2
    END::integer AS match_rank,
    greatest(
      coalesce(similarity(nullif(b.pnorm, ''), b.nq), 0),
      coalesce(similarity(nullif(public.firm_search_normalize(b.firm_name, true), ''), b.nq), 0)
    ) AS sim_score
  FROM base b
  ORDER BY match_rank ASC, sim_score DESC, b.full_name ASC
  LIMIT greatest(coalesce(nullif(p_limit, 0), 25), 1);
$$;

GRANT EXECUTE ON FUNCTION public.firm_search_normalize(text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_firm_records(text, integer, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_firm_investors(text, integer) TO anon, authenticated, service_role;
