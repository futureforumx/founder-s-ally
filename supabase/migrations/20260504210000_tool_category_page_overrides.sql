-- Editable hero copy for public /tools/:categorySlug pages (starts with AI Agents).
-- Null fields fall back to code defaults in `TOOL_CATEGORY_INTROS`.

CREATE TABLE IF NOT EXISTS public.tool_category_page_overrides (
  category_slug text PRIMARY KEY,
  title text,
  description text,
  meta text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tool_category_page_overrides (category_slug)
VALUES ('ai-agents')
ON CONFLICT (category_slug) DO NOTHING;

DROP TRIGGER IF EXISTS tool_category_page_overrides_updated_at ON public.tool_category_page_overrides;
CREATE TRIGGER tool_category_page_overrides_updated_at
  BEFORE UPDATE ON public.tool_category_page_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tool_category_page_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tool_category_page_overrides_select_public"
  ON public.tool_category_page_overrides
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "tool_category_page_overrides_service_all"
  ON public.tool_category_page_overrides
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.tool_category_page_overrides IS
  'Operator overrides for Tools library category hero title, description, and SEO meta; empty DB fields use app defaults.';

GRANT SELECT ON TABLE public.tool_category_page_overrides TO anon, authenticated;
