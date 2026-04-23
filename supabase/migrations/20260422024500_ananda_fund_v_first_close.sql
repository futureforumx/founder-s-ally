-- Ananda Impact Ventures: replace stub fund row with official Fund V details
-- from the January 19, 2026 announcement.
--
-- Source:
-- https://ananda.vc/our-largest-first-close-ever-e73m-for-ananda-fund-v/
--
-- Notes:
-- - The article announces a EUR 73M first close and says this is above a EUR 50M target.
-- - Fresh Capital renders USD amounts from vc_funds.{final,target}_size_usd, so we store
--   rounded USD equivalents for display while preserving the original EUR figures in metadata.

DO $$
DECLARE
  v_firm_record_id uuid;
  v_vc_fund_id uuid;
  v_announced_date constant date := DATE '2026-01-19';
  v_announcement_url constant text := 'https://ananda.vc/our-largest-first-close-ever-e73m-for-ananda-fund-v/';
  v_announcement_title constant text := 'Our Largest First Close Ever: €73M for Ananda Fund V';
  v_source_text constant text := 'We just have secured €73 million in the first close of our fifth Core Impact Fund, well above our €50 million target. The largest first close in Ananda''s 16-year history!';
  -- EUR/USD 1.1728 on April 22, 2026. Rounded to whole USD for display.
  v_target_size_usd constant numeric := 58640000;
  v_first_close_usd constant numeric := 85600000;
BEGIN
  SELECT fr.id
  INTO v_firm_record_id
  FROM public.firm_records fr
  WHERE fr.deleted_at IS NULL
    AND LOWER(TRIM(fr.firm_name)) = 'ananda impact ventures'
  ORDER BY
    CASE
      WHEN LOWER(COALESCE(fr.website_url, '')) LIKE '%ananda.vc%' THEN 0
      ELSE 1
    END,
    fr.updated_at DESC NULLS LAST,
    fr.created_at DESC
  LIMIT 1;

  IF v_firm_record_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve firm_records.id for Ananda Impact Ventures';
  END IF;

  SELECT vf.id
  INTO v_vc_fund_id
  FROM public.vc_funds vf
  WHERE vf.firm_record_id = v_firm_record_id
    AND vf.deleted_at IS NULL
    AND (
      LOWER(TRIM(vf.name)) IN ('fund', 'ananda fund v', 'fund v', 'ananda core impact fund v')
      OR vf.normalized_key = v_firm_record_id::text || ':fund:unknown'
    )
  ORDER BY vf.updated_at DESC NULLS LAST, vf.created_at DESC
  LIMIT 1;

  IF v_vc_fund_id IS NULL THEN
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
      final_size_usd,
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
      'Ananda Fund V',
      'ananda fund 5',
      v_firm_record_id::text || ':ananda fund 5:2026',
      'traditional',
      5,
      2026,
      v_announced_date,
      v_target_size_usd,
      v_first_close_usd,
      'EUR',
      'first_close',
      0.9900,
      1,
      'official_website',
      v_announcement_url,
      v_announcement_title,
      v_source_text,
      true,
      v_announced_date,
      DATE '2028-01-19',
      true,
      ARRAY['Pre-seed', 'Seed', 'Series A']::text[],
      ARRAY['Climate', 'Healthcare', 'Education']::text[],
      ARRAY['Europe']::text[],
      jsonb_build_object(
        'name', 0.99,
        'announced_date', 0.99,
        'target_size_usd', 0.90,
        'final_size_usd', 0.90,
        'geography_focus', 0.97,
        'sector_focus', 0.68
      ),
      jsonb_build_object(
        'name', jsonb_build_array(v_announcement_url),
        'announced_date', jsonb_build_array(v_announcement_url),
        'target_size_usd', jsonb_build_array(v_announcement_url, 'eur_to_usd_conversion_2026_04_22'),
        'final_size_usd', jsonb_build_array(v_announcement_url, 'eur_to_usd_conversion_2026_04_22'),
        'geography_focus', jsonb_build_array(v_announcement_url),
        'sector_focus', jsonb_build_array(v_announcement_url, 'curated_from_source_examples')
      ),
      jsonb_build_object(
        'source_currency', 'EUR',
        'source_target_size_eur', 50000000,
        'source_first_close_eur', 73000000,
        'source_vehicle_label', 'fifth Core Impact Fund',
        'fundraise_note', 'Official announcement describes a first close, not a final close.',
        'curated_sector_mapping_from_examples', jsonb_build_array('Climate', 'Healthcare', 'Education')
      ),
      now(),
      'official_source_promoted',
      now(),
      now(),
      v_announced_date::timestamptz,
      true
    )
    RETURNING id INTO v_vc_fund_id;
  ELSE
    UPDATE public.vc_funds
    SET
      name = 'Ananda Fund V',
      normalized_name = 'ananda fund 5',
      normalized_key = v_firm_record_id::text || ':ananda fund 5:2026',
      fund_type = 'traditional',
      fund_sequence_number = 5,
      vintage_year = 2026,
      announced_date = v_announced_date,
      close_date = NULL,
      target_size_usd = v_target_size_usd,
      final_size_usd = v_first_close_usd,
      currency = 'EUR',
      status = 'first_close',
      source_confidence = GREATEST(COALESCE(source_confidence, 0), 0.9900),
      source_count = GREATEST(COALESCE(source_count, 0), 1),
      lead_source = 'official_website',
      announcement_url = v_announcement_url,
      announcement_title = v_announcement_title,
      raw_source_text = v_source_text,
      is_new_fund_signal = true,
      active_deployment_window_start = v_announced_date,
      active_deployment_window_end = DATE '2028-01-19',
      likely_actively_deploying = true,
      stage_focus = ARRAY['Pre-seed', 'Seed', 'Series A']::text[],
      sector_focus = ARRAY['Climate', 'Healthcare', 'Education']::text[],
      geography_focus = ARRAY['Europe']::text[],
      field_confidence = jsonb_build_object(
        'name', 0.99,
        'announced_date', 0.99,
        'target_size_usd', 0.90,
        'final_size_usd', 0.90,
        'geography_focus', 0.97,
        'sector_focus', 0.68
      ),
      field_provenance = jsonb_build_object(
        'name', jsonb_build_array(v_announcement_url),
        'announced_date', jsonb_build_array(v_announcement_url),
        'target_size_usd', jsonb_build_array(v_announcement_url, 'eur_to_usd_conversion_2026_04_22'),
        'final_size_usd', jsonb_build_array(v_announcement_url, 'eur_to_usd_conversion_2026_04_22'),
        'geography_focus', jsonb_build_array(v_announcement_url),
        'sector_focus', jsonb_build_array(v_announcement_url, 'curated_from_source_examples')
      ),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'source_currency', 'EUR',
        'source_target_size_eur', 50000000,
        'source_first_close_eur', 73000000,
        'source_vehicle_label', 'fifth Core Impact Fund',
        'fundraise_note', 'Official announcement describes a first close, not a final close.',
        'curated_sector_mapping_from_examples', jsonb_build_array('Climate', 'Healthcare', 'Education')
      ),
      last_signal_at = now(),
      verification_status = 'official_source_promoted',
      last_verified_at = now(),
      freshness_synced_at = now(),
      latest_source_published_at = v_announced_date::timestamptz,
      manually_verified = true,
      deleted_at = NULL
    WHERE id = v_vc_fund_id;
  END IF;

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
    'Ananda Impact Ventures',
    v_announced_date::timestamptz,
    jsonb_build_object(
      'fund_name', 'Ananda Fund V',
      'announced_date', v_announced_date,
      'status', 'first_close',
      'target_size_eur', 50000000,
      'first_close_eur', 73000000,
      'geography_focus', jsonb_build_array('Europe'),
      'sector_focus', jsonb_build_array('Climate', 'Healthcare', 'Education'),
      'source_note', 'Official announcement says €73M first close for the fifth Core Impact Fund, above a €50M target.'
    ),
    0.9900,
    md5(v_announcement_url || '|ananda-fund-v|2026-01-19')
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
