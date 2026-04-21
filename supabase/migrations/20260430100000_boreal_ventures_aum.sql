-- Manual enrichment: Boreal Ventures — AUM $35M.
-- Idempotent: safe to re-apply.
--
-- Updates firm_records.aum (text display) and derives related capital fields.
-- Inserts a vc_funds row so the firm appears in the Fresh Capital feed with
-- the correct fund size. Uses ON CONFLICT to stay idempotent on re-runs.

DO $$
DECLARE
  v_firm_id uuid;
BEGIN
  -- ── 1. Find or create the firm_records row ─────────────────────────────────
  SELECT id INTO v_firm_id
  FROM public.firm_records
  WHERE deleted_at IS NULL
    AND lower(btrim(firm_name)) = 'boreal ventures'
  LIMIT 1;

  IF v_firm_id IS NULL THEN
    INSERT INTO public.firm_records (firm_name, website_url, created_at, updated_at)
    VALUES ('Boreal Ventures', 'https://boreal.vc', NOW(), NOW())
    RETURNING id INTO v_firm_id;
  END IF;

  -- ── 2. Set AUM text + fresh-capital signal fields ─────────────────────────
  UPDATE public.firm_records
  SET
    aum                       = '$35M',
    has_fresh_capital         = true,
    is_actively_deploying     = true,
    latest_fund_size_usd      = 35000000,
    last_fund_announcement_date = CURRENT_DATE,
    fresh_capital_priority_score = GREATEST(
      COALESCE(fresh_capital_priority_score, 0),
      0.70
    ),
    updated_at = NOW()
  WHERE id = v_firm_id;

  -- ── 3. Upsert vc_funds row so the fund appears in get_new_vc_funds ─────────
  INSERT INTO public.vc_funds (
    firm_record_id,
    name,
    normalized_name,
    normalized_key,
    fund_type,
    final_size_usd,
    status,
    announced_date,
    source_confidence,
    is_new_fund_signal,
    likely_actively_deploying,
    created_at,
    updated_at
  )
  VALUES (
    v_firm_id,
    'Boreal Ventures',
    'boreal ventures',
    'boreal-ventures-fund-2026',
    'venture',
    35000000,
    'announced',
    CURRENT_DATE,
    0.90,
    true,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (normalized_key) DO UPDATE
    SET
      firm_record_id        = EXCLUDED.firm_record_id,
      final_size_usd        = EXCLUDED.final_size_usd,
      status                = EXCLUDED.status,
      announced_date        = EXCLUDED.announced_date,
      likely_actively_deploying = EXCLUDED.likely_actively_deploying,
      updated_at            = NOW();

END $$;
