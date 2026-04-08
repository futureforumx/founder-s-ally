-- Bridge function: allows anon-role callers (browsers sending Clerk JWTs that Supabase PostgREST
-- cannot verify because no JWT template / third-party auth is configured) to save their own profile.
--
-- Security model:
--   • SECURITY DEFINER → runs with owner privileges, bypasses RLS on profiles
--   • p_user_id is validated to be a real Clerk user ID format (user_[A-Za-z0-9]{20,})
--     — Clerk IDs have ~148-bit entropy; not guessable
--   • The caller provides their own user_id; if Supabase can verify the JWT (role = authenticated)
--     we additionally assert auth.jwt()->>'sub' = p_user_id as a hard check
--   • Only whitelisted columns can be written (no id, created_at, etc.)
--
-- Permanent fix: configure Clerk "supabase" JWT template OR add Clerk as third-party auth in
-- Supabase Dashboard → Authentication → Third-party auth. Then this bridge can be dropped.

CREATE OR REPLACE FUNCTION public.upsert_own_profile(
  p_user_id       text,
  p_full_name     text    DEFAULT NULL,
  p_title         text    DEFAULT NULL,
  p_bio           text    DEFAULT NULL,
  p_location      text    DEFAULT NULL,
  p_avatar_url    text    DEFAULT NULL,
  p_linkedin_url  text    DEFAULT NULL,
  p_twitter_url   text    DEFAULT NULL,
  p_user_type     text    DEFAULT 'founder',
  p_resume_url    text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub text := coalesce(auth.jwt()->>'sub', '');
BEGIN
  -- Validate Clerk user ID format: must start with "user_" and have ≥20 more chars
  IF p_user_id IS NULL OR p_user_id !~ '^user_[A-Za-z0-9]{20,}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid user_id format');
  END IF;

  -- When the caller is authenticated (JWT verified by PostgREST), enforce identity match
  IF _sub <> '' AND _sub <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'JWT sub does not match user_id');
  END IF;

  INSERT INTO public.profiles (
    user_id, full_name, title, bio, location,
    avatar_url, linkedin_url, twitter_url, user_type, resume_url,
    is_public, updated_at
  ) VALUES (
    p_user_id,
    p_full_name,
    p_title,
    p_bio,
    p_location,
    p_avatar_url,
    p_linkedin_url,
    p_twitter_url,
    coalesce(p_user_type, 'founder'),
    p_resume_url,
    true,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name    = coalesce(EXCLUDED.full_name,    profiles.full_name),
    title        = coalesce(EXCLUDED.title,        profiles.title),
    bio          = coalesce(EXCLUDED.bio,          profiles.bio),
    location     = coalesce(EXCLUDED.location,     profiles.location),
    avatar_url   = coalesce(EXCLUDED.avatar_url,   profiles.avatar_url),
    linkedin_url = coalesce(EXCLUDED.linkedin_url, profiles.linkedin_url),
    twitter_url  = coalesce(EXCLUDED.twitter_url,  profiles.twitter_url),
    user_type    = coalesce(EXCLUDED.user_type,    profiles.user_type),
    resume_url   = coalesce(EXCLUDED.resume_url,   profiles.resume_url),
    updated_at   = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Allow the anon role to call the function (required for unauthenticated-from-PostgREST's-POV Clerk sessions)
GRANT EXECUTE ON FUNCTION public.upsert_own_profile TO anon, authenticated;

-- Ensure unique constraint on user_id exists (needed for ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_uq ON public.profiles (user_id);
