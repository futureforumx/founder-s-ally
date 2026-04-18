-- =============================================================================
-- Migration: canonical freshness metadata and sync-run observability
-- DATE:      2026-04-18
-- PURPOSE:   Make verified fresh-capital state explicit on canonical tables,
--            tighten public/backend reads to verified fund records, and add
--            lightweight run logging for scheduled detect/verify/promote/
--            rederive/mirror flows.
-- =============================================================================

ALTER TABLE public.vc_funds
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS freshness_synced_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS latest_source_published_at timestamptz;

ALTER TABLE public.vc_funds
  DROP CONSTRAINT IF EXISTS vc_funds_verification_status_chk;

ALTER TABLE public.vc_funds
  ADD CONSTRAINT vc_funds_verification_status_chk CHECK (
    verification_status IN ('verified', 'official_source_promoted', 'manual_reviewed')
  );

CREATE INDEX IF NOT EXISTS idx_vc_funds_verification_status
  ON public.vc_funds (verification_status, freshness_synced_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS freshness_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS freshness_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_verified_vc_fund_id uuid REFERENCES public.vc_funds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recent_capital_signal_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_firm_records_freshness_synced_at
  ON public.firm_records (freshness_synced_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

ALTER TABLE public.fund_records
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS canonical_freshness_synced_at timestamptz;

CREATE TABLE IF NOT EXISTS public.vc_fund_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  dry_run boolean NOT NULL DEFAULT false,
  scope_firm_id uuid REFERENCES public.firm_records(id) ON DELETE SET NULL,
  scope_cluster_key text,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_fund_sync_runs_phase_chk CHECK (
    phase IN ('detect', 'verify', 'promote', 'rederive', 'mirror', 'daily')
  ),
  CONSTRAINT vc_fund_sync_runs_status_chk CHECK (
    status IN ('running', 'completed', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_vc_fund_sync_runs_phase_started
  ON public.vc_fund_sync_runs (phase, started_at DESC);

ALTER TABLE public.vc_fund_sync_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vc_fund_sync_runs' AND policyname = 'vc_fund_sync_runs_select_authenticated'
  ) THEN
    CREATE POLICY "vc_fund_sync_runs_select_authenticated"
      ON public.vc_fund_sync_runs FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vc_fund_sync_runs' AND policyname = 'vc_fund_sync_runs_service_all'
  ) THEN
    CREATE POLICY "vc_fund_sync_runs_service_all"
      ON public.vc_fund_sync_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS vc_fund_sync_runs_updated_at ON public.vc_fund_sync_runs;
CREATE TRIGGER vc_fund_sync_runs_updated_at
  BEFORE UPDATE ON public.vc_fund_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE VIEW public.vc_fund_sync_latest_runs AS
SELECT DISTINCT ON (phase)
  id,
  phase,
  status,
  dry_run,
  scope_firm_id,
  scope_cluster_key,
  options,
  stats,
  error_message,
  started_at,
  completed_at,
  updated_at
FROM public.vc_fund_sync_runs
ORDER BY phase, started_at DESC;

CREATE OR REPLACE FUNCTION public.refresh_firm_capital_derived_fields(
  p_firm_record_id uuid DEFAULT NULL,
  p_fresh_window_days integer DEFAULT 365
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH verified_funds AS (
    SELECT
      vf.*
    FROM public.vc_funds vf
    WHERE vf.deleted_at IS NULL
      AND vf.verification_status IN ('verified', 'official_source_promoted', 'manual_reviewed')
      AND (p_firm_record_id IS NULL OR vf.firm_record_id = p_firm_record_id)
  ),
  fund_base AS (
    SELECT
      vf.firm_record_id,
      vf.id,
      COALESCE(vf.announced_date, vf.close_date, (vf.created_at AT TIME ZONE 'UTC')::date) AS capital_date,
      COALESCE(vf.final_size_usd, vf.target_size_usd) AS representative_size_usd,
      vf.vintage_year,
      vf.fund_type,
      vf.status,
      COALESCE(vf.likely_actively_deploying, false) AS likely_actively_deploying,
      vf.active_deployment_window_start,
      vf.active_deployment_window_end,
      vf.estimated_check_min_usd,
      vf.estimated_check_max_usd,
      vf.last_verified_at,
      vf.freshness_synced_at
    FROM verified_funds vf
  ),
  latest_verified_fund AS (
    SELECT DISTINCT ON (vf.firm_record_id)
      vf.firm_record_id,
      vf.id AS latest_verified_vc_fund_id,
      vf.last_verified_at,
      vf.freshness_synced_at
    FROM verified_funds vf
    ORDER BY
      vf.firm_record_id,
      COALESCE(vf.announced_date, vf.close_date, (vf.created_at AT TIME ZONE 'UTC')::date) DESC NULLS LAST,
      vf.last_verified_at DESC NULLS LAST,
      vf.updated_at DESC
  ),
  source_rollup AS (
    SELECT
      vf.id AS vc_fund_id,
      bool_or(vfs.source_type = 'official_website') AS official_source_present
    FROM verified_funds vf
    LEFT JOIN public.vc_fund_sources vfs
      ON vfs.vc_fund_id = vf.id
    GROUP BY vf.id
  ),
  signal_base AS (
    SELECT
      s.firm_record_id,
      max(s.created_at) AS last_capital_signal_at,
      max(s.confidence) AS max_signal_confidence,
      count(*) FILTER (
        WHERE s.event_date >= CURRENT_DATE - GREATEST(COALESCE(p_fresh_window_days, 365), 1)
      )::integer AS recent_capital_signal_count
    FROM public.vc_fund_signals s
    JOIN verified_funds vf
      ON vf.id = s.vc_fund_id
    WHERE p_firm_record_id IS NULL OR s.firm_record_id = p_firm_record_id
    GROUP BY s.firm_record_id
  ),
  rollup AS (
    SELECT
      fb.firm_record_id,
      max(fb.capital_date) AS last_fund_announcement_date,
      max(fb.representative_size_usd) FILTER (WHERE fb.representative_size_usd IS NOT NULL) AS latest_fund_size_usd,
      bool_or(
        fb.capital_date >= (CURRENT_DATE - GREATEST(COALESCE(p_fresh_window_days, 365), 1))
      ) AS has_fresh_capital,
      bool_or(
        fb.likely_actively_deploying
        OR (
          fb.active_deployment_window_start IS NOT NULL
          AND fb.active_deployment_window_end IS NOT NULL
          AND CURRENT_DATE BETWEEN fb.active_deployment_window_start AND fb.active_deployment_window_end
        )
      ) AS likely_actively_deploying,
      max(fb.vintage_year) FILTER (
        WHERE fb.likely_actively_deploying
           OR (
             fb.active_deployment_window_start IS NOT NULL
             AND fb.active_deployment_window_end IS NOT NULL
             AND CURRENT_DATE BETWEEN fb.active_deployment_window_start AND fb.active_deployment_window_end
           )
      ) AS active_fund_vintage,
      count(*) FILTER (
        WHERE fb.likely_actively_deploying
           OR (
             fb.active_deployment_window_start IS NOT NULL
             AND fb.active_deployment_window_end IS NOT NULL
             AND CURRENT_DATE BETWEEN fb.active_deployment_window_start AND fb.active_deployment_window_end
           )
      )::integer AS active_fund_count,
      max(sb.last_capital_signal_at) AS last_capital_signal_at,
      max(sb.recent_capital_signal_count) AS recent_capital_signal_count,
      max(lvf.last_verified_at) AS freshness_verified_at,
      max(lvf.freshness_synced_at) AS freshness_synced_at,
      max(lvf.latest_verified_vc_fund_id) AS latest_verified_vc_fund_id,
      round(
        (
          COALESCE(
            max(
              CASE
                WHEN fb.capital_date IS NULL THEN 0
                ELSE GREATEST(0, 365 - (CURRENT_DATE - fb.capital_date))
              END
            )::numeric / 365.0,
            0
          ) * 0.45
        ) +
        (
          LEAST(COALESCE(max(fb.representative_size_usd), 0), 1000000000)::numeric / 1000000000.0 * 0.25
        ) +
        (
          LEAST(COALESCE(max(sb.max_signal_confidence), 0), 1)::numeric * 0.2
        ) +
        (
          CASE WHEN bool_or(COALESCE(sr.official_source_present, false)) THEN 0.1 ELSE 0 END
        ),
        4
      ) AS fresh_capital_priority_score,
      round(
        (
          COALESCE(
            max(
              CASE
                WHEN fb.capital_date IS NULL THEN 0
                ELSE GREATEST(0, 365 - (CURRENT_DATE - fb.capital_date))
              END
            )::numeric / 365.0,
            0
          ) * 0.45
        ) +
        (
          LEAST(COALESCE(max(fb.representative_size_usd), 0), 1000000000)::numeric / 1000000000.0 * 0.25
        ) +
        (
          LEAST(COALESCE(max(sb.max_signal_confidence), 0), 1)::numeric * 0.2
        ) +
        (
          CASE WHEN bool_or(COALESCE(sr.official_source_present, false)) THEN 0.1 ELSE 0 END
        ),
        4
      ) AS capital_freshness_boost_score,
      jsonb_strip_nulls(
        jsonb_build_object(
          'min_usd', max(fb.estimated_check_min_usd),
          'max_usd', max(fb.estimated_check_max_usd)
        )
      ) AS estimated_check_range_json
    FROM fund_base fb
    LEFT JOIN source_rollup sr
      ON sr.vc_fund_id = fb.id
    LEFT JOIN signal_base sb
      ON sb.firm_record_id = fb.firm_record_id
    LEFT JOIN latest_verified_fund lvf
      ON lvf.firm_record_id = fb.firm_record_id
    GROUP BY fb.firm_record_id
  )
  UPDATE public.firm_records fr
  SET
    last_fund_announcement_date = r.last_fund_announcement_date,
    latest_fund_size_usd = r.latest_fund_size_usd,
    has_fresh_capital = COALESCE(r.has_fresh_capital, false),
    likely_actively_deploying = COALESCE(r.likely_actively_deploying, false),
    active_fund_vintage = r.active_fund_vintage,
    active_fund_count = COALESCE(r.active_fund_count, 0),
    last_capital_signal_at = r.last_capital_signal_at,
    recent_capital_signal_count = COALESCE(r.recent_capital_signal_count, 0),
    fresh_capital_priority_score = r.fresh_capital_priority_score,
    capital_freshness_boost_score = r.capital_freshness_boost_score,
    estimated_check_range_json = COALESCE(r.estimated_check_range_json, '{}'::jsonb),
    freshness_synced_at = COALESCE(r.freshness_synced_at, now()),
    freshness_verified_at = r.freshness_verified_at,
    latest_verified_vc_fund_id = r.latest_verified_vc_fund_id,
    last_verified_at = GREATEST(COALESCE(fr.last_verified_at, 'epoch'::timestamptz), COALESCE(r.freshness_verified_at, fr.last_verified_at)),
    verification_status = CASE
      WHEN COALESCE(r.has_fresh_capital, false) THEN 'verified'
      ELSE COALESCE(fr.verification_status, 'pending')
    END,
    is_actively_deploying = COALESCE(r.likely_actively_deploying, COALESCE(r.has_fresh_capital, fr.is_actively_deploying))
  FROM rollup r
  WHERE fr.id = r.firm_record_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.refresh_firm_capital_derived_fields(uuid, integer) IS
  'Recomputes canonical fresh-capital and profile freshness derivations on firm_records from verified vc_funds and vc_fund_signals.';

DROP FUNCTION IF EXISTS public.get_new_vc_funds(integer, integer, text[], text[], text[], numeric, numeric, text[]);

CREATE OR REPLACE FUNCTION public.get_new_vc_funds(
  p_limit integer DEFAULT 50,
  p_days integer DEFAULT 90,
  p_stage text[] DEFAULT NULL,
  p_sector text[] DEFAULT NULL,
  p_geography text[] DEFAULT NULL,
  p_fund_size_min numeric DEFAULT NULL,
  p_fund_size_max numeric DEFAULT NULL,
  p_firm_type text[] DEFAULT NULL
)
RETURNS TABLE (
  vc_fund_id uuid,
  firm_record_id uuid,
  firm_name text,
  fund_name text,
  fund_type text,
  fund_sequence_number integer,
  vintage_year integer,
  announced_date date,
  close_date date,
  target_size_usd numeric,
  final_size_usd numeric,
  status public.vc_fund_status_enum,
  source_confidence numeric,
  announcement_url text,
  announcement_title text,
  stage_focus text[],
  sector_focus text[],
  geography_focus text[],
  has_fresh_capital boolean,
  fresh_capital_priority_score numeric,
  likely_actively_deploying boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lim AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)::integer AS n
  )
  SELECT
    vf.id AS vc_fund_id,
    fr.id AS firm_record_id,
    fr.firm_name,
    vf.name AS fund_name,
    vf.fund_type,
    vf.fund_sequence_number,
    vf.vintage_year,
    vf.announced_date,
    vf.close_date,
    vf.target_size_usd,
    vf.final_size_usd,
    vf.status,
    vf.source_confidence,
    vf.announcement_url,
    vf.announcement_title,
    vf.stage_focus,
    vf.sector_focus,
    vf.geography_focus,
    fr.has_fresh_capital,
    fr.fresh_capital_priority_score,
    COALESCE(
      vf.likely_actively_deploying,
      (
        vf.active_deployment_window_start IS NOT NULL
        AND vf.active_deployment_window_end IS NOT NULL
        AND CURRENT_DATE BETWEEN vf.active_deployment_window_start AND vf.active_deployment_window_end
      )
    ) AS likely_actively_deploying
  FROM public.vc_funds vf
  JOIN public.firm_records fr
    ON fr.id = vf.firm_record_id
  CROSS JOIN lim
  WHERE vf.deleted_at IS NULL
    AND vf.verification_status IN ('verified', 'official_source_promoted', 'manual_reviewed')
    AND (
      COALESCE(vf.announced_date, vf.close_date, (vf.created_at AT TIME ZONE 'UTC')::date) >= CURRENT_DATE - GREATEST(COALESCE(p_days, 90), 1)
    )
    AND (p_stage IS NULL OR vf.stage_focus && p_stage)
    AND (p_sector IS NULL OR vf.sector_focus && p_sector)
    AND (p_geography IS NULL OR vf.geography_focus && p_geography)
    AND (p_fund_size_min IS NULL OR COALESCE(vf.final_size_usd, vf.target_size_usd) >= p_fund_size_min)
    AND (p_fund_size_max IS NULL OR COALESCE(vf.final_size_usd, vf.target_size_usd) <= p_fund_size_max)
    AND (p_firm_type IS NULL OR fr.entity_type::text = ANY (p_firm_type))
  ORDER BY
    COALESCE(vf.announced_date, vf.close_date, (vf.created_at AT TIME ZONE 'UTC')::date) DESC NULLS LAST,
    vf.freshness_synced_at DESC NULLS LAST,
    vf.updated_at DESC
  LIMIT (SELECT n FROM lim);
$$;

CREATE OR REPLACE FUNCTION public.get_recent_fresh_capital_backend(
  p_limit integer DEFAULT 80,
  p_window_days integer DEFAULT 180
)
RETURNS TABLE (
  vc_fund_signal_id uuid,
  signal_type public.vc_fund_signal_type_enum,
  event_date date,
  headline text,
  summary text,
  source_url text,
  confidence numeric,
  display_priority integer,
  firm_record_id uuid,
  firm_name text,
  vc_fund_id uuid,
  fund_name text,
  representative_size_usd numeric,
  official_source_present boolean,
  fresh_capital_priority_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id AS vc_fund_signal_id,
    s.signal_type,
    s.event_date,
    s.headline,
    s.summary,
    s.source_url,
    s.confidence,
    s.display_priority,
    fr.id AS firm_record_id,
    fr.firm_name,
    vf.id AS vc_fund_id,
    vf.name AS fund_name,
    COALESCE(vf.final_size_usd, vf.target_size_usd) AS representative_size_usd,
    EXISTS (
      SELECT 1 FROM public.vc_fund_sources vfs
      WHERE vfs.vc_fund_id = vf.id
        AND vfs.source_type = 'official_website'
    ) AS official_source_present,
    fr.fresh_capital_priority_score
  FROM public.vc_fund_signals s
  JOIN public.firm_records fr ON fr.id = s.firm_record_id
  LEFT JOIN public.vc_funds vf ON vf.id = s.vc_fund_id
  WHERE s.event_date >= CURRENT_DATE - GREATEST(COALESCE(p_window_days, 180), 1)
    AND s.signal_type IN ('new_fund_announced','fund_closed','fresh_capital_inferred','fund_target_updated')
    AND (vf.id IS NULL OR vf.verification_status IN ('verified', 'official_source_promoted', 'manual_reviewed'))
  ORDER BY s.event_date DESC, s.display_priority DESC, s.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 80), 1), 500);
$$;

CREATE OR REPLACE FUNCTION public.get_capital_heatmap_backend(
  p_window_days integer DEFAULT 180
)
RETURNS TABLE (
  dimension_kind text,
  dimension_value text,
  window_days integer,
  signal_count integer,
  weighted_score numeric,
  average_confidence numeric,
  total_size_usd numeric,
  official_source_hits integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      s.id AS signal_id,
      s.confidence,
      s.event_date,
      vf.stage_focus,
      vf.sector_focus,
      COALESCE(vf.final_size_usd, vf.target_size_usd, 0) AS representative_size_usd,
      EXISTS (
        SELECT 1 FROM public.vc_fund_sources vfs
        WHERE vfs.vc_fund_id = vf.id
          AND vfs.source_type = 'official_website'
      ) AS official_source_present
    FROM public.vc_fund_signals s
    JOIN public.vc_funds vf ON vf.id = s.vc_fund_id
    WHERE s.event_date >= CURRENT_DATE - GREATEST(COALESCE(p_window_days, 180), 1)
      AND s.signal_type IN ('new_fund_announced','fund_closed','fresh_capital_inferred','fund_target_updated')
      AND vf.verification_status IN ('verified', 'official_source_promoted', 'manual_reviewed')
  ),
  exploded AS (
    SELECT
      'sector'::text AS dimension_kind,
      unnest(CASE WHEN array_length(sector_focus, 1) IS NULL THEN ARRAY['Unknown']::text[] ELSE sector_focus END) AS dimension_value,
      signal_id,
      confidence,
      event_date,
      representative_size_usd,
      official_source_present
    FROM base
    UNION ALL
    SELECT
      'stage'::text,
      unnest(CASE WHEN array_length(stage_focus, 1) IS NULL THEN ARRAY['Unknown']::text[] ELSE stage_focus END),
      signal_id,
      confidence,
      event_date,
      representative_size_usd,
      official_source_present
    FROM base
    UNION ALL
    SELECT
      'recency_window'::text,
      CASE
        WHEN event_date >= CURRENT_DATE - 30 THEN '30d'
        WHEN event_date >= CURRENT_DATE - 90 THEN '90d'
        ELSE '180d+'
      END,
      signal_id,
      confidence,
      event_date,
      representative_size_usd,
      official_source_present
    FROM base
  )
  SELECT
    dimension_kind,
    dimension_value,
    COALESCE(p_window_days, 180) AS window_days,
    count(*)::integer AS signal_count,
    round(sum(
      (
        GREATEST(0, 365 - (CURRENT_DATE - event_date))::numeric / 365.0 * 0.45
      ) +
      (
        LEAST(representative_size_usd, 1000000000)::numeric / 1000000000.0 * 0.25
      ) +
      (
        LEAST(confidence, 1)::numeric * 0.2
      ) +
      (
        CASE WHEN official_source_present THEN 0.1 ELSE 0 END
      )
    ), 4) AS weighted_score,
    round(avg(confidence), 4) AS average_confidence,
    sum(representative_size_usd) AS total_size_usd,
    sum(CASE WHEN official_source_present THEN 1 ELSE 0 END)::integer AS official_source_hits
  FROM exploded
  GROUP BY dimension_kind, dimension_value
  ORDER BY weighted_score DESC, signal_count DESC, dimension_value;
$$;

CREATE OR REPLACE FUNCTION public.get_firms_with_fresh_capital_backend(
  p_limit integer DEFAULT 80,
  p_window_days integer DEFAULT 365
)
RETURNS TABLE (
  firm_record_id uuid,
  firm_name text,
  has_fresh_capital boolean,
  likely_actively_deploying boolean,
  last_fund_announcement_date date,
  latest_fund_size_usd numeric,
  active_fund_vintage integer,
  last_capital_signal_at timestamptz,
  fresh_capital_priority_score numeric,
  capital_freshness_boost_score numeric,
  active_fund_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fr.id AS firm_record_id,
    fr.firm_name,
    fr.has_fresh_capital,
    fr.likely_actively_deploying,
    fr.last_fund_announcement_date,
    fr.latest_fund_size_usd,
    fr.active_fund_vintage,
    fr.last_capital_signal_at,
    fr.fresh_capital_priority_score,
    fr.capital_freshness_boost_score,
    fr.active_fund_count
  FROM public.firm_records fr
  WHERE fr.deleted_at IS NULL
    AND fr.has_fresh_capital = true
    AND (
      fr.last_fund_announcement_date IS NULL
      OR fr.last_fund_announcement_date >= CURRENT_DATE - GREATEST(COALESCE(p_window_days, 365), 1)
    )
  ORDER BY fr.capital_freshness_boost_score DESC NULLS LAST, fr.last_capital_signal_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 80), 1), 500);
$$;

GRANT EXECUTE ON FUNCTION public.refresh_firm_capital_derived_fields(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_new_vc_funds(integer, integer, text[], text[], text[], numeric, numeric, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_fresh_capital_backend(integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_capital_heatmap_backend(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_firms_with_fresh_capital_backend(integer, integer) TO anon, authenticated, service_role;
