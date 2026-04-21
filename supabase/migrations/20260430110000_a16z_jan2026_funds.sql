-- Manual enrichment: Andreessen Horowitz — five fund vehicles announced January 9, 2026.
--   American Dynamism Fund  $1.176B
--   Growth Fund V           $6.75B
--   Apps Fund               $1.7B
--   Infrastructure Fund     $1.7B
--   Bio + Health Fund       $700M
-- Total new capital: ~$12.026B
-- Idempotent: safe to re-apply (ON CONFLICT on normalized_key).

DO $$
DECLARE
  v_firm_id uuid;
BEGIN

  -- ── 1. Resolve canonical Andreessen Horowitz firm_records row ───────────────
  SELECT id INTO v_firm_id
  FROM public.firm_records
  WHERE deleted_at IS NULL
    AND (
      LOWER(firm_name) LIKE '%andreessen%'
      OR LOWER(firm_name) LIKE '%a16z%'
    )
  ORDER BY
    COALESCE(match_score, 0) DESC,
    COALESCE(last_enriched_at, '1970-01-01'::timestamptz) DESC,
    created_at ASC
  LIMIT 1;

  IF v_firm_id IS NULL THEN
    INSERT INTO public.firm_records (firm_name, website_url, created_at, updated_at)
    VALUES ('Andreessen Horowitz', 'https://a16z.com', NOW(), NOW())
    RETURNING id INTO v_firm_id;
  END IF;

  -- ── 2. Update firm-level capital signal fields ──────────────────────────────
  -- latest_fund_size_usd = Growth Fund V (largest vehicle of this cohort).
  UPDATE public.firm_records
  SET
    has_fresh_capital            = true,
    is_actively_deploying        = true,
    latest_fund_size_usd         = 6750000000,
    last_fund_announcement_date  = '2026-01-09',
    fresh_capital_priority_score = GREATEST(COALESCE(fresh_capital_priority_score, 0), 0.98),
    updated_at = NOW()
  WHERE id = v_firm_id;

  -- ── 3. American Dynamism Fund — $1.176B ─────────────────────────────────────
  INSERT INTO public.vc_funds (
    firm_record_id, name, normalized_name, normalized_key,
    fund_type, final_size_usd, status, announced_date,
    stage_focus, sector_focus, geography_focus,
    source_confidence, is_new_fund_signal, likely_actively_deploying,
    announcement_title, created_at, updated_at
  ) VALUES (
    v_firm_id,
    'American Dynamism Fund',
    'american dynamism fund',
    'a16z-american-dynamism-fund-2026',
    'venture',
    1176000000,
    'announced',
    '2026-01-09',
    ARRAY['Seed', 'Series A', 'Series B'],
    ARRAY['Defense', 'Aerospace', 'Infrastructure', 'Supply Chain', 'Manufacturing'],
    ARRAY['United States'],
    0.95, true, true,
    'a16z raises $1.176B American Dynamism Fund for defense, aerospace, and industrial tech',
    NOW(), NOW()
  )
  ON CONFLICT (normalized_key) DO UPDATE SET
    firm_record_id            = EXCLUDED.firm_record_id,
    final_size_usd            = EXCLUDED.final_size_usd,
    stage_focus               = EXCLUDED.stage_focus,
    sector_focus              = EXCLUDED.sector_focus,
    geography_focus           = EXCLUDED.geography_focus,
    announced_date            = EXCLUDED.announced_date,
    announcement_title        = EXCLUDED.announcement_title,
    likely_actively_deploying = EXCLUDED.likely_actively_deploying,
    updated_at                = NOW();

  -- ── 4. Growth Fund V — $6.75B ───────────────────────────────────────────────
  INSERT INTO public.vc_funds (
    firm_record_id, name, normalized_name, normalized_key,
    fund_sequence_number, fund_type, final_size_usd, status, announced_date,
    stage_focus, sector_focus, geography_focus,
    source_confidence, is_new_fund_signal, likely_actively_deploying,
    announcement_title, created_at, updated_at
  ) VALUES (
    v_firm_id,
    'Growth Fund V',
    'growth fund v',
    'a16z-growth-fund-v-2026',
    5,
    'growth',
    6750000000,
    'announced',
    '2026-01-09',
    ARRAY['Series B', 'Series C+'],
    ARRAY['AI Native', 'Enterprise', 'Consumer', 'Global'],
    ARRAY['United States'],
    0.95, true, true,
    'a16z raises $6.75B Growth Fund V for Series B and C+ across AI, enterprise, and consumer',
    NOW(), NOW()
  )
  ON CONFLICT (normalized_key) DO UPDATE SET
    firm_record_id            = EXCLUDED.firm_record_id,
    fund_sequence_number      = EXCLUDED.fund_sequence_number,
    final_size_usd            = EXCLUDED.final_size_usd,
    stage_focus               = EXCLUDED.stage_focus,
    sector_focus              = EXCLUDED.sector_focus,
    geography_focus           = EXCLUDED.geography_focus,
    announced_date            = EXCLUDED.announced_date,
    announcement_title        = EXCLUDED.announcement_title,
    likely_actively_deploying = EXCLUDED.likely_actively_deploying,
    updated_at                = NOW();

  -- ── 5. Apps Fund — $1.7B ────────────────────────────────────────────────────
  INSERT INTO public.vc_funds (
    firm_record_id, name, normalized_name, normalized_key,
    fund_type, final_size_usd, status, announced_date,
    stage_focus, sector_focus, geography_focus,
    source_confidence, is_new_fund_signal, likely_actively_deploying,
    announcement_title, created_at, updated_at
  ) VALUES (
    v_firm_id,
    'Apps Fund',
    'apps fund',
    'a16z-apps-fund-2026',
    'venture',
    1700000000,
    'announced',
    '2026-01-09',
    ARRAY['Seed', 'Series A', 'Series B'],
    ARRAY['Consumer', 'Enterprise', 'Vertical SaaS', 'Marketplaces', 'AI Native'],
    ARRAY['United States'],
    0.95, true, true,
    'a16z raises $1.7B Apps Fund for consumer, enterprise, and AI-native applications',
    NOW(), NOW()
  )
  ON CONFLICT (normalized_key) DO UPDATE SET
    firm_record_id            = EXCLUDED.firm_record_id,
    final_size_usd            = EXCLUDED.final_size_usd,
    stage_focus               = EXCLUDED.stage_focus,
    sector_focus              = EXCLUDED.sector_focus,
    geography_focus           = EXCLUDED.geography_focus,
    announced_date            = EXCLUDED.announced_date,
    announcement_title        = EXCLUDED.announcement_title,
    likely_actively_deploying = EXCLUDED.likely_actively_deploying,
    updated_at                = NOW();

  -- ── 6. Infrastructure Fund — $1.7B ──────────────────────────────────────────
  INSERT INTO public.vc_funds (
    firm_record_id, name, normalized_name, normalized_key,
    fund_type, final_size_usd, status, announced_date,
    stage_focus, sector_focus, geography_focus,
    source_confidence, is_new_fund_signal, likely_actively_deploying,
    announcement_title, created_at, updated_at
  ) VALUES (
    v_firm_id,
    'Infrastructure Fund',
    'infrastructure fund',
    'a16z-infrastructure-fund-2026',
    'venture',
    1700000000,
    'announced',
    '2026-01-09',
    ARRAY['Seed', 'Series A', 'Series B'],
    ARRAY['AI Infrastructure', 'Cloud', 'Developer Tools', 'Crypto', 'Blockchain', 'Data Centers'],
    ARRAY['United States'],
    0.95, true, true,
    'a16z raises $1.7B Infrastructure Fund for AI infra, cloud, developer tools, and crypto',
    NOW(), NOW()
  )
  ON CONFLICT (normalized_key) DO UPDATE SET
    firm_record_id            = EXCLUDED.firm_record_id,
    final_size_usd            = EXCLUDED.final_size_usd,
    stage_focus               = EXCLUDED.stage_focus,
    sector_focus              = EXCLUDED.sector_focus,
    geography_focus           = EXCLUDED.geography_focus,
    announced_date            = EXCLUDED.announced_date,
    announcement_title        = EXCLUDED.announcement_title,
    likely_actively_deploying = EXCLUDED.likely_actively_deploying,
    updated_at                = NOW();

  -- ── 7. Bio + Health Fund — $700M ────────────────────────────────────────────
  INSERT INTO public.vc_funds (
    firm_record_id, name, normalized_name, normalized_key,
    fund_type, final_size_usd, status, announced_date,
    stage_focus, sector_focus, geography_focus,
    source_confidence, is_new_fund_signal, likely_actively_deploying,
    announcement_title, created_at, updated_at
  ) VALUES (
    v_firm_id,
    'Bio + Health Fund',
    'bio + health fund',
    'a16z-bio-health-fund-2026',
    'venture',
    700000000,
    'announced',
    '2026-01-09',
    ARRAY['Seed', 'Series A', 'Series B'],
    ARRAY['Biotechnology', 'Healthcare', 'Drug Discovery', 'AI Models', 'Longevity', 'Diagnostics', 'Healthcare Infrastructure'],
    ARRAY['United States'],
    0.95, true, true,
    'a16z raises $700M Bio + Health Fund for biotech, drug discovery, longevity, and health AI',
    NOW(), NOW()
  )
  ON CONFLICT (normalized_key) DO UPDATE SET
    firm_record_id            = EXCLUDED.firm_record_id,
    final_size_usd            = EXCLUDED.final_size_usd,
    stage_focus               = EXCLUDED.stage_focus,
    sector_focus              = EXCLUDED.sector_focus,
    geography_focus           = EXCLUDED.geography_focus,
    announced_date            = EXCLUDED.announced_date,
    announcement_title        = EXCLUDED.announcement_title,
    likely_actively_deploying = EXCLUDED.likely_actively_deploying,
    updated_at                = NOW();

END $$;
