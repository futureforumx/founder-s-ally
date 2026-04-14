-- HQ audit log + BEFORE UPDATE guard (canonical_hq_locked) + Andreessen Horowitz canonical fix.
-- Depends on columns from 20260414120000_firm_records_canonical_hq_governance.sql

-- ── Audit table (lightweight; service_role / postgres bypass RLS) ────────────
CREATE TABLE IF NOT EXISTS public.firm_records_hq_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firm_records (id) ON DELETE CASCADE,
  old_hq_city text,
  old_hq_state text,
  old_hq_country text,
  old_location text,
  new_hq_city text,
  new_hq_state text,
  new_hq_country text,
  new_location text,
  source text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firm_records_hq_audit_firm_id_changed_at
  ON public.firm_records_hq_audit (firm_id, changed_at DESC);

COMMENT ON TABLE public.firm_records_hq_audit IS
  'Append-only log when hq_city/hq_state/hq_country or legacy location changes on firm_records.';

ALTER TABLE public.firm_records_hq_audit ENABLE ROW LEVEL SECURITY;

-- ── AFTER UPDATE: append audit row when HQ / location changed ───────────────
CREATE OR REPLACE FUNCTION public.trg_firm_records_hq_audit_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.hq_city IS DISTINCT FROM NEW.hq_city)
     OR (OLD.hq_state IS DISTINCT FROM NEW.hq_state)
     OR (OLD.hq_country IS DISTINCT FROM NEW.hq_country)
     OR (OLD.location IS DISTINCT FROM NEW.location)
  THEN
    INSERT INTO public.firm_records_hq_audit (
      firm_id,
      old_hq_city, old_hq_state, old_hq_country, old_location,
      new_hq_city, new_hq_state, new_hq_country, new_location,
      source
    ) VALUES (
      NEW.id,
      OLD.hq_city, OLD.hq_state, OLD.hq_country, OLD.location,
      NEW.hq_city, NEW.hq_state, NEW.hq_country, NEW.location,
      COALESCE(NEW.canonical_hq_source, OLD.canonical_hq_source, 'unknown')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firm_records_hq_audit ON public.firm_records;
CREATE TRIGGER trg_firm_records_hq_audit
  AFTER UPDATE ON public.firm_records
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_firm_records_hq_audit_fn();

-- ── BEFORE UPDATE: block HQ drift when canonical_hq_locked ──────────────────
CREATE OR REPLACE FUNCTION public.trg_firm_records_canonical_hq_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.canonical_hq_locked, false) THEN
    -- Admin unlock in the same UPDATE: allow all submitted values through
    IF NEW.canonical_hq_locked IS FALSE AND OLD.canonical_hq_locked IS TRUE THEN
      RETURN NEW;
    END IF;

    -- Still locked: strip automated changes to HQ + legacy location + provenance
    IF COALESCE(NEW.canonical_hq_locked, false) THEN
      NEW.hq_city := OLD.hq_city;
      NEW.hq_state := OLD.hq_state;
      NEW.hq_country := OLD.hq_country;
      NEW.hq_zip_code := OLD.hq_zip_code;
      NEW.hq_region := OLD.hq_region;
      NEW.address := OLD.address;
      NEW.location := OLD.location;
      NEW.locations := OLD.locations;
      NEW.canonical_hq_source := OLD.canonical_hq_source;
      NEW.canonical_hq_set_at := OLD.canonical_hq_set_at;
      NEW.canonical_hq_locked := OLD.canonical_hq_locked;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firm_records_canonical_hq_guard ON public.firm_records;
CREATE TRIGGER trg_firm_records_canonical_hq_guard
  BEFORE UPDATE ON public.firm_records
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_firm_records_canonical_hq_guard_fn();

-- ── Production fix: Andreessen Horowitz canonical HQ (Menlo Park) ───────────
UPDATE public.firm_records
SET
  hq_city = 'Menlo Park',
  hq_state = 'CA',
  hq_country = 'US',
  location = 'Menlo Park, CA, US',
  canonical_hq_locked = true,
  canonical_hq_source = 'manual_admin',
  canonical_hq_set_at = now(),
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('Andreessen Horowitz'));
