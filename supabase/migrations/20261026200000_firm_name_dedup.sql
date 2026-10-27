-- Firm name dedupe for Investor Records.
-- Search already matches firm_records.aliases. This adds the scan and merge
-- used by admin-market-intel, plus the normalize helper that search calls.
-- Admin RPCs are service-role only. No new tables.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

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
      IF t ~* '\s(ventures|venture|capital|partners?|partner|management|funds?|fund|investments?|investment|holdings?|holding|advisors?|advisory|vc|group|lp|llc|inc|corp|corporation|plc)\s*$' THEN
        t := regexp_replace(
          t,
          '\s(ventures|venture|capital|partners?|partner|management|funds?|fund|investments?|investment|holdings?|holding|advisors?|advisory|vc|group|lp|llc|inc|corp|corporation|plc)\s*$',
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
  'Lowercase, strip punctuation, map number words to digits, optionally strip corporate suffixes.';

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
  alias_blob := trim(both ' ' from
    coalesce(array_to_string(NEW.aliases, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.alternate_names, ' '), '')
  );
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.normalized_name, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(alias_blob, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(NEW.legal_name, '')), 'C');
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_firm_records_search_fields ON public.firm_records;
CREATE TRIGGER trg_firm_records_search_fields
  BEFORE INSERT OR UPDATE OF firm_name, aliases, alternate_names, legal_name
  ON public.firm_records
  FOR EACH ROW
  EXECUTE FUNCTION public.firm_records_refresh_search_fields();

CREATE INDEX IF NOT EXISTS idx_firm_records_normalized_name_trgm
  ON public.firm_records USING gin (normalized_name gin_trgm_ops)
  WHERE deleted_at IS NULL AND normalized_name IS NOT NULL AND normalized_name <> '';

CREATE INDEX IF NOT EXISTS idx_firm_records_search_vector
  ON public.firm_records USING gin (search_vector)
  WHERE deleted_at IS NULL;

-- Generic single-token cores. Same-core pairs in this list still cluster when
-- the full names are nearly the same (Angel Ventures vs Angel Ventures LLC).
DROP FUNCTION IF EXISTS public.admin_list_firm_duplicate_clusters(integer);

CREATE OR REPLACE FUNCTION public.admin_list_firm_duplicate_clusters(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 80);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_scanned integer := 0;
  v_total integer := 0;
  v_skipped integer := 0;
  v_clusters jsonb := '[]'::jsonb;
  v_deny text[] := ARRAY[
    'angel','alpha','beta','apex','atlas','base','black','blue','bridge','capital',
    'catalyst','core','crest','digital','east','first','forge','fund','funds','global',
    'gold','green','horizon','impact','launch','new','next','north','nova','open',
    'partner','partners','peak','pioneer','prime','red','rise','silver','south',
    'spark','summit','tech','true','vector','venture','ventures','vertex','west','white'
  ];
  i integer;
BEGIN
  PERFORM set_config('statement_timeout', '25000', true);

  DROP TABLE IF EXISTS pg_temp._firm_dup_pairs;
  DROP TABLE IF EXISTS pg_temp._firm_dup_label;
  DROP TABLE IF EXISTS pg_temp._firm_dup_base;

  CREATE TEMP TABLE _firm_dup_base (
    id uuid PRIMARY KEY,
    firm_name text NOT NULL,
    legal_name text,
    website_url text,
    aliases text[] NOT NULL,
    completeness_score numeric,
    ready_for_live boolean,
    norm_core text NOT NULL,
    norm_keep text NOT NULL,
    token text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _firm_dup_base (
    id, firm_name, legal_name, website_url, aliases, completeness_score, ready_for_live,
    norm_core, norm_keep, token
  )
  SELECT
    named.id,
    named.firm_name,
    named.legal_name,
    named.website_url,
    named.aliases,
    named.completeness_score,
    named.ready_for_live,
    named.norm_core,
    named.norm_keep,
    split_part(named.norm_core, ' ', 1)
  FROM (
    SELECT
      fr.id,
      fr.firm_name,
      fr.legal_name,
      fr.website_url,
      coalesce(fr.aliases, '{}'::text[]) AS aliases,
      fr.completeness_score,
      fr.ready_for_live,
      public.firm_search_normalize(fr.firm_name, true) AS norm_core,
      public.firm_search_normalize(fr.firm_name, false) AS norm_keep
    FROM public.firm_records fr
    WHERE fr.deleted_at IS NULL
      AND length(btrim(coalesce(fr.firm_name, ''))) > 0
  ) named;

  GET DIAGNOSTICS v_scanned = ROW_COUNT;

  CREATE INDEX _firm_dup_base_core_idx ON _firm_dup_base (norm_core);

  SELECT count(*)::integer INTO v_skipped
  FROM (
    SELECT norm_core
    FROM _firm_dup_base
    WHERE length(norm_core) >= 4
    GROUP BY norm_core
    HAVING count(*) > 15
  ) big;

  CREATE TEMP TABLE _firm_dup_pairs (
    a uuid NOT NULL,
    b uuid NOT NULL,
    PRIMARY KEY (a, b)
  ) ON COMMIT DROP;

  INSERT INTO _firm_dup_pairs (a, b)
  SELECT a.id, b.id
  FROM _firm_dup_base a
  JOIN (
    SELECT norm_core
    FROM _firm_dup_base
    WHERE length(norm_core) >= 4
    GROUP BY norm_core
    HAVING count(*) BETWEEN 2 AND 15
  ) ok ON ok.norm_core = a.norm_core
  JOIN _firm_dup_base b
    ON b.norm_core = a.norm_core
   AND a.id < b.id
  WHERE NOT (a.norm_core = ANY (v_deny))
     OR similarity(a.norm_keep, b.norm_keep) >= 0.78;

  INSERT INTO _firm_dup_pairs (a, b)
  SELECT a.id, b.id
  FROM _firm_dup_base a
  JOIN (
    SELECT token
    FROM _firm_dup_base
    WHERE length(token) >= 5
    GROUP BY token
    HAVING count(*) BETWEEN 2 AND 12
  ) ok ON ok.token = a.token
  JOIN _firm_dup_base b
    ON b.token = a.token
   AND a.id < b.id
   AND a.norm_core <> b.norm_core
  WHERE NOT (a.token = ANY (v_deny))
    AND similarity(a.norm_core, b.norm_core) >= 0.84
  ON CONFLICT DO NOTHING;

  CREATE TEMP TABLE _firm_dup_label (
    id uuid PRIMARY KEY,
    cluster uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _firm_dup_label (id, cluster)
  SELECT id, id
  FROM _firm_dup_base b
  WHERE EXISTS (
    SELECT 1 FROM _firm_dup_pairs p WHERE p.a = b.id OR p.b = b.id
  );

  FOR i IN 1..8 LOOP
    UPDATE _firm_dup_label l
    SET cluster = s.next_cluster
    FROM (
      SELECT
        x.id,
        LEAST(x.cluster::text, min(y.cluster::text))::uuid AS next_cluster
      FROM _firm_dup_label x
      JOIN _firm_dup_pairs p ON p.a = x.id OR p.b = x.id
      JOIN _firm_dup_label y ON y.id = CASE WHEN p.a = x.id THEN p.b ELSE p.a END
      GROUP BY x.id, x.cluster
    ) s
    WHERE l.id = s.id
      AND s.next_cluster IS NOT NULL
      AND s.next_cluster <> l.cluster;
  END LOOP;

  SELECT count(*)::integer INTO v_total
  FROM (
    SELECT cluster
    FROM _firm_dup_label
    GROUP BY cluster
    HAVING count(*) BETWEEN 2 AND 12
  ) c;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'member_count', c.member_count,
      'members', c.members
    )
    ORDER BY c.member_count DESC, c.sort_name
  ), '[]'::jsonb)
  INTO v_clusters
  FROM (
    SELECT
      l.cluster AS id,
      count(*)::integer AS member_count,
      min(b.firm_name) AS sort_name,
      jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'firm_name', b.firm_name,
          'legal_name', b.legal_name,
          'website_url', b.website_url,
          'aliases', to_jsonb(b.aliases),
          'completeness_score', b.completeness_score,
          'ready_for_live', b.ready_for_live
        )
        ORDER BY b.completeness_score DESC NULLS LAST, b.firm_name
      ) AS members
    FROM _firm_dup_label l
    JOIN _firm_dup_base b ON b.id = l.id
    GROUP BY l.cluster
    HAVING count(*) BETWEEN 2 AND 12
    ORDER BY count(*) DESC, min(b.firm_name)
    LIMIT v_limit
    OFFSET v_offset
  ) c;

  RETURN jsonb_build_object(
    'scanned', v_scanned,
    'total_clusters', v_total,
    'skipped_large', v_skipped,
    'clusters', coalesce(v_clusters, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.admin_list_firm_duplicate_clusters(integer, integer) IS
  'Admin-only. Groups live firm_records whose names match after suffix stripping or a close spelling.';

CREATE OR REPLACE FUNCTION public.admin_merge_firm_records(p_primary uuid, p_merge_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_dup uuid;
  v_found integer;
  v_name text;
  v_aliases text[];
  v_nil uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF p_primary IS NULL OR p_merge_ids IS NULL OR cardinality(p_merge_ids) < 1 OR cardinality(p_merge_ids) > 11 THEN
    RAISE EXCEPTION 'Select one primary firm and between 1 and 11 records to merge';
  END IF;

  IF p_primary = ANY (p_merge_ids) THEN
    RAISE EXCEPTION 'The primary firm cannot also be merged away';
  END IF;

  IF (SELECT count(DISTINCT x) FROM unnest(p_merge_ids) AS x) <> cardinality(p_merge_ids) THEN
    RAISE EXCEPTION 'The same firm was selected more than once';
  END IF;

  SELECT count(*)::integer INTO v_found
  FROM public.firm_records
  WHERE deleted_at IS NULL
    AND id = ANY (array_append(p_merge_ids, p_primary));

  IF v_found <> cardinality(p_merge_ids) + 1 THEN
    RAISE EXCEPTION 'One or more firms are missing or already deleted';
  END IF;

  SELECT firm_name INTO v_name
  FROM public.firm_records
  WHERE id = p_primary;

  FOREACH v_dup IN ARRAY p_merge_ids LOOP
    UPDATE public.startup_investment_links l
    SET firm_investor_id = keeper.id
    FROM public.firm_investors dup_person
    JOIN public.firm_investors keeper
      ON keeper.firm_id = p_primary
     AND keeper.deleted_at IS NULL
     AND lower(btrim(keeper.full_name)) = lower(btrim(dup_person.full_name))
    WHERE l.firm_investor_id = dup_person.id
      AND dup_person.firm_id = v_dup
      AND dup_person.deleted_at IS NULL
      AND keeper.id <> dup_person.id;

    DELETE FROM public.startup_investment_links d
    USING public.startup_investment_links p
    WHERE d.firm_id = v_dup
      AND p.firm_id = p_primary
      AND d.startup_id = p.startup_id
      AND coalesce(lower(btrim(d.round_name)), '') = coalesce(lower(btrim(p.round_name)), '')
      AND coalesce(d.firm_investor_id, v_nil) = coalesce(p.firm_investor_id, v_nil);

    UPDATE public.firm_investors d
    SET deleted_at = now()
    WHERE d.firm_id = v_dup
      AND d.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.firm_investors p
        WHERE p.firm_id = p_primary
          AND (
            p.full_name = d.full_name
            OR (
              p.deleted_at IS NULL
              AND lower(btrim(p.full_name)) = lower(btrim(d.full_name))
            )
          )
      );

    UPDATE public.firm_investors d
    SET slug = NULL
    WHERE d.firm_id = v_dup
      AND d.deleted_at IS NULL
      AND d.slug IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.firm_investors p
        WHERE p.deleted_at IS NULL
          AND p.slug = d.slug
          AND p.id <> d.id
      );

    UPDATE public.firm_investors
    SET firm_id = p_primary
    WHERE firm_id = v_dup
      AND deleted_at IS NULL;

    DELETE FROM public.firm_recent_deals d
    USING public.firm_recent_deals p
    WHERE d.firm_id = v_dup
      AND p.firm_id = p_primary
      AND d.normalized_company_name IS NOT NULL
      AND d.normalized_company_name = p.normalized_company_name;

    UPDATE public.firm_recent_deals SET firm_id = p_primary WHERE firm_id = v_dup;

    DELETE FROM public.portfolio_investments d
    USING public.portfolio_investments p
    WHERE d.firm_id = v_dup
      AND p.firm_id = p_primary
      AND d.portfolio_company_id = p.portfolio_company_id
      AND coalesce(d.round_type, '__null__') = coalesce(p.round_type, '__null__');

    UPDATE public.portfolio_investments SET firm_id = p_primary WHERE firm_id = v_dup;

    DELETE FROM public.portfolio_source_evidence d
    USING public.portfolio_source_evidence p
    WHERE d.firm_id = v_dup
      AND p.firm_id = p_primary
      AND d.source_name = p.source_name
      AND d.normalized_portfolio_company_name = p.normalized_portfolio_company_name;

    UPDATE public.portfolio_source_evidence SET firm_id = p_primary WHERE firm_id = v_dup;

    DELETE FROM public.firm_field_sources d
    USING public.firm_field_sources p
    WHERE d.firm_id = v_dup
      AND p.firm_id = p_primary
      AND d.field_name = p.field_name
      AND d.source_name = p.source_name;

    UPDATE public.firm_field_sources SET firm_id = p_primary WHERE firm_id = v_dup;

    DELETE FROM public.firm_source_url_candidates d
    USING public.firm_source_url_candidates p
    WHERE d.firm_id = v_dup
      AND p.firm_id = p_primary
      AND d.source_name = p.source_name
      AND d.candidate_url = p.candidate_url;

    UPDATE public.firm_source_url_candidates SET firm_id = p_primary WHERE firm_id = v_dup;

    DELETE FROM public.firm_tag_links d
    USING public.firm_tag_links p
    WHERE d.firm_id = v_dup
      AND p.firm_id = p_primary
      AND d.tag_id = p.tag_id;

    UPDATE public.firm_tag_links SET firm_id = p_primary WHERE firm_id = v_dup;

    DELETE FROM public.firm_website_candidates d
    USING public.firm_website_candidates p
    WHERE d.firm_id = v_dup
      AND p.firm_id = p_primary
      AND d.domain = p.domain;

    UPDATE public.firm_website_candidates SET firm_id = p_primary WHERE firm_id = v_dup;

    DELETE FROM public.founder_vc_interactions d
    USING public.founder_vc_interactions p
    WHERE d.firm_id = v_dup
      AND p.firm_id = p_primary
      AND d.founder_id = p.founder_id
      AND d.action_type = p.action_type;

    UPDATE public.founder_vc_interactions SET firm_id = p_primary WHERE firm_id = v_dup;

    DELETE FROM public.fund_records d
    USING public.fund_records p
    WHERE d.firm_id = v_dup
      AND p.firm_id = p_primary
      AND d.normalized_fund_name IS NOT NULL
      AND d.normalized_fund_name = p.normalized_fund_name;

    UPDATE public.fund_records SET firm_id = p_primary WHERE firm_id = v_dup;

    UPDATE public.startup_investment_links SET firm_id = p_primary WHERE firm_id = v_dup;
    UPDATE public.firm_field_values SET firm_id = p_primary WHERE firm_id = v_dup;
    UPDATE public.firm_source_evidence SET firm_id = p_primary WHERE firm_id = v_dup;
    UPDATE public.firm_data_qa_flags SET firm_id = p_primary WHERE firm_id = v_dup;
    UPDATE public.reputation_logs SET firm_id = p_primary WHERE firm_id = v_dup;
    UPDATE public.ninjapear_enrichment_cache SET firm_id = p_primary WHERE firm_id = v_dup;
    UPDATE public.ninjapear_headcount_snapshots SET firm_id = p_primary WHERE firm_id = v_dup;
    UPDATE public.enrichment_review_queue SET firm_id = p_primary WHERE firm_id = v_dup;
    UPDATE public.backfill_runs SET firm_id = p_primary WHERE firm_id = v_dup;
    UPDATE public.vc_funds SET firm_record_id = p_primary WHERE firm_record_id = v_dup;
    UPDATE public.vc_fund_signals SET firm_record_id = p_primary WHERE firm_record_id = v_dup;
    UPDATE public.candidate_capital_events SET firm_record_id = p_primary WHERE firm_record_id = v_dup;
    UPDATE public.vc_fund_sync_runs SET scope_firm_id = p_primary WHERE scope_firm_id = v_dup;
  END LOOP;

  UPDATE public.firm_records primary_row
  SET
    website_url = COALESCE(NULLIF(btrim(primary_row.website_url), ''), donor.website_url),
    logo_url = COALESCE(NULLIF(btrim(primary_row.logo_url), ''), donor.logo_url),
    legal_name = COALESCE(NULLIF(btrim(primary_row.legal_name), ''), donor.legal_name),
    linkedin_url = COALESCE(NULLIF(btrim(primary_row.linkedin_url), ''), donor.linkedin_url),
    description = COALESCE(NULLIF(btrim(primary_row.description), ''), donor.description),
    hq_city = COALESCE(NULLIF(btrim(primary_row.hq_city), ''), donor.hq_city),
    aliases = COALESCE(names.aliases, '{}'::text[]),
    alternate_names = COALESCE(names.aliases, '{}'::text[])
  FROM (
    SELECT
      (SELECT website_url FROM public.firm_records WHERE id = ANY (p_merge_ids) AND NULLIF(btrim(website_url), '') IS NOT NULL LIMIT 1) AS website_url,
      (SELECT logo_url FROM public.firm_records WHERE id = ANY (p_merge_ids) AND NULLIF(btrim(logo_url), '') IS NOT NULL LIMIT 1) AS logo_url,
      (SELECT legal_name FROM public.firm_records WHERE id = ANY (p_merge_ids) AND NULLIF(btrim(legal_name), '') IS NOT NULL LIMIT 1) AS legal_name,
      (SELECT linkedin_url FROM public.firm_records WHERE id = ANY (p_merge_ids) AND NULLIF(btrim(linkedin_url), '') IS NOT NULL LIMIT 1) AS linkedin_url,
      (SELECT description FROM public.firm_records WHERE id = ANY (p_merge_ids) AND NULLIF(btrim(description), '') IS NOT NULL LIMIT 1) AS description,
      (SELECT hq_city FROM public.firm_records WHERE id = ANY (p_merge_ids) AND NULLIF(btrim(hq_city), '') IS NOT NULL LIMIT 1) AS hq_city
  ) donor
  CROSS JOIN (
    SELECT array_agg(n ORDER BY n) AS aliases
    FROM (
      SELECT DISTINCT ON (lower(btrim(raw.n))) btrim(raw.n) AS n
      FROM (
        SELECT firm_name AS n FROM public.firm_records WHERE id = ANY (p_merge_ids)
        UNION ALL
        SELECT legal_name FROM public.firm_records WHERE id = ANY (p_merge_ids) OR id = p_primary
        UNION ALL
        SELECT unnest(coalesce(aliases, '{}'::text[])) FROM public.firm_records WHERE id = p_primary OR id = ANY (p_merge_ids)
        UNION ALL
        SELECT unnest(coalesce(alternate_names, '{}'::text[])) FROM public.firm_records WHERE id = p_primary OR id = ANY (p_merge_ids)
      ) raw
      WHERE raw.n IS NOT NULL
        AND length(btrim(raw.n)) > 0
      ORDER BY lower(btrim(raw.n)), length(btrim(raw.n)) DESC
    ) cleaned
    WHERE lower(cleaned.n) <> lower(btrim(v_name))
  ) names
  WHERE primary_row.id = p_primary;

  UPDATE public.firm_records
  SET deleted_at = now(),
      ready_for_live = false
  WHERE id = ANY (p_merge_ids);

  SELECT coalesce(aliases, '{}'::text[]) INTO v_aliases
  FROM public.firm_records
  WHERE id = p_primary;

  RETURN jsonb_build_object(
    'primary_id', p_primary,
    'firm_name', v_name,
    'aliases', to_jsonb(v_aliases),
    'merged_ids', to_jsonb(p_merge_ids)
  );
END;
$$;

COMMENT ON FUNCTION public.admin_merge_firm_records(uuid, uuid[]) IS
  'Admin-only. Keeps the primary firm, stores the other names as aliases, moves related rows, and soft-deletes the duplicates.';

REVOKE ALL ON FUNCTION public.admin_list_firm_duplicate_clusters(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_merge_firm_records(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_firm_duplicate_clusters(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_merge_firm_records(uuid, uuid[]) TO service_role;
