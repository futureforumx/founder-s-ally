-- Link operators to a startup, and stop name-only company inserts from becoming live.
-- Live companies are status ACTIVE. A new company from the admin picker is UNKNOWN
-- until that status is set.

ALTER TABLE public.operator_profiles
  ADD COLUMN IF NOT EXISTS startup_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operator_profiles_startup_id_fkey'
  ) THEN
    ALTER TABLE public.operator_profiles
      ADD CONSTRAINT operator_profiles_startup_id_fkey
      FOREIGN KEY (startup_id) REFERENCES public.startups (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS operator_profiles_startup_id_idx
  ON public.operator_profiles (startup_id);

DROP POLICY IF EXISTS "Admins can insert non-live startups" ON public.startups;
CREATE POLICY "Admins can insert non-live startups"
  ON public.startups
  FOR INSERT
  WITH CHECK (
    public.is_admin_or_above((auth.jwt() ->> 'sub'))
    AND status IS DISTINCT FROM 'ACTIVE'
  );
