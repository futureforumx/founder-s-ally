-- ─────────────────────────────────────────────────────────────────────────────
-- User bans + IP capture
--
-- Adds the infrastructure for the Admin → Users "BAN" action:
--   • user_ip_log        – best-effort record of the IP addresses each user has
--                          connected from (populated by /api/ensure-user).
--   • banned_identities  – emails and IP addresses that are blocked from the app.
--
-- Writes happen with the service-role key (Vercel function + admin edge
-- functions), so RLS only needs to grant admins read access.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Per-user IP log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_ip_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  ip_address text NOT NULL,
  user_agent text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 1,
  UNIQUE (user_id, ip_address)
);

CREATE INDEX IF NOT EXISTS user_ip_log_user_id_idx ON public.user_ip_log (user_id);
CREATE INDEX IF NOT EXISTS user_ip_log_ip_idx ON public.user_ip_log (ip_address);

ALTER TABLE public.user_ip_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_ip_log_select_admin" ON public.user_ip_log;
CREATE POLICY "user_ip_log_select_admin"
  ON public.user_ip_log FOR SELECT TO authenticated
  USING (public.is_admin_or_above((auth.jwt()->>'sub')));

GRANT SELECT ON public.user_ip_log TO authenticated;

-- ── Banned emails / IPs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.banned_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('email', 'ip')),
  value text NOT NULL,
  banned_user_id text,
  email text,
  reason text,
  banned_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);

CREATE INDEX IF NOT EXISTS banned_identities_user_idx ON public.banned_identities (banned_user_id);

ALTER TABLE public.banned_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "banned_identities_select_admin" ON public.banned_identities;
CREATE POLICY "banned_identities_select_admin"
  ON public.banned_identities FOR SELECT TO authenticated
  USING (public.is_admin_or_above((auth.jwt()->>'sub')));

GRANT SELECT ON public.banned_identities TO authenticated;

-- ── Ban check helper (used by /api/ensure-user via service role) ────────────
CREATE OR REPLACE FUNCTION public.is_identity_banned(_email text, _ip text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.banned_identities b
    WHERE (b.kind = 'email' AND _email IS NOT NULL AND lower(b.value) = lower(_email))
       OR (b.kind = 'ip'    AND _ip    IS NOT NULL AND b.value = _ip)
  );
$$;
