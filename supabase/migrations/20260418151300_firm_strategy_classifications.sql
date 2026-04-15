-- Multi-select strategy taxonomy for investor firm_records (orthogonal to thesis_orientation).
CREATE TYPE public.firm_strategy_classification AS ENUM (
  'THESIS_DRIVEN',
  'GENERALIST',
  'OPERATOR_LED',
  'PLATFORM_SERVICES_HEAVY',
  'EVERGREEN_LONG_DURATION',
  'IMPACT_ESG_DRIVEN',
  'GEOGRAPHY_SPECIALIST',
  'FOUNDER_PROFILE_DRIVEN'
);

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS strategy_classifications public.firm_strategy_classification[] NOT NULL DEFAULT '{}'::public.firm_strategy_classification[];

COMMENT ON COLUMN public.firm_records.strategy_classifications IS
  'Investment strategy tags (thesis-driven, generalist, operator-led, etc.); see product copy in src/lib/firmStrategyClassifications.ts';

CREATE INDEX IF NOT EXISTS firm_records_strategy_classifications_gin
  ON public.firm_records USING GIN (strategy_classifications);

-- Expose column on safe directory view (explicit column list).
DROP VIEW IF EXISTS public.investor_directory_safe;

CREATE VIEW public.investor_directory_safe
WITH (security_invoker = true)
AS
SELECT
  id,
  firm_name,
  legal_name,
  slug,
  entity_type,
  thesis_orientation,
  sector_scope,
  stage_focus,
  stage_min,
  stage_max,
  geo_focus,
  lead_partner,
  thesis_verticals,
  strategy_classifications,
  preferred_stage,
  min_check_size,
  max_check_size,
  recent_deals,
  lead_or_follow,
  ca_sb54_compliant,
  market_sentiment,
  sentiment_detail,
  location,
  hq_city,
  hq_state,
  hq_region,
  hq_country,
  hq_zip_code,
  logo_url,
  website_url,
  linkedin_url,
  x_url,
  youtube_url,
  medium_url,
  substack_url,
  tiktok_url,
  facebook_url,
  instagram_url,
  crunchbase_url,
  angellist_url,
  firm_type,
  founded_year,
  status,
  verification_status,
  data_confidence_score,
  total_headcount,
  total_investors,
  total_partners,
  general_partner_count,
  partner_names,
  general_partner_names,
  headcount,
  is_actively_deploying,
  aum,
  reputation_score,
  match_score,
  responsiveness_score,
  value_add_score,
  network_strength,
  industry_reputation,
  founder_reputation_score,
  news_sentiment_score,
  social_sentiment_score,
  community_rating,
  volatility_score,
  elevator_pitch,
  description,
  created_at,
  updated_at,
  last_enriched_at,
  last_verified_at,
  next_update_scheduled_at,
  sector_embedding,
  NULL::text AS email,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_credits uc
      WHERE uc.user_id = auth.uid()::text AND uc.tier = 'admin'
    )
    THEN email_source
    ELSE NULL
  END AS email_source,
  prisma_firm_id
FROM public.firm_records
WHERE deleted_at IS NULL;
