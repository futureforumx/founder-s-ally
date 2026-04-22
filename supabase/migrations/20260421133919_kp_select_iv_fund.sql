-- Kleiner Perkins: add KP Select IV to canonical vc_funds from the official
-- March 24, 2026 announcement.
--
-- Note on amount:
-- The source page explicitly says "$2.5 billion in growth funds" (plural).
-- This migration follows the curated request to represent that amount on the
-- KP Select IV vehicle row while preserving the official announcement URL and
-- source text for traceability.

DO $$
DECLARE
  v_firm_record_id uuid;
  v_vc_fund_id uuid;
  v_announced_date constant date := DATE '2026-03-24';
  v_announcement_url constant text := 'https://www.kleinerperkins.com/perspectives/our-new-funds-kp22-select-iv-flex/';
  v_announcement_title constant text := 'Our New Funds: KP22 and KP Select IV';
  v_source_text constant text := '$2.5 billion in growth funds to back high-inflection, category-defining businesses. Across both stages, we see exceptional opportunities in areas including professional services, healthcare, autonomy, security, financial services, productivity, and the physical economy.';
BEGIN
  SELECT fr.id
  INTO v_firm_record_id
  FROM public.firm_records fr
  WHERE fr.deleted_at IS NULL
    AND LOWER(TRIM(fr.firm_name)) = 'kleiner perkins'
  ORDER BY
    CASE
      WHEN LOWER(COALESCE(fr.website_url, '')) LIKE '%kleinerperkins.com%' THEN 0
      ELSE 1
    END,
    fr.updated_at DESC NULLS LAST,
    fr.created_at DESC
  LIMIT 1;

  IF v_firm_record_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve firm_records.id for Kleiner Perkins';
  END IF;

  INSERT INTO public.vc_funds (
    firm_record_id,
    name,
    normalized_name,
    normalized_key,
    fund_type,
    fund_sequence_number,
    vintage_year,
    announced_date,
    target_size_usd,
    currency,
    status,
    source_confidence,
    source_count,
    lead_source,
    announcement_url,
    announcement_title,
    raw_source_text,
    is_new_fund_signal,
    active_deployment_window_start,
    active_deployment_window_end,
    likely_actively_deploying,
    stage_focus,
    sector_focus,
    geography_focus,
    field_confidence,
    field_provenance,
    metadata,
    last_signal_at,
    verification_status,
    last_verified_at,
    freshness_synced_at,
    latest_source_published_at,
    manually_verified
  )
  VALUES (
    v_firm_record_id,
    'KP Select IV',
    'kp select 4',
    v_firm_record_id::text || ':kp select 4:2026',
    'traditional',
    4,
    2026,
    v_announced_date,
    2500000000.00,
    'USD',
    'announced',
    0.9900,
    1,
    'official_website',
    v_announcement_url,
    v_announcement_title,
    v_source_text,
    true,
    v_announced_date,
    DATE '2028-03-24',
    true,
    ARRAY['Series B', 'Growth']::text[],
    ARRAY[
      'AI-Native',
      'Professional Services',
      'Healthcare',
      'Cybersecurity',
      'Fintech',
      'Enterprise',
      'Transportation',
      'Industrial',
      'Physical AI'
    ]::text[],
    ARRAY[]::text[],
    jsonb_build_object(
      'name', 0.99,
      'announced_date', 0.99,
      'target_size_usd', 0.90,
      'stage_focus', 0.88,
      'sector_focus', 0.82
    ),
    jsonb_build_object(
      'name', jsonb_build_array(v_announcement_url),
      'announced_date', jsonb_build_array(v_announcement_url),
      'target_size_usd', jsonb_build_array(v_announcement_url, 'curated_mapping'),
      'stage_focus', jsonb_build_array(v_announcement_url, 'curated_mapping'),
      'sector_focus', jsonb_build_array(v_announcement_url, 'curated_mapping')
    ),
    jsonb_build_object(
      'curation_note', 'Amount/themes/stage tags curated onto KP Select IV from official announcement plus manual taxonomy mapping.',
      'source_article_says_growth_funds_plural', true
    ),
    now(),
    'official_source_promoted',
    now(),
    now(),
    v_announced_date,
    true
  )
  ON CONFLICT (normalized_key) DO UPDATE
  SET
    firm_record_id = EXCLUDED.firm_record_id,
    name = EXCLUDED.name,
    normalized_name = EXCLUDED.normalized_name,
    fund_type = EXCLUDED.fund_type,
    fund_sequence_number = EXCLUDED.fund_sequence_number,
    vintage_year = EXCLUDED.vintage_year,
    announced_date = EXCLUDED.announced_date,
    target_size_usd = EXCLUDED.target_size_usd,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status,
    source_confidence = GREATEST(public.vc_funds.source_confidence, EXCLUDED.source_confidence),
    source_count = GREATEST(public.vc_funds.source_count, EXCLUDED.source_count),
    lead_source = EXCLUDED.lead_source,
    announcement_url = EXCLUDED.announcement_url,
    announcement_title = EXCLUDED.announcement_title,
    raw_source_text = EXCLUDED.raw_source_text,
    is_new_fund_signal = EXCLUDED.is_new_fund_signal,
    active_deployment_window_start = EXCLUDED.active_deployment_window_start,
    active_deployment_window_end = EXCLUDED.active_deployment_window_end,
    likely_actively_deploying = EXCLUDED.likely_actively_deploying,
    stage_focus = EXCLUDED.stage_focus,
    sector_focus = EXCLUDED.sector_focus,
    geography_focus = EXCLUDED.geography_focus,
    field_confidence = EXCLUDED.field_confidence,
    field_provenance = EXCLUDED.field_provenance,
    metadata = EXCLUDED.metadata,
    last_signal_at = now(),
    verification_status = EXCLUDED.verification_status,
    last_verified_at = now(),
    freshness_synced_at = now(),
    latest_source_published_at = EXCLUDED.latest_source_published_at,
    manually_verified = true,
    deleted_at = NULL
  RETURNING id INTO v_vc_fund_id;

  INSERT INTO public.vc_fund_sources (
    vc_fund_id,
    source_type,
    source_url,
    source_title,
    publisher,
    published_at,
    extracted_payload,
    confidence,
    content_hash
  )
  VALUES (
    v_vc_fund_id,
    'official_website',
    v_announcement_url,
    v_announcement_title,
    'Kleiner Perkins',
    v_announced_date::timestamptz,
    jsonb_build_object(
      'fund_name', 'KP Select IV',
      'announced_date', v_announced_date,
      'target_size_usd', 2500000000,
      'stage_focus', jsonb_build_array('Series B', 'Growth'),
      'sector_focus', jsonb_build_array(
        'AI-Native',
        'Professional Services',
        'Healthcare',
        'Cybersecurity',
        'Fintech',
        'Enterprise',
        'Transportation',
        'Industrial',
        'Physical AI'
      ),
      'source_note', 'Official page says "$2.5 billion in growth funds" (plural); row is a curated mapping to KP Select IV.'
    ),
    0.9900,
    md5(v_announcement_url || '|kp-select-iv|2026-03-24')
  )
  ON CONFLICT (vc_fund_id, source_url) DO UPDATE
  SET
    source_type = EXCLUDED.source_type,
    source_title = EXCLUDED.source_title,
    publisher = EXCLUDED.publisher,
    published_at = EXCLUDED.published_at,
    extracted_payload = EXCLUDED.extracted_payload,
    confidence = GREATEST(public.vc_fund_sources.confidence, EXCLUDED.confidence),
    content_hash = EXCLUDED.content_hash;

  PERFORM public.refresh_firm_capital_derived_fields(v_firm_record_id, 365);
END $$;
