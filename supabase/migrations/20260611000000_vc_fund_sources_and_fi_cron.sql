-- ── pipeline_source_config ───────────────────────────────────────────────────
-- Admin-configurable source registry for vc_funds and fi_deals pipelines.
-- (fi_sources is the internal engine table; this is the admin-editable config layer)

CREATE TABLE IF NOT EXISTS public.vc_fund_sources (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key    text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  description   text,
  base_url      text,
  enabled       boolean     NOT NULL DEFAULT true,
  max_items     int         NOT NULL DEFAULT 100,
  cron_schedule text,
  notes         text,
  last_run_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vc_fund_sources_enabled ON public.vc_fund_sources (enabled) WHERE enabled;

ALTER TABLE public.vc_fund_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY vc_fund_sources_service_all ON public.vc_fund_sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY vc_fund_sources_select_authenticated ON public.vc_fund_sources
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER vc_fund_sources_touch_updated_at
  BEFORE UPDATE ON public.vc_fund_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.vc_fund_sources (source_key, name, description, base_url, enabled, max_items)
VALUES
  ('TECHCRUNCH_VENTURE',           'TechCrunch Venture',          'RSS feed from TechCrunch venture category',                   'https://techcrunch.com/category/venture/',                                                             true, 400),
  ('ALLEYWATCH_FUNDING',           'AlleyWatch Funding',          'RSS feed from AlleyWatch funding category',                   'https://www.alleywatch.com/category/funding/',                                                         true, 300),
  ('TECHCRUNCH_FUNDING_TAG',       'TechCrunch Funding Tag',      'Web scraper targeting TechCrunch /tag/funding/ listing page', 'https://techcrunch.com/tag/funding/',                                                                  true, 300),
  ('PRNEWSWIRE_VENTURE_CAPITAL',   'PR Newswire Venture Capital', 'PR Newswire press releases – venture capital category',      'https://www.prnewswire.com/news-releases/financial-services-latest-news/venture-capital-list/',         true, 250),
  ('VCSHEET_FUNDS',                'VC Sheet Funds',              'Web scraper for vcsheet.com/funds listing page',              'https://www.vcsheet.com/funds',                                                                        true, 150),
  ('SHAI_GOLDMAN_NEW_FUNDS_SHEET', 'Shai Goldman New Funds',      'Community-curated spreadsheet of newly announced VC funds',  null,                                                                                                   true, 400)
ON CONFLICT (source_key) DO NOTHING;

-- ── Add cron_schedule to fi_sources ─────────────────────────────────────────
ALTER TABLE public.fi_sources ADD COLUMN IF NOT EXISTS cron_schedule text;
