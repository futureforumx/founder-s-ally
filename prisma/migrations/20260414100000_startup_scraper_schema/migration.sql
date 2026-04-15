-- Startup Data Scraper Schema Extension
-- Extends the minimal `startups` table with comprehensive company, funding, founder,
-- and signal data. Adds new tables for funding rounds, founders, competitors, signals,
-- and score snapshots.

-- New enums
CREATE TYPE "StartupDataSource" AS ENUM ('SEEDTABLE', 'TOPSTARTUPS', 'TINYTEAMS', 'YC', 'NEXTPLAY', 'STARTUPS_GALLERY', 'CB_INSIGHTS', 'CRUNCHBASE', 'MANUAL', 'OTHER');
CREATE TYPE "StartupStatus" AS ENUM ('ACTIVE', 'ACQUIRED', 'SHUT_DOWN', 'IPO', 'UNKNOWN');
CREATE TYPE "BusinessModel" AS ENUM ('SAAS', 'MARKETPLACE', 'E_COMMERCE', 'FINTECH_INFRA', 'API_PLATFORM', 'HARDWARE', 'D2C', 'ENTERPRISE', 'CONSUMER_APP', 'OPEN_SOURCE', 'OTHER');
CREATE TYPE "RevenueRange" AS ENUM ('PRE_REVENUE', 'SUB_1M', 'ARR_1M_5M', 'ARR_5M_10M', 'ARR_10M_50M', 'ARR_50M_100M', 'ARR_100M_PLUS', 'UNKNOWN');
CREATE TYPE "FounderArchetype" AS ENUM ('TECHNICAL', 'COMMERCIAL', 'HYBRID', 'DOMAIN_EXPERT', 'OPERATOR', 'SERIAL_ENTREPRENEUR');
CREATE TYPE "TargetCustomer" AS ENUM ('SMB', 'MID_MARKET', 'ENTERPRISE', 'CONSUMER', 'PROSUMER', 'GOVERNMENT', 'OTHER');

-- Extend startups table
ALTER TABLE "startups" ADD COLUMN "domain" TEXT;
ALTER TABLE "startups" ADD COLUMN "description_short" TEXT;
ALTER TABLE "startups" ADD COLUMN "description_long" TEXT;
ALTER TABLE "startups" ADD COLUMN "logo_url" TEXT;
ALTER TABLE "startups" ADD COLUMN "founding_date" DATE;
ALTER TABLE "startups" ADD COLUMN "founded_year" INTEGER;
ALTER TABLE "startups" ADD COLUMN "hq_city" TEXT;
ALTER TABLE "startups" ADD COLUMN "hq_state" TEXT;
ALTER TABLE "startups" ADD COLUMN "hq_country" TEXT;
ALTER TABLE "startups" ADD COLUMN "geo_footprint" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "startups" ADD COLUMN "stage" "OperatorCompanyStage" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "startups" ADD COLUMN "status" "StartupStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "startups" ADD COLUMN "sectors" "SectorFocus"[];
ALTER TABLE "startups" ADD COLUMN "secondary_sectors" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "startups" ADD COLUMN "business_model" "BusinessModel";
ALTER TABLE "startups" ADD COLUMN "business_model_tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "startups" ADD COLUMN "headcount" INTEGER;
ALTER TABLE "startups" ADD COLUMN "headcount_band" "CompanyHeadcountBand";
ALTER TABLE "startups" ADD COLUMN "headcount_growth_pct" DOUBLE PRECISION;
ALTER TABLE "startups" ADD COLUMN "tech_stack" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "startups" ADD COLUMN "last_round_size_usd" DECIMAL(15,2);
ALTER TABLE "startups" ADD COLUMN "last_round_date" DATE;
ALTER TABLE "startups" ADD COLUMN "last_round_type" TEXT;
ALTER TABLE "startups" ADD COLUMN "valuation_usd" DECIMAL(15,2);
ALTER TABLE "startups" ADD COLUMN "revenue_range" "RevenueRange";
ALTER TABLE "startups" ADD COLUMN "hiring_velocity" INTEGER;
ALTER TABLE "startups" ADD COLUMN "web_traffic_rank" INTEGER;

ALTER TABLE "startups" ADD COLUMN "investor_names" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "startups" ADD COLUMN "lead_investor_names" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "startups" ADD COLUMN "board_members" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "startups" ADD COLUMN "target_customer" "TargetCustomer";
ALTER TABLE "startups" ADD COLUMN "icp_description" TEXT;
ALTER TABLE "startups" ADD COLUMN "notable_customers" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "startups" ADD COLUMN "market_category" TEXT;
ALTER TABLE "startups" ADD COLUMN "market_subcategory" TEXT;

ALTER TABLE "startups" ADD COLUMN "fundraising_readiness_score" INTEGER;
ALTER TABLE "startups" ADD COLUMN "investor_fit_score" INTEGER;
ALTER TABLE "startups" ADD COLUMN "momentum_score" INTEGER;
ALTER TABLE "startups" ADD COLUMN "quality_of_backers_score" INTEGER;
ALTER TABLE "startups" ADD COLUMN "likelihood_to_raise_score" INTEGER;

ALTER TABLE "startups" ADD COLUMN "data_sources" "StartupDataSource"[];
ALTER TABLE "startups" ADD COLUMN "primary_data_source" "StartupDataSource";
ALTER TABLE "startups" ADD COLUMN "external_ids" JSONB;
ALTER TABLE "startups" ADD COLUMN "data_confidence" INTEGER;

ALTER TABLE "startups" ADD COLUMN "linkedin_url" TEXT;
ALTER TABLE "startups" ADD COLUMN "x_url" TEXT;
ALTER TABLE "startups" ADD COLUMN "github_url" TEXT;
ALTER TABLE "startups" ADD COLUMN "crunchbase_url" TEXT;

ALTER TABLE "startups" ADD COLUMN "yc_batch" TEXT;
ALTER TABLE "startups" ADD COLUMN "yc_slug" TEXT;

ALTER TABLE "startups" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "startups" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "startups" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Unique index on domain
CREATE UNIQUE INDEX "startups_domain_key" ON "startups"("domain");

-- Additional indexes on startups
CREATE INDEX "startups_domain_idx" ON "startups"("domain");
CREATE INDEX "startups_stage_idx" ON "startups"("stage");
CREATE INDEX "startups_status_idx" ON "startups"("status");
CREATE INDEX "startups_sector_idx" ON "startups"("sector");
CREATE INDEX "startups_hq_country_hq_state_hq_city_idx" ON "startups"("hq_country", "hq_state", "hq_city");
CREATE INDEX "startups_yc_batch_idx" ON "startups"("yc_batch");
CREATE INDEX "startups_momentum_score_idx" ON "startups"("momentum_score");
CREATE INDEX "startups_fundraising_readiness_score_idx" ON "startups"("fundraising_readiness_score");
CREATE INDEX "startups_primary_data_source_idx" ON "startups"("primary_data_source");
CREATE INDEX "startups_deleted_at_idx" ON "startups"("deleted_at");

-- StartupFundingRound
CREATE TABLE "startup_funding_rounds" (
    "id" TEXT NOT NULL,
    "startup_id" TEXT NOT NULL,
    "round_name" TEXT NOT NULL,
    "round_date" DATE,
    "amount_usd" DECIMAL(15,2),
    "valuation_usd" DECIMAL(15,2),
    "lead_investors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "investor_roles" JSONB,
    "source_url" TEXT,
    "data_source" "StartupDataSource",
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "startup_funding_rounds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "startup_funding_rounds_startup_id_round_name_round_date_key" ON "startup_funding_rounds"("startup_id", "round_name", "round_date");
CREATE INDEX "startup_funding_rounds_startup_id_idx" ON "startup_funding_rounds"("startup_id");
CREATE INDEX "startup_funding_rounds_round_date_idx" ON "startup_funding_rounds"("round_date");
CREATE INDEX "startup_funding_rounds_round_name_idx" ON "startup_funding_rounds"("round_name");

ALTER TABLE "startup_funding_rounds" ADD CONSTRAINT "startup_funding_rounds_startup_id_fkey" FOREIGN KEY ("startup_id") REFERENCES "startups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- StartupFounder
CREATE TABLE "startup_founders" (
    "id" TEXT NOT NULL,
    "startup_id" TEXT NOT NULL,
    "professional_id" TEXT,
    "full_name" TEXT NOT NULL,
    "role" TEXT,
    "linkedin_url" TEXT,
    "x_url" TEXT,
    "location" TEXT,
    "avatar_url" TEXT,
    "email" TEXT,
    "prior_companies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prior_exits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "has_prior_exit" BOOLEAN NOT NULL DEFAULT false,
    "education_highlight" TEXT,
    "operator_background" TEXT,
    "domain_expertise" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_repeat_founder" BOOLEAN NOT NULL DEFAULT false,
    "founder_archetype" "FounderArchetype",
    "operator_to_founder" BOOLEAN NOT NULL DEFAULT false,
    "track_record_score" INTEGER,
    "prior_outcome_summary" TEXT,
    "data_source" "StartupDataSource",
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "startup_founders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "startup_founders_startup_id_full_name_key" ON "startup_founders"("startup_id", "full_name");
CREATE INDEX "startup_founders_startup_id_idx" ON "startup_founders"("startup_id");
CREATE INDEX "startup_founders_professional_id_idx" ON "startup_founders"("professional_id");
CREATE INDEX "startup_founders_is_repeat_founder_idx" ON "startup_founders"("is_repeat_founder");
CREATE INDEX "startup_founders_founder_archetype_idx" ON "startup_founders"("founder_archetype");
CREATE INDEX "startup_founders_track_record_score_idx" ON "startup_founders"("track_record_score");

ALTER TABLE "startup_founders" ADD CONSTRAINT "startup_founders_startup_id_fkey" FOREIGN KEY ("startup_id") REFERENCES "startups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- StartupCompetitor
CREATE TABLE "startup_competitors" (
    "id" TEXT NOT NULL,
    "startup_id" TEXT NOT NULL,
    "competitor_id" TEXT NOT NULL,
    "relationship_type" TEXT NOT NULL DEFAULT 'direct',
    "data_source" "StartupDataSource",
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "startup_competitors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "startup_competitors_startup_id_competitor_id_key" ON "startup_competitors"("startup_id", "competitor_id");
CREATE INDEX "startup_competitors_startup_id_idx" ON "startup_competitors"("startup_id");
CREATE INDEX "startup_competitors_competitor_id_idx" ON "startup_competitors"("competitor_id");

ALTER TABLE "startup_competitors" ADD CONSTRAINT "startup_competitors_startup_id_fkey" FOREIGN KEY ("startup_id") REFERENCES "startups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "startup_competitors" ADD CONSTRAINT "startup_competitors_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "startups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- StartupSignal
CREATE TABLE "startup_signals" (
    "id" TEXT NOT NULL,
    "startup_id" TEXT NOT NULL,
    "signal_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "signal_date" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "data_source" "StartupDataSource",
    "confidence_score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "startup_signals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "startup_signals_startup_id_idx" ON "startup_signals"("startup_id");
CREATE INDEX "startup_signals_signal_type_idx" ON "startup_signals"("signal_type");
CREATE INDEX "startup_signals_signal_date_idx" ON "startup_signals"("signal_date");
CREATE INDEX "startup_signals_deleted_at_idx" ON "startup_signals"("deleted_at");

ALTER TABLE "startup_signals" ADD CONSTRAINT "startup_signals_startup_id_fkey" FOREIGN KEY ("startup_id") REFERENCES "startups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- StartupScoreSnapshot
CREATE TABLE "startup_score_snapshots" (
    "id" TEXT NOT NULL,
    "startup_id" TEXT NOT NULL,
    "fundraising_readiness" INTEGER NOT NULL DEFAULT 0,
    "investor_fit" INTEGER NOT NULL DEFAULT 0,
    "momentum" INTEGER NOT NULL DEFAULT 0,
    "quality_of_backers" INTEGER NOT NULL DEFAULT 0,
    "likelihood_to_raise" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT,
    "model_version" TEXT,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "startup_score_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "startup_score_snapshots_startup_id_idx" ON "startup_score_snapshots"("startup_id");
CREATE INDEX "startup_score_snapshots_computed_at_idx" ON "startup_score_snapshots"("computed_at");

ALTER TABLE "startup_score_snapshots" ADD CONSTRAINT "startup_score_snapshots_startup_id_fkey" FOREIGN KEY ("startup_id") REFERENCES "startups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
