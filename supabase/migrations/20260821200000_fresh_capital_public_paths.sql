-- Public URL path aliases for Fresh Capital (e.g. /fresh-capital → New Funds or Latest Funding).

CREATE TABLE IF NOT EXISTS public.fresh_capital_public_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path_slug text NOT NULL UNIQUE,
  destination text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fresh_capital_public_paths_slug_format
    CHECK (path_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(path_slug) BETWEEN 1 AND 64),
  CONSTRAINT fresh_capital_public_paths_destination_check
    CHECK (destination IN ('new_funds', 'latest_funding'))
);

DROP TRIGGER IF EXISTS fresh_capital_public_paths_updated_at ON public.fresh_capital_public_paths;
CREATE TRIGGER fresh_capital_public_paths_updated_at
  BEFORE UPDATE ON public.fresh_capital_public_paths
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fresh_capital_public_paths ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fresh_capital_public_paths_select_public"
  ON public.fresh_capital_public_paths;
CREATE POLICY "fresh_capital_public_paths_select_public"
  ON public.fresh_capital_public_paths
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "fresh_capital_public_paths_service_all"
  ON public.fresh_capital_public_paths;
CREATE POLICY "fresh_capital_public_paths_service_all"
  ON public.fresh_capital_public_paths
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.fresh_capital_public_paths IS
  'Operator-defined public path aliases (e.g. fresh-capital) that open New Funds or Latest Funding.';

GRANT SELECT ON TABLE public.fresh_capital_public_paths TO anon, authenticated;
GRANT ALL ON TABLE public.fresh_capital_public_paths TO service_role;

INSERT INTO public.fresh_capital_public_paths (path_slug, destination)
VALUES
  ('fresh-capital', 'new_funds'),
  ('fund-watch', 'new_funds'),
  ('freshcapital', 'new_funds'),
  ('fundwatch', 'new_funds'),
  ('newfunds', 'new_funds')
ON CONFLICT (path_slug) DO NOTHING;
