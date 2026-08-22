-- Live `vc_firms` never received the Prisma `deleted_at` column. Firm profile
-- queries that filtered on it failed with "column vc_firms.deleted_at does not exist".
ALTER TABLE public.vc_firms
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS vc_firms_deleted_at_idx
  ON public.vc_firms (deleted_at);

DROP POLICY IF EXISTS "Authenticated read active vc_firms" ON public.vc_firms;
DROP POLICY IF EXISTS "Anon read active vc_firms" ON public.vc_firms;

CREATE POLICY "Authenticated read active vc_firms"
  ON public.vc_firms FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_firms"
  ON public.vc_firms FOR SELECT TO anon USING (deleted_at IS NULL);
