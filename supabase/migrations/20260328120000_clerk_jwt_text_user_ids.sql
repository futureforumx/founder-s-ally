-- Clerk third-party auth: user IDs are strings (e.g. user_2abc...). Replace uuid + auth.uid() with
-- text + (auth.jwt() ->> 'sub') per https://clerk.com/docs/guides/development/integrations/databases/supabase
-- company_competitors was migrated earlier in 20260326_fix_company_competitors_user_id.sql — not repeated here.

-- ── Dependent view (references auth.uid / user_credits.user_id) ─────────────────
DROP VIEW IF EXISTS public.investor_directory_safe;

-- ── Drop table RLS policies that use auth.uid() ─────────────────────────────────
DROP POLICY IF EXISTS "Users can view own analyses" ON public.company_analyses;
DROP POLICY IF EXISTS "Users can insert own analyses" ON public.company_analyses;
DROP POLICY IF EXISTS "Users can update own analyses" ON public.company_analyses;
DROP POLICY IF EXISTS "Users can delete own analyses" ON public.company_analyses;

DROP POLICY IF EXISTS "Anyone can read public profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

DROP POLICY IF EXISTS "Users can view own cap table" ON public.cap_table;
DROP POLICY IF EXISTS "Users can insert own cap table" ON public.cap_table;
DROP POLICY IF EXISTS "Users can update own cap table" ON public.cap_table;
DROP POLICY IF EXISTS "Users can delete own cap table" ON public.cap_table;

DROP POLICY IF EXISTS "Users can view own pending investors" ON public.pending_investors;
DROP POLICY IF EXISTS "Users can insert own pending investors" ON public.pending_investors;
DROP POLICY IF EXISTS "Users can update own pending investors" ON public.pending_investors;
DROP POLICY IF EXISTS "Users can delete own pending investors" ON public.pending_investors;

DROP POLICY IF EXISTS "Users can read own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can update own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can insert own credits" ON public.user_credits;

DROP POLICY IF EXISTS "Users can read own export logs" ON public.export_audit_logs;
DROP POLICY IF EXISTS "Users can insert own export logs" ON public.export_audit_logs;

DROP POLICY IF EXISTS "Users can read own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;

DROP POLICY IF EXISTS "Anyone can read events" ON public.community_events;
DROP POLICY IF EXISTS "Users can create events" ON public.community_events;
DROP POLICY IF EXISTS "Creators can update own events" ON public.community_events;
DROP POLICY IF EXISTS "Creators can delete own events" ON public.community_events;

DROP POLICY IF EXISTS "Anyone can read RSVPs" ON public.event_rsvps;
DROP POLICY IF EXISTS "Users can RSVP" ON public.event_rsvps;
DROP POLICY IF EXISTS "Users can update own RSVP" ON public.event_rsvps;
DROP POLICY IF EXISTS "Users can cancel own RSVP" ON public.event_rsvps;

DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

DROP POLICY IF EXISTS "Admins can read all activity" ON public.user_activity;
DROP POLICY IF EXISTS "Users can upsert own activity" ON public.user_activity;
DROP POLICY IF EXISTS "Users can update own activity" ON public.user_activity;

DROP POLICY IF EXISTS "Users can view own decks" ON public.company_pitch_decks;
DROP POLICY IF EXISTS "Users can insert own decks" ON public.company_pitch_decks;
DROP POLICY IF EXISTS "Users can update own decks" ON public.company_pitch_decks;
DROP POLICY IF EXISTS "Users can delete own decks" ON public.company_pitch_decks;

DROP POLICY IF EXISTS "Users can read own memberships" ON public.company_members;
DROP POLICY IF EXISTS "Members can see co-members" ON public.company_members;
DROP POLICY IF EXISTS "Users can request access" ON public.company_members;
DROP POLICY IF EXISTS "Owners can update memberships" ON public.company_members;
DROP POLICY IF EXISTS "Users can cancel own pending requests" ON public.company_members;

DROP POLICY IF EXISTS "Company members can view their codes" ON public.company_approval_codes;
DROP POLICY IF EXISTS "Company members can create codes" ON public.company_approval_codes;
DROP POLICY IF EXISTS "Code creators can update their codes" ON public.company_approval_codes;

DROP POLICY IF EXISTS "Users can insert own reviews" ON public.investor_reviews;
DROP POLICY IF EXISTS "Users can read own reviews" ON public.investor_reviews;

DROP POLICY IF EXISTS "Users can read own interactions" ON public.founder_vc_interactions;
DROP POLICY IF EXISTS "Users can insert own interactions" ON public.founder_vc_interactions;
DROP POLICY IF EXISTS "Users can delete own interactions" ON public.founder_vc_interactions;

-- ── Storage policies ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can upload own decks" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own decks" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own decks" ON storage.objects;

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

DROP POLICY IF EXISTS "Users can upload own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own resumes" ON storage.objects;

-- ── Drop FKs to auth.users (Clerk users are not in auth.users) ───────────────────
ALTER TABLE public.company_analyses DROP CONSTRAINT IF EXISTS company_analyses_user_id_fkey;
ALTER TABLE public.user_credits DROP CONSTRAINT IF EXISTS user_credits_user_id_fkey;
ALTER TABLE public.export_audit_logs DROP CONSTRAINT IF EXISTS export_audit_logs_user_id_fkey;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.user_activity DROP CONSTRAINT IF EXISTS user_activity_user_id_fkey;
ALTER TABLE public.investor_reviews DROP CONSTRAINT IF EXISTS investor_reviews_founder_id_fkey;
ALTER TABLE public.company_competitors DROP CONSTRAINT IF EXISTS company_competitors_user_id_fkey;

-- Replace function overloads (uuid args) so Clerk text ids are the only signature
DROP FUNCTION IF EXISTS public.has_permission(uuid, app_permission);
DROP FUNCTION IF EXISTS public.is_admin_or_above(uuid);
DROP FUNCTION IF EXISTS public.recommend_competitors(uuid, text[], int);
DROP FUNCTION IF EXISTS public.get_collaborative_recommendations(uuid);
DROP FUNCTION IF EXISTS public.find_connections_by_investor(text);

-- ── Alter user / founder / creator columns to text ───────────────────────────────
ALTER TABLE public.company_analyses ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;
ALTER TABLE public.profiles ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;
ALTER TABLE public.cap_table ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;
ALTER TABLE public.pending_investors ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;
ALTER TABLE public.user_credits ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;
ALTER TABLE public.export_audit_logs ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;
ALTER TABLE public.user_preferences ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;
ALTER TABLE public.event_rsvps ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;
ALTER TABLE public.user_roles ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;
ALTER TABLE public.user_activity ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;
ALTER TABLE public.company_pitch_decks ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;
ALTER TABLE public.company_members ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;
ALTER TABLE public.community_events ALTER COLUMN creator_id SET DATA TYPE text USING creator_id::text;
ALTER TABLE public.company_approval_codes ALTER COLUMN created_by SET DATA TYPE text USING created_by::text;
ALTER TABLE public.investor_reviews ALTER COLUMN founder_id SET DATA TYPE text USING founder_id::text;
ALTER TABLE public.founder_vc_interactions ALTER COLUMN founder_id SET DATA TYPE text USING founder_id::text;

-- company_competitors.user_id is already text after 20260326; DROP CONSTRAINT is idempotent if re-run

-- ── RBAC helpers: text user ids ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_permission(_user_id text, _permission app_permission)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND permission = _permission
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_above(_user_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND permission IN ('admin', 'god')
  );
$$;

-- ── RPCs that referenced auth.uid() as uuid ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reveal_contact_info(_investor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id text := auth.jwt()->>'sub';
  _credits int;
  _tier text;
  _email text;
  _firm text;
BEGIN
  IF _user_id IS NULL OR _user_id = '' THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  INSERT INTO public.user_credits (user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT credits_remaining, tier INTO _credits, _tier
  FROM public.user_credits
  WHERE user_id = _user_id;

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

CREATE OR REPLACE FUNCTION public.find_connections_by_investor(_investor_name text)
RETURNS TABLE(
  user_id text,
  company_name text,
  sector text,
  stage text,
  investor_amount integer,
  instrument text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    ct.user_id,
    COALESCE(ca.company_name, '') AS company_name,
    ca.sector,
    ca.stage,
    ct.amount AS investor_amount,
    ct.instrument
  FROM public.cap_table ct
  LEFT JOIN public.company_analyses ca ON ca.user_id = ct.user_id
  WHERE LOWER(TRIM(ct.investor_name)) = LOWER(TRIM(_investor_name))
  ORDER BY ct.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.recommend_competitors(
  _user_id text,
  _industry_tags text[],
  _limit int DEFAULT 5
)
RETURNS TABLE (
  competitor_id uuid,
  competitor_name text,
  website text,
  description text,
  industry_tags text[],
  tracking_count bigint,
  tag_overlap int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS competitor_id,
    c.name AS competitor_name,
    c.website,
    c.description,
    c.industry_tags,
    COUNT(DISTINCT cc.user_id) AS tracking_count,
    (SELECT COUNT(*)::INT FROM unnest(c.industry_tags) t WHERE t = ANY(_industry_tags)) AS tag_overlap
  FROM public.competitors c
  JOIN public.company_competitors cc ON cc.competitor_id = c.id
  WHERE c.id NOT IN (
    SELECT competitor_id FROM public.company_competitors WHERE user_id = _user_id
  )
  AND c.industry_tags && _industry_tags
  GROUP BY c.id
  ORDER BY tag_overlap DESC, tracking_count DESC
  LIMIT _limit
$$;

CREATE OR REPLACE FUNCTION public.get_collaborative_recommendations(_current_founder_id text)
RETURNS TABLE (
  firm_id uuid,
  firm_name text,
  peer_save_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH current_profile AS (
    SELECT sector, stage
    FROM public.company_analyses
    WHERE user_id = _current_founder_id
    ORDER BY updated_at DESC
    LIMIT 1
  ),
  peer_founders AS (
    SELECT ca.user_id
    FROM public.company_analyses ca, current_profile cp
    WHERE ca.user_id != _current_founder_id
      AND ca.sector = cp.sector
      AND ca.stage = cp.stage
  ),
  already_interacted AS (
    SELECT fvi.firm_id
    FROM public.founder_vc_interactions fvi
    WHERE fvi.founder_id = _current_founder_id
      AND fvi.action_type IN ('saved', 'skipped')
  )
  SELECT
    fvi.firm_id,
    id_db.firm_name,
    COUNT(*) AS peer_save_count
  FROM public.founder_vc_interactions fvi
  JOIN peer_founders pf ON fvi.founder_id = pf.user_id
  JOIN public.investor_database id_db ON id_db.id = fvi.firm_id
  WHERE fvi.action_type = 'saved'
    AND fvi.firm_id NOT IN (SELECT firm_id FROM already_interacted)
  GROUP BY fvi.firm_id, id_db.firm_name
  ORDER BY peer_save_count DESC
  LIMIT 5;
$$;

-- ── Table RLS (Clerk JWT sub) ─────────────────────────────────────────────────────
CREATE POLICY "Users can view own analyses" ON public.company_analyses
  FOR SELECT TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can insert own analyses" ON public.company_analyses
  FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can update own analyses" ON public.company_analyses
  FOR UPDATE TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can delete own analyses" ON public.company_analyses
  FOR DELETE TO authenticated USING ((auth.jwt()->>'sub') = user_id);

CREATE POLICY "Anyone can read public profiles" ON public.profiles
  FOR SELECT TO authenticated USING (is_public = true);
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING ((auth.jwt()->>'sub') = user_id);

CREATE POLICY "Users can view own cap table" ON public.cap_table FOR SELECT TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can insert own cap table" ON public.cap_table FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can update own cap table" ON public.cap_table FOR UPDATE TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can delete own cap table" ON public.cap_table FOR DELETE TO authenticated USING ((auth.jwt()->>'sub') = user_id);

CREATE POLICY "Users can view own pending investors" ON public.pending_investors FOR SELECT TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can insert own pending investors" ON public.pending_investors FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can update own pending investors" ON public.pending_investors FOR UPDATE TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can delete own pending investors" ON public.pending_investors FOR DELETE TO authenticated USING ((auth.jwt()->>'sub') = user_id);

CREATE POLICY "Users can read own credits" ON public.user_credits FOR SELECT TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can update own credits" ON public.user_credits FOR UPDATE TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can insert own credits" ON public.user_credits FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'sub') = user_id);

CREATE POLICY "Users can read own export logs" ON public.export_audit_logs FOR SELECT TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can insert own export logs" ON public.export_audit_logs FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'sub') = user_id);

CREATE POLICY "Users can read own preferences" ON public.user_preferences FOR SELECT TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE TO authenticated USING ((auth.jwt()->>'sub') = user_id);

CREATE POLICY "Anyone can read events" ON public.community_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create events" ON public.community_events FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'sub') = creator_id);
CREATE POLICY "Creators can update own events" ON public.community_events FOR UPDATE TO authenticated USING ((auth.jwt()->>'sub') = creator_id);
CREATE POLICY "Creators can delete own events" ON public.community_events FOR DELETE TO authenticated USING ((auth.jwt()->>'sub') = creator_id);

CREATE POLICY "Anyone can read RSVPs" ON public.event_rsvps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can RSVP" ON public.event_rsvps FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can update own RSVP" ON public.event_rsvps FOR UPDATE TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can cancel own RSVP" ON public.event_rsvps FOR DELETE TO authenticated USING ((auth.jwt()->>'sub') = user_id);

CREATE POLICY "Admins can read all roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_admin_or_above((auth.jwt()->>'sub')) OR (auth.jwt()->>'sub') = user_id);
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_above((auth.jwt()->>'sub')));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_admin_or_above((auth.jwt()->>'sub')));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_admin_or_above((auth.jwt()->>'sub')));

CREATE POLICY "Admins can read all activity" ON public.user_activity FOR SELECT TO authenticated
  USING (public.is_admin_or_above((auth.jwt()->>'sub')) OR (auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can upsert own activity" ON public.user_activity FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can update own activity" ON public.user_activity FOR UPDATE TO authenticated USING ((auth.jwt()->>'sub') = user_id);

CREATE POLICY "Users can view own decks" ON public.company_pitch_decks FOR SELECT TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can insert own decks" ON public.company_pitch_decks FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can update own decks" ON public.company_pitch_decks FOR UPDATE TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Users can delete own decks" ON public.company_pitch_decks FOR DELETE TO authenticated USING ((auth.jwt()->>'sub') = user_id);

CREATE POLICY "Users can read own memberships" ON public.company_members FOR SELECT TO authenticated USING ((auth.jwt()->>'sub') = user_id);
CREATE POLICY "Members can see co-members" ON public.company_members FOR SELECT TO authenticated USING (
  company_id IN (SELECT company_id FROM public.company_members WHERE user_id = (auth.jwt()->>'sub'))
);
CREATE POLICY "Users can request access" ON public.company_members FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'sub') = user_id AND role = 'pending');
CREATE POLICY "Owners can update memberships" ON public.company_members FOR UPDATE TO authenticated USING (
  company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id = (auth.jwt()->>'sub') AND role = 'owner'
  )
);
CREATE POLICY "Users can cancel own pending requests" ON public.company_members FOR DELETE TO authenticated
  USING ((auth.jwt()->>'sub') = user_id AND role = 'pending');

CREATE POLICY "Company members can view their codes" ON public.company_approval_codes FOR SELECT TO authenticated USING (
  created_by = (auth.jwt()->>'sub')
  OR EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = company_approval_codes.company_id
      AND cm.user_id = (auth.jwt()->>'sub')
      AND cm.role IN ('owner', 'admin', 'manager')
  )
);
CREATE POLICY "Company members can create codes" ON public.company_approval_codes FOR INSERT TO authenticated
  WITH CHECK (created_by = (auth.jwt()->>'sub'));
CREATE POLICY "Code creators can update their codes" ON public.company_approval_codes FOR UPDATE TO authenticated
  USING (created_by = (auth.jwt()->>'sub'));

CREATE POLICY "Users can insert own reviews" ON public.investor_reviews FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'sub') = founder_id);
CREATE POLICY "Users can read own reviews" ON public.investor_reviews FOR SELECT TO authenticated USING ((auth.jwt()->>'sub') = founder_id);

CREATE POLICY "Users can read own interactions" ON public.founder_vc_interactions FOR SELECT TO authenticated USING ((auth.jwt()->>'sub') = founder_id);
CREATE POLICY "Users can insert own interactions" ON public.founder_vc_interactions FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->>'sub') = founder_id);
CREATE POLICY "Users can delete own interactions" ON public.founder_vc_interactions FOR DELETE TO authenticated USING ((auth.jwt()->>'sub') = founder_id);

-- ── Storage: folder name = Clerk user id ─────────────────────────────────────────
CREATE POLICY "Users can upload own decks" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'pitch-decks' AND (storage.foldername(name))[1] = (auth.jwt()->>'sub'));
CREATE POLICY "Users can view own decks" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'pitch-decks' AND (storage.foldername(name))[1] = (auth.jwt()->>'sub'));
CREATE POLICY "Users can delete own decks" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'pitch-decks' AND (storage.foldername(name))[1] = (auth.jwt()->>'sub'));

CREATE POLICY "Users can upload own avatar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.jwt()->>'sub'));
CREATE POLICY "Users can update own avatar" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.jwt()->>'sub'));
CREATE POLICY "Users can delete own avatar" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.jwt()->>'sub'));

CREATE POLICY "Users can upload own resumes" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'resumes' AND (storage.foldername(name))[1] = (auth.jwt()->>'sub'));
CREATE POLICY "Users can read own resumes" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'resumes' AND (storage.foldername(name))[1] = (auth.jwt()->>'sub'));
CREATE POLICY "Users can delete own resumes" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'resumes' AND (storage.foldername(name))[1] = (auth.jwt()->>'sub'));

-- ── investor_directory_safe (was security invoker in follow-up migration) ───────
CREATE VIEW public.investor_directory_safe
WITH (security_invoker = true)
AS
SELECT
  id, firm_name, lead_partner, thesis_verticals, preferred_stage,
  min_check_size, max_check_size, recent_deals, location,
  lead_or_follow, market_sentiment, sentiment_detail, aum,
  website_url, logo_url, ca_sb54_compliant, created_at,
  last_enriched_at, sector_embedding,
  NULL::text AS email,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_credits uc
      WHERE uc.user_id = (auth.jwt()->>'sub') AND uc.tier = 'admin'
    )
    THEN email_source
    ELSE NULL
  END AS email_source
FROM public.investor_database;
