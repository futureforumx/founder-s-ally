-- =============================================================================
-- Migration: fix refresh_firm_capital_derived_fields uuid aggregate
-- DATE:      2026-04-18
-- PURPOSE:   Replace invalid max(uuid) aggregation when choosing the latest
--            verified canonical fund for a firm.
-- =============================================================================

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
      (array_agg(
        lvf.latest_verified_vc_fund_id
        ORDER BY lvf.last_verified_at DESC NULLS LAST, lvf.freshness_synced_at DESC NULLS LAST
      ))[1] AS latest_verified_vc_fund_id,
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
