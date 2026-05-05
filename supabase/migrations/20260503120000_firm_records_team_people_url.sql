-- Firm-level URL for team / people listings (e.g. LinkedIn company people page, /team on website).
-- Used by admin + future scrapers to refresh linked investors; one URL per firm.
ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS team_people_url text;

COMMENT ON COLUMN public.firm_records.team_people_url IS
  'Public URL listing firm team/people (for enrichment scrapes). Distinct from individual LinkedIn profiles.';
