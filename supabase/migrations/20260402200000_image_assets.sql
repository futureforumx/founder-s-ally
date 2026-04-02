-- Migration: Image asset tables for firm logos and investor headshots
-- Assets are stored in Cloudflare R2; metadata tracked here.
-- approval_state gates what's shown in the product (only 'approved' assets are displayed).

CREATE TYPE IF NOT EXISTS image_format_enum AS ENUM ('svg', 'png', 'webp', 'jpg', 'gif');
CREATE TYPE IF NOT EXISTS image_source_enum AS ENUM ('signal_nfx', 'clearbit', 'linkedin', 'manual', 'gravatar', 'unavatar', 'other');
CREATE TYPE IF NOT EXISTS image_quality_enum AS ENUM ('original', 'high', 'compressed');
CREATE TYPE IF NOT EXISTS approval_state_enum AS ENUM ('pending', 'approved', 'rejected');

-- ── Firm logo assets ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.logo_assets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id          uuid NOT NULL REFERENCES public.firm_records(id) ON DELETE CASCADE,
  r2_key           text NOT NULL,           -- e.g. "firms/homebrew/logo.svg"
  cdn_url          text NOT NULL,           -- public CDN URL served by Cloudflare
  format           image_format_enum NOT NULL DEFAULT 'png',
  source           image_source_enum NOT NULL DEFAULT 'signal_nfx',
  source_url       text,                    -- original URL it was fetched from
  quality          image_quality_enum NOT NULL DEFAULT 'original',
  file_size_bytes  integer,
  width_px         integer,
  height_px        integer,
  approval_state   approval_state_enum NOT NULL DEFAULT 'pending',
  approved_by      text,                    -- user ID or email of approver
  approved_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, r2_key)
);

CREATE INDEX IF NOT EXISTS idx_logo_assets_firm_id        ON public.logo_assets (firm_id);
CREATE INDEX IF NOT EXISTS idx_logo_assets_approval_state ON public.logo_assets (approval_state);
CREATE INDEX IF NOT EXISTS idx_logo_assets_source         ON public.logo_assets (source);

-- ── Investor headshot assets ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.headshot_assets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id      uuid NOT NULL REFERENCES public.firm_investors(id) ON DELETE CASCADE,
  r2_key           text NOT NULL,           -- e.g. "investors/satya-patel/headshot.jpg"
  cdn_url          text NOT NULL,
  format           image_format_enum NOT NULL DEFAULT 'jpg',
  source           image_source_enum NOT NULL DEFAULT 'signal_nfx',
  source_url       text,
  quality          image_quality_enum NOT NULL DEFAULT 'original',
  file_size_bytes  integer,
  width_px         integer,
  height_px        integer,
  approval_state   approval_state_enum NOT NULL DEFAULT 'pending',
  approved_by      text,
  approved_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (investor_id, r2_key)
);

CREATE INDEX IF NOT EXISTS idx_headshot_assets_investor_id    ON public.headshot_assets (investor_id);
CREATE INDEX IF NOT EXISTS idx_headshot_assets_approval_state ON public.headshot_assets (approval_state);
CREATE INDEX IF NOT EXISTS idx_headshot_assets_source         ON public.headshot_assets (source);

-- ── Helper view: active logo per firm (only approved) ────────────────────────

CREATE OR REPLACE VIEW public.firm_active_logo AS
SELECT DISTINCT ON (firm_id)
  firm_id,
  cdn_url,
  format,
  source,
  r2_key
FROM public.logo_assets
WHERE approval_state = 'approved'
ORDER BY firm_id, created_at DESC;

-- ── Helper view: active headshot per investor (only approved) ────────────────

CREATE OR REPLACE VIEW public.investor_active_headshot AS
SELECT DISTINCT ON (investor_id)
  investor_id,
  cdn_url,
  format,
  source,
  r2_key
FROM public.headshot_assets
WHERE approval_state = 'approved'
ORDER BY investor_id, created_at DESC;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.logo_assets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.headshot_assets ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all approved assets
CREATE POLICY "approved_logo_assets_readable" ON public.logo_assets
  FOR SELECT USING (approval_state = 'approved');

CREATE POLICY "approved_headshot_assets_readable" ON public.headshot_assets
  FOR SELECT USING (approval_state = 'approved');

-- Service role can do everything (bypasses RLS by default)

COMMENT ON TABLE public.logo_assets IS
  'Cloudflare R2-backed firm logo assets. Only approved assets are shown in the product.';
COMMENT ON TABLE public.headshot_assets IS
  'Cloudflare R2-backed investor headshot assets. Only approved assets are shown in the product.';
