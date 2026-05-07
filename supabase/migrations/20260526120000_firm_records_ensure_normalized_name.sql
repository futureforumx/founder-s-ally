-- Repair DBs where firm search columns were never applied (partial migrate / old branch).
-- Safe to re-run: ADD COLUMN IF NOT EXISTS + replace trigger + refresh rows + indexes.
-- Depends on public.firm_search_normalize from 20260414203000_firm_investor_search_normalize.sql.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS normalized_name text,
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.firm_records_refresh_search_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  alias_blob text;
BEGIN
  NEW.normalized_name := public.firm_search_normalize(COALESCE(NEW.firm_name, ''), true);
  alias_blob := coalesce(array_to_string(NEW.aliases, ' '), '');
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.normalized_name, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(alias_blob, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(NEW.legal_name, '')), 'C');
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_firm_records_search_fields ON public.firm_records;
CREATE TRIGGER trg_firm_records_search_fields
  BEFORE INSERT OR UPDATE OF firm_name, aliases, legal_name
  ON public.firm_records
  FOR EACH ROW
  EXECUTE PROCEDURE public.firm_records_refresh_search_fields();

UPDATE public.firm_records
SET firm_name = firm_name
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_records_normalized_name_trgm
  ON public.firm_records USING gin (normalized_name gin_trgm_ops)
  WHERE deleted_at IS NULL AND normalized_name IS NOT NULL AND normalized_name <> '';

CREATE INDEX IF NOT EXISTS idx_firm_records_search_vector
  ON public.firm_records USING gin (search_vector)
  WHERE deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
