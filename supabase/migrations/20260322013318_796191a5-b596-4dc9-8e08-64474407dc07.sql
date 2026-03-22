
-- 1. Add email + email_source columns to investor_database
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS email text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_source text DEFAULT NULL;

-- 2. User credits table
CREATE TABLE IF NOT EXISTS public.user_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_remaining integer NOT NULL DEFAULT 10,
  tier text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own credits"
  ON public.user_credits FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own credits"
  ON public.user_credits FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credits"
  ON public.user_credits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3. Export audit logs table
CREATE TABLE IF NOT EXISTS public.export_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  export_type text NOT NULL DEFAULT 'csv',
  intent text,
  row_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.export_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own export logs"
  ON public.export_audit_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own export logs"
  ON public.export_audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. reveal_contact_info RPC — deducts 1 credit and returns email
CREATE OR REPLACE FUNCTION public.reveal_contact_info(_investor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _credits int;
  _tier text;
  _email text;
  _firm text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Get or create credits row
  INSERT INTO public.user_credits (user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT credits_remaining, tier INTO _credits, _tier
  FROM public.user_credits
  WHERE user_id = _user_id;

  -- Pro/admin users bypass credit check
  IF _tier NOT IN ('pro', 'admin') THEN
    IF _credits <= 0 THEN
      RETURN jsonb_build_object('error', 'No credits remaining. Upgrade to Pro for unlimited reveals.');
    END IF;

    UPDATE public.user_credits
    SET credits_remaining = credits_remaining - 1, updated_at = now()
    WHERE user_id = _user_id;
  END IF;

  SELECT i.email, i.firm_name INTO _email, _firm
  FROM public.investor_database i
  WHERE i.id = _investor_id;

  IF _email IS NULL THEN
    RETURN jsonb_build_object('error', 'No contact info available for this investor', 'firm_name', _firm);
  END IF;

  RETURN jsonb_build_object(
    'email', _email,
    'firm_name', _firm,
    'credits_remaining', CASE WHEN _tier IN ('pro', 'admin') THEN -1 ELSE _credits - 1 END
  );
END;
$$;

-- 5. Create a secure view that strips email_source for non-admins
-- Since Postgres RLS can't strip individual columns, we use a view
CREATE OR REPLACE VIEW public.investor_directory_safe AS
SELECT
  id, firm_name, lead_partner, thesis_verticals, preferred_stage,
  min_check_size, max_check_size, recent_deals, location,
  lead_or_follow, market_sentiment, sentiment_detail, aum,
  website_url, logo_url, ca_sb54_compliant, created_at,
  last_enriched_at, sector_embedding,
  -- Always hide raw email from the default query
  NULL::text AS email,
  -- Only show email_source to admins
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_credits uc
      WHERE uc.user_id = auth.uid() AND uc.tier = 'admin'
    )
    THEN email_source
    ELSE NULL
  END AS email_source
FROM public.investor_database;
