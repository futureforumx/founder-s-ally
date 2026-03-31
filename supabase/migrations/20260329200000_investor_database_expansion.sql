-- =============================================================================
-- investor_database expansion: add missing fields to match VCFirm (Prisma)
-- + investor_partners expansion to match VCPerson
-- + prisma_firm_id link column for sync script
-- =============================================================================

-- --------------------------------------------------------
-- 1. investor_database — link column to vc_firms (Prisma)
-- --------------------------------------------------------
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS prisma_firm_id text UNIQUE DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_investor_database_prisma_firm_id
  ON public.investor_database (prisma_firm_id);

-- --------------------------------------------------------
-- 2. investor_database — identity & description fields
-- --------------------------------------------------------
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS legal_name          text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS slug                text UNIQUE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS elevator_pitch      text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description         text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone               text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS address             text DEFAULT NULL;

-- --------------------------------------------------------
-- 3. investor_database — structured geography (split from location)
-- --------------------------------------------------------
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS hq_city    text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hq_state   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hq_country text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS locations  jsonb DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_investor_database_hq
  ON public.investor_database (hq_country, hq_state, hq_city);

-- --------------------------------------------------------
-- 4. investor_database — social & platform URLs
-- --------------------------------------------------------
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS linkedin_url      text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS x_url             text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS substack_url      text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS medium_url        text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS beehiiv_url       text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS instagram_url     text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS facebook_url      text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS youtube_url       text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tiktok_url        text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS crunchbase_url    text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cb_insights_url   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS signal_nfx_url    text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vcsheet_url       text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS angellist_url     text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS openvc_url        text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trustfinta_url    text DEFAULT NULL;

-- --------------------------------------------------------
-- 5. investor_database — team size fields
-- --------------------------------------------------------
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS total_headcount       integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS total_investors       integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS total_partners        integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS general_partner_count integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS partner_names         text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS general_partner_names text[]  DEFAULT '{}';

-- --------------------------------------------------------
-- 6. investor_database — classification & status
-- --------------------------------------------------------
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS founded_year          integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status                text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verification_status   text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS data_confidence_score integer DEFAULT NULL;

-- --------------------------------------------------------
-- 7. investor_database — scoring metrics (all 0–100 integers)
-- --------------------------------------------------------
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS match_score          integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS responsiveness_score integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS value_add_score      integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS network_strength     integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS industry_reputation  integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS volatility_score     integer DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_investor_database_match_score
  ON public.investor_database (match_score);

-- --------------------------------------------------------
-- 8. investor_database — enrichment & audit timestamps
-- --------------------------------------------------------
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS last_verified_at         timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_update_scheduled_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at               timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at               timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_investor_database_deleted_at
  ON public.investor_database (deleted_at);

-- --------------------------------------------------------
-- 9. investor_partners — expand to match VCPerson fields
-- --------------------------------------------------------
ALTER TABLE public.investor_partners
  ADD COLUMN IF NOT EXISTS prisma_person_id       text UNIQUE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS first_name             text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_name              text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preferred_name         text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avatar_url             text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bio                    text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email                  text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone                  text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS linkedin_url           text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS x_url                  text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS website_url            text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS city                   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS state                  text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS country                text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS timezone               text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stage_focus            text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sector_focus           text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS check_size_min         numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS check_size_max         numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS warm_intro_preferred   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cold_outreach_ok       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS personal_thesis_tags   text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS investment_style       text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS background_summary     text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prior_firms            text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS education_summary      text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS responsiveness_score   integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reputation_score       integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS value_add_score        integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS network_strength       integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS match_score            integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recent_deal_count      integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_active_date       timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_actively_investing  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at             timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_investor_partners_prisma_person_id
  ON public.investor_partners (prisma_person_id);

CREATE INDEX IF NOT EXISTS idx_investor_partners_email
  ON public.investor_partners (email);

CREATE INDEX IF NOT EXISTS idx_investor_partners_match_score
  ON public.investor_partners (match_score);

-- --------------------------------------------------------
-- 10. Refresh the investor_directory_safe view with new columns
-- --------------------------------------------------------
DROP VIEW IF EXISTS public.investor_directory_safe;

CREATE VIEW public.investor_directory_safe
WITH (security_invoker = true)
AS
SELECT
  -- original core fields
  id,
  firm_name,
  legal_name,
  slug,
  lead_partner,
  thesis_verticals,
  preferred_stage,
  min_check_size,
  max_check_size,
  recent_deals,
  lead_or_follow,
  ca_sb54_compliant,
  market_sentiment,
  sentiment_detail,
  -- location (legacy string + structured)
  location,
  hq_city,
  hq_state,
  hq_country,
  -- enriched identity
  logo_url,
  website_url,
  linkedin_url,
  x_url,
  crunchbase_url,
  angellist_url,
  -- firm metadata
  firm_type,
  founded_year,
  status,
  verification_status,
  data_confidence_score,
  -- team
  total_headcount,
  total_investors,
  total_partners,
  general_partner_count,
  partner_names,
  general_partner_names,
  headcount,
  -- deployment signals
  is_actively_deploying,
  aum,
  -- scores
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
  -- description / thesis
  elevator_pitch,
  description,
  -- timestamps
  created_at,
  updated_at,
  last_enriched_at,
  last_verified_at,
  next_update_scheduled_at,
  -- vector
  sector_embedding,
  -- hidden by default (credit-gated)
  NULL::text AS email,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_credits uc
      WHERE uc.user_id = auth.uid() AND uc.tier = 'admin'
    )
    THEN email_source
    ELSE NULL
  END AS email_source,
  -- Prisma link
  prisma_firm_id
FROM public.investor_database
WHERE deleted_at IS NULL;
