-- Admin console access is not only user_roles.user_id = auth.jwt()->>'sub'.
-- user_roles stores Clerk ids (user_…), while the browser session JWT sub is a
-- Supabase UUID. The console also treats @vekta.so and @tryvekta.com as staff,
-- matching autoPermissionForEmail in the admin edge functions.
-- New companies stay non-live: status must not be ACTIVE.

CREATE OR REPLACE FUNCTION public.has_admin_console_jwt()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH claims AS (
    SELECT coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb,
      nullif(current_setting('request.jwt.claim', true), '')::jsonb,
      '{}'::jsonb
    ) AS c
  )
  SELECT
    public.is_admin_or_above(coalesce(auth.jwt() ->> 'sub', (SELECT c ->> 'sub' FROM claims)))
    OR lower(split_part(coalesce(
      nullif(auth.jwt() ->> 'email', ''),
      nullif((SELECT c ->> 'email' FROM claims), ''),
      ''
    ), '@', 2)) IN ('vekta.so', 'tryvekta.com');
$$;

GRANT EXECUTE ON FUNCTION public.has_admin_console_jwt() TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Admins can insert non-live startups" ON public.startups;
CREATE POLICY "Admins can insert non-live startups"
  ON public.startups
  FOR INSERT
  WITH CHECK (
    public.has_admin_console_jwt()
    AND status IS DISTINCT FROM 'ACTIVE'
  );
