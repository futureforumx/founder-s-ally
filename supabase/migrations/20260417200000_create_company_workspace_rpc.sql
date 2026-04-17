-- SECURITY DEFINER RPC: creates a company_analyses + company_members row for a user.
--
-- Why: The direct-DB fallback in ensureCompanyWorkspace.ts fails when Clerk is not
-- configured as a Supabase third-party auth provider, because the Supabase client runs
-- as `anon` and auth.jwt()->>'sub' is null, so all INSERT RLS policies block the write.
-- This function bypasses RLS entirely (SECURITY DEFINER) and is the last-resort fallback
-- before asking the user to re-configure their Clerk→Supabase JWT setup.

CREATE OR REPLACE FUNCTION public.create_company_workspace(
  p_user_id text,
  p_company_name text,
  p_website_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_existing_mem_company_id uuid;
  v_existing_company_id uuid;
BEGIN
  IF p_user_id IS NULL OR trim(p_user_id) = '' THEN
    RETURN jsonb_build_object('error', 'user_id is required');
  END IF;
  IF p_company_name IS NULL OR trim(p_company_name) = '' THEN
    RETURN jsonb_build_object('error', 'company_name is required');
  END IF;

  SELECT company_id INTO v_existing_mem_company_id
  FROM public.company_members
  WHERE user_id = p_user_id AND role IN ('owner', 'manager', 'admin')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_mem_company_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'companyId', v_existing_mem_company_id::text, 'created', false);
  END IF;

  SELECT id INTO v_existing_company_id
  FROM public.company_analyses
  WHERE user_id = p_user_id
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_existing_company_id IS NOT NULL THEN
    INSERT INTO public.company_members (user_id, company_id, role)
    VALUES (p_user_id, v_existing_company_id, 'manager')
    ON CONFLICT (user_id, company_id) DO UPDATE SET role = 'manager';

    UPDATE public.profiles SET company_id = v_existing_company_id WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true, 'companyId', v_existing_company_id::text, 'created', false, 'repairedMembership', true);
  END IF;

  v_company_id := gen_random_uuid();

  INSERT INTO public.company_analyses (id, user_id, company_name, website_url, is_claimed)
  VALUES (v_company_id, p_user_id, trim(p_company_name), nullif(trim(coalesce(p_website_url, '')), ''), true);

  INSERT INTO public.company_members (user_id, company_id, role)
  VALUES (p_user_id, v_company_id, 'manager');

  UPDATE public.profiles SET company_id = v_company_id WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'companyId', v_company_id::text, 'created', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_company_workspace(text, text, text) TO anon, authenticated;
