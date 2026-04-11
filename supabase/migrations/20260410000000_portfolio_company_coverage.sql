-- =============================================================================
-- Migration: Portfolio company coverage pipeline
-- =============================================================================
-- 1. Extends firm_recent_deals with source attribution, evidence linkage,
--    normalization, and is_notable flag.
-- 2. Adds missing columns to the existing portfolio_source_evidence table
--    and a unique constraint for idempotent upserts.
-- 3. Extends enrichment_review_queue entity types for portfolio review items.
-- =============================================================================

-- ── 1. Extend firm_recent_deals ───────────────────────────────────────────────

ALTER TABLE public.firm_recent_deals
  ADD COLUMN IF NOT EXISTS normalized_company_name   text,
  ADD COLUMN IF NOT EXISTS source_name               text,     -- 'signal_nfx' | 'cb_insights' | 'merged' | 'manual'
  ADD COLUMN IF NOT EXISTS source_firm_name          text,
  ADD COLUMN IF NOT EXISTS portfolio_company_website text,
  ADD COLUMN IF NOT EXISTS portfolio_company_linkedin text,
  ADD COLUMN IF NOT EXISTS portfolio_company_slug    text,
  ADD COLUMN IF NOT EXISTS investment_status         text,     -- 'active' | 'exited' | 'acquired' | 'ipo' | 'unknown'
  ADD COLUMN IF NOT EXISTS is_notable                boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_url                text,
  ADD COLUMN IF NOT EXISTS source_confidence         numeric(3,2) DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS raw_payload               jsonb,
  ADD COLUMN IF NOT EXISTS canonical_company_id      text,     -- cuid ref to operator_companies in Prisma DB
  ADD COLUMN IF NOT EXISTS updated_at                timestamptz DEFAULT now();

-- Backfill normalized_company_name for all existing rows
UPDATE public.firm_recent_deals
SET normalized_company_name = lower(trim(regexp_replace(company_name, '\s+', ' ', 'g')))
WHERE normalized_company_name IS NULL
  AND company_name IS NOT NULL;

-- Remove duplicates before adding unique index.
-- Keep the row with the latest date_announced; break ties by earliest created_at.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY firm_id, normalized_company_name
           ORDER BY date_announced DESC NULLS LAST, created_at ASC
         ) AS rn
  FROM public.firm_recent_deals
  WHERE normalized_company_name IS NOT NULL
)
DELETE FROM public.firm_recent_deals
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Unique index: one canonical portfolio link per firm per company name
CREATE UNIQUE INDEX IF NOT EXISTS firm_recent_deals_firm_norm_name_key
  ON public.firm_recent_deals (firm_id, normalized_company_name)
  WHERE normalized_company_name IS NOT NULL;

-- Supporting indexes
CREATE INDEX IF NOT EXISTS firm_recent_deals_source_name_idx ON public.firm_recent_deals (source_name);
CREATE INDEX IF NOT EXISTS firm_recent_deals_is_notable_idx  ON public.firm_recent_deals (is_notable);

-- ── 2. Extend existing portfolio_source_evidence table ───────────────────────
-- The table already exists with: id, portfolio_company_id, investment_id,
-- firm_id, source_type, source_name, source_firm_name, portfolio_company_name,
-- normalized_portfolio_company_name, portfolio_company_website,
-- portfolio_company_linkedin, portfolio_company_slug, investment_status,
-- investment_stage, investment_date (timestamptz), announced_date (timestamptz),
-- source_url, source_confidence, raw_payload, category, discovered_at, created_at

-- Add is_notable column (missing from original schema)
ALTER TABLE public.portfolio_source_evidence
  ADD COLUMN IF NOT EXISTS is_notable boolean DEFAULT false;

-- Add a unique constraint for idempotent upserts per source+firm+company
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pse_firm_source_name_unique'
      AND conrelid = 'public.portfolio_source_evidence'::regclass
  ) THEN
    ALTER TABLE public.portfolio_source_evidence
      ADD CONSTRAINT pse_firm_source_name_unique
        UNIQUE (firm_id, source_name, normalized_portfolio_company_name);
  END IF;
END $$;

-- ── 3. Extend enrichment_review_queue entity types ───────────────────────────
ALTER TYPE public.review_entity_type ADD VALUE IF NOT EXISTS 'portfolio_link';
ALTER TYPE public.review_entity_type ADD VALUE IF NOT EXISTS 'portfolio_company_match';
ALTER TYPE public.review_entity_type ADD VALUE IF NOT EXISTS 'portfolio_firm_mapping';
