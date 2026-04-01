-- ============================================================================
-- Operator Network Graph Schema
-- Adds: 6 new enums, 5 new tables, extends startup_professionals
-- Tables: operator_companies, operator_experiences, operator_signals,
--         operator_reputation, operator_relationships
-- ============================================================================

-- ─── New Enums ───────────────────────────────────────────────────────────────

CREATE TYPE "OperatorFunction" AS ENUM (
  'PRODUCT',
  'ENGINEERING',
  'GTM',
  'SALES',
  'MARKETING',
  'FINANCE',
  'OPERATIONS',
  'LEGAL',
  'DESIGN',
  'DATA',
  'GENERAL_MANAGEMENT',
  'PEOPLE_HR',
  'CUSTOMER_SUCCESS',
  'OTHER'
);

CREATE TYPE "OperatorSeniority" AS ENUM (
  'INDIVIDUAL_CONTRIBUTOR',
  'MANAGER',
  'DIRECTOR',
  'VP',
  'C_SUITE',
  'FOUNDER',
  'ADVISOR',
  'BOARD'
);

CREATE TYPE "OperatorSignalType" AS ENUM (
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

CREATE TYPE "OperatorEdgeType" AS ENUM (
  'WORKED_WITH',
  'REPORTED_TO',
  'COFOUNDED',
  'INVESTED_IN',
  'ADVISED',
  'HIRED',
  'INTRODUCED',
  'BOARD_MEMBER',
  'PEER'
);

CREATE TYPE "OperatorCompanyStage" AS ENUM (
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

CREATE TYPE "CompanyHeadcountBand" AS ENUM (
  'SOLO',
  'MICRO',
  'SMALL',
  'MID',
  'LARGE',
  'ENTERPRISE'
);

-- ─── operator_companies ──────────────────────────────────────────────────────
-- Richer company entity for the operator graph.
-- Distinct from vc_firms (which are investor entities) and startups (minimal).
-- Represents any company an operator has worked at: portfolio, pre-IPO, big-co, etc.

CREATE TABLE "operator_companies" (
    "id"                  TEXT NOT NULL,
    "name"                TEXT NOT NULL,
    -- Canonical domain (no www, lowercase) — primary deduplication key
    "domain"              TEXT,
    "description"         TEXT,
    "logo_url"            TEXT,
    "website_url"         TEXT,
    "linkedin_url"        TEXT,
    "x_url"               TEXT,
    "crunchbase_url"      TEXT,

    -- Primary sector for indexing/filtering; sectors[] for multi-tag
    "sector"              "SectorFocus",
    "sectors"             "SectorFocus"[] NOT NULL DEFAULT ARRAY[]::"SectorFocus"[],
    -- B2B, B2C, B2B2C, marketplace, etc. (free text for flexibility)
    "business_model"      TEXT,

    "stage"               "OperatorCompanyStage" NOT NULL DEFAULT 'UNKNOWN',
    "headcount_band"      "CompanyHeadcountBand",
    "headcount"           INTEGER,

    "hq_city"             TEXT,
    "hq_state"            TEXT,
    "hq_country"          TEXT,

    -- Funding context (raw status string + structured fields)
    "funding_status"      TEXT,
    "total_raised_usd"    DECIMAL(15,2),
    "latest_funding_date" DATE,
    -- Raw list of investor names (denormalized for speed)
    "investors"           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    -- Hiring activity (populated from Greenhouse / Ashby signal scripts)
    "active_job_count"    INTEGER,
    "last_job_posted_at"  TIMESTAMPTZ(6),

    -- Enrichment provenance
    "apollo_org_id"       TEXT,
    "pdl_company_id"      TEXT,
    "latest_activity_at"  TIMESTAMPTZ(6),
    "last_enriched_at"    TIMESTAMPTZ(6),
    "data_source"         TEXT,

    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"          TIMESTAMP(3),

    CONSTRAINT "operator_companies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operator_companies_domain_key"        ON "operator_companies"("domain");
CREATE UNIQUE INDEX "operator_companies_apollo_org_id_key" ON "operator_companies"("apollo_org_id");
CREATE UNIQUE INDEX "operator_companies_pdl_company_id_key" ON "operator_companies"("pdl_company_id");
CREATE INDEX "operator_companies_name_idx"     ON "operator_companies"("name");
CREATE INDEX "operator_companies_sector_idx"   ON "operator_companies"("sector");
CREATE INDEX "operator_companies_stage_idx"    ON "operator_companies"("stage");
CREATE INDEX "operator_companies_location_idx" ON "operator_companies"("hq_country", "hq_state", "hq_city");
CREATE INDEX "operator_companies_deleted_at_idx" ON "operator_companies"("deleted_at");
CREATE INDEX "operator_companies_last_enriched_at_idx" ON "operator_companies"("last_enriched_at");

-- ─── Extend startup_professionals ────────────────────────────────────────────
-- New columns for the operator graph layer:
--   identity, normalized dimensions, taxonomy tags, enrichment metadata.

ALTER TABLE "startup_professionals"
    ADD COLUMN "bio_summary"          TEXT,
    ADD COLUMN "avatar_url"           TEXT,
    ADD COLUMN "x_url"                TEXT,
    ADD COLUMN "website_url"          TEXT,
    ADD COLUMN "normalized_function"  "OperatorFunction",
    ADD COLUMN "normalized_seniority" "OperatorSeniority",
    -- Startup-specific capability tags: "B2B SaaS GTM", "enterprise sales", "marketplaces"
    ADD COLUMN "expertise_tags"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    -- Industry verticals: "fintech", "healthtech", "construction tech"
    ADD COLUMN "industries"           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    -- Stage experience: "seed", "series_a", "series_b_plus"
    ADD COLUMN "stages"               TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    -- External enrichment IDs
    ADD COLUMN "apollo_id"            TEXT,
    ADD COLUMN "pdl_id"               TEXT,
    -- 0–100 overall data confidence (completeness + source quality)
    ADD COLUMN "confidence_score"     INTEGER,
    ADD COLUMN "last_enriched_at"     TIMESTAMPTZ(6),
    -- FK to current employer in operator_companies (optional — links graph)
    ADD COLUMN "current_company_id"   TEXT;

CREATE UNIQUE INDEX "startup_professionals_apollo_id_key"
    ON "startup_professionals"("apollo_id");

CREATE INDEX "startup_professionals_normalized_function_idx"
    ON "startup_professionals"("normalized_function");
CREATE INDEX "startup_professionals_normalized_seniority_idx"
    ON "startup_professionals"("normalized_seniority");
CREATE INDEX "startup_professionals_current_company_id_idx"
    ON "startup_professionals"("current_company_id");
CREATE INDEX "startup_professionals_confidence_score_idx"
    ON "startup_professionals"("confidence_score");
CREATE INDEX "startup_professionals_last_enriched_at_idx"
    ON "startup_professionals"("last_enriched_at");

ALTER TABLE "startup_professionals"
    ADD CONSTRAINT "startup_professionals_current_company_id_fkey"
    FOREIGN KEY ("current_company_id")
    REFERENCES "operator_companies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── operator_experiences ────────────────────────────────────────────────────
-- Normalized employment timeline per person.
-- One row per role. Multiple rows per company if the person was promoted.

CREATE TABLE "operator_experiences" (
    "id"                   TEXT NOT NULL,
    "person_id"            TEXT NOT NULL,
    -- Optional FK; null when the company isn't yet in operator_companies
    "company_id"           TEXT,

    -- Raw strings exactly as ingested (preserved for audit / re-normalization)
    "title_raw"            TEXT NOT NULL,
    "company_name_raw"     TEXT NOT NULL,

    -- Normalized fields (written by enrichment / normalization workers)
    "title_normalized"     TEXT,
    "function_normalized"  "OperatorFunction",
    "seniority_normalized" "OperatorSeniority",

    "start_date"           DATE,
    "end_date"             DATE,
    "is_current"           BOOLEAN NOT NULL DEFAULT false,
    -- True when same company, higher seniority than previous role
    "is_promotion"         BOOLEAN NOT NULL DEFAULT false,

    "description"          TEXT,
    "data_source"          TEXT,
    -- 0–1 confidence on this particular experience record
    "confidence"           DOUBLE PRECISION,

    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_experiences_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "operator_experiences"
    ADD CONSTRAINT "operator_experiences_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "startup_professionals"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operator_experiences"
    ADD CONSTRAINT "operator_experiences_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "operator_companies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "operator_experiences_person_id_idx"            ON "operator_experiences"("person_id");
CREATE INDEX "operator_experiences_company_id_idx"           ON "operator_experiences"("company_id");
CREATE INDEX "operator_experiences_is_current_idx"           ON "operator_experiences"("is_current");
CREATE INDEX "operator_experiences_start_date_idx"           ON "operator_experiences"("start_date");
CREATE INDEX "operator_experiences_function_normalized_idx"  ON "operator_experiences"("function_normalized");
CREATE INDEX "operator_experiences_seniority_normalized_idx" ON "operator_experiences"("seniority_normalized");

-- ─── operator_signals ────────────────────────────────────────────────────────
-- Freshness and activity signals for people and companies.
-- Sources: Greenhouse, Ashby (job postings), Apollo (job changes),
--          GDELT (news), manual/first-party.

CREATE TABLE "operator_signals" (
    "id"               TEXT NOT NULL,
    -- "person" | "company" — entity this signal is about
    "entity_type"      TEXT NOT NULL,
    "person_id"        TEXT,
    "company_id"       TEXT,

    "signal_type"      "OperatorSignalType" NOT NULL,
    "title"            TEXT NOT NULL,
    "description"      TEXT,
    "url"              TEXT,

    -- Source identifier: "greenhouse", "ashby", "gdelt", "apollo", "manual"
    "source"           TEXT NOT NULL,
    "occurred_at"      TIMESTAMPTZ(6),
    -- 0–100 confidence on signal accuracy
    "confidence_score" INTEGER,
    -- Arbitrary extra payload from source (role details, job req, etc.)
    "metadata"         JSONB,

    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"       TIMESTAMP(3),

    CONSTRAINT "operator_signals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "operator_signals"
    ADD CONSTRAINT "operator_signals_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "startup_professionals"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operator_signals"
    ADD CONSTRAINT "operator_signals_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "operator_companies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "operator_signals_person_id_idx"    ON "operator_signals"("person_id");
CREATE INDEX "operator_signals_company_id_idx"   ON "operator_signals"("company_id");
CREATE INDEX "operator_signals_signal_type_idx"  ON "operator_signals"("signal_type");
CREATE INDEX "operator_signals_occurred_at_idx"  ON "operator_signals"("occurred_at");
CREATE INDEX "operator_signals_source_idx"       ON "operator_signals"("source");
CREATE INDEX "operator_signals_deleted_at_idx"   ON "operator_signals"("deleted_at");

-- ─── operator_reputation ─────────────────────────────────────────────────────
-- One row per person. Trust and credibility layer:
--   crowdsourced founder ratings + engagement quality metrics.
-- This is the moat — populated from first-party platform activity.

CREATE TABLE "operator_reputation" (
    "id"                         TEXT NOT NULL,
    -- 1:1 with startup_professionals
    "person_id"                  TEXT NOT NULL,

    -- Founder-submitted ratings (via review wizard, similar to VCRating)
    "rating_count"               INTEGER NOT NULL DEFAULT 0,
    -- 0–5 composite score
    "avg_rating"                 DOUBLE PRECISION,

    -- Structured endorsements (from founders and investors separately)
    "founder_endorsement_count"  INTEGER NOT NULL DEFAULT 0,
    "investor_endorsement_count" INTEGER NOT NULL DEFAULT 0,

    -- Engagement quality (computed from platform activity events)
    -- 0–1: fraction of intro requests accepted
    "intro_accept_rate"          DOUBLE PRECISION,
    -- 0–100: faster = higher
    "response_time_score"        INTEGER,
    -- 0–1: fraction of founders who engaged this operator more than once
    "repeat_engagement_rate"     DOUBLE PRECISION,

    -- Availability and preference (self-reported or inferred)
    "open_to_advising"           BOOLEAN,
    "open_to_fractional"         BOOLEAN,
    "open_to_full_time"          BOOLEAN,
    -- "advisor" | "fractional" | "full-time" | "board"
    "engagement_preference"      TEXT,
    -- "cash" | "equity" | "mixed"
    "preferred_comp_model"       TEXT,

    -- 0–100 composite credibility score (recomputed by worker)
    "credibility_score"          INTEGER,
    "last_computed_at"           TIMESTAMPTZ(6),

    "created_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_reputation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "operator_reputation"
    ADD CONSTRAINT "operator_reputation_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "startup_professionals"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "operator_reputation_person_id_key"      ON "operator_reputation"("person_id");
CREATE INDEX "operator_reputation_credibility_score_idx"    ON "operator_reputation"("credibility_score");
CREATE INDEX "operator_reputation_open_to_advising_idx"     ON "operator_reputation"("open_to_advising");
CREATE INDEX "operator_reputation_avg_rating_idx"           ON "operator_reputation"("avg_rating");

-- ─── operator_relationships ──────────────────────────────────────────────────
-- Directed graph edges: person → person or person → company.
-- Edge types: WORKED_WITH, REPORTED_TO, COFOUNDED, ADVISED, HIRED, etc.
-- Highest-value edges come from first-party platform activity + user submissions.

CREATE TABLE "operator_relationships" (
    "id"                TEXT NOT NULL,
    "source_person_id"  TEXT NOT NULL,
    -- Exactly one of target_person_id / target_company_id must be non-null
    "target_person_id"  TEXT,
    "target_company_id" TEXT,

    "edge_type"         "OperatorEdgeType" NOT NULL,
    -- Provenance: "apollo", "user_submission", "co_employment", "manual"
    "source"            TEXT,
    -- 0–1 confidence on this edge
    "confidence"        DOUBLE PRECISION,
    -- 0–100 relationship strength (decays if not refreshed)
    "strength"          INTEGER,
    "notes"             TEXT,

    "first_seen_at"     TIMESTAMPTZ(6),
    "last_seen_at"      TIMESTAMPTZ(6),

    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_relationships_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "operator_relationships"
    ADD CONSTRAINT "operator_relationships_source_person_id_fkey"
    FOREIGN KEY ("source_person_id") REFERENCES "startup_professionals"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operator_relationships"
    ADD CONSTRAINT "operator_relationships_target_person_id_fkey"
    FOREIGN KEY ("target_person_id") REFERENCES "startup_professionals"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operator_relationships"
    ADD CONSTRAINT "operator_relationships_target_company_id_fkey"
    FOREIGN KEY ("target_company_id") REFERENCES "operator_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Prevent duplicate person→person edges of the same type
CREATE UNIQUE INDEX "operator_relationships_person_person_edge_key"
    ON "operator_relationships"("source_person_id", "target_person_id", "edge_type")
    WHERE "target_person_id" IS NOT NULL;

CREATE INDEX "operator_relationships_source_person_id_idx"  ON "operator_relationships"("source_person_id");
CREATE INDEX "operator_relationships_target_person_id_idx"  ON "operator_relationships"("target_person_id");
CREATE INDEX "operator_relationships_target_company_id_idx" ON "operator_relationships"("target_company_id");
CREATE INDEX "operator_relationships_edge_type_idx"         ON "operator_relationships"("edge_type");
