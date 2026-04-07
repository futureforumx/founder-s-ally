-- Avatar canonicalization: add metadata columns to vc_people for R2-hosted headshots.

ALTER TABLE "vc_people"
  ADD COLUMN IF NOT EXISTS "avatar_source_url"       TEXT,
  ADD COLUMN IF NOT EXISTS "avatar_source_type"       TEXT,
  ADD COLUMN IF NOT EXISTS "avatar_last_verified_at"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "avatar_confidence"         REAL;
