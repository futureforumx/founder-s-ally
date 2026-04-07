-- Add avatar provenance / quality-control columns to firm_investors.
-- These columns power the audit-repair pipeline and prevent future
-- bad avatar writes.

ALTER TABLE public.firm_investors
  ADD COLUMN IF NOT EXISTS avatar_source_url        TEXT,
  ADD COLUMN IF NOT EXISTS avatar_source_type       TEXT,
  ADD COLUMN IF NOT EXISTS avatar_confidence        NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS avatar_last_verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avatar_needs_review      BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.firm_investors.avatar_source_url IS
  'Original URL the headshot was discovered at before it was uploaded to R2 (provenance trail).';

COMMENT ON COLUMN public.firm_investors.avatar_source_type IS
  'Source category of the avatar: r2_canonical | nfx | webflow | unavatar | apollo | pdl | linkedin_direct | x_direct | manual | other.';

COMMENT ON COLUMN public.firm_investors.avatar_confidence IS
  'Person-photo match confidence score 0.00–1.00. Values below 0.70 are routed to avatar_needs_review.';

COMMENT ON COLUMN public.firm_investors.avatar_last_verified_at IS
  'Last timestamp when avatar_url was confirmed reachable with a valid image/* response.';

COMMENT ON COLUMN public.firm_investors.avatar_needs_review IS
  'Set TRUE when automated confidence is too low for auto-assignment, or when the URL is suspected to be a mismatch.';

-- Back-fill avatar_needs_review=TRUE for known-bad rows already in the table:
-- 1. Truncated Webflow CDN URLs (filename ends with "%20(" — missing ext + closing paren)
UPDATE public.firm_investors
SET avatar_needs_review = TRUE
WHERE avatar_url LIKE '%website-files.com%'
  AND (
    avatar_url NOT LIKE '%.avif'
    AND avatar_url NOT LIKE '%.jpg'
    AND avatar_url NOT LIKE '%.jpeg'
    AND avatar_url NOT LIKE '%.png'
    AND avatar_url NOT LIKE '%.webp'
    AND avatar_url NOT LIKE '%.gif'
    AND avatar_url NOT LIKE '%.svg'
  );

-- 2. NULL avatar_url that are ready_for_live (data gap)
UPDATE public.firm_investors
SET avatar_needs_review = TRUE
WHERE avatar_url IS NULL
  AND ready_for_live = TRUE;
