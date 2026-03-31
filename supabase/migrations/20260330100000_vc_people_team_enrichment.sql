-- ============================================================
-- Migration: vc_people — team-page enrichment fields
-- Adds: medium_url, substack_url, investment_themes,
--       articles (JSONB), team_page_scraped_at
-- ============================================================

ALTER TABLE vc_people
  ADD COLUMN IF NOT EXISTS medium_url           TEXT,
  ADD COLUMN IF NOT EXISTS substack_url         TEXT,
  ADD COLUMN IF NOT EXISTS investment_themes    TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS articles             JSONB,
  ADD COLUMN IF NOT EXISTS team_page_scraped_at TIMESTAMPTZ;

-- Index for finding recently scraped (or never-scraped) people
CREATE INDEX IF NOT EXISTS idx_vc_people_team_page_scraped_at
  ON vc_people (team_page_scraped_at ASC NULLS FIRST);
