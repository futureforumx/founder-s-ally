-- Let authenticated console operators upsert hero copy without deploying edge functions.
-- Matches admin-console access: manager, admin, god in user_roles (same sub as JWT).

CREATE POLICY "tool_category_page_overrides_admin_console_insert"
  ON public.tool_category_page_overrides
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (auth.jwt()->>'sub')
        AND ur.permission IN ('manager'::public.app_permission, 'admin'::public.app_permission, 'god'::public.app_permission)
    )
  );

CREATE POLICY "tool_category_page_overrides_admin_console_update"
  ON public.tool_category_page_overrides
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (auth.jwt()->>'sub')
        AND ur.permission IN ('manager'::public.app_permission, 'admin'::public.app_permission, 'god'::public.app_permission)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (auth.jwt()->>'sub')
        AND ur.permission IN ('manager'::public.app_permission, 'admin'::public.app_permission, 'god'::public.app_permission)
    )
  );

GRANT INSERT, UPDATE ON TABLE public.tool_category_page_overrides TO authenticated;
