-- Allow public (anon key) read of active VC directory rows so the app works without
-- passing a Clerk JWT that Supabase can verify. Publishable key is already public in the browser.
-- RLS must be enabled (no-op if already on from a prior migration).

ALTER TABLE public.vc_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_source_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_score_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read active vc_firms" ON public.vc_firms;
DROP POLICY IF EXISTS "Anon read active vc_funds" ON public.vc_funds;
DROP POLICY IF EXISTS "Anon read active vc_people" ON public.vc_people;
DROP POLICY IF EXISTS "Anon read active vc_investments" ON public.vc_investments;
DROP POLICY IF EXISTS "Anon read active vc_source_links" ON public.vc_source_links;
DROP POLICY IF EXISTS "Anon read active vc_signals" ON public.vc_signals;
DROP POLICY IF EXISTS "Anon read active vc_score_snapshots" ON public.vc_score_snapshots;

CREATE POLICY "Anon read active vc_firms"
  ON public.vc_firms
  FOR SELECT
  TO anon
  USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_funds"
  ON public.vc_funds
  FOR SELECT
  TO anon
  USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_people"
  ON public.vc_people
  FOR SELECT
  TO anon
  USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_investments"
  ON public.vc_investments
  FOR SELECT
  TO anon
  USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_source_links"
  ON public.vc_source_links
  FOR SELECT
  TO anon
  USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_signals"
  ON public.vc_signals
  FOR SELECT
  TO anon
  USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_score_snapshots"
  ON public.vc_score_snapshots
  FOR SELECT
  TO anon
  USING (deleted_at IS NULL);
