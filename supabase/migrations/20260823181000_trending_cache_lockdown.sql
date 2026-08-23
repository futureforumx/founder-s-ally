REVOKE ALL ON TABLE public.trending_cache FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.trending_cache FROM anon, authenticated;
GRANT SELECT ON TABLE public.trending_cache TO anon, authenticated;
GRANT ALL ON TABLE public.trending_cache TO service_role;
