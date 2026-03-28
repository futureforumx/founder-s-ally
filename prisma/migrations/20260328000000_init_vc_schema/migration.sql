-- CreateEnum
CREATE TYPE "FirmType" AS ENUM ('VC', 'CVC', 'ANGEL_NETWORK', 'MICRO_FUND', 'FAMILY_OFFICE', 'PE', 'ACCELERATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "FundStatus" AS ENUM ('ACTIVE', 'CLOSED', 'FORMING', 'WINDING_DOWN');

-- CreateEnum
CREATE TYPE "FundType" AS ENUM ('TRADITIONAL', 'ROLLING', 'SYNDICATE', 'MICRO', 'CVC', 'FAMILY_OFFICE');

-- CreateEnum
CREATE TYPE "LeadFollowPreference" AS ENUM ('LEAD_ONLY', 'LEAD_PREFERRED', 'FOLLOW_ONLY', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "StageFocus" AS ENUM ('PRE_SEED', 'SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'GROWTH', 'LATE', 'IPO');

-- CreateEnum
CREATE TYPE "SectorFocus" AS ENUM ('FINTECH', 'ENTERPRISE_SAAS', 'AI', 'HEALTHTECH', 'BIOTECH', 'CONSUMER', 'CLIMATE', 'MOBILITY', 'INDUSTRIAL', 'CYBERSECURITY', 'MEDIA', 'WEB3', 'EDTECH', 'GOVTECH', 'HARDWARE', 'ROBOTICS', 'MARKETPLACE', 'AGRITECH', 'PROPTECH', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('CRUNCHBASE', 'CB_INSIGHTS', 'SIGNAL_NFX', 'VCSHEET', 'VC_PRO_DATABASE', 'VENTUREXPERT', 'ANGELLIST', 'OPENVC', 'TRUSTFINTA', 'OTHER');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('RECENT_INVESTMENT', 'HIRE', 'DEPARTURE', 'BLOG_POST', 'EVENT', 'DEPLOYMENT_UPDATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExitType" AS ENUM ('IPO', 'ACQUISITION', 'SECONDARY', 'SHUTDOWN', 'STILL_PRIVATE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InvestmentLifecycleStatus" AS ENUM ('ACTIVE', 'EXITED', 'WRITTEN_OFF', 'UNKNOWN');

-- CreateTable
CREATE TABLE "vc_firms" (
    "id" TEXT NOT NULL,
    "firm_name" TEXT NOT NULL,
    "legal_name" TEXT,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "elevator_pitch" TEXT,
    "description" TEXT,
    "website_url" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "hq_city" TEXT,
    "hq_state" TEXT,
    "hq_country" TEXT,
    "locations" JSONB,
    "x_url" TEXT,
    "linkedin_url" TEXT,
    "substack_url" TEXT,
    "medium_url" TEXT,
    "beehiiv_url" TEXT,
    "instagram_url" TEXT,
    "facebook_url" TEXT,
    "youtube_url" TEXT,
    "tiktok_url" TEXT,
    "crunchbase_url" TEXT,
    "cb_insights_url" TEXT,
    "signal_nfx_url" TEXT,
    "vcsheet_url" TEXT,
    "vcprodatabase_url" TEXT,
    "venturexpert_url" TEXT,
    "angellist_url" TEXT,
    "openvc_url" TEXT,
    "trustfinta_url" TEXT,
    "total_headcount" INTEGER,
    "total_investors" INTEGER,
    "total_partners" INTEGER,
    "general_partner_count" INTEGER,
    "partner_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "general_partner_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firm_type" "FirmType" NOT NULL DEFAULT 'VC',
    "founded_year" INTEGER,
    "status" TEXT,
    "verification_status" TEXT,
    "data_confidence_score" INTEGER,
    "reputation_score" INTEGER,
    "founder_sentiment" INTEGER,
    "industry_reputation" INTEGER,
    "responsiveness_score" INTEGER,
    "value_add_score" INTEGER,
    "network_strength" INTEGER,
    "match_score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vc_firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vc_funds" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "fund_name" TEXT NOT NULL,
    "fund_number" INTEGER,
    "vintage_year" INTEGER,
    "open_date" TIMESTAMP(3),
    "close_date" TIMESTAMP(3),
    "fund_status" "FundStatus" NOT NULL DEFAULT 'ACTIVE',
    "fund_type" "FundType" NOT NULL DEFAULT 'TRADITIONAL',
    "size_usd" DOUBLE PRECISION,
    "aum_usd" DOUBLE PRECISION,
    "committed_capital" DOUBLE PRECISION,
    "gp_commit_usd" DOUBLE PRECISION,
    "management_fee_pct" DOUBLE PRECISION,
    "carry_pct" DOUBLE PRECISION,
    "fund_term_years" INTEGER,
    "investment_period_yrs" INTEGER,
    "focus_summary" TEXT,
    "thesis_description" TEXT,
    "themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stage_focus" "StageFocus"[],
    "sector_focus" "SectorFocus"[],
    "geography_focus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prefer_to_lead" BOOLEAN,
    "lead_percentage" DOUBLE PRECISION,
    "co_invest_percentage" DOUBLE PRECISION,
    "lead_follow" "LeadFollowPreference",
    "reserve_for_follow_on" DOUBLE PRECISION,
    "board_seat_preference" BOOLEAN,
    "actively_deploying" BOOLEAN NOT NULL DEFAULT true,
    "avg_check_size_min" DOUBLE PRECISION,
    "avg_check_size_max" DOUBLE PRECISION,
    "avg_check_size_mean" DOUBLE PRECISION,
    "avg_check_size_median" DOUBLE PRECISION,
    "deployment_rate" DOUBLE PRECISION,
    "last_investment_date" TIMESTAMP(3),
    "investments_last_60d" INTEGER,
    "investments_last_12m" INTEGER,
    "deployed_capital_usd" DOUBLE PRECISION,
    "capital_remaining_usd" DOUBLE PRECISION,
    "target_investments" INTEGER,
    "fund_match_score" INTEGER,
    "active_signal_score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vc_funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vc_people" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "preferred_name" TEXT,
    "title" TEXT,
    "role" TEXT,
    "bio" TEXT,
    "avatar_url" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website_url" TEXT,
    "linkedin_url" TEXT,
    "x_url" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "timezone" TEXT,
    "stage_focus" "StageFocus"[],
    "sector_focus" "SectorFocus"[],
    "check_size_min" DOUBLE PRECISION,
    "check_size_max" DOUBLE PRECISION,
    "warm_intro_preferred" BOOLEAN NOT NULL DEFAULT true,
    "cold_outreach_ok" BOOLEAN NOT NULL DEFAULT false,
    "personal_thesis_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "investment_style" TEXT,
    "background_summary" TEXT,
    "prior_firms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "education_summary" TEXT,
    "responsiveness_score" INTEGER,
    "recent_deal_count" INTEGER,
    "last_active_date" TIMESTAMP(3),
    "is_actively_investing" BOOLEAN NOT NULL DEFAULT true,
    "reputation_score" INTEGER,
    "value_add_score" INTEGER,
    "network_strength" INTEGER,
    "match_score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vc_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vc_investments" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "fund_id" TEXT,
    "company_name" TEXT NOT NULL,
    "company_url" TEXT,
    "sector" "SectorFocus",
    "stage_at_investment" "StageFocus",
    "location" TEXT,
    "investment_date" TIMESTAMP(3),
    "check_size_usd" DOUBLE PRECISION,
    "round_type" TEXT,
    "ownership_pct" DOUBLE PRECISION,
    "entry_valuation_usd" DOUBLE PRECISION,
    "pro_rata_participation" BOOLEAN,
    "follow_on_support" BOOLEAN,
    "outcome_status" TEXT,
    "exit_type" "ExitType",
    "exit_date" TIMESTAMP(3),
    "current_status" "InvestmentLifecycleStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vc_investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vc_source_links" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "last_verified_at" TIMESTAMP(3),
    "confidence_score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vc_source_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vc_signals" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "person_id" TEXT,
    "signal_type" "SignalType" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "description" TEXT,
    "signal_date" TIMESTAMP(3),
    "source_type" "SourceType",
    "source_confidence" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vc_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vc_score_snapshots" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "person_id" TEXT,
    "fund_id" TEXT,
    "match_score" INTEGER NOT NULL DEFAULT 0,
    "reputation_score" INTEGER NOT NULL DEFAULT 0,
    "founder_sentiment" INTEGER NOT NULL DEFAULT 0,
    "industry_reputation" INTEGER NOT NULL DEFAULT 0,
    "responsiveness_score" INTEGER NOT NULL DEFAULT 0,
    "founder_satisfaction" INTEGER NOT NULL DEFAULT 0,
    "value_add_ability" INTEGER NOT NULL DEFAULT 0,
    "network_strength" INTEGER NOT NULL DEFAULT 0,
    "active_deployment" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT,
    "model_version" TEXT,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vc_score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vc_firms_slug_key" ON "vc_firms"("slug");

-- CreateIndex
CREATE INDEX "vc_firms_firm_name_idx" ON "vc_firms"("firm_name");

-- CreateIndex
CREATE INDEX "vc_firms_firm_type_idx" ON "vc_firms"("firm_type");

-- CreateIndex
CREATE INDEX "vc_firms_hq_country_hq_state_hq_city_idx" ON "vc_firms"("hq_country", "hq_state", "hq_city");

-- CreateIndex
CREATE INDEX "vc_firms_match_score_idx" ON "vc_firms"("match_score");

-- CreateIndex
CREATE INDEX "vc_firms_reputation_score_idx" ON "vc_firms"("reputation_score");

-- CreateIndex
CREATE INDEX "vc_firms_founder_sentiment_idx" ON "vc_firms"("founder_sentiment");

-- CreateIndex
CREATE INDEX "vc_firms_industry_reputation_idx" ON "vc_firms"("industry_reputation");

-- CreateIndex
CREATE INDEX "vc_firms_deleted_at_idx" ON "vc_firms"("deleted_at");

-- CreateIndex
CREATE INDEX "vc_funds_firm_id_idx" ON "vc_funds"("firm_id");

-- CreateIndex
CREATE INDEX "vc_funds_fund_status_idx" ON "vc_funds"("fund_status");

-- CreateIndex
CREATE INDEX "vc_funds_fund_type_idx" ON "vc_funds"("fund_type");

-- CreateIndex
CREATE INDEX "vc_funds_actively_deploying_idx" ON "vc_funds"("actively_deploying");

-- CreateIndex
CREATE INDEX "vc_funds_vintage_year_idx" ON "vc_funds"("vintage_year");

-- CreateIndex
CREATE INDEX "vc_funds_size_usd_idx" ON "vc_funds"("size_usd");

-- CreateIndex
CREATE INDEX "vc_funds_aum_usd_idx" ON "vc_funds"("aum_usd");

-- CreateIndex
CREATE INDEX "vc_funds_lead_follow_idx" ON "vc_funds"("lead_follow");

-- CreateIndex
CREATE INDEX "vc_funds_fund_match_score_idx" ON "vc_funds"("fund_match_score");

-- CreateIndex
CREATE INDEX "vc_funds_deleted_at_idx" ON "vc_funds"("deleted_at");

-- CreateIndex
CREATE INDEX "vc_people_firm_id_idx" ON "vc_people"("firm_id");

-- CreateIndex
CREATE INDEX "vc_people_email_idx" ON "vc_people"("email");

-- CreateIndex
CREATE INDEX "vc_people_country_state_city_idx" ON "vc_people"("country", "state", "city");

-- CreateIndex
CREATE INDEX "vc_people_is_actively_investing_idx" ON "vc_people"("is_actively_investing");

-- CreateIndex
CREATE INDEX "vc_people_match_score_idx" ON "vc_people"("match_score");

-- CreateIndex
CREATE INDEX "vc_people_responsiveness_score_idx" ON "vc_people"("responsiveness_score");

-- CreateIndex
CREATE INDEX "vc_people_deleted_at_idx" ON "vc_people"("deleted_at");

-- CreateIndex
CREATE INDEX "vc_investments_firm_id_idx" ON "vc_investments"("firm_id");

-- CreateIndex
CREATE INDEX "vc_investments_fund_id_idx" ON "vc_investments"("fund_id");

-- CreateIndex
CREATE INDEX "vc_investments_sector_idx" ON "vc_investments"("sector");

-- CreateIndex
CREATE INDEX "vc_investments_stage_at_investment_idx" ON "vc_investments"("stage_at_investment");

-- CreateIndex
CREATE INDEX "vc_investments_investment_date_idx" ON "vc_investments"("investment_date");

-- CreateIndex
CREATE INDEX "vc_investments_check_size_usd_idx" ON "vc_investments"("check_size_usd");

-- CreateIndex
CREATE INDEX "vc_investments_location_idx" ON "vc_investments"("location");

-- CreateIndex
CREATE INDEX "vc_investments_current_status_idx" ON "vc_investments"("current_status");

-- CreateIndex
CREATE INDEX "vc_investments_exit_type_idx" ON "vc_investments"("exit_type");

-- CreateIndex
CREATE INDEX "vc_investments_deleted_at_idx" ON "vc_investments"("deleted_at");

-- CreateIndex
CREATE INDEX "vc_source_links_firm_id_idx" ON "vc_source_links"("firm_id");

-- CreateIndex
CREATE INDEX "vc_source_links_source_type_idx" ON "vc_source_links"("source_type");

-- CreateIndex
CREATE INDEX "vc_source_links_last_verified_at_idx" ON "vc_source_links"("last_verified_at");

-- CreateIndex
CREATE INDEX "vc_source_links_deleted_at_idx" ON "vc_source_links"("deleted_at");

-- CreateIndex
CREATE INDEX "vc_signals_firm_id_idx" ON "vc_signals"("firm_id");

-- CreateIndex
CREATE INDEX "vc_signals_person_id_idx" ON "vc_signals"("person_id");

-- CreateIndex
CREATE INDEX "vc_signals_signal_type_idx" ON "vc_signals"("signal_type");

-- CreateIndex
CREATE INDEX "vc_signals_signal_date_idx" ON "vc_signals"("signal_date");

-- CreateIndex
CREATE INDEX "vc_signals_source_type_idx" ON "vc_signals"("source_type");

-- CreateIndex
CREATE INDEX "vc_signals_deleted_at_idx" ON "vc_signals"("deleted_at");

-- CreateIndex
CREATE INDEX "vc_score_snapshots_firm_id_idx" ON "vc_score_snapshots"("firm_id");

-- CreateIndex
CREATE INDEX "vc_score_snapshots_person_id_idx" ON "vc_score_snapshots"("person_id");

-- CreateIndex
CREATE INDEX "vc_score_snapshots_fund_id_idx" ON "vc_score_snapshots"("fund_id");

-- CreateIndex
CREATE INDEX "vc_score_snapshots_computed_at_idx" ON "vc_score_snapshots"("computed_at");

-- CreateIndex
CREATE INDEX "vc_score_snapshots_match_score_idx" ON "vc_score_snapshots"("match_score");

-- CreateIndex
CREATE INDEX "vc_score_snapshots_reputation_score_idx" ON "vc_score_snapshots"("reputation_score");

-- CreateIndex
CREATE INDEX "vc_score_snapshots_deleted_at_idx" ON "vc_score_snapshots"("deleted_at");

-- AddForeignKey
ALTER TABLE "vc_funds" ADD CONSTRAINT "vc_funds_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "vc_firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vc_people" ADD CONSTRAINT "vc_people_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "vc_firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vc_investments" ADD CONSTRAINT "vc_investments_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "vc_firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vc_investments" ADD CONSTRAINT "vc_investments_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "vc_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vc_source_links" ADD CONSTRAINT "vc_source_links_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "vc_firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vc_signals" ADD CONSTRAINT "vc_signals_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "vc_firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vc_signals" ADD CONSTRAINT "vc_signals_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "vc_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vc_score_snapshots" ADD CONSTRAINT "vc_score_snapshots_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "vc_firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vc_score_snapshots" ADD CONSTRAINT "vc_score_snapshots_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "vc_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vc_score_snapshots" ADD CONSTRAINT "vc_score_snapshots_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "vc_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

