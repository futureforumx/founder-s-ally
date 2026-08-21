-- Recreate funding-intel tables if they were CASCADE-dropped when vc_firms
-- was replaced by an empty compatibility stub (id, name, website, …).
-- Do not FK intel rows to vc_firms / vc_people: live canonical IDs live on
-- firm_records / firm_investors.

DO $$ BEGIN
  CREATE TYPE "FundingEntityMatchMethod" AS ENUM (
    'DOMAIN_EXACT',
    'NAME_EXACT',
    'ALIAS_EXACT',
    'FUZZY_HIGH',
    'FUZZY_MEDIUM',
    'MANUAL',
    'UNRESOLVED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EntityMatchReviewStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'AUTO_EXPIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EntityMatchReviewKind" AS ENUM (
    'DEAL_COMPANY',
    'DEAL_INVESTOR'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "funding_deal_company_links" (
  "id" TEXT NOT NULL,
  "funding_deal_id" TEXT NOT NULL,
  "startup_id" TEXT,
  "match_method" "FundingEntityMatchMethod" NOT NULL,
  "match_confidence" DOUBLE PRECISION NOT NULL,
  "match_evidence_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "funding_deal_company_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "funding_deal_company_links_funding_deal_id_key"
  ON "funding_deal_company_links" ("funding_deal_id");

CREATE INDEX IF NOT EXISTS "funding_deal_company_links_startup_id_idx"
  ON "funding_deal_company_links" ("startup_id");

DO $$ BEGIN
  ALTER TABLE "funding_deal_company_links"
    ADD CONSTRAINT "funding_deal_company_links_funding_deal_id_fkey"
    FOREIGN KEY ("funding_deal_id") REFERENCES "funding_deals" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funding_deal_company_links"
    ADD CONSTRAINT "funding_deal_company_links_startup_id_fkey"
    FOREIGN KEY ("startup_id") REFERENCES "startups" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "funding_deal_investor_links" (
  "id" TEXT NOT NULL,
  "funding_deal_investor_id" TEXT NOT NULL,
  "vc_firm_id" TEXT,
  "vc_person_id" TEXT,
  "match_method" "FundingEntityMatchMethod" NOT NULL,
  "match_confidence" DOUBLE PRECISION NOT NULL,
  "match_evidence_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "funding_deal_investor_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "funding_deal_investor_links_investor_id_key"
  ON "funding_deal_investor_links" ("funding_deal_investor_id");

CREATE INDEX IF NOT EXISTS "funding_deal_investor_links_vc_firm_id_idx"
  ON "funding_deal_investor_links" ("vc_firm_id");

CREATE INDEX IF NOT EXISTS "funding_deal_investor_links_vc_person_id_idx"
  ON "funding_deal_investor_links" ("vc_person_id");

DO $$ BEGIN
  ALTER TABLE "funding_deal_investor_links"
    ADD CONSTRAINT "funding_deal_investor_links_investor_fkey"
    FOREIGN KEY ("funding_deal_investor_id") REFERENCES "funding_deal_investors" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "funding_deal_investor_links" DROP CONSTRAINT IF EXISTS "funding_deal_investor_links_vc_firm_fkey";
ALTER TABLE "funding_deal_investor_links" DROP CONSTRAINT IF EXISTS "funding_deal_investor_links_vc_person_fkey";

CREATE TABLE IF NOT EXISTS "entity_match_reviews" (
  "id" TEXT NOT NULL,
  "kind" "EntityMatchReviewKind" NOT NULL,
  "funding_deal_id" TEXT,
  "funding_deal_investor_id" TEXT,
  "candidate_json" JSONB NOT NULL,
  "status" "EntityMatchReviewStatus" NOT NULL DEFAULT 'PENDING',
  "resolution_notes" TEXT,
  "resolved_startup_id" TEXT,
  "resolved_vc_firm_id" TEXT,
  "resolved_vc_person_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(6),
  CONSTRAINT "entity_match_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "entity_match_reviews_status_idx" ON "entity_match_reviews" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "entity_match_reviews_deal_idx" ON "entity_match_reviews" ("funding_deal_id");

DO $$ BEGIN
  ALTER TABLE "entity_match_reviews"
    ADD CONSTRAINT "entity_match_reviews_funding_deal_fkey"
    FOREIGN KEY ("funding_deal_id") REFERENCES "funding_deals" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "entity_match_reviews"
    ADD CONSTRAINT "entity_match_reviews_funding_deal_investor_fkey"
    FOREIGN KEY ("funding_deal_investor_id") REFERENCES "funding_deal_investors" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "firm_market_intel_snapshots" (
  "id" TEXT NOT NULL,
  "vc_firm_id" TEXT NOT NULL,
  "window_days" INTEGER NOT NULL,
  "as_of_date" DATE NOT NULL,
  "metrics_json" JSONB NOT NULL,
  "activity_score" DOUBLE PRECISION NOT NULL,
  "momentum_score" DOUBLE PRECISION NOT NULL,
  "activity_components_json" JSONB NOT NULL,
  "momentum_components_json" JSONB NOT NULL,
  "focus_json" JSONB NOT NULL,
  "formula_version" VARCHAR(16) NOT NULL DEFAULT 'intel_v1',
  "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "firm_market_intel_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "firm_market_intel_firm_window_date_key"
  ON "firm_market_intel_snapshots" ("vc_firm_id", "window_days", "as_of_date");

CREATE INDEX IF NOT EXISTS "firm_market_intel_snapshots_as_of_window_score_idx"
  ON "firm_market_intel_snapshots" ("as_of_date" DESC, "window_days", "activity_score" DESC);

CREATE INDEX IF NOT EXISTS "firm_market_intel_snapshots_firm_as_of_idx"
  ON "firm_market_intel_snapshots" ("vc_firm_id", "as_of_date" DESC);

ALTER TABLE "firm_market_intel_snapshots" DROP CONSTRAINT IF EXISTS "firm_market_intel_snapshots_vc_firm_fkey";

CREATE TABLE IF NOT EXISTS "investor_market_intel_snapshots" (
  "id" TEXT NOT NULL,
  "vc_person_id" TEXT NOT NULL,
  "window_days" INTEGER NOT NULL,
  "as_of_date" DATE NOT NULL,
  "metrics_json" JSONB NOT NULL,
  "activity_score" DOUBLE PRECISION NOT NULL,
  "momentum_score" DOUBLE PRECISION NOT NULL,
  "activity_components_json" JSONB NOT NULL,
  "momentum_components_json" JSONB NOT NULL,
  "focus_json" JSONB NOT NULL,
  "formula_version" VARCHAR(16) NOT NULL DEFAULT 'intel_v1',
  "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "investor_market_intel_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "investor_market_intel_person_window_date_key"
  ON "investor_market_intel_snapshots" ("vc_person_id", "window_days", "as_of_date");

CREATE INDEX IF NOT EXISTS "investor_market_intel_snapshots_as_of_score_idx"
  ON "investor_market_intel_snapshots" ("as_of_date" DESC, "window_days", "activity_score" DESC);

ALTER TABLE "investor_market_intel_snapshots" DROP CONSTRAINT IF EXISTS "investor_market_intel_snapshots_person_fkey";

CREATE TABLE IF NOT EXISTS "vc_firm_derived_market_intel" (
  "vc_firm_id" TEXT NOT NULL,
  "recent_activity_summary" TEXT,
  "recent_investments_json" JSONB,
  "activity_metrics_json" JSONB,
  "focus_json" JSONB,
  "pace_label" VARCHAR(24),
  "activity_score" DOUBLE PRECISION,
  "momentum_score" DOUBLE PRECISION,
  "score_components_json" JSONB,
  "last_seen_investing_at" TIMESTAMPTZ(6),
  "source_formula_version" VARCHAR(16) NOT NULL DEFAULT 'intel_v1',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vc_firm_derived_market_intel_pkey" PRIMARY KEY ("vc_firm_id")
);

ALTER TABLE "vc_firm_derived_market_intel" DROP CONSTRAINT IF EXISTS "vc_firm_derived_market_intel_firm_fkey";

CREATE INDEX IF NOT EXISTS "vc_firm_derived_market_intel_activity_idx"
  ON "vc_firm_derived_market_intel" ("activity_score" DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS "vc_person_derived_market_intel" (
  "vc_person_id" TEXT NOT NULL,
  "recent_investment_summary" TEXT,
  "recent_investments_json" JSONB,
  "activity_metrics_json" JSONB,
  "focus_json" JSONB,
  "pace_label" VARCHAR(24),
  "activity_score" DOUBLE PRECISION,
  "momentum_score" DOUBLE PRECISION,
  "score_components_json" JSONB,
  "last_seen_investing_at" TIMESTAMPTZ(6),
  "source_formula_version" VARCHAR(16) NOT NULL DEFAULT 'intel_v1',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vc_person_derived_market_intel_pkey" PRIMARY KEY ("vc_person_id")
);

ALTER TABLE "vc_person_derived_market_intel" DROP CONSTRAINT IF EXISTS "vc_person_derived_market_intel_person_fkey";

CREATE TABLE IF NOT EXISTS "intel_batch_runs" (
  "id" TEXT NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),
  "job_kind" VARCHAR(32) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "summary_json" JSONB,
  "error_message" TEXT,
  CONSTRAINT "intel_batch_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "intel_batch_runs_started_idx" ON "intel_batch_runs" ("started_at" DESC);

DROP VIEW IF EXISTS "v_intel_vc_firm_rankings_90d";
DROP VIEW IF EXISTS "v_intel_vc_person_rankings_90d";

DO $$
BEGIN
  IF to_regclass('public.firm_records') IS NOT NULL THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW "v_intel_vc_firm_rankings_90d" AS
      SELECT
        s."vc_firm_id",
        f."firm_name",
        f."slug",
        s."as_of_date",
        s."activity_score",
        s."momentum_score",
        s."metrics_json",
        s."focus_json",
        s."computed_at"
      FROM "firm_market_intel_snapshots" s
      JOIN "firm_records" f ON f."id"::text = s."vc_firm_id"
      WHERE s."window_days" = 90
        AND s."as_of_date" = (
          SELECT MAX(s2."as_of_date")
          FROM "firm_market_intel_snapshots" s2
          WHERE s2."vc_firm_id" = s."vc_firm_id"
            AND s2."window_days" = 90
        )
        AND f."deleted_at" IS NULL
    $v$;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vc_firms' AND column_name = 'firm_name'
  ) THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW "v_intel_vc_firm_rankings_90d" AS
      SELECT
        s."vc_firm_id",
        f."firm_name",
        f."slug",
        s."as_of_date",
        s."activity_score",
        s."momentum_score",
        s."metrics_json",
        s."focus_json",
        s."computed_at"
      FROM "firm_market_intel_snapshots" s
      JOIN "vc_firms" f ON f."id" = s."vc_firm_id"
      WHERE s."window_days" = 90
        AND s."as_of_date" = (
          SELECT MAX(s2."as_of_date")
          FROM "firm_market_intel_snapshots" s2
          WHERE s2."vc_firm_id" = s."vc_firm_id"
            AND s2."window_days" = 90
        )
        AND (f."deleted_at" IS NULL)
    $v$;
  END IF;

  IF to_regclass('public.firm_investors') IS NOT NULL THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW "v_intel_vc_person_rankings_90d" AS
      SELECT
        s."vc_person_id",
        p."first_name",
        p."last_name",
        p."firm_id"::text AS "firm_id",
        s."as_of_date",
        s."activity_score",
        s."momentum_score",
        s."metrics_json",
        s."focus_json",
        s."computed_at"
      FROM "investor_market_intel_snapshots" s
      JOIN "firm_investors" p ON p."id"::text = s."vc_person_id"
      WHERE s."window_days" = 90
        AND s."as_of_date" = (
          SELECT MAX(s2."as_of_date")
          FROM "investor_market_intel_snapshots" s2
          WHERE s2."vc_person_id" = s."vc_person_id"
            AND s2."window_days" = 90
        )
        AND p."deleted_at" IS NULL
    $v$;
  ELSIF to_regclass('public.vc_people') IS NOT NULL THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW "v_intel_vc_person_rankings_90d" AS
      SELECT
        s."vc_person_id",
        p."first_name",
        p."last_name",
        p."firm_id",
        s."as_of_date",
        s."activity_score",
        s."momentum_score",
        s."metrics_json",
        s."focus_json",
        s."computed_at"
      FROM "investor_market_intel_snapshots" s
      JOIN "vc_people" p ON p."id" = s."vc_person_id"
      WHERE s."window_days" = 90
        AND s."as_of_date" = (
          SELECT MAX(s2."as_of_date")
          FROM "investor_market_intel_snapshots" s2
          WHERE s2."vc_person_id" = s."vc_person_id"
            AND s2."window_days" = 90
        )
        AND (p."deleted_at" IS NULL)
    $v$;
  END IF;
END $$;
