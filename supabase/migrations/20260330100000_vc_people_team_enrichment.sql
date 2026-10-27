-- ============================================================
-- Migration: vc_people — team-page enrichment fields
-- Adds: medium_url, substack_url, investment_themes,
--       articles (JSONB), team_page_scraped_at
-- vc_people is not created by this migration history.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.vc_people') IS NULL THEN
    RAISE NOTICE 'vc_people is not present; skipping team-page enrichment columns';
    RETURN;
  END IF;

  ALTER TABLE vc_people
    ADD COLUMN IF NOT EXISTS medium_url           TEXT,
    ADD COLUMN IF NOT EXISTS substack_url         TEXT,
    ADD COLUMN IF NOT EXISTS investment_themes    TEXT[]      NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS articles             JSONB,
    ADD COLUMN IF NOT EXISTS team_page_scraped_at TIMESTAMPTZ;

  CREATE INDEX IF NOT EXISTS idx_vc_people_team_page_scraped_at
    ON vc_people (team_page_scraped_at ASC NULLS FIRST);
END $$;
