-- VC directory tables (Prisma / vc_*): RLS for Clerk-authenticated app users.
-- Read-only for signed-in users; soft-deleted rows hidden. Service role bypasses RLS.

-- Enable RLS only for tables that exist (some may not be created in all environments)
DO $$ BEGIN
  IF to_regclass('public.vc_firms') IS NOT NULL THEN ALTER TABLE public.vc_firms ENABLE ROW LEVEL SECURITY; END IF;
  IF to_regclass('public.vc_funds') IS NOT NULL THEN ALTER TABLE public.vc_funds ENABLE ROW LEVEL SECURITY; END IF;
  IF to_regclass('public.vc_people') IS NOT NULL THEN ALTER TABLE public.vc_people ENABLE ROW LEVEL SECURITY; END IF;
  IF to_regclass('public.vc_investments') IS NOT NULL THEN ALTER TABLE public.vc_investments ENABLE ROW LEVEL SECURITY; END IF;
  IF to_regclass('public.vc_source_links') IS NOT NULL THEN ALTER TABLE public.vc_source_links ENABLE ROW LEVEL SECURITY; END IF;
  IF to_regclass('public.vc_signals') IS NOT NULL THEN ALTER TABLE public.vc_signals ENABLE ROW LEVEL SECURITY; END IF;
  IF to_regclass('public.vc_score_snapshots') IS NOT NULL THEN ALTER TABLE public.vc_score_snapshots ENABLE ROW LEVEL SECURITY; END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated read active vc_firms" ON public.vc_firms;
DROP POLICY IF EXISTS "Authenticated read active vc_funds" ON public.vc_funds;
DROP POLICY IF EXISTS "Authenticated read active vc_people" ON public.vc_people;
DROP POLICY IF EXISTS "Authenticated read active vc_investments" ON public.vc_investments;
DROP POLICY IF EXISTS "Authenticated read active vc_source_links" ON public.vc_source_links;
DROP POLICY IF EXISTS "Authenticated read active vc_signals" ON public.vc_signals;
DROP POLICY IF EXISTS "Authenticated read active vc_score_snapshots" ON public.vc_score_snapshots;

CREATE POLICY "Authenticated read active vc_firms"
  ON public.vc_firms
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated read active vc_funds"
  ON public.vc_funds
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated read active vc_people"
  ON public.vc_people
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated read active vc_investments"
  ON public.vc_investments
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated read active vc_source_links"
  ON public.vc_source_links
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated read active vc_signals"
  ON public.vc_signals
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated read active vc_score_snapshots"
  ON public.vc_score_snapshots
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);
