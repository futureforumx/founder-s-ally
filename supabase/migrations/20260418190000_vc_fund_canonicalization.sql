-- =============================================================================
-- Migration: canonical VC fund intelligence layer
-- DATE:      2026-04-18
-- PURPOSE:   Add additive canonical fund tables, append-only fund signals,
--            firm-level capital derivations, and frontend-ready read RPCs.
-- NOTES:     This migration keeps public.firm_records as the canonical firm
--            identity anchor and preserves public.fund_records for compatibility.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
  CREATE TYPE public.vc_fund_status_enum AS ENUM (
    'announced',
    'target',
    'first_close',
    'final_close',
    'inferred_active',
    'historical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.vc_fund_signal_type_enum AS ENUM (
    'new_fund_announced',
    'fund_closed',
    'fund_target_updated',
    'new_vehicle_detected',
    'fresh_capital_inferred',
    'fund_size_updated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.vc_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_record_id uuid NOT NULL REFERENCES public.firm_records(id) ON DELETE CASCADE,
  legacy_fund_record_id uuid NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  normalized_key text NOT NULL,
  fund_type text,
  fund_sequence_number integer,
  vintage_year integer,
  announced_date date,
  close_date date,
  target_size_usd numeric(18,2),
  final_size_usd numeric(18,2),
  currency varchar(3) NOT NULL DEFAULT 'USD',
  status public.vc_fund_status_enum NOT NULL DEFAULT 'announced',
  source_confidence numeric(5,4) NOT NULL DEFAULT 0.5000,
  source_count integer NOT NULL DEFAULT 1,
  lead_source text,
  announcement_url text,
  announcement_title text,
  raw_source_text text,
  is_new_fund_signal boolean NOT NULL DEFAULT false,
  active_deployment_window_start date,
  active_deployment_window_end date,
  likely_actively_deploying boolean,
  stage_focus text[] NOT NULL DEFAULT '{}',
  sector_focus text[] NOT NULL DEFAULT '{}',
  geography_focus text[] NOT NULL DEFAULT '{}',
  estimated_check_min_usd numeric(18,2),
  estimated_check_max_usd numeric(18,2),
  field_confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_signal_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT vc_funds_normalized_key_unique UNIQUE (normalized_key),
  CONSTRAINT vc_funds_vintage_year_chk CHECK (
    vintage_year IS NULL OR vintage_year BETWEEN 1950 AND 2100
  ),
  CONSTRAINT vc_funds_positive_target_chk CHECK (
    target_size_usd IS NULL OR target_size_usd >= 0
  ),
  CONSTRAINT vc_funds_positive_final_chk CHECK (
    final_size_usd IS NULL OR final_size_usd >= 0
  ),
  CONSTRAINT vc_funds_name_nonempty_chk CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_vc_funds_firm_record_id
  ON public.vc_funds (firm_record_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vc_funds_status
  ON public.vc_funds (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vc_funds_announced_date
  ON public.vc_funds (announced_date DESC NULLS LAST)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vc_funds_close_date
  ON public.vc_funds (close_date DESC NULLS LAST)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vc_funds_vintage_year
  ON public.vc_funds (vintage_year DESC NULLS LAST)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vc_funds_type
  ON public.vc_funds (fund_type)
  WHERE deleted_at IS NULL AND fund_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vc_funds_stage_focus
  ON public.vc_funds USING GIN (stage_focus);

CREATE INDEX IF NOT EXISTS idx_vc_funds_sector_focus
  ON public.vc_funds USING GIN (sector_focus);

CREATE INDEX IF NOT EXISTS idx_vc_funds_geography_focus
  ON public.vc_funds USING GIN (geography_focus);

CREATE INDEX IF NOT EXISTS idx_vc_funds_normalized_name_trgm
  ON public.vc_funds USING GIN (normalized_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.vc_fund_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vc_fund_id uuid NOT NULL REFERENCES public.vc_funds(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_url text,
  source_title text,
  publisher text,
  published_at timestamptz,
  extracted_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(5,4) NOT NULL DEFAULT 0.5000,
  content_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vc_fund_sources_unique_url
  ON public.vc_fund_sources (vc_fund_id, source_url);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vc_fund_sources_unique_hash
  ON public.vc_fund_sources (vc_fund_id, content_hash);

CREATE INDEX IF NOT EXISTS idx_vc_fund_sources_published_at
  ON public.vc_fund_sources (published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_vc_fund_sources_source_type
  ON public.vc_fund_sources (source_type);

CREATE TABLE IF NOT EXISTS public.vc_fund_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vc_fund_id uuid NOT NULL REFERENCES public.vc_funds(id) ON DELETE CASCADE,
  firm_investor_id uuid REFERENCES public.firm_investors(id) ON DELETE SET NULL,
  canonical_person_key text,
  role text NOT NULL,
  confidence numeric(5,4) NOT NULL DEFAULT 0.5000,
  source text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_fund_people_target_chk CHECK (
    firm_investor_id IS NOT NULL OR canonical_person_key IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vc_fund_people_unique_firm_investor
  ON public.vc_fund_people (vc_fund_id, firm_investor_id, role);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vc_fund_people_unique_person_key
  ON public.vc_fund_people (vc_fund_id, canonical_person_key, role);

CREATE INDEX IF NOT EXISTS idx_vc_fund_people_role
  ON public.vc_fund_people (role);

CREATE INDEX IF NOT EXISTS idx_vc_fund_people_firm_investor
  ON public.vc_fund_people (firm_investor_id)
  WHERE firm_investor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vc_fund_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type public.vc_fund_signal_type_enum NOT NULL,
  firm_record_id uuid NOT NULL REFERENCES public.firm_records(id) ON DELETE CASCADE,
  vc_fund_id uuid REFERENCES public.vc_funds(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  headline text NOT NULL,
  summary text,
  source_url text,
  confidence numeric(5,4) NOT NULL DEFAULT 0.5000,
  display_priority integer NOT NULL DEFAULT 50,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  intelligence_event_id uuid REFERENCES public.intelligence_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_fund_signals_dedupe_key_unique UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_vc_fund_signals_firm_event_date
  ON public.vc_fund_signals (firm_record_id, event_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vc_fund_signals_fund_event_date
  ON public.vc_fund_signals (vc_fund_id, event_date DESC, created_at DESC)
  WHERE vc_fund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vc_fund_signals_signal_type
  ON public.vc_fund_signals (signal_type, event_date DESC);

ALTER TABLE public.fund_records
  ADD COLUMN IF NOT EXISTS canonical_vc_fund_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'fund_records'
      AND constraint_name = 'fund_records_canonical_vc_fund_id_fkey'
  ) THEN
    ALTER TABLE public.fund_records
      ADD CONSTRAINT fund_records_canonical_vc_fund_id_fkey
      FOREIGN KEY (canonical_vc_fund_id)
      REFERENCES public.vc_funds(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fund_records_canonical_vc_fund_id
  ON public.fund_records (canonical_vc_fund_id)
  WHERE canonical_vc_fund_id IS NOT NULL;

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS last_fund_announcement_date date,
  ADD COLUMN IF NOT EXISTS latest_fund_size_usd numeric(18,2),
  ADD COLUMN IF NOT EXISTS has_fresh_capital boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active_fund_vintage integer,
  ADD COLUMN IF NOT EXISTS last_capital_signal_at timestamptz,
  ADD COLUMN IF NOT EXISTS fresh_capital_priority_score numeric(10,4),
  ADD COLUMN IF NOT EXISTS estimated_check_range_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS active_fund_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_firm_records_has_fresh_capital
  ON public.firm_records (has_fresh_capital)
  WHERE deleted_at IS NULL AND has_fresh_capital = true;

CREATE INDEX IF NOT EXISTS idx_firm_records_last_capital_signal_at
  ON public.firm_records (last_capital_signal_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_records_active_fund_vintage
  ON public.firm_records (active_fund_vintage DESC NULLS LAST)
  WHERE deleted_at IS NULL;

INSERT INTO public.intelligence_event_types (code, label, default_category, description, sort_order, active)
VALUES
  ('new_fund_announced', 'New Fund Announced', 'investors', 'A firm announced a new fund or vehicle.', 35, true),
  ('fund_closed', 'Fund Closed', 'investors', 'A firm completed a fund close.', 36, true),
  ('fund_target_updated', 'Fund Target Updated', 'investors', 'A fund target or planned size changed materially.', 37, true),
  ('new_vehicle_detected', 'New Vehicle Detected', 'investors', 'A new fund vehicle was detected from filings or announcements.', 38, true),
  ('fresh_capital_inferred', 'Fresh Capital Inferred', 'investors', 'The system inferred new deployable capital.', 39, true),
  ('fund_size_updated', 'Fund Size Updated', 'investors', 'A fund size was updated from a better source.', 40, true)
ON CONFLICT (code) DO UPDATE
SET
  label = EXCLUDED.label,
  default_category = EXCLUDED.default_category,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active,
  updated_at = now();

ALTER TABLE public.vc_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_fund_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_fund_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_fund_signals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vc_funds' AND policyname = 'vc_funds_select_authenticated'
  ) THEN
    CREATE POLICY "vc_funds_select_authenticated"
      ON public.vc_funds FOR SELECT
      TO authenticated
      USING (deleted_at IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vc_fund_sources' AND policyname = 'vc_fund_sources_select_authenticated'
  ) THEN
    CREATE POLICY "vc_fund_sources_select_authenticated"
      ON public.vc_fund_sources FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vc_fund_people' AND policyname = 'vc_fund_people_select_authenticated'
  ) THEN
    CREATE POLICY "vc_fund_people_select_authenticated"
      ON public.vc_fund_people FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vc_fund_signals' AND policyname = 'vc_fund_signals_select_authenticated'
  ) THEN
    CREATE POLICY "vc_fund_signals_select_authenticated"
      ON public.vc_fund_signals FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vc_funds' AND policyname = 'vc_funds_service_all'
  ) THEN
    CREATE POLICY "vc_funds_service_all"
      ON public.vc_funds FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vc_fund_sources' AND policyname = 'vc_fund_sources_service_all'
  ) THEN
    CREATE POLICY "vc_fund_sources_service_all"
      ON public.vc_fund_sources FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vc_fund_people' AND policyname = 'vc_fund_people_service_all'
  ) THEN
    CREATE POLICY "vc_fund_people_service_all"
      ON public.vc_fund_people FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vc_fund_signals' AND policyname = 'vc_fund_signals_service_all'
  ) THEN
    CREATE POLICY "vc_fund_signals_service_all"
      ON public.vc_fund_signals FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS vc_funds_updated_at ON public.vc_funds;
CREATE TRIGGER vc_funds_updated_at
  BEFORE UPDATE ON public.vc_funds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS vc_fund_people_updated_at ON public.vc_fund_people;
CREATE TRIGGER vc_fund_people_updated_at
  BEFORE UPDATE ON public.vc_fund_people
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
  signal_base AS (
    SELECT
      s.firm_record_id,
      max(s.created_at) AS last_capital_signal_at
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
          ) * 0.55
        ) +
        (
          LEAST(COALESCE(max(fb.representative_size_usd), 0), 1000000000)::numeric / 1000000000.0 * 0.30
        ) +
        (
          LEAST(count(*) FILTER (WHERE fb.likely_actively_deploying)::numeric, 3) / 3.0 * 0.15
        ),
        4
      ) AS fresh_capital_priority_score,
      jsonb_strip_nulls(
        jsonb_build_object(
          'min_usd', max(fb.estimated_check_min_usd),
          'max_usd', max(fb.estimated_check_max_usd)
        )
      ) AS estimated_check_range_json
    FROM fund_base fb
    LEFT JOIN signal_base sb
      ON sb.firm_record_id = fb.firm_record_id
    GROUP BY fb.firm_record_id
  )
  UPDATE public.firm_records fr
  SET
    last_fund_announcement_date = r.last_fund_announcement_date,
    latest_fund_size_usd = r.latest_fund_size_usd,
    has_fresh_capital = COALESCE(r.has_fresh_capital, false),
    active_fund_vintage = r.active_fund_vintage,
    last_capital_signal_at = r.last_capital_signal_at,
    fresh_capital_priority_score = r.fresh_capital_priority_score,
    estimated_check_range_json = COALESCE(r.estimated_check_range_json, '{}'::jsonb),
    active_fund_count = COALESCE(r.active_fund_count, 0),
    is_actively_deploying = COALESCE(r.has_fresh_capital, fr.is_actively_deploying)
  FROM rollup r
  WHERE fr.id = r.firm_record_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.refresh_firm_capital_derived_fields(uuid, integer) IS
  'Recomputes fresh-capital and active-fund derivations on firm_records from vc_funds and vc_fund_signals.';

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
  fresh_capital_priority_score numeric
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
    fr.fresh_capital_priority_score
  FROM public.vc_funds vf
  JOIN public.firm_records fr
    ON fr.id = vf.firm_record_id
  CROSS JOIN lim
  WHERE vf.deleted_at IS NULL
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
    vf.updated_at DESC
  LIMIT (SELECT n FROM lim);
$$;

CREATE OR REPLACE FUNCTION public.get_recent_fund_signals(
  p_limit integer DEFAULT 50,
  p_days integer DEFAULT 180,
  p_stage text[] DEFAULT NULL,
  p_sector text[] DEFAULT NULL,
  p_geography text[] DEFAULT NULL,
  p_fund_size_min numeric DEFAULT NULL,
  p_fund_size_max numeric DEFAULT NULL,
  p_firm_type text[] DEFAULT NULL
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
  metadata jsonb
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
    s.metadata
  FROM public.vc_fund_signals s
  JOIN public.firm_records fr
    ON fr.id = s.firm_record_id
  LEFT JOIN public.vc_funds vf
    ON vf.id = s.vc_fund_id
  CROSS JOIN lim
  WHERE s.event_date >= CURRENT_DATE - GREATEST(COALESCE(p_days, 180), 1)
    AND (p_stage IS NULL OR vf.stage_focus && p_stage)
    AND (p_sector IS NULL OR vf.sector_focus && p_sector)
    AND (p_geography IS NULL OR vf.geography_focus && p_geography)
    AND (p_fund_size_min IS NULL OR COALESCE(vf.final_size_usd, vf.target_size_usd) >= p_fund_size_min)
    AND (p_fund_size_max IS NULL OR COALESCE(vf.final_size_usd, vf.target_size_usd) <= p_fund_size_max)
    AND (p_firm_type IS NULL OR fr.entity_type::text = ANY (p_firm_type))
  ORDER BY s.event_date DESC, s.display_priority DESC, s.created_at DESC
  LIMIT (SELECT n FROM lim);
$$;

CREATE OR REPLACE FUNCTION public.get_firm_funds(p_firm_record_id uuid)
RETURNS TABLE (
  vc_fund_id uuid,
  fund_name text,
  normalized_name text,
  fund_type text,
  fund_sequence_number integer,
  vintage_year integer,
  announced_date date,
  close_date date,
  target_size_usd numeric,
  final_size_usd numeric,
  currency varchar,
  status public.vc_fund_status_enum,
  source_confidence numeric,
  source_count integer,
  announcement_url text,
  announcement_title text,
  is_new_fund_signal boolean,
  active_deployment_window_start date,
  active_deployment_window_end date,
  likely_actively_deploying boolean,
  stage_focus text[],
  sector_focus text[],
  geography_focus text[],
  estimated_check_min_usd numeric,
  estimated_check_max_usd numeric,
  field_confidence jsonb,
  field_provenance jsonb,
  metadata jsonb,
  last_signal_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    vf.id AS vc_fund_id,
    vf.name AS fund_name,
    vf.normalized_name,
    vf.fund_type,
    vf.fund_sequence_number,
    vf.vintage_year,
    vf.announced_date,
    vf.close_date,
    vf.target_size_usd,
    vf.final_size_usd,
    vf.currency,
    vf.status,
    vf.source_confidence,
    vf.source_count,
    vf.announcement_url,
    vf.announcement_title,
    vf.is_new_fund_signal,
    vf.active_deployment_window_start,
    vf.active_deployment_window_end,
    vf.likely_actively_deploying,
    vf.stage_focus,
    vf.sector_focus,
    vf.geography_focus,
    vf.estimated_check_min_usd,
    vf.estimated_check_max_usd,
    vf.field_confidence,
    vf.field_provenance,
    vf.metadata,
    vf.last_signal_at
  FROM public.vc_funds vf
  WHERE vf.firm_record_id = p_firm_record_id
    AND vf.deleted_at IS NULL
  ORDER BY COALESCE(vf.announced_date, vf.close_date, (vf.created_at AT TIME ZONE 'UTC')::date) DESC NULLS LAST, vf.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_fresh_capital_firms(
  p_limit integer DEFAULT 50,
  p_days integer DEFAULT 365,
  p_stage text[] DEFAULT NULL,
  p_sector text[] DEFAULT NULL,
  p_geography text[] DEFAULT NULL,
  p_fund_size_min numeric DEFAULT NULL,
  p_fund_size_max numeric DEFAULT NULL,
  p_firm_type text[] DEFAULT NULL
)
RETURNS TABLE (
  firm_record_id uuid,
  firm_name text,
  entity_type public.entity_type,
  has_fresh_capital boolean,
  fresh_capital_priority_score numeric,
  last_fund_announcement_date date,
  latest_fund_size_usd numeric,
  active_fund_vintage integer,
  active_fund_count integer,
  last_capital_signal_at timestamptz,
  estimated_check_range_json jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lim AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)::integer AS n
  )
  SELECT DISTINCT
    fr.id AS firm_record_id,
    fr.firm_name,
    fr.entity_type,
    fr.has_fresh_capital,
    fr.fresh_capital_priority_score,
    fr.last_fund_announcement_date,
    fr.latest_fund_size_usd,
    fr.active_fund_vintage,
    fr.active_fund_count,
    fr.last_capital_signal_at,
    fr.estimated_check_range_json
  FROM public.firm_records fr
  LEFT JOIN public.vc_funds vf
    ON vf.firm_record_id = fr.id
   AND vf.deleted_at IS NULL
  CROSS JOIN lim
  WHERE fr.deleted_at IS NULL
    AND fr.has_fresh_capital = true
    AND (
      fr.last_fund_announcement_date IS NULL
      OR fr.last_fund_announcement_date >= CURRENT_DATE - GREATEST(COALESCE(p_days, 365), 1)
    )
    AND (p_stage IS NULL OR vf.stage_focus && p_stage OR fr.stage_focus && p_stage)
    AND (p_sector IS NULL OR vf.sector_focus && p_sector OR fr.thesis_verticals && p_sector)
    AND (p_geography IS NULL OR vf.geography_focus && p_geography OR fr.active_geo_focus && p_geography)
    AND (p_fund_size_min IS NULL OR fr.latest_fund_size_usd >= p_fund_size_min)
    AND (p_fund_size_max IS NULL OR fr.latest_fund_size_usd <= p_fund_size_max)
    AND (p_firm_type IS NULL OR fr.entity_type::text = ANY (p_firm_type))
  ORDER BY fr.fresh_capital_priority_score DESC NULLS LAST, fr.last_capital_signal_at DESC NULLS LAST
  LIMIT (SELECT n FROM lim);
$$;

CREATE OR REPLACE FUNCTION public.get_active_funds_by_stage(
  p_limit integer DEFAULT 50,
  p_stage text[] DEFAULT NULL,
  p_sector text[] DEFAULT NULL,
  p_geography text[] DEFAULT NULL,
  p_days integer DEFAULT 1095,
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
  vintage_year integer,
  representative_size_usd numeric,
  announced_date date,
  close_date date,
  stage_focus text[],
  sector_focus text[],
  geography_focus text[],
  likely_actively_deploying boolean,
  source_confidence numeric,
  estimated_check_min_usd numeric,
  estimated_check_max_usd numeric
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
    vf.vintage_year,
    COALESCE(vf.final_size_usd, vf.target_size_usd) AS representative_size_usd,
    vf.announced_date,
    vf.close_date,
    vf.stage_focus,
    vf.sector_focus,
    vf.geography_focus,
    COALESCE(
      vf.likely_actively_deploying,
      (
        vf.active_deployment_window_start IS NOT NULL
        AND vf.active_deployment_window_end IS NOT NULL
        AND CURRENT_DATE BETWEEN vf.active_deployment_window_start AND vf.active_deployment_window_end
      )
    ) AS likely_actively_deploying,
    vf.source_confidence,
    vf.estimated_check_min_usd,
    vf.estimated_check_max_usd
  FROM public.vc_funds vf
  JOIN public.firm_records fr
    ON fr.id = vf.firm_record_id
  CROSS JOIN lim
  WHERE vf.deleted_at IS NULL
    AND (
      COALESCE(
        vf.likely_actively_deploying,
        (
          vf.active_deployment_window_start IS NOT NULL
          AND vf.active_deployment_window_end IS NOT NULL
          AND CURRENT_DATE BETWEEN vf.active_deployment_window_start AND vf.active_deployment_window_end
        )
      ) = true
    )
    AND (
      COALESCE(vf.announced_date, vf.close_date, (vf.created_at AT TIME ZONE 'UTC')::date) >= CURRENT_DATE - GREATEST(COALESCE(p_days, 1095), 1)
    )
    AND (p_stage IS NULL OR vf.stage_focus && p_stage)
    AND (p_sector IS NULL OR vf.sector_focus && p_sector)
    AND (p_geography IS NULL OR vf.geography_focus && p_geography)
    AND (p_fund_size_min IS NULL OR COALESCE(vf.final_size_usd, vf.target_size_usd) >= p_fund_size_min)
    AND (p_fund_size_max IS NULL OR COALESCE(vf.final_size_usd, vf.target_size_usd) <= p_fund_size_max)
    AND (p_firm_type IS NULL OR fr.entity_type::text = ANY (p_firm_type))
  ORDER BY
    COALESCE(vf.final_size_usd, vf.target_size_usd) DESC NULLS LAST,
    COALESCE(vf.announced_date, vf.close_date, (vf.created_at AT TIME ZONE 'UTC')::date) DESC NULLS LAST
  LIMIT (SELECT n FROM lim);
$$;

GRANT EXECUTE ON FUNCTION public.refresh_firm_capital_derived_fields(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_new_vc_funds(integer, integer, text[], text[], text[], numeric, numeric, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_fund_signals(integer, integer, text[], text[], text[], numeric, numeric, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_firm_funds(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_fresh_capital_firms(integer, integer, text[], text[], text[], numeric, numeric, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_active_funds_by_stage(integer, text[], text[], text[], integer, numeric, numeric, text[]) TO anon, authenticated, service_role;
