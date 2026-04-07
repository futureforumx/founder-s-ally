-- Avatar canonicalization: add metadata columns for R2-hosted headshots
-- investor_partners already has avatar_url; add source tracking fields.

ALTER TABLE public.investor_partners
  ADD COLUMN IF NOT EXISTS avatar_source_url       text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avatar_source_type       text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avatar_last_verified_at  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avatar_confidence         real DEFAULT NULL;

COMMENT ON COLUMN public.investor_partners.avatar_url              IS 'Canonical R2-hosted headshot URL (never a third-party URL)';
COMMENT ON COLUMN public.investor_partners.avatar_source_url       IS 'Original third-party URL the headshot was fetched from';
COMMENT ON COLUMN public.investor_partners.avatar_source_type      IS 'Source type: signal_nfx, linkedin, x_twitter, manual, etc.';
COMMENT ON COLUMN public.investor_partners.avatar_last_verified_at IS 'When the headshot was last verified as a valid image';
COMMENT ON COLUMN public.investor_partners.avatar_confidence        IS 'Confidence score 0.0–1.0 that the headshot belongs to this person';
