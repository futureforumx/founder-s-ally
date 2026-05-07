-- Singleton admin config for Fresh Capital enrichment UI (Fund Watch notes + source keys reference).
-- CI still reads VC_FUND_SOURCE_KEYS from secrets; this table documents intent and optional comma-separated keys for operators.

CREATE TABLE IF NOT EXISTS public.fresh_capital_enrichment_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  fund_watch_source_keys text,
  fund_watch_schedule_note text,
  latest_funding_schedule_note text,
  process_notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.fresh_capital_enrichment_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS fresh_capital_enrichment_settings_updated_at ON public.fresh_capital_enrichment_settings;
CREATE TRIGGER fresh_capital_enrichment_settings_updated_at
  BEFORE UPDATE ON public.fresh_capital_enrichment_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fresh_capital_enrichment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fresh_capital_enrichment_settings_service_all"
  ON public.fresh_capital_enrichment_settings;

CREATE POLICY "fresh_capital_enrichment_settings_service_all"
  ON public.fresh_capital_enrichment_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.fresh_capital_enrichment_settings IS
  'Operator-editable notes and optional VC_FUND_SOURCE_KEYS-style list for Fresh Capital admin (Fund Watch vs Latest Funding).';
