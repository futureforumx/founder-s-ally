-- Funding news ingestion pipeline (articles → deals → investors + logs + checkpoints)

CREATE TYPE "FundingIngestSourceKey" AS ENUM (
  'STARTUPS_GALLERY_NEWS',
  'TECHCRUNCH_VENTURE',
  'GEEKWIRE_FUNDINGS',
  'ALLEYWATCH_FUNDING'
);

CREATE TYPE "FundingArticleFetchStatus" AS ENUM (
  'PENDING',
  'FETCHED',
  'FAILED',
  'SKIPPED_DUPLICATE'
);

CREATE TYPE "FundingDealInvestorRole" AS ENUM (
  'LEAD',
  'PARTICIPANT',
  'EXISTING',
  'UNKNOWN'
);

CREATE TABLE "ingestion_runs" (
  "id" TEXT NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),
  "status" VARCHAR(24) NOT NULL,
  "trigger_kind" VARCHAR(32),
  "pacific_date" VARCHAR(12),
  "summary_json" JSONB,
  "error_message" TEXT,
  CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ingestion_runs_started_at_idx" ON "ingestion_runs" ("started_at");
CREATE INDEX "ingestion_runs_pacific_date_idx" ON "ingestion_runs" ("pacific_date");

CREATE TABLE "ingestion_source_checkpoints" (
  "id" TEXT NOT NULL,
  "source_key" "FundingIngestSourceKey" NOT NULL,
  "last_success_at" TIMESTAMPTZ(6),
  "last_article_published_at" TIMESTAMPTZ(6),
  "last_run_id" TEXT,
  "cursor_json" JSONB,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ingestion_source_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ingestion_source_checkpoints_source_key_key" ON "ingestion_source_checkpoints" ("source_key");

CREATE TABLE "source_articles" (
  "id" TEXT NOT NULL,
  "source_key" "FundingIngestSourceKey" NOT NULL,
  "canonical_url" TEXT NOT NULL,
  "article_url" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "published_at" TIMESTAMPTZ(6),
  "author" TEXT,
  "fetch_status" "FundingArticleFetchStatus" NOT NULL DEFAULT 'FETCHED',
  "raw_excerpt" TEXT,
  "raw_text" TEXT,
  "content_hash" VARCHAR(128),
  "html_fetched_at" TIMESTAMPTZ(6),
  "first_seen_run_id" TEXT,
  "last_seen_run_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "source_articles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_articles_canonical_url_key" ON "source_articles" ("canonical_url");
CREATE INDEX "source_articles_source_key_published_at_idx" ON "source_articles" ("source_key", "published_at");
CREATE INDEX "source_articles_published_at_idx" ON "source_articles" ("published_at");

CREATE TABLE "funding_deals" (
  "id" TEXT NOT NULL,
  "source_article_id" TEXT NOT NULL,
  "slot_index" INTEGER NOT NULL DEFAULT 0,
  "company_name" TEXT NOT NULL,
  "company_name_normalized" TEXT NOT NULL,
  "company_website" TEXT,
  "company_hq" TEXT,
  "round_type_raw" TEXT,
  "round_type_normalized" TEXT,
  "amount_raw" TEXT,
  "amount_minor_units" BIGINT,
  "currency" VARCHAR(8) NOT NULL DEFAULT 'USD',
  "announced_date" DATE,
  "sector_raw" TEXT,
  "sector_normalized" TEXT,
  "founders_mentioned" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "existing_investors_mentioned" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "deal_summary" TEXT,
  "extraction_confidence" DOUBLE PRECISION NOT NULL,
  "extraction_method" VARCHAR(24) NOT NULL,
  "raw_extraction_json" JSONB,
  "needs_review" BOOLEAN NOT NULL DEFAULT false,
  "review_reason" TEXT,
  "duplicate_of_deal_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "funding_deals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "funding_deals_source_article_id_slot_index_key" ON "funding_deals" ("source_article_id", "slot_index");
CREATE INDEX "funding_deals_company_name_normalized_announced_date_idx" ON "funding_deals" ("company_name_normalized", "announced_date");
CREATE INDEX "funding_deals_needs_review_idx" ON "funding_deals" ("needs_review");
CREATE INDEX "funding_deals_duplicate_of_deal_id_idx" ON "funding_deals" ("duplicate_of_deal_id");

ALTER TABLE "funding_deals"
  ADD CONSTRAINT "funding_deals_source_article_id_fkey"
  FOREIGN KEY ("source_article_id") REFERENCES "source_articles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "funding_deals"
  ADD CONSTRAINT "funding_deals_duplicate_of_deal_id_fkey"
  FOREIGN KEY ("duplicate_of_deal_id") REFERENCES "funding_deals" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "funding_deal_investors" (
  "id" TEXT NOT NULL,
  "funding_deal_id" TEXT NOT NULL,
  "role" "FundingDealInvestorRole" NOT NULL,
  "name_raw" TEXT NOT NULL,
  "name_normalized" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "funding_deal_investors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "funding_deal_investors_funding_deal_id_idx" ON "funding_deal_investors" ("funding_deal_id");

ALTER TABLE "funding_deal_investors"
  ADD CONSTRAINT "funding_deal_investors_funding_deal_id_fkey"
  FOREIGN KEY ("funding_deal_id") REFERENCES "funding_deals" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "extraction_logs" (
  "id" TEXT NOT NULL,
  "run_id" TEXT,
  "source_article_id" TEXT,
  "funding_deal_id" TEXT,
  "level" VARCHAR(16) NOT NULL,
  "message" TEXT NOT NULL,
  "payload_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "extraction_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "extraction_logs_run_id_idx" ON "extraction_logs" ("run_id");
CREATE INDEX "extraction_logs_source_article_id_idx" ON "extraction_logs" ("source_article_id");
CREATE INDEX "extraction_logs_level_idx" ON "extraction_logs" ("level");

ALTER TABLE "extraction_logs"
  ADD CONSTRAINT "extraction_logs_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "ingestion_runs" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "extraction_logs"
  ADD CONSTRAINT "extraction_logs_source_article_id_fkey"
  FOREIGN KEY ("source_article_id") REFERENCES "source_articles" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "extraction_logs"
  ADD CONSTRAINT "extraction_logs_funding_deal_id_fkey"
  FOREIGN KEY ("funding_deal_id") REFERENCES "funding_deals" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
