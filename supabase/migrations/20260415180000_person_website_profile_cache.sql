-- Cache for /api/person-website-profile (avoids repeated scrapes per firm+name).
-- firm_investors.profile_image_last_fetched_at: throttle scrape attempts per investor row.

CREATE TABLE IF NOT EXISTS public.person_website_profile_cache (
  cache_key          text PRIMARY KEY,
  firm_website_host  text NOT NULL,
  full_name_norm     text NOT NULL,
  profile            jsonb NOT NULL,
  fetched_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_person_website_profile_cache_fetched_at
  ON public.person_website_profile_cache (fetched_at DESC);

COMMENT ON TABLE public.person_website_profile_cache IS
  'Server-side cache for person-website-profile API responses (JSON payload).';

ALTER TABLE public.firm_investors
  ADD COLUMN IF NOT EXISTS profile_image_last_fetched_at timestamptz;

COMMENT ON COLUMN public.firm_investors.profile_image_last_fetched_at IS
  'Last time the app attempted a person-website-profile / headshot scrape for this row; used to throttle repeat work.';

ALTER TABLE public.person_website_profile_cache ENABLE ROW LEVEL SECURITY;
