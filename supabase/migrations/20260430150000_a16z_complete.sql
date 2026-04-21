-- Andreessen Horowitz — complete upsert: firm + HQ + 5 funds + announcement URLs.
-- Single CTE chain. Run once in the Supabase SQL Editor.
-- Source: https://a16z.com/why-did-we-raise-15b/?utm_source=tryvekta&utm_medium=referral&utm_campaign=fresh_capital

WITH
existing_firm AS (
  SELECT id
  FROM public.firm_records
  WHERE deleted_at IS NULL
    AND (LOWER(firm_name) LIKE '%andreessen%' OR LOWER(firm_name) LIKE '%a16z%')
  ORDER BY COALESCE(match_score, 0) DESC, created_at ASC
  LIMIT 1
),
created_firm AS (
  INSERT INTO public.firm_records (firm_name, website_url, created_at, updated_at)
  SELECT 'Andreessen Horowitz', 'https://a16z.com', NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM existing_firm)
  RETURNING id
),
firm AS (
  SELECT id FROM existing_firm
  UNION ALL
  SELECT id FROM created_firm
),
update_firm AS (
  UPDATE public.firm_records SET
    has_fresh_capital            = true,
    is_actively_deploying        = true,
    latest_fund_size_usd         = 6750000000,
    last_fund_announcement_date  = '2026-01-09',
    fresh_capital_priority_score = GREATEST(COALESCE(fresh_capital_priority_score, 0), 0.98),
    hq_city                      = 'Menlo Park',
    hq_state                     = 'CA',
    hq_country                   = 'United States',
    updated_at                   = NOW()
  WHERE id IN (SELECT id FROM firm)
  RETURNING id
),
ins1 AS (
  INSERT INTO public.vc_funds (firm_record_id, name, normalized_name, normalized_key, fund_type, final_size_usd, status, announced_date, stage_focus, sector_focus, geography_focus, source_confidence, is_new_fund_signal, likely_actively_deploying, announcement_title, announcement_url, created_at, updated_at)
  SELECT f.id, 'American Dynamism Fund', 'american dynamism fund', 'a16z-american-dynamism-fund-2026', 'venture', 1176000000, 'announced', '2026-01-09', ARRAY['Seed','Series A','Series B'], ARRAY['Defense','Aerospace','Infrastructure','Supply Chain','Manufacturing'], ARRAY['United States'], 0.95, true, true, 'a16z raises $1.176B American Dynamism Fund', 'https://a16z.com/why-did-we-raise-15b/?utm_source=tryvekta&utm_medium=referral&utm_campaign=fresh_capital', NOW(), NOW() FROM firm f
  ON CONFLICT (normalized_key) DO UPDATE SET firm_record_id=EXCLUDED.firm_record_id, final_size_usd=EXCLUDED.final_size_usd, stage_focus=EXCLUDED.stage_focus, sector_focus=EXCLUDED.sector_focus, geography_focus=EXCLUDED.geography_focus, announced_date=EXCLUDED.announced_date, announcement_title=EXCLUDED.announcement_title, announcement_url=EXCLUDED.announcement_url, likely_actively_deploying=EXCLUDED.likely_actively_deploying, updated_at=NOW()
  RETURNING name
),
ins2 AS (
  INSERT INTO public.vc_funds (firm_record_id, name, normalized_name, normalized_key, fund_sequence_number, fund_type, final_size_usd, status, announced_date, stage_focus, sector_focus, geography_focus, source_confidence, is_new_fund_signal, likely_actively_deploying, announcement_title, announcement_url, created_at, updated_at)
  SELECT f.id, 'Growth Fund V', 'growth fund v', 'a16z-growth-fund-v-2026', 5, 'growth', 6750000000, 'announced', '2026-01-09', ARRAY['Series B','Series C+'], ARRAY['AI Native','Enterprise','Consumer','Global'], ARRAY['United States'], 0.95, true, true, 'a16z raises $6.75B Growth Fund V', 'https://a16z.com/why-did-we-raise-15b/?utm_source=tryvekta&utm_medium=referral&utm_campaign=fresh_capital', NOW(), NOW() FROM firm f
  ON CONFLICT (normalized_key) DO UPDATE SET firm_record_id=EXCLUDED.firm_record_id, fund_sequence_number=EXCLUDED.fund_sequence_number, final_size_usd=EXCLUDED.final_size_usd, stage_focus=EXCLUDED.stage_focus, sector_focus=EXCLUDED.sector_focus, geography_focus=EXCLUDED.geography_focus, announced_date=EXCLUDED.announced_date, announcement_title=EXCLUDED.announcement_title, announcement_url=EXCLUDED.announcement_url, likely_actively_deploying=EXCLUDED.likely_actively_deploying, updated_at=NOW()
  RETURNING name
),
ins3 AS (
  INSERT INTO public.vc_funds (firm_record_id, name, normalized_name, normalized_key, fund_type, final_size_usd, status, announced_date, stage_focus, sector_focus, geography_focus, source_confidence, is_new_fund_signal, likely_actively_deploying, announcement_title, announcement_url, created_at, updated_at)
  SELECT f.id, 'Apps Fund', 'apps fund', 'a16z-apps-fund-2026', 'venture', 1700000000, 'announced', '2026-01-09', ARRAY['Seed','Series A','Series B'], ARRAY['Consumer','Enterprise','Vertical SaaS','Marketplaces','AI Native'], ARRAY['United States'], 0.95, true, true, 'a16z raises $1.7B Apps Fund', 'https://a16z.com/why-did-we-raise-15b/?utm_source=tryvekta&utm_medium=referral&utm_campaign=fresh_capital', NOW(), NOW() FROM firm f
  ON CONFLICT (normalized_key) DO UPDATE SET firm_record_id=EXCLUDED.firm_record_id, final_size_usd=EXCLUDED.final_size_usd, stage_focus=EXCLUDED.stage_focus, sector_focus=EXCLUDED.sector_focus, geography_focus=EXCLUDED.geography_focus, announced_date=EXCLUDED.announced_date, announcement_title=EXCLUDED.announcement_title, announcement_url=EXCLUDED.announcement_url, likely_actively_deploying=EXCLUDED.likely_actively_deploying, updated_at=NOW()
  RETURNING name
),
ins4 AS (
  INSERT INTO public.vc_funds (firm_record_id, name, normalized_name, normalized_key, fund_type, final_size_usd, status, announced_date, stage_focus, sector_focus, geography_focus, source_confidence, is_new_fund_signal, likely_actively_deploying, announcement_title, announcement_url, created_at, updated_at)
  SELECT f.id, 'Infrastructure Fund', 'infrastructure fund', 'a16z-infrastructure-fund-2026', 'venture', 1700000000, 'announced', '2026-01-09', ARRAY['Seed','Series A','Series B'], ARRAY['AI Infrastructure','Cloud','Developer Tools','Crypto','Blockchain','Data Centers'], ARRAY['United States'], 0.95, true, true, 'a16z raises $1.7B Infrastructure Fund', 'https://a16z.com/why-did-we-raise-15b/?utm_source=tryvekta&utm_medium=referral&utm_campaign=fresh_capital', NOW(), NOW() FROM firm f
  ON CONFLICT (normalized_key) DO UPDATE SET firm_record_id=EXCLUDED.firm_record_id, final_size_usd=EXCLUDED.final_size_usd, stage_focus=EXCLUDED.stage_focus, sector_focus=EXCLUDED.sector_focus, geography_focus=EXCLUDED.geography_focus, announced_date=EXCLUDED.announced_date, announcement_title=EXCLUDED.announcement_title, announcement_url=EXCLUDED.announcement_url, likely_actively_deploying=EXCLUDED.likely_actively_deploying, updated_at=NOW()
  RETURNING name
),
ins5 AS (
  INSERT INTO public.vc_funds (firm_record_id, name, normalized_name, normalized_key, fund_type, final_size_usd, status, announced_date, stage_focus, sector_focus, geography_focus, source_confidence, is_new_fund_signal, likely_actively_deploying, announcement_title, announcement_url, created_at, updated_at)
  SELECT f.id, 'Bio + Health Fund', 'bio + health fund', 'a16z-bio-health-fund-2026', 'venture', 700000000, 'announced', '2026-01-09', ARRAY['Seed','Series A','Series B'], ARRAY['Biotechnology','Healthcare','Drug Discovery','AI Models','Longevity','Diagnostics','Healthcare Infrastructure'], ARRAY['United States'], 0.95, true, true, 'a16z raises $700M Bio + Health Fund', 'https://a16z.com/why-did-we-raise-15b/?utm_source=tryvekta&utm_medium=referral&utm_campaign=fresh_capital', NOW(), NOW() FROM firm f
  ON CONFLICT (normalized_key) DO UPDATE SET firm_record_id=EXCLUDED.firm_record_id, final_size_usd=EXCLUDED.final_size_usd, stage_focus=EXCLUDED.stage_focus, sector_focus=EXCLUDED.sector_focus, geography_focus=EXCLUDED.geography_focus, announced_date=EXCLUDED.announced_date, announcement_title=EXCLUDED.announcement_title, announcement_url=EXCLUDED.announcement_url, likely_actively_deploying=EXCLUDED.likely_actively_deploying, updated_at=NOW()
  RETURNING name
)
SELECT
  (SELECT id   FROM firm) AS firm_id,
  (SELECT name FROM ins1) AS american_dynamism,
  (SELECT name FROM ins2) AS growth_fund_v,
  (SELECT name FROM ins3) AS apps_fund,
  (SELECT name FROM ins4) AS infrastructure,
  (SELECT name FROM ins5) AS bio_health;
