-- Founder workspace companies belong in the startups catalog, with the
-- details the founder entered. Later edits keep that catalog row current.

CREATE OR REPLACE FUNCTION public.upsert_startup_from_company_analysis(p public.company_analyses)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := NULLIF(btrim(p.company_name), '');
  v_id text;
  v_owned boolean := false;
  v_stage public."OperatorCompanyStage";
  v_sector public."SectorFocus";
  v_sector_key text;
  v_url text := NULLIF(btrim(p.website_url), '');
  v_domain text;
  v_summary text := NULLIF(left(btrim(coalesce(p.executive_summary, '')), 600), '');
  v_logo text := NULLIF(btrim(p.logo_url), '');
BEGIN
  IF v_name IS NULL THEN
    RETURN;
  END IF;

  v_stage := CASE lower(btrim(coalesce(p.stage, '')))
    WHEN 'pre-seed' THEN 'PRE_SEED'
    WHEN 'preseed' THEN 'PRE_SEED'
    WHEN 'mvp' THEN 'PRE_SEED'
    WHEN 'accelerator' THEN 'PRE_SEED'
    WHEN 'seed' THEN 'SEED'
    WHEN 'series a' THEN 'SERIES_A'
    WHEN 'series b' THEN 'SERIES_B'
    WHEN 'series b+' THEN 'SERIES_B'
    WHEN 'series b +' THEN 'SERIES_B'
    WHEN 'series c' THEN 'SERIES_C'
    WHEN 'series c+' THEN 'SERIES_C'
    WHEN 'series c +' THEN 'SERIES_C'
    WHEN 'growth' THEN 'GROWTH'
    WHEN 'bootstrapped' THEN 'BOOTSTRAPPED'
    ELSE 'UNKNOWN'
  END::public."OperatorCompanyStage";

  v_sector_key := lower(regexp_replace(coalesce(p.sector, ''), '[^a-z0-9]+', '', 'g'));
  v_sector := CASE
    WHEN v_sector_key IN ('fintech', 'finance') THEN 'FINTECH'
    WHEN v_sector_key IN ('saas', 'devtools', 'enterprisesoftware', 'enterprisesoftwaresaas') THEN 'ENTERPRISE_SAAS'
    WHEN v_sector_key IN ('ai', 'aiml', 'aidataanalytics') THEN 'AI'
    WHEN v_sector_key IN ('healthtech') THEN 'HEALTHTECH'
    WHEN v_sector_key IN ('biotech') THEN 'BIOTECH'
    WHEN v_sector_key LIKE 'healthtechbiotech%' THEN 'HEALTHTECH'
    WHEN v_sector_key = 'edtech' THEN 'EDTECH'
    WHEN v_sector_key IN ('cleantech', 'climate', 'climateenergysustainability') THEN 'CLIMATE'
    WHEN v_sector_key IN ('ecommerce', 'consumer', 'consumerecommercecpg') THEN 'CONSUMER'
    WHEN v_sector_key = 'marketplace' THEN 'MARKETPLACE'
    WHEN v_sector_key = 'cybersecurity' THEN 'CYBERSECURITY'
    WHEN v_sector_key IN ('proptech', 'proptechconstructiontech') THEN 'PROPTECH'
    WHEN v_sector_key IN ('logistics', 'mobility', 'mobilitytransportationlogistics') THEN 'MOBILITY'
    WHEN v_sector_key IN ('media', 'gaming') THEN 'MEDIA'
    WHEN v_sector_key = '' THEN NULL
    ELSE 'OTHER'
  END::public."SectorFocus";

  IF v_url IS NOT NULL THEN
    v_domain := lower(regexp_replace(regexp_replace(v_url, '^https?://', ''), '^www\.', ''));
    v_domain := split_part(split_part(v_domain, '/', 1), '?', 1);
    IF v_domain = '' OR position('.' IN v_domain) = 0 THEN
      v_domain := NULL;
    END IF;
  END IF;

  SELECT s.id, (s.external_ids->>'company_analysis_id' = p.id::text)
  INTO v_id, v_owned
  FROM public.startups AS s
  WHERE s.external_ids->>'company_analysis_id' = p.id::text
  LIMIT 1;

  IF v_id IS NULL THEN
    SELECT s.id INTO v_id
    FROM public.startups AS s
    WHERE lower(btrim(s.company_name)) = lower(v_name)
    ORDER BY s.deleted_at NULLS FIRST, s.updated_at DESC
    LIMIT 1;
    v_owned := false;
  END IF;

  IF v_domain IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.startups AS s
    WHERE s.domain = v_domain AND s.id IS DISTINCT FROM v_id
  ) THEN
    v_domain := NULL;
  END IF;

  IF v_id IS NULL THEN
    v_id := 'cs_' || substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16);
    INSERT INTO public.startups (
      id, company_name, company_url, domain, logo_url, description_short,
      sector, stage, status, record_status, primary_data_source, data_sources, external_ids
    ) VALUES (
      v_id,
      v_name,
      v_url,
      v_domain,
      v_logo,
      v_summary,
      v_sector,
      v_stage,
      'UNKNOWN',
      'needs_review',
      'MANUAL',
      ARRAY['MANUAL']::public."StartupDataSource"[],
      jsonb_build_object('company_analysis_id', p.id::text)
    );
    RETURN;
  END IF;

  UPDATE public.startups AS s
  SET
    deleted_at = NULL,
    external_ids = coalesce(s.external_ids, '{}'::jsonb) || jsonb_build_object('company_analysis_id', p.id::text),
    company_name = CASE
      WHEN v_owned AND NOT EXISTS (
        SELECT 1 FROM public.startups AS other
        WHERE other.company_name = v_name AND other.id <> s.id
      ) THEN v_name
      ELSE s.company_name
    END,
    company_url = CASE WHEN v_owned OR s.company_url IS NULL THEN coalesce(v_url, s.company_url) ELSE s.company_url END,
    domain = CASE WHEN s.domain IS NULL THEN coalesce(v_domain, s.domain) ELSE s.domain END,
    logo_url = CASE WHEN v_owned OR s.logo_url IS NULL THEN coalesce(v_logo, s.logo_url) ELSE s.logo_url END,
    description_short = CASE WHEN v_owned OR s.description_short IS NULL THEN coalesce(v_summary, s.description_short) ELSE s.description_short END,
    sector = CASE WHEN v_sector IS NOT NULL AND (v_owned OR s.sector IS NULL) THEN v_sector ELSE s.sector END,
    stage = CASE
      WHEN v_stage <> 'UNKNOWN'::public."OperatorCompanyStage" AND (v_owned OR s.stage = 'UNKNOWN'::public."OperatorCompanyStage")
      THEN v_stage
      ELSE s.stage
    END,
    updated_at = now()
  WHERE s.id = v_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'upsert_startup_from_company_analysis skipped for %: %', p.id, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_startup_from_company_analysis(public.company_analyses)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_startup_from_company_analysis(public.company_analyses)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sync_company_analysis_to_startup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.upsert_startup_from_company_analysis(NEW);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_company_analysis_to_startup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_company_analysis_to_startup() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_sync_company_analysis_to_startup ON public.company_analyses;
CREATE TRIGGER trg_sync_company_analysis_to_startup
  AFTER INSERT OR UPDATE OF company_name, website_url, logo_url, sector, stage, executive_summary
  ON public.company_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_company_analysis_to_startup();

SELECT public.upsert_startup_from_company_analysis(c)
FROM public.company_analyses AS c;
