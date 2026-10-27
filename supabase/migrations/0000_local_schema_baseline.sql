-- Baseline for objects the linked database already had before this migration
-- history (Prisma directory tables and other public relations that later
-- migrations alter). A clean local database has none of them, so startup
-- failed on missing relations such as public.people and public.vc_firms.
--
-- Columns that a later migration adds are omitted here so those migrations
-- still apply. CREATE TABLE IF NOT EXISTS keeps a database that already has
-- the relation unchanged.
--
-- This file is not applied to the linked project by this change.

-- Enums referenced by the baseline tables, or by later migrations
-- that alter a type they do not create (FirmType).
DO $$ BEGIN
  CREATE TYPE public."FirmType" AS ENUM (
    'VC',
    'CVC',
    'ANGEL_NETWORK',
    'MICRO_FUND',
    'FAMILY_OFFICE',
    'PE',
    'ACCELERATOR',
    'OTHER',
    'INSTITUTIONAL',
    'SOLO_GP',
    'MICRO_VC',
    'PUBLIC',
    'VENTURE_STUDIO'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."BusinessModel" AS ENUM (
    'SAAS',
    'MARKETPLACE',
    'E_COMMERCE',
    'FINTECH_INFRA',
    'API_PLATFORM',
    'HARDWARE',
    'D2C',
    'ENTERPRISE',
    'CONSUMER_APP',
    'OPEN_SOURCE',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."CompanyHeadcountBand" AS ENUM (
    'SOLO',
    'MICRO',
    'SMALL',
    'MID',
    'LARGE',
    'ENTERPRISE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."EntityMatchReviewKind" AS ENUM (
    'DEAL_COMPANY',
    'DEAL_INVESTOR'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."EntityMatchReviewStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'AUTO_EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."FounderArchetype" AS ENUM (
    'TECHNICAL',
    'COMMERCIAL',
    'HYBRID',
    'DOMAIN_EXPERT',
    'OPERATOR',
    'SERIAL_ENTREPRENEUR'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."FundingArticleFetchStatus" AS ENUM (
    'PENDING',
    'FETCHED',
    'FAILED',
    'SKIPPED_DUPLICATE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."FundingDealInvestorRole" AS ENUM (
    'LEAD',
    'PARTICIPANT',
    'EXISTING',
    'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."FundingEntityMatchMethod" AS ENUM (
    'DOMAIN_EXACT',
    'NAME_EXACT',
    'ALIAS_EXACT',
    'FUZZY_HIGH',
    'FUZZY_MEDIUM',
    'MANUAL',
    'UNRESOLVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."FundingIngestSourceKey" AS ENUM (
    'STARTUPS_GALLERY_NEWS',
    'TECHCRUNCH_VENTURE',
    'GEEKWIRE_FUNDINGS',
    'ALLEYWATCH_FUNDING'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."OperatorCompanyStage" AS ENUM (
    'PRE_SEED',
    'SEED',
    'SERIES_A',
    'SERIES_B',
    'SERIES_C',
    'GROWTH',
    'PUBLIC',
    'BOOTSTRAPPED',
    'ACQUIRED',
    'SHUTDOWN',
    'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."OperatorSignalType" AS ENUM (
    'JOB_CHANGE',
    'PROMOTION',
    'NEW_ADVISORY_ROLE',
    'CONTENT_PUBLISHED',
    'SPEAKING_APPEARANCE',
    'MEDIA_MENTION',
    'COMPANY_MILESTONE',
    'JOB_POSTING_DETECTED',
    'OPEN_TO_ADVISING',
    'FUNDING_NEWS',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."RevenueRange" AS ENUM (
    'PRE_REVENUE',
    'SUB_1M',
    'ARR_1M_5M',
    'ARR_5M_10M',
    'ARR_10M_50M',
    'ARR_50M_100M',
    'ARR_100M_PLUS',
    'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."SectorFocus" AS ENUM (
    'FINTECH',
    'ENTERPRISE_SAAS',
    'AI',
    'HEALTHTECH',
    'BIOTECH',
    'CONSUMER',
    'CLIMATE',
    'MOBILITY',
    'INDUSTRIAL',
    'CYBERSECURITY',
    'MEDIA',
    'WEB3',
    'EDTECH',
    'GOVTECH',
    'HARDWARE',
    'ROBOTICS',
    'MARKETPLACE',
    'AGRITECH',
    'PROPTECH',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."StartupDataSource" AS ENUM (
    'SEEDTABLE',
    'TOPSTARTUPS',
    'TINYTEAMS',
    'YC',
    'NEXTPLAY',
    'STARTUPS_GALLERY',
    'CB_INSIGHTS',
    'CRUNCHBASE',
    'TRACXN',
    'MANUAL',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."StartupStatus" AS ENUM (
    'ACTIVE',
    'ACQUIRED',
    'SHUT_DOWN',
    'IPO',
    'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."TargetCustomer" AS ENUM (
    'SMB',
    'MID_MARKET',
    'ENTERPRISE',
    'CONSUMER',
    'PROSUMER',
    'GOVERNMENT',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.sector_scope_enum AS ENUM (
    'Generalist',
    'Specialized'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Relations that no later file creates.
CREATE TABLE IF NOT EXISTS public.alexandria_credit_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  run_id text NOT NULL,
  batch_id uuid,
  entity_type text,
  entity_id text,
  provider text NOT NULL,
  capability text NOT NULL,
  credits_estimated numeric(10,2) NOT NULL DEFAULT 0,
  credits_actual numeric(10,2),
  status text NOT NULL,
  error_code text,
  scrape_id text,
  attempt_count integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT alexandria_credit_ledger_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.alexandria_enrichment_changes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  run_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  table_name text NOT NULL,
  column_name text,
  op text NOT NULL,
  row_id text,
  before_value jsonb,
  after_value jsonb,
  provider text,
  capability text,
  confidence_label text,
  confidence_score numeric(3,2),
  applied_at timestamp with time zone NOT NULL DEFAULT now(),
  rolled_back_at timestamp with time zone,
  rolled_back_by text,
  CONSTRAINT alexandria_enrichment_changes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.alexandria_enrichment_state (
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  last_attempt_at timestamp with time zone,
  last_success_at timestamp with time zone,
  last_run_id text,
  attempts integer NOT NULL DEFAULT 0,
  completeness_before numeric(5,2),
  completeness_after numeric(5,2),
  missing_fields text[] NOT NULL DEFAULT '{}'::text[],
  fields_updated text[] NOT NULL DEFAULT '{}'::text[],
  field_last_refreshed jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_after timestamp with time zone,
  last_error text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT alexandria_enrichment_state_pkey PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS public.alexandria_provider_cache (
  cache_key text NOT NULL,
  provider text NOT NULL,
  capability text NOT NULL,
  response jsonb NOT NULL,
  credits_cost numeric(10,2) NOT NULL DEFAULT 0,
  request_id text,
  retrieved_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT alexandria_provider_cache_pkey PRIMARY KEY (cache_key)
);

CREATE TABLE IF NOT EXISTS public.enrich_social_state (
  key text NOT NULL,
  int_value integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT enrich_social_state_pkey PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS public.entity_match_reviews (
  id text NOT NULL,
  kind "EntityMatchReviewKind" NOT NULL,
  funding_deal_id text,
  funding_deal_investor_id text,
  candidate_json jsonb NOT NULL,
  status "EntityMatchReviewStatus" NOT NULL DEFAULT 'PENDING'::"EntityMatchReviewStatus",
  resolution_notes text,
  resolved_startup_id text,
  resolved_vc_firm_id text,
  resolved_vc_person_id text,
  created_at timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at timestamp(6) with time zone,
  CONSTRAINT entity_match_reviews_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.extraction_logs (
  id text NOT NULL,
  run_id text,
  source_article_id text,
  funding_deal_id text,
  level character varying(16) NOT NULL,
  message text NOT NULL,
  payload_json jsonb,
  created_at timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT extraction_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.firm_market_intel_snapshots (
  id text NOT NULL,
  vc_firm_id text NOT NULL,
  window_days integer NOT NULL,
  as_of_date date NOT NULL,
  metrics_json jsonb NOT NULL,
  activity_score double precision NOT NULL,
  momentum_score double precision NOT NULL,
  activity_components_json jsonb NOT NULL,
  momentum_components_json jsonb NOT NULL,
  focus_json jsonb NOT NULL,
  formula_version character varying(16) NOT NULL DEFAULT 'intel_v1'::character varying,
  computed_at timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT firm_market_intel_snapshots_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.fund_data (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  firm_name text NOT NULL,
  firm_slug text,
  fund_name text,
  fund_number integer,
  vintage_year integer,
  fund_status text,
  total_amount_usd bigint,
  amount_sold_usd bigint,
  pct_deployed numeric(5,2),
  investment_pace text,
  themes text[],
  sectors text[],
  stages text[],
  geographies text[],
  portfolio_companies jsonb DEFAULT '[]'::jsonb,
  portfolio_count integer DEFAULT 0,
  edgar_cik text,
  edgar_entity_name text,
  edgar_form_type text,
  edgar_accession_number text,
  edgar_filing_date date,
  edgar_filing_url text,
  edgar_industry_group text,
  edgar_state text,
  edgar_raw jsonb DEFAULT '{}'::jsonb,
  sources text[] DEFAULT ARRAY['edgar'::text],
  nfx_raw jsonb DEFAULT '{}'::jsonb,
  cbinsights_raw jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT fund_data_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.funding_deal_company_links (
  id text NOT NULL,
  funding_deal_id text NOT NULL,
  startup_id text,
  match_method "FundingEntityMatchMethod" NOT NULL,
  match_confidence double precision NOT NULL,
  match_evidence_json jsonb,
  created_at timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(6) with time zone NOT NULL,
  CONSTRAINT funding_deal_company_links_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.funding_deal_investor_links (
  id text NOT NULL,
  funding_deal_investor_id text NOT NULL,
  vc_firm_id text,
  vc_person_id text,
  match_method "FundingEntityMatchMethod" NOT NULL,
  match_confidence double precision NOT NULL,
  match_evidence_json jsonb,
  created_at timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(6) with time zone NOT NULL,
  CONSTRAINT funding_deal_investor_links_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.funding_deal_investors (
  id text NOT NULL,
  funding_deal_id text NOT NULL,
  role "FundingDealInvestorRole" NOT NULL,
  name_raw text NOT NULL,
  name_normalized text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT funding_deal_investors_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.funding_deals (
  id text NOT NULL,
  source_article_id text NOT NULL,
  slot_index integer NOT NULL DEFAULT 0,
  company_name text NOT NULL,
  company_name_normalized text NOT NULL,
  company_website text,
  company_hq text,
  round_type_raw text,
  round_type_normalized text,
  amount_raw text,
  amount_minor_units bigint,
  currency character varying(8) NOT NULL DEFAULT 'USD'::character varying,
  announced_date date,
  sector_raw text,
  sector_normalized text,
  founders_mentioned text[] NOT NULL DEFAULT ARRAY[]::text[],
  existing_investors_mentioned text[] NOT NULL DEFAULT ARRAY[]::text[],
  deal_summary text,
  extraction_confidence double precision NOT NULL,
  extraction_method character varying(24) NOT NULL,
  raw_extraction_json jsonb,
  needs_review boolean NOT NULL DEFAULT false,
  review_reason text,
  duplicate_of_deal_id text,
  created_at timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(6) with time zone NOT NULL,
  CONSTRAINT funding_deals_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "sourceAdapter" text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  "triggeredBy" text,
  error text,
  stats jsonb,
  "startedAt" timestamp with time zone,
  "completedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  CONSTRAINT ingestion_jobs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ingestion_runs (
  id text NOT NULL,
  started_at timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at timestamp(6) with time zone,
  status character varying(24) NOT NULL,
  trigger_kind character varying(32),
  pacific_date character varying(12),
  summary_json jsonb,
  error_message text,
  CONSTRAINT ingestion_runs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ingestion_source_checkpoints (
  id text NOT NULL,
  source_key "FundingIngestSourceKey" NOT NULL,
  last_success_at timestamp(6) with time zone,
  last_article_published_at timestamp(6) with time zone,
  last_run_id text,
  cursor_json jsonb,
  updated_at timestamp(6) with time zone NOT NULL,
  CONSTRAINT ingestion_source_checkpoints_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.intel_batch_runs (
  id text NOT NULL,
  started_at timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at timestamp(6) with time zone,
  job_kind character varying(32) NOT NULL,
  status character varying(16) NOT NULL,
  summary_json jsonb,
  error_message text,
  CONSTRAINT intel_batch_runs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.investor_market_intel_snapshots (
  id text NOT NULL,
  vc_person_id text NOT NULL,
  window_days integer NOT NULL,
  as_of_date date NOT NULL,
  metrics_json jsonb NOT NULL,
  activity_score double precision NOT NULL,
  momentum_score double precision NOT NULL,
  activity_components_json jsonb NOT NULL,
  momentum_components_json jsonb NOT NULL,
  focus_json jsonb NOT NULL,
  formula_version character varying(16) NOT NULL DEFAULT 'intel_v1'::character varying,
  computed_at timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT investor_market_intel_snapshots_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.investormatch_vc_firms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_firm_id bigint NOT NULL,
  name text NOT NULL,
  slug text,
  website_url text,
  hq_geo text,
  stage_focus text[] NOT NULL DEFAULT '{}'::text[],
  sector_tags text[] NOT NULL DEFAULT '{}'::text[],
  check_size_min bigint,
  check_size_max bigint,
  thesis_summary text,
  logo_url text,
  portfolio_count integer,
  aum_usd bigint,
  linkedin_url text,
  twitter_handle text,
  submission_url text,
  portfolio jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_firms jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT investormatch_vc_firms_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.match_decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "entityType" text NOT NULL,
  "candidateIds" text[] DEFAULT '{}'::text[],
  "selectedId" text,
  "matchRuleUsed" text NOT NULL,
  "confidenceScore" double precision NOT NULL,
  "decisionType" text NOT NULL,
  "resolverVersion" text NOT NULL,
  metadata jsonb,
  "organizationId" uuid,
  "personId" uuid,
  "createdAt" timestamp with time zone DEFAULT now(),
  CONSTRAINT match_decisions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.onboarding_workflow (
  id text NOT NULL,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT onboarding_workflow_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.operator_companies (
  id text NOT NULL,
  name text NOT NULL,
  domain text,
  description text,
  logo_url text,
  website_url text,
  linkedin_url text,
  x_url text,
  crunchbase_url text,
  sector sector_scope_enum,
  sectors sector_scope_enum[] NOT NULL DEFAULT ARRAY[]::sector_scope_enum[],
  business_model text,
  stage "OperatorCompanyStage" NOT NULL DEFAULT 'UNKNOWN'::"OperatorCompanyStage",
  headcount_band "CompanyHeadcountBand",
  headcount integer,
  hq_city text,
  hq_state text,
  hq_country text,
  funding_status text,
  total_raised_usd numeric(15,2),
  latest_funding_date date,
  investors text[] NOT NULL DEFAULT ARRAY[]::text[],
  active_job_count integer,
  last_job_posted_at timestamp(6) with time zone,
  apollo_org_id text,
  pdl_company_id text,
  latest_activity_at timestamp(6) with time zone,
  last_enriched_at timestamp(6) with time zone,
  data_source text,
  created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at timestamp(3) without time zone,
  CONSTRAINT operator_companies_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.operator_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  first_name text,
  last_name text,
  title text,
  bio text,
  avatar_url text,
  linkedin_url text,
  x_url text,
  website_url text,
  email text,
  city text,
  state text,
  country text,
  engagement_type text,
  sector_focus text[],
  stage_focus text,
  expertise text[],
  prior_companies text[],
  is_available boolean DEFAULT true,
  source text,
  source_id text,
  people_id uuid,
  last_enriched_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT operator_profiles_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.operator_signals (
  id text NOT NULL,
  entity_type text NOT NULL,
  person_id text,
  company_id text,
  signal_type "OperatorSignalType" NOT NULL,
  title text NOT NULL,
  description text,
  url text,
  source text NOT NULL,
  occurred_at timestamp(6) with time zone,
  confidence_score integer,
  metadata jsonb,
  created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at timestamp(3) without time zone,
  CONSTRAINT operator_signals_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "canonicalName" text NOT NULL,
  "dedupeKey" text NOT NULL,
  domain text,
  website text,
  "linkedinUrl" text,
  description text,
  "logoUrl" text,
  industry text,
  location text,
  city text,
  state text,
  country text,
  "foundedYear" integer,
  "employeeCount" integer,
  status text,
  "stageProxy" text,
  tags text[] DEFAULT '{}'::text[],
  "isYcBacked" boolean DEFAULT false,
  "ycBatch" text,
  "ycId" text,
  "ycRawJson" jsonb,
  "sourceIds" text[] DEFAULT '{}'::text[],
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.people (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "canonicalName" text NOT NULL,
  "dedupeKey" text NOT NULL,
  "firstName" text,
  "lastName" text,
  email text,
  "linkedinUrl" text,
  "twitterUrl" text,
  "githubUrl" text,
  "avatarUrl" text,
  bio text,
  location text,
  city text,
  country text,
  expertise text[] DEFAULT '{}'::text[],
  "ycId" text,
  "sourceIds" text[] DEFAULT '{}'::text[],
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  CONSTRAINT people_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.pipeline_source_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pipeline text NOT NULL,
  source_key text NOT NULL,
  name text NOT NULL,
  description text,
  base_url text,
  enabled boolean NOT NULL DEFAULT true,
  max_items integer NOT NULL DEFAULT 100,
  cron_schedule text,
  notes text,
  last_run_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pipeline_source_config_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.portfolio_company_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  portfolio_company_id uuid NOT NULL,
  alias_value text NOT NULL,
  normalized_value text NOT NULL,
  source text,
  confidence double precision,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT portfolio_company_aliases_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.portfolio_investments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL,
  portfolio_company_id uuid NOT NULL,
  round_type text,
  check_size_usd numeric(15,2),
  led_round boolean DEFAULT false,
  investment_date timestamp with time zone,
  source_url text,
  confidence numeric(3,2) DEFAULT 0.50,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT portfolio_investments_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.portfolio_source_evidence (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  portfolio_company_id uuid,
  investment_id uuid,
  firm_id uuid,
  source_type text NOT NULL,
  source_name text,
  source_firm_name text,
  portfolio_company_name text NOT NULL,
  normalized_portfolio_company_name text,
  portfolio_company_website text,
  portfolio_company_linkedin text,
  portfolio_company_slug text,
  investment_status text,
  investment_stage text,
  investment_date timestamp with time zone,
  announced_date timestamp with time zone,
  source_url text,
  source_confidence numeric(3,2) NOT NULL DEFAULT 0.50,
  raw_payload jsonb,
  category text NOT NULL DEFAULT 'UNKNOWN'::text,
  discovered_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT portfolio_source_evidence_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "personId" uuid NOT NULL,
  "organizationId" uuid NOT NULL,
  title text,
  "roleType" text,
  "functionType" text,
  "isCurrent" boolean DEFAULT true,
  "startDate" timestamp with time zone,
  "endDate" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.source_articles (
  id text NOT NULL,
  source_key "FundingIngestSourceKey" NOT NULL,
  canonical_url text NOT NULL,
  article_url text NOT NULL,
  title text NOT NULL,
  published_at timestamp(6) with time zone,
  author text,
  fetch_status "FundingArticleFetchStatus" NOT NULL DEFAULT 'FETCHED'::"FundingArticleFetchStatus",
  raw_excerpt text,
  raw_text text,
  content_hash character varying(128),
  html_fetched_at timestamp(6) with time zone,
  first_seen_run_id text,
  last_seen_run_id text,
  created_at timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(6) with time zone NOT NULL,
  listing_url text,
  CONSTRAINT source_articles_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.source_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "sourceAdapter" text NOT NULL,
  "sourceUrl" text NOT NULL,
  "sourceId" text,
  "rawPayload" jsonb NOT NULL,
  "entityType" text NOT NULL,
  "fetchedAt" timestamp with time zone DEFAULT now(),
  "normalizedAt" timestamp with time zone,
  "organizationId" uuid,
  "personId" uuid,
  CONSTRAINT source_records_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.startup_competitors (
  id text NOT NULL,
  startup_id text NOT NULL,
  competitor_id text NOT NULL,
  relationship_type text NOT NULL DEFAULT 'direct'::text,
  data_source "StartupDataSource",
  confidence double precision,
  created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT startup_competitors_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.startup_founders (
  id text NOT NULL,
  startup_id text NOT NULL,
  professional_id text,
  full_name text NOT NULL,
  role text,
  linkedin_url text,
  x_url text,
  location text,
  avatar_url text,
  email text,
  prior_companies text[] DEFAULT ARRAY[]::text[],
  prior_exits text[] DEFAULT ARRAY[]::text[],
  has_prior_exit boolean NOT NULL DEFAULT false,
  education_highlight text,
  operator_background text,
  domain_expertise text[] DEFAULT ARRAY[]::text[],
  is_repeat_founder boolean NOT NULL DEFAULT false,
  founder_archetype "FounderArchetype",
  operator_to_founder boolean NOT NULL DEFAULT false,
  track_record_score integer,
  prior_outcome_summary text,
  data_source "StartupDataSource",
  confidence double precision,
  created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT startup_founders_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.startup_funding_rounds (
  id text NOT NULL,
  startup_id text NOT NULL,
  round_name text NOT NULL,
  round_date date,
  amount_usd numeric(15,2),
  valuation_usd numeric(15,2),
  lead_investors text[] DEFAULT ARRAY[]::text[],
  participants text[] DEFAULT ARRAY[]::text[],
  investor_roles jsonb,
  source_url text,
  data_source "StartupDataSource",
  confidence double precision,
  created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT startup_funding_rounds_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.startup_score_snapshots (
  id text NOT NULL,
  startup_id text NOT NULL,
  fundraising_readiness integer NOT NULL DEFAULT 0,
  investor_fit integer NOT NULL DEFAULT 0,
  momentum integer NOT NULL DEFAULT 0,
  quality_of_backers integer NOT NULL DEFAULT 0,
  likelihood_to_raise integer NOT NULL DEFAULT 0,
  explanation text,
  model_version text,
  computed_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT startup_score_snapshots_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.startup_signals (
  id text NOT NULL,
  startup_id text NOT NULL,
  signal_type text NOT NULL,
  title text NOT NULL,
  description text,
  url text,
  signal_date timestamp(6) with time zone,
  metadata jsonb,
  data_source "StartupDataSource",
  confidence_score integer,
  created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at timestamp(3) without time zone,
  CONSTRAINT startup_signals_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.startups (
  id text NOT NULL,
  company_name text NOT NULL,
  company_url text,
  sector "SectorFocus",
  location text,
  total_raised_usd numeric(15,2),
  last_funding_date date,
  last_verified_at timestamp(6) with time zone NOT NULL DEFAULT now(),
  domain text,
  description_short text,
  description_long text,
  logo_url text,
  founding_date date,
  founded_year integer,
  hq_city text,
  hq_state text,
  hq_country text,
  geo_footprint text[] DEFAULT ARRAY[]::text[],
  stage "OperatorCompanyStage" NOT NULL DEFAULT 'UNKNOWN'::"OperatorCompanyStage",
  status "StartupStatus" NOT NULL DEFAULT 'ACTIVE'::"StartupStatus",
  sectors "SectorFocus"[],
  secondary_sectors text[] DEFAULT ARRAY[]::text[],
  business_model "BusinessModel",
  business_model_tags text[] DEFAULT ARRAY[]::text[],
  headcount integer,
  headcount_band "CompanyHeadcountBand",
  headcount_growth_pct double precision,
  tech_stack text[] DEFAULT ARRAY[]::text[],
  last_round_size_usd numeric(15,2),
  last_round_date date,
  last_round_type text,
  valuation_usd numeric(15,2),
  revenue_range "RevenueRange",
  hiring_velocity integer,
  web_traffic_rank integer,
  investor_names text[] DEFAULT ARRAY[]::text[],
  lead_investor_names text[] DEFAULT ARRAY[]::text[],
  board_members text[] DEFAULT ARRAY[]::text[],
  target_customer "TargetCustomer",
  icp_description text,
  notable_customers text[] DEFAULT ARRAY[]::text[],
  market_category text,
  market_subcategory text,
  fundraising_readiness_score integer,
  investor_fit_score integer,
  momentum_score integer,
  quality_of_backers_score integer,
  likelihood_to_raise_score integer,
  data_sources "StartupDataSource"[],
  primary_data_source "StartupDataSource",
  external_ids jsonb,
  data_confidence integer,
  linkedin_url text,
  x_url text,
  github_url text,
  crunchbase_url text,
  yc_batch text,
  yc_slug text,
  created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at timestamp(3) without time zone,
  CONSTRAINT startups_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.vc_firm_derived_market_intel (
  vc_firm_id text NOT NULL,
  recent_activity_summary text,
  recent_investments_json jsonb,
  activity_metrics_json jsonb,
  focus_json jsonb,
  pace_label character varying(24),
  activity_score double precision,
  momentum_score double precision,
  score_components_json jsonb,
  last_seen_investing_at timestamp(6) with time zone,
  source_formula_version character varying(16) NOT NULL DEFAULT 'intel_v1'::character varying,
  updated_at timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT vc_firm_derived_market_intel_pkey PRIMARY KEY (vc_firm_id)
);

CREATE TABLE IF NOT EXISTS public.vc_firms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  website text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  is_trending boolean DEFAULT false,
  is_popular boolean DEFAULT false,
  is_recent boolean DEFAULT false,
  last_external_sync timestamp with time zone,
  deleted_at timestamp with time zone,
  email text,
  crunchbase_url text,
  hq_city text,
  hq_state text,
  hq_country text,
  partner_names text[] DEFAULT ARRAY[]::text[],
  updated_at timestamp with time zone,
  firm_type "FirmType" NOT NULL DEFAULT 'VC'::"FirmType",
  CONSTRAINT vc_firms_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.vc_interactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vc_firm_id uuid,
  interaction_type character varying(50),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT vc_interactions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.vc_person_derived_market_intel (
  vc_person_id text NOT NULL,
  recent_investment_summary text,
  recent_investments_json jsonb,
  activity_metrics_json jsonb,
  focus_json jsonb,
  pace_label character varying(24),
  activity_score double precision,
  momentum_score double precision,
  score_components_json jsonb,
  last_seen_investing_at timestamp(6) with time zone,
  source_formula_version character varying(16) NOT NULL DEFAULT 'intel_v1'::character varying,
  updated_at timestamp(6) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT vc_person_derived_market_intel_pkey PRIMARY KEY (vc_person_id)
);

CREATE TABLE IF NOT EXISTS public.yc_companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "ycId" text NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  batch text NOT NULL,
  status text,
  website text,
  description text,
  "longDescription" text,
  "teamSize" integer,
  "allLocations" text,
  industries text[] DEFAULT '{}'::text[],
  subverticals text[] DEFAULT '{}'::text[],
  tags text[] DEFAULT '{}'::text[],
  badges jsonb,
  "foundersRaw" jsonb,
  "rawJson" jsonb NOT NULL,
  "organizationId" uuid,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  CONSTRAINT yc_companies_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.yc_people (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "ycId" text NOT NULL,
  name text NOT NULL,
  role text,
  "linkedinUrl" text,
  "twitterUrl" text,
  "avatarUrl" text,
  bio text,
  "ycCompanyId" uuid,
  "personId" uuid,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  CONSTRAINT yc_people_pkey PRIMARY KEY (id)
);
