-- Fund enrichment pipeline: new enums, VCFund columns, VCFundAlias,
-- VCFundSourceEvidence, EnrichmentReviewQueue tables.

-- ---------------------------------------------------------------
-- 1. New enum types
-- ---------------------------------------------------------------

CREATE TYPE "FundSourceType" AS ENUM (
  'OFFICIAL_WEBSITE',
  'SEC_FILING',
  'CRUNCHBASE',
  'PITCHBOOK',
  'PREQIN',
  'NEWS_ARTICLE',
  'PRESS_RELEASE',
  'LP_DISCLOSURE',
  'SECONDARY_AGGREGATOR',
  'AI_INFERRED',
  'MANUAL',
  'OTHER'
);

CREATE TYPE "ReviewStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'MERGED'
);

CREATE TYPE "ReviewEntityType" AS ENUM (
  'FUND',
  'FUND_ALIAS',
  'FIRM_FUND_LINK'
);

-- ---------------------------------------------------------------
-- 2. VCFund — add new columns
-- ---------------------------------------------------------------

ALTER TABLE "vc_funds"
  ADD COLUMN "normalized_fund_name" TEXT,
  ADD COLUMN "strategy"             TEXT,
  ADD COLUMN "currency"             VARCHAR(3) DEFAULT 'USD',
  ADD COLUMN "target_size_usd"      DOUBLE PRECISION,
  ADD COLUMN "final_close_size_usd" DOUBLE PRECISION;

-- Dedup index: one normalized name per firm
CREATE UNIQUE INDEX "vc_funds_firm_id_normalized_fund_name_key"
  ON "vc_funds"("firm_id", "normalized_fund_name");

CREATE INDEX "vc_funds_normalized_fund_name_idx"
  ON "vc_funds"("normalized_fund_name");

-- ---------------------------------------------------------------
-- 3. VCFundAlias
-- ---------------------------------------------------------------

CREATE TABLE "vc_fund_aliases" (
  "id"               TEXT NOT NULL,
  "fund_id"          TEXT NOT NULL,
  "alias_value"      TEXT NOT NULL,
  "normalized_value" TEXT NOT NULL,
  "source"           TEXT,
  "notes"            TEXT,
  "confidence"       DOUBLE PRECISION,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vc_fund_aliases_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vc_fund_aliases"
  ADD CONSTRAINT "vc_fund_aliases_fund_id_fkey"
  FOREIGN KEY ("fund_id") REFERENCES "vc_funds"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "vc_fund_aliases_fund_id_normalized_value_key"
  ON "vc_fund_aliases"("fund_id", "normalized_value");

CREATE INDEX "vc_fund_aliases_normalized_value_idx"
  ON "vc_fund_aliases"("normalized_value");

-- ---------------------------------------------------------------
-- 4. VCFundSourceEvidence
-- ---------------------------------------------------------------

CREATE TABLE "vc_fund_source_evidence" (
  "id"                TEXT NOT NULL,
  "fund_id"           TEXT NOT NULL,
  "field_name"        TEXT NOT NULL DEFAULT '*',
  "source_type"       "FundSourceType" NOT NULL,
  "source_url"        TEXT,
  "evidence_quote"    TEXT,
  "source_confidence" DECIMAL(3,2) NOT NULL DEFAULT 0.50,
  "raw_payload"       JSONB,
  "discovered_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "vc_fund_source_evidence_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vc_fund_source_evidence"
  ADD CONSTRAINT "vc_fund_source_evidence_fund_id_fkey"
  FOREIGN KEY ("fund_id") REFERENCES "vc_funds"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "vc_fund_source_evidence_fund_id_idx"
  ON "vc_fund_source_evidence"("fund_id");

CREATE INDEX "vc_fund_source_evidence_source_type_idx"
  ON "vc_fund_source_evidence"("source_type");

CREATE INDEX "vc_fund_source_evidence_source_confidence_idx"
  ON "vc_fund_source_evidence"("source_confidence");

-- ---------------------------------------------------------------
-- 5. EnrichmentReviewQueue
-- ---------------------------------------------------------------

CREATE TABLE "enrichment_review_queue" (
  "id"               TEXT NOT NULL,
  "entity_type"      "ReviewEntityType" NOT NULL,
  "entity_id"        TEXT NOT NULL,
  "firm_id"          TEXT,
  "reason"           TEXT NOT NULL,
  "review_data"      JSONB,
  "status"           "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  "resolved_by"      TEXT,
  "resolved_at"      TIMESTAMP(3),
  "resolution_notes" TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "enrichment_review_queue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "enrichment_review_queue_entity_type_status_idx"
  ON "enrichment_review_queue"("entity_type", "status");

CREATE INDEX "enrichment_review_queue_firm_id_idx"
  ON "enrichment_review_queue"("firm_id");

CREATE INDEX "enrichment_review_queue_status_idx"
  ON "enrichment_review_queue"("status");

CREATE INDEX "enrichment_review_queue_created_at_idx"
  ON "enrichment_review_queue"("created_at");
