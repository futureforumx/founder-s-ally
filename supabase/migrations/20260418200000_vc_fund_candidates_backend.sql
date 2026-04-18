-- =============================================================================
-- Migration: fresh-capital candidate staging, mirroring, and backend read models
-- DATE:      2026-04-18
-- PURPOSE:   Add low-cost candidate detection storage, evidence auditability,
--            ranking inputs, and backend-only fresh-capital RPCs.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.candidate_capital_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_record_id uuid REFERENCES public.firm_records(id) ON DELETE SET NULL,
  raw_firm_name text,
  normalized_firm_name text,
  candidate_headline text,
  excerpt text,
  source_url text NOT NULL,
  source_type text NOT NULL,
  publisher text,
  published_at timestamptz,
  raw_text text,
  event_type_guess text,
  normalized_fund_label text,
  fund_sequence_number integer,
  vintage_year integer,
  announced_date date,
  size_amount numeric,
  size_currency text,
  confidence_score numeric NOT NULL DEFAULT 0,
  confidence_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_count integer NOT NULL DEFAULT 1,
  source_diversity integer NOT NULL DEFAULT 1,
  official_source_present boolean NOT NULL DEFAULT false,
  cluster_key text,
  canonical_vc_fund_id uuid REFERENCES public.vc_funds(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  review_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  latest_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidate_capital_events_status_chk CHECK (
    status IN ('pending', 'ignored', 'escalated', 'verified', 'rejected', 'review')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_capital_events_source_url
  ON public.candidate_capital_events (source_url);

CREATE INDEX IF NOT EXISTS idx_candidate_capital_events_cluster_key
  ON public.candidate_capital_events (cluster_key)
  WHERE cluster_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidate_capital_events_status_latest_seen
  ON public.candidate_capital_events (status, latest_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_capital_events_firm_status
  ON public.candidate_capital_events (firm_record_id, status)
  WHERE firm_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidate_capital_events_confidence
  ON public.candidate_capital_events (confidence_score DESC, latest_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.candidate_capital_event_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_capital_event_id uuid NOT NULL REFERENCES public.candidate_capital_events(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  source_type text NOT NULL,
  publisher text,
  published_at timestamptz,
  headline text NOT NULL,
  excerpt text,
  raw_text text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidate_capital_event_evidence_source_url_unique UNIQUE (source_url)
);

CREATE INDEX IF NOT EXISTS idx_candidate_capital_event_evidence_candidate
  ON public.candidate_capital_event_evidence (candidate_capital_event_id, published_at DESC);

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS likely_actively_deploying boolean,
  ADD COLUMN IF NOT EXISTS capital_freshness_boost_score numeric(10,4);

ALTER TABLE public.firm_investors
  ADD COLUMN IF NOT EXISTS capital_freshness_boost_score numeric(10,4),
  ADD COLUMN IF NOT EXISTS last_capital_signal_at timestamptz;

ALTER TABLE public.vc_fund_signals
  ADD COLUMN IF NOT EXISTS mirrored_to_intelligence_at timestamptz;

ALTER TABLE public.candidate_capital_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_capital_event_evidence ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'candidate_capital_events' AND policyname = 'candidate_capital_events_select_authenticated'
  ) THEN
    CREATE POLICY "candidate_capital_events_select_authenticated"
      ON public.candidate_capital_events FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'candidate_capital_event_evidence' AND policyname = 'candidate_capital_event_evidence_select_authenticated'
  ) THEN
    CREATE POLICY "candidate_capital_event_evidence_select_authenticated"
      ON public.candidate_capital_event_evidence FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'candidate_capital_events' AND policyname = 'candidate_capital_events_service_all'
  ) THEN
    CREATE POLICY "candidate_capital_events_service_all"
      ON public.candidate_capital_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'candidate_capital_event_evidence' AND policyname = 'candidate_capital_event_evidence_service_all'
  ) THEN
    CREATE POLICY "candidate_capital_event_evidence_service_all"
      ON public.candidate_capital_event_evidence FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS candidate_capital_events_updated_at ON public.candidate_capital_events;
CREATE TRIGGER candidate_capital_events_updated_at
  BEFORE UPDATE ON public.candidate_capital_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
  WITH fund_base AS (
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
      vf.estimated_check_max_usd
    FROM public.vc_funds vf
    WHERE vf.deleted_at IS NULL
      AND (p_firm_record_id IS NULL OR vf.firm_record_id = p_firm_record_id)
  ),
  source_rollup AS (
    SELECT
      vf.id AS vc_fund_id,
      bool_or(vfs.source_type = 'official_website') AS official_source_present
    FROM public.vc_funds vf
    LEFT JOIN public.vc_fund_sources vfs
      ON vfs.vc_fund_id = vf.id
    WHERE vf.deleted_at IS NULL
      AND (p_firm_record_id IS NULL OR vf.firm_record_id = p_firm_record_id)
    GROUP BY vf.id
  ),
  signal_base AS (
    SELECT
      s.firm_record_id,
      max(s.created_at) AS last_capital_signal_at,
      max(s.confidence) AS max_signal_confidence
    FROM public.vc_fund_signals s
    WHERE p_firm_record_id IS NULL OR s.firm_record_id = p_firm_record_id
    GROUP BY s.firm_record_id
  ),
  rollup AS (
    SELECT
      fb.firm_record_id,
      max(fb.capital_date) AS last_fund_announcement_date,
      max(fb.representative_size_usd) FILTER (WHERE fb.representative_size_usd IS NOT NULL) AS latest_fund_size_usd,
      bool_or(
        fb.capital_date >= (CURRENT_DATE - make_interval(days => GREATEST(COALESCE(p_fresh_window_days, 365), 1)))
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
    GROUP BY fb.firm_record_id
  )
  UPDATE public.firm_records fr
  SET
    last_fund_announcement_date = r.last_fund_announcement_date,
    latest_fund_size_usd = r.latest_fund_size_usd,
    has_fresh_capital = COALESCE(r.has_fresh_capital, false),
    likely_actively_deploying = COALESCE(r.likely_actively_deploying, false),
    active_fund_vintage = r.active_fund_vintage,
    last_capital_signal_at = r.last_capital_signal_at,
    fresh_capital_priority_score = r.fresh_capital_priority_score,
    capital_freshness_boost_score = r.capital_freshness_boost_score,
    estimated_check_range_json = COALESCE(r.estimated_check_range_json, '{}'::jsonb),
    active_fund_count = COALESCE(r.active_fund_count, 0),
    is_actively_deploying = COALESCE(r.likely_actively_deploying, fr.is_actively_deploying)
  FROM rollup r
  WHERE fr.id = r.firm_record_id;

  UPDATE public.firm_investors fi
  SET
    capital_freshness_boost_score = round(COALESCE(fr.capital_freshness_boost_score, 0)::numeric * 0.8, 4),
    last_capital_signal_at = fr.last_capital_signal_at
  FROM public.firm_records fr
  WHERE fi.firm_id = fr.id
    AND (p_firm_record_id IS NULL OR fi.firm_id = p_firm_record_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_candidate_capital_events_for_review(
  p_limit integer DEFAULT 100,
  p_status text[] DEFAULT ARRAY['review','escalated'],
  p_firm_record_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  firm_record_id uuid,
  raw_firm_name text,
  candidate_headline text,
  source_url text,
  publisher text,
  published_at timestamptz,
  event_type_guess text,
  normalized_fund_label text,
  confidence_score numeric,
  confidence_breakdown jsonb,
  evidence_count integer,
  source_diversity integer,
  official_source_present boolean,
  status text,
  review_reason text,
  latest_seen_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.firm_record_id,
    c.raw_firm_name,
    c.candidate_headline,
    c.source_url,
    c.publisher,
    c.published_at,
    c.event_type_guess,
    c.normalized_fund_label,
    c.confidence_score,
    c.confidence_breakdown,
    c.evidence_count,
    c.source_diversity,
    c.official_source_present,
    c.status,
    c.review_reason,
    c.latest_seen_at
  FROM public.candidate_capital_events c
  WHERE c.status = ANY(COALESCE(p_status, ARRAY['review','escalated']))
    AND (p_firm_record_id IS NULL OR c.firm_record_id = p_firm_record_id)
  ORDER BY c.latest_seen_at DESC, c.confidence_score DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
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

GRANT EXECUTE ON FUNCTION public.get_candidate_capital_events_for_review(integer, text[], uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_fresh_capital_backend(integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_capital_heatmap_backend(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_firms_with_fresh_capital_backend(integer, integer) TO anon, authenticated, service_role;
