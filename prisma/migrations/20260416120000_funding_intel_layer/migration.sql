-- =============================================================================
-- Funding intelligence layer: canonical links, match reviews, snapshots,
-- derived profiles, and ranking views (extends funding news ingestion).
-- =============================================================================

-- Match provenance for funding deal → Startup / investor → VCFirm links
CREATE TYPE "FundingEntityMatchMethod" AS ENUM (
  'DOMAIN_EXACT',
  'NAME_EXACT',
  'ALIAS_EXACT',
  'FUZZY_HIGH',
  'FUZZY_MEDIUM',
  'MANUAL',
  'UNRESOLVED'
);

CREATE TYPE "EntityMatchReviewStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'AUTO_EXPIRED'
);

CREATE TYPE "EntityMatchReviewKind" AS ENUM (
  'DEAL_COMPANY',
  'DEAL_INVESTOR'
);

-- One canonical link per funding deal → Startup (portfolio company)
CREATE TABLE "funding_deal_company_links" (
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

CREATE UNIQUE INDEX "funding_deal_company_links_funding_deal_id_key"
  ON "funding_deal_company_links" ("funding_deal_id");

CREATE INDEX "funding_deal_company_links_startup_id_idx"
  ON "funding_deal_company_links" ("startup_id");

ALTER TABLE "funding_deal_company_links"
  ADD CONSTRAINT "funding_deal_company_links_funding_deal_id_fkey"
  FOREIGN KEY ("funding_deal_id") REFERENCES "funding_deals" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "funding_deal_company_links"
  ADD CONSTRAINT "funding_deal_company_links_startup_id_fkey"
  FOREIGN KEY ("startup_id") REFERENCES "startups" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One canonical link per funding_deal_investor row → VC firm (and optionally person later)
CREATE TABLE "funding_deal_investor_links" (
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

CREATE UNIQUE INDEX "funding_deal_investor_links_investor_id_key"
  ON "funding_deal_investor_links" ("funding_deal_investor_id");

CREATE INDEX "funding_deal_investor_links_vc_firm_id_idx"
  ON "funding_deal_investor_links" ("vc_firm_id");

CREATE INDEX "funding_deal_investor_links_vc_person_id_idx"
  ON "funding_deal_investor_links" ("vc_person_id");

ALTER TABLE "funding_deal_investor_links"
  ADD CONSTRAINT "funding_deal_investor_links_investor_fkey"
  FOREIGN KEY ("funding_deal_investor_id") REFERENCES "funding_deal_investors" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "funding_deal_investor_links"
  ADD CONSTRAINT "funding_deal_investor_links_vc_firm_fkey"
  FOREIGN KEY ("vc_firm_id") REFERENCES "vc_firms" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "funding_deal_investor_links"
  ADD CONSTRAINT "funding_deal_investor_links_vc_person_fkey"
  FOREIGN KEY ("vc_person_id") REFERENCES "vc_people" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Human / workflow queue for ambiguous matches
CREATE TABLE "entity_match_reviews" (
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

CREATE INDEX "entity_match_reviews_status_idx" ON "entity_match_reviews" ("status", "created_at");
CREATE INDEX "entity_match_reviews_deal_idx" ON "entity_match_reviews" ("funding_deal_id");

ALTER TABLE "entity_match_reviews"
  ADD CONSTRAINT "entity_match_reviews_funding_deal_fkey"
  FOREIGN KEY ("funding_deal_id") REFERENCES "funding_deals" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entity_match_reviews"
  ADD CONSTRAINT "entity_match_reviews_funding_deal_investor_fkey"
  FOREIGN KEY ("funding_deal_investor_id") REFERENCES "funding_deal_investors" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Time-series rollup per VC firm (window_days ∈ {30,90,180,365})
CREATE TABLE "firm_market_intel_snapshots" (
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

CREATE UNIQUE INDEX "firm_market_intel_firm_window_date_key"
  ON "firm_market_intel_snapshots" ("vc_firm_id", "window_days", "as_of_date");

CREATE INDEX "firm_market_intel_snapshots_as_of_window_score_idx"
  ON "firm_market_intel_snapshots" ("as_of_date" DESC, "window_days", "activity_score" DESC);

CREATE INDEX "firm_market_intel_snapshots_firm_as_of_idx"
  ON "firm_market_intel_snapshots" ("vc_firm_id", "as_of_date" DESC);

ALTER TABLE "firm_market_intel_snapshots"
  ADD CONSTRAINT "firm_market_intel_snapshots_vc_firm_fkey"
  FOREIGN KEY ("vc_firm_id") REFERENCES "vc_firms" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-person rollup (optional vc_person link; many rows may only have firm-level signal)
CREATE TABLE "investor_market_intel_snapshots" (
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

CREATE UNIQUE INDEX "investor_market_intel_person_window_date_key"
  ON "investor_market_intel_snapshots" ("vc_person_id", "window_days", "as_of_date");

CREATE INDEX "investor_market_intel_snapshots_as_of_score_idx"
  ON "investor_market_intel_snapshots" ("as_of_date" DESC, "window_days", "activity_score" DESC);

ALTER TABLE "investor_market_intel_snapshots"
  ADD CONSTRAINT "investor_market_intel_snapshots_person_fkey"
  FOREIGN KEY ("vc_person_id") REFERENCES "vc_people" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Latest denormalized app-facing intel for VC firms (non-canonical; safe to overwrite)
CREATE TABLE "vc_firm_derived_market_intel" (
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

ALTER TABLE "vc_firm_derived_market_intel"
  ADD CONSTRAINT "vc_firm_derived_market_intel_firm_fkey"
  FOREIGN KEY ("vc_firm_id") REFERENCES "vc_firms" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "vc_firm_derived_market_intel_activity_idx"
  ON "vc_firm_derived_market_intel" ("activity_score" DESC NULLS LAST);

-- Latest denormalized intel for individual investors (GPs)
CREATE TABLE "vc_person_derived_market_intel" (
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

ALTER TABLE "vc_person_derived_market_intel"
  ADD CONSTRAINT "vc_person_derived_market_intel_person_fkey"
  FOREIGN KEY ("vc_person_id") REFERENCES "vc_people" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Optional: intelligence batch run metadata (separate from funding ingestion_runs)
CREATE TABLE "intel_batch_runs" (
  "id" TEXT NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),
  "job_kind" VARCHAR(32) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "summary_json" JSONB,
  "error_message" TEXT,

  CONSTRAINT "intel_batch_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "intel_batch_runs_started_idx" ON "intel_batch_runs" ("started_at" DESC);

-- ---------------------------------------------------------------------------
-- Ranking views (latest 90d window by default)
-- ---------------------------------------------------------------------------

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
  AND (f."deleted_at" IS NULL);

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
  AND (p."deleted_at" IS NULL);

COMMENT ON TABLE "funding_deal_company_links" IS 'Canonical link from ingested funding_deals to startups (portfolio company).';
COMMENT ON TABLE "funding_deal_investor_links" IS 'Canonical link from funding_deal_investors to vc_firms / optionally vc_people.';
COMMENT ON TABLE "firm_market_intel_snapshots" IS 'Time-bucketed activity+momentum+focus metrics for VC firms; formula_version documents scoring.';
COMMENT ON TABLE "vc_firm_derived_market_intel" IS 'Latest app-facing market intel for a VC firm; overwritable enrichment only.';
