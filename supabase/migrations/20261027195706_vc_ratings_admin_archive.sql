-- Keep administrator-archived reviews for audit/history while hiding them from
-- public and authenticated application reads.
ALTER TABLE public.vc_ratings
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.vc_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vc_ratings_select_anon" ON public.vc_ratings;
DROP POLICY IF EXISTS "vc_ratings_select_authenticated" ON public.vc_ratings;

CREATE POLICY "vc_ratings_select_anon"
  ON public.vc_ratings FOR SELECT TO anon
  USING (archived_at IS NULL);

CREATE POLICY "vc_ratings_select_authenticated"
  ON public.vc_ratings FOR SELECT TO authenticated
  USING (archived_at IS NULL);

CREATE OR REPLACE FUNCTION public.guard_vc_rating_archive_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin')
     AND ((TG_OP = 'INSERT' AND NEW.archived_at IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND OLD.archived_at IS DISTINCT FROM NEW.archived_at)) THEN
    RAISE EXCEPTION 'Only administrators can change review archive status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_vc_rating_archive_admin_only ON public.vc_ratings;
CREATE TRIGGER guard_vc_rating_archive_admin_only
  BEFORE INSERT OR UPDATE OF archived_at ON public.vc_ratings
  FOR EACH ROW EXECUTE FUNCTION public.guard_vc_rating_archive_admin_only();
