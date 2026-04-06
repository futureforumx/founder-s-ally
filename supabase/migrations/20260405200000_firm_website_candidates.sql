-- Lightweight sidecar table for website enrichment review candidates.
-- Stores plausible but uncertain website matches that need human review
-- before being promoted to firm_records.website_url.
--
-- Canonical (high-confidence) matches bypass this table entirely and
-- write directly to firm_records.website_url as before.

CREATE TABLE IF NOT EXISTS firm_website_candidates (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_id       uuid NOT NULL REFERENCES firm_records(id) ON DELETE CASCADE,
  candidate_url text NOT NULL,
  domain        text NOT NULL,           -- root domain, e.g. "acme.vc"
  score         numeric(4,1) NOT NULL,   -- composite match score
  confidence    text NOT NULL DEFAULT 'review',  -- 'canonical' | 'review' | 'rejected'
  source        text NOT NULL,           -- 'exa' | 'tavily'
  reason        text,                    -- why it landed in review
  competing_url text,                    -- runner-up domain if ambiguity detected
  competing_score numeric(4,1),          -- runner-up score
  fetch_method  text,                    -- 'jina' | 'raw' | 'scrapingbee' | 'none'
  created_at    timestamptz DEFAULT now(),

  -- One candidate per firm per domain (idempotent upserts)
  UNIQUE(firm_id, domain)
);

-- Fast lookups by firm and by confidence for review workflows
CREATE INDEX IF NOT EXISTS idx_fwc_firm_id ON firm_website_candidates(firm_id);
CREATE INDEX IF NOT EXISTS idx_fwc_confidence ON firm_website_candidates(confidence);
CREATE INDEX IF NOT EXISTS idx_fwc_score ON firm_website_candidates(score DESC);

COMMENT ON TABLE firm_website_candidates IS
  'Website enrichment review queue. High-confidence matches go directly to firm_records.website_url; uncertain matches land here for human review.';
