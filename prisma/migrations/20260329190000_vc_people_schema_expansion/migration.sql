-- =============================================================================
-- Migration: vc_people_schema_expansion
-- Expands the vc_people table with the full individual_investor_profile schema.
-- Also creates two new tables:
--   • vc_person_content       — published insights / articles per person
--   • user_investor_relationships — user-specific relationship intelligence
--
-- Design notes:
--   • Scalar, filterable fields → typed columns with indexes
--   • Rich nested / variable-length fields → JSONB (flexible, no migration per field change)
--   • Relationship intelligence lives in its OWN table (user-specific, not global)
--   • Scores stay as individual columns for fast ORDER BY / WHERE; also mirrored
--     into a scores JSONB blob for convenient reads
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- NEW ENUMS
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "VerificationStatus" AS ENUM (
    'VERIFIED', 'UNVERIFIED', 'STALE', 'DISPUTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InvestorType" AS ENUM (
    'GENERAL_PARTNER', 'VENTURE_PARTNER', 'PARTNER', 'PRINCIPAL',
    'ASSOCIATE', 'ANALYST', 'SCOUT', 'ANGEL', 'ADVISOR', 'OPERATOR', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SeniorityLevel" AS ENUM (
    'C_SUITE', 'MANAGING_PARTNER', 'GENERAL_PARTNER', 'PARTNER',
    'VENTURE_PARTNER', 'PRINCIPAL', 'ASSOCIATE', 'ANALYST', 'SCOUT', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AffiliationType" AS ENUM (
    'EMPLOYEE', 'VENTURE_PARTNER', 'SCOUT', 'ADVISOR', 'LP', 'EIR', 'ANGEL', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ContactabilityStatus" AS ENUM (
    'OPEN', 'WARM_INTRO_ONLY', 'CLOSED', 'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ContentType" AS ENUM (
    'BLOG_POST', 'TWEET', 'LINKEDIN_POST', 'PODCAST', 'VIDEO',
    'NEWSLETTER', 'PRESS', 'INTERVIEW', 'RESEARCH', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTEND: vc_people
-- ─────────────────────────────────────────────────────────────────────────────

-- Identity & metadata
ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "full_name"               TEXT,
  ADD COLUMN IF NOT EXISTS "slug"                    TEXT,
  ADD COLUMN IF NOT EXISTS "profile_image_url"       TEXT,           -- preferred alias over avatar_url
  ADD COLUMN IF NOT EXISTS "is_active"               BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "investor_type"           "InvestorType",
  ADD COLUMN IF NOT EXISTS "source_confidence"       DOUBLE PRECISION CHECK (source_confidence BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS "verification_status"     "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS "last_verified_at"        TIMESTAMPTZ;

-- Location (extends existing city/state/country scalars)
ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "postal_code"             TEXT,
  ADD COLUMN IF NOT EXISTS "raw_location"            TEXT;           -- freeform string from source, e.g. "SF Bay Area"

-- Background (structured, replaces freeform text fields)
ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "notable_credentials"     TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "personal_qualities"      TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "areas_of_expertise"      JSONB,
  -- { sectors: string[], functions: string[], themes: string[] }
  ADD COLUMN IF NOT EXISTS "prior_companies"         JSONB,
  -- [{ company_name, role, start_date, end_date }]
  ADD COLUMN IF NOT EXISTS "prior_roles"             JSONB,
  -- [{ role_title, organization_name, start_date, end_date }]
  ADD COLUMN IF NOT EXISTS "education"               JSONB;
  -- [{ institution, degree, field_of_study, start_year, end_year }]

-- Affiliation (primary firm; full history → affiliations JSONB)
ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "primary_firm_name"       TEXT,           -- denormalized for read speed
  ADD COLUMN IF NOT EXISTS "affiliation_type"        "AffiliationType",
  ADD COLUMN IF NOT EXISTS "seniority"               "SeniorityLevel",
  ADD COLUMN IF NOT EXISTS "affiliation_start_date"  DATE,
  ADD COLUMN IF NOT EXISTS "affiliation_end_date"    DATE,
  ADD COLUMN IF NOT EXISTS "is_primary_affiliation"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "affiliations"            JSONB;
  -- [{ firm_id, firm_name, title, affiliation_type, seniority,
  --    start_date, end_date, is_primary }]

-- Contact details (extends existing email/phone/linkedin_url/x_url/website_url)
ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "preferred_contact_method"  TEXT,
  ADD COLUMN IF NOT EXISTS "contactability_status"     "ContactabilityStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS "assistant_contact"         TEXT;

-- Investing preferences (extends existing stage_focus/sector_focus/check_size_min/max)
ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "geography_focus"             TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "business_models"             TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "investment_criteria_qualities" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "check_size_avg_usd"          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "lead_or_follow"              "LeadFollowPreference",
  ADD COLUMN IF NOT EXISTS "ownership_target_pct"        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "board_seat_preference"       TEXT,       -- 'REQUIRED' | 'PREFERRED' | 'FLEXIBLE' | 'NONE'
  ADD COLUMN IF NOT EXISTS "solo_founder_preference"     TEXT,       -- 'YES' | 'NO' | 'NEUTRAL'
  ADD COLUMN IF NOT EXISTS "thesis_summary"              TEXT;

-- Network & co-investing
ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "co_investors"            JSONB;
  -- { firms: string[], investors: string[], recent_coinvestors: string[],
  --   coinvestment_count: int, last_coinvestment_at: date }

-- Trends & themes
ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "trends"                  JSONB;
  -- { current_themes: string[], market_interests: string[],
  --   focus_shifts: string[], latest_insights_summary: string }

-- Activity signals
ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "activity"                JSONB;
  -- { last_seen_active_at, recent_content_count_90d, recent_investments_count_12m,
  --   active_deployment_signal: bool, data_freshness_score: float }

-- Investments (JSONB for denormalized quick reads;
--   canonical records live in vc_investments via person_id FK below)
ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "recent_investments"      JSONB,
  -- [{ company_name, company_id, sector, stage, check_size,
  --    location, date, lead_or_follow, source_url }]
  ADD COLUMN IF NOT EXISTS "notable_investments"     JSONB;
  -- [{ company_name, company_id, sector, stage, outcome, source_url }]

-- Comprehensive scores blob (individual columns kept for index/sort performance)
ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "scores"                  JSONB,
  -- { match_score, reputation_score, founder_sentiment_score,
  --   industry_reputation_score, responsiveness_score,
  --   founder_satisfaction_score, value_add_score,
  --   network_strength_score, active_deployment_score,
  --   confidence_score, score_explanations: Record<string,string> }
  ADD COLUMN IF NOT EXISTS "founder_sentiment_score"  INTEGER,
  ADD COLUMN IF NOT EXISTS "founder_satisfaction_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "active_deployment_score"   INTEGER,
  ADD COLUMN IF NOT EXISTS "confidence_score"          INTEGER;

-- Data provenance (source URLs for where this record's data came from)
ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "data_provenance_urls"    JSONB;
  -- { firm_website, personal_website, crunchbase, angellist,
  --   openvc, signal_nfx, vcsheet, vcprodatabase, trustfinta,
  --   other_links: string[] }

-- Published content (JSONB summary; full records in vc_person_content)
ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "published_content"       JSONB;
  -- [{ title, published_at, content_type, source_name,
  --    source_url, summary, themes: string[] }]

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTEND: vc_investments — add lead_person_id so deals link back to individuals
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "vc_investments"
  ADD COLUMN IF NOT EXISTS "lead_person_id"          TEXT,
  ADD COLUMN IF NOT EXISTS "is_notable"              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "source_url"              TEXT;

ALTER TABLE "vc_investments"
  ADD CONSTRAINT "vc_investments_lead_person_id_fkey"
  FOREIGN KEY ("lead_person_id")
  REFERENCES "vc_people"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- NEW TABLE: vc_person_content
-- Published insights, articles, tweets, podcast appearances, etc.
-- Keeps vc_people lean; full-text search runs here.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "vc_person_content" (
    "id"            TEXT        NOT NULL,
    "person_id"     TEXT        NOT NULL,
    "firm_id"       TEXT,
    "title"         TEXT        NOT NULL,
    "published_at"  TIMESTAMPTZ,
    "content_type"  "ContentType" NOT NULL DEFAULT 'OTHER',
    "source_name"   TEXT,
    "source_url"    TEXT,
    "summary"       TEXT,
    "themes"        TEXT[]      DEFAULT ARRAY[]::TEXT[],
    "is_featured"   BOOLEAN     NOT NULL DEFAULT false,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at"    TIMESTAMPTZ,

    CONSTRAINT "vc_person_content_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vc_person_content"
  ADD CONSTRAINT "vc_person_content_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "vc_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vc_person_content"
  ADD CONSTRAINT "vc_person_content_firm_id_fkey"
  FOREIGN KEY ("firm_id") REFERENCES "vc_firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- NEW TABLE: user_investor_relationships
-- Relationship intelligence is USER-SPECIFIC — it changes per viewer.
-- Storing it on vc_people would mean every user's data overwrites others.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user_investor_relationships" (
    "id"                          TEXT        NOT NULL,
    "user_id"                     TEXT        NOT NULL,  -- Clerk user ID
    "person_id"                   TEXT        NOT NULL,
    "firm_id"                     TEXT,

    -- Relationship strength
    "relationship_strength_score" INTEGER     CHECK (relationship_strength_score BETWEEN 0 AND 100),
    "last_interaction_at"         TIMESTAMPTZ,

    -- Intro path intelligence
    "warm_intro_paths_count"      INTEGER     NOT NULL DEFAULT 0,
    "mutual_connections_count"    INTEGER     NOT NULL DEFAULT 0,
    "best_intro_source_person_id" TEXT,
    "best_intro_source_name"      TEXT,

    -- Engagement history
    "contacted_at"                TIMESTAMPTZ,
    "responded_at"                TIMESTAMPTZ,
    "meeting_held_at"             TIMESTAMPTZ,
    "status"                      TEXT,       -- 'not_contacted' | 'in_progress' | 'passed' | 'portfolio'
    "notes"                       TEXT,
    "tags"                        TEXT[]      DEFAULT ARRAY[]::TEXT[],

    "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at"                  TIMESTAMPTZ,

    CONSTRAINT "user_investor_relationships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_investor_relationships_user_person_key" UNIQUE ("user_id", "person_id")
);

ALTER TABLE "user_investor_relationships"
  ADD CONSTRAINT "uir_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "vc_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES — vc_people new columns
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "vc_people_slug_key"
  ON "vc_people"("slug") WHERE "slug" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "vc_people_verification_status_idx"
  ON "vc_people"("verification_status");

CREATE INDEX IF NOT EXISTS "vc_people_investor_type_idx"
  ON "vc_people"("investor_type");

CREATE INDEX IF NOT EXISTS "vc_people_seniority_idx"
  ON "vc_people"("seniority");

CREATE INDEX IF NOT EXISTS "vc_people_contactability_status_idx"
  ON "vc_people"("contactability_status");

CREATE INDEX IF NOT EXISTS "vc_people_lead_or_follow_idx"
  ON "vc_people"("lead_or_follow");

CREATE INDEX IF NOT EXISTS "vc_people_last_verified_at_idx"
  ON "vc_people"("last_verified_at");

CREATE INDEX IF NOT EXISTS "vc_people_founder_sentiment_score_idx"
  ON "vc_people"("founder_sentiment_score");

CREATE INDEX IF NOT EXISTS "vc_people_confidence_score_idx"
  ON "vc_people"("confidence_score");

CREATE INDEX IF NOT EXISTS "vc_people_active_deployment_score_idx"
  ON "vc_people"("active_deployment_score");

CREATE INDEX IF NOT EXISTS "vc_people_geography_focus_idx"
  ON "vc_people" USING GIN ("geography_focus");

CREATE INDEX IF NOT EXISTS "vc_people_business_models_idx"
  ON "vc_people" USING GIN ("business_models");

CREATE INDEX IF NOT EXISTS "vc_people_personal_qualities_idx"
  ON "vc_people" USING GIN ("personal_qualities");

CREATE INDEX IF NOT EXISTS "vc_people_investment_criteria_qualities_idx"
  ON "vc_people" USING GIN ("investment_criteria_qualities");

-- GIN indexes on JSONB for fast key lookups
CREATE INDEX IF NOT EXISTS "vc_people_areas_of_expertise_gin_idx"
  ON "vc_people" USING GIN ("areas_of_expertise");

CREATE INDEX IF NOT EXISTS "vc_people_trends_gin_idx"
  ON "vc_people" USING GIN ("trends");

CREATE INDEX IF NOT EXISTS "vc_people_co_investors_gin_idx"
  ON "vc_people" USING GIN ("co_investors");

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES — vc_person_content
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "vc_person_content_person_id_idx"
  ON "vc_person_content"("person_id");

CREATE INDEX IF NOT EXISTS "vc_person_content_firm_id_idx"
  ON "vc_person_content"("firm_id");

CREATE INDEX IF NOT EXISTS "vc_person_content_published_at_idx"
  ON "vc_person_content"("published_at" DESC);

CREATE INDEX IF NOT EXISTS "vc_person_content_content_type_idx"
  ON "vc_person_content"("content_type");

CREATE INDEX IF NOT EXISTS "vc_person_content_themes_gin_idx"
  ON "vc_person_content" USING GIN ("themes");

CREATE INDEX IF NOT EXISTS "vc_person_content_deleted_at_idx"
  ON "vc_person_content"("deleted_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES — user_investor_relationships
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "uir_user_id_idx"
  ON "user_investor_relationships"("user_id");

CREATE INDEX IF NOT EXISTS "uir_person_id_idx"
  ON "user_investor_relationships"("person_id");

CREATE INDEX IF NOT EXISTS "uir_status_idx"
  ON "user_investor_relationships"("status");

CREATE INDEX IF NOT EXISTS "uir_relationship_strength_score_idx"
  ON "user_investor_relationships"("relationship_strength_score");

CREATE INDEX IF NOT EXISTS "uir_deleted_at_idx"
  ON "user_investor_relationships"("deleted_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- POPULATE: full_name from existing first_name + last_name
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE "vc_people"
SET "full_name" = TRIM(COALESCE("first_name", '') || ' ' || COALESCE("last_name", ''))
WHERE "full_name" IS NULL
  AND ("first_name" IS NOT NULL OR "last_name" IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- POPULATE: slug from full_name (lowercase, hyphenated)
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE "vc_people"
SET "slug" = LOWER(REGEXP_REPLACE(TRIM("full_name"), '\s+', '-', 'g'))
WHERE "slug" IS NULL AND "full_name" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- POPULATE: profile_image_url from existing avatar_url
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE "vc_people"
SET "profile_image_url" = "avatar_url"
WHERE "profile_image_url" IS NULL AND "avatar_url" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- POPULATE: is_active from existing is_actively_investing
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE "vc_people"
SET "is_active" = "is_actively_investing";
