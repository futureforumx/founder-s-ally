-- Keep firm_records.domain filled from website_url host (normalized: no leading www., lowercased).
-- Funds already join firm_records via vc_funds.firm_record_id; this column was added (20260418150000)
-- without a backfill, so many rows had website_url set but domain NULL.

CREATE OR REPLACE FUNCTION public.firm_records_host_from_website_url(url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE
    WHEN url IS NULL OR url !~ '^https?://[^/]+' THEN NULL
    ELSE lower(
      regexp_replace(
        split_part((regexp_match(url, '^https?://([^/]+)'))[1], ':', 1),
        '^www\.',
        '',
        'i'
      )
    )
  END;
$$;

COMMENT ON FUNCTION public.firm_records_host_from_website_url(text) IS
  'Root host from firm_records.website_url (strip scheme, path, port, leading www.).';

-- One-time backfill for existing rows
UPDATE public.firm_records fr
SET domain = public.firm_records_host_from_website_url(fr.website_url)
WHERE fr.deleted_at IS NULL
  AND fr.website_url IS NOT NULL
  AND (fr.domain IS NULL OR btrim(fr.domain::text) = '');

CREATE OR REPLACE FUNCTION public.firm_records_sync_domain_from_website()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.website_url IS NOT NULL AND NEW.website_url ~ '^https?://[^/]+' THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.website_url IS DISTINCT FROM OLD.website_url) THEN
      IF NEW.domain IS NULL OR btrim(NEW.domain::text) = '' THEN
        NEW.domain := public.firm_records_host_from_website_url(NEW.website_url);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firm_records_domain_from_website ON public.firm_records;

CREATE TRIGGER trg_firm_records_domain_from_website
BEFORE INSERT OR UPDATE OF website_url ON public.firm_records
FOR EACH ROW
EXECUTE FUNCTION public.firm_records_sync_domain_from_website();

COMMENT ON TRIGGER trg_firm_records_domain_from_website ON public.firm_records IS
  'When domain is empty, derive it from website_url host (same normalization as backfill).';
