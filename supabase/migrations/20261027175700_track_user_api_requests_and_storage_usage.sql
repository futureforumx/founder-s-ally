-- Count authenticated app requests atomically. The caller cannot supply a user ID;
-- the row is always keyed by the subject in the signed JWT (including Clerk JWTs).
CREATE OR REPLACE FUNCTION public.record_user_api_request(p_request_count integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  request_user_id text := auth.jwt() ->> 'sub';
BEGIN
  IF request_user_id IS NULL OR btrim(request_user_id) = '' THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_request_count IS NULL OR p_request_count < 1 OR p_request_count > 1000 THEN
    RAISE EXCEPTION 'Invalid request count';
  END IF;

  INSERT INTO public.user_activity (user_id, api_calls_count, last_active_at, updated_at)
  VALUES (request_user_id, p_request_count, now(), now())
  ON CONFLICT (user_id) DO UPDATE
  SET api_calls_count = public.user_activity.api_calls_count + p_request_count,
      last_active_at = now(),
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_api_request(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_user_api_request(integer) TO authenticated;

-- The admin user-list endpoint records its own request before it reads activity,
-- so the response immediately reflects the request that loaded the table.
CREATE OR REPLACE FUNCTION public.record_user_api_request_for_user(_user_id text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  INSERT INTO public.user_activity (user_id, api_calls_count, last_active_at, updated_at)
  VALUES (_user_id, 1, now(), now())
  ON CONFLICT (user_id) DO UPDATE
  SET api_calls_count = public.user_activity.api_calls_count + 1,
      last_active_at = now(),
      updated_at = now();
$$;

REVOKE ALL ON FUNCTION public.record_user_api_request_for_user(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_user_api_request_for_user(text) TO service_role;

-- Storage is summarized on the server using the service role. Only the
-- service_role may call this function; no storage metadata is exposed to users.
CREATE OR REPLACE FUNCTION public.admin_user_storage_usage(_user_ids text[])
RETURNS TABLE (user_id text, storage_bytes bigint)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT usage.user_id, sum(usage.bytes)::bigint AS storage_bytes
  FROM (
    SELECT split_part(object.name, '/', 1) AS user_id,
           COALESCE(NULLIF(object.metadata ->> 'size', '')::bigint, 0) AS bytes
    FROM storage.objects AS object
    WHERE object.bucket_id IN ('pitch-decks', 'avatars', 'resumes')
      AND split_part(object.name, '/', 1) = ANY (_user_ids)

    UNION ALL

    -- R2-backed fundraising uploads store their exact byte size alongside the
    -- per-user storage reference. Legacy pitch decks are mirrored here too.
    SELECT version.user_id, COALESCE(version.size_bytes, 0) AS bytes
    FROM public.fundraising_file_versions AS version
    WHERE version.source_kind = 'upload'
      AND version.storage_ref LIKE 'r2://%'
      AND version.user_id = ANY (_user_ids)
  ) AS usage
  GROUP BY usage.user_id;
$$;

REVOKE ALL ON FUNCTION public.admin_user_storage_usage(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_storage_usage(text[]) TO service_role;
