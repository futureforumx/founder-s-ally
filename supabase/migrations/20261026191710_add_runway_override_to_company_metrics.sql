ALTER TABLE public.company_metrics
  ADD COLUMN runway_is_override BOOLEAN NOT NULL DEFAULT false;

-- Preserve manually entered runway values that predate the override control.
UPDATE public.company_metrics
SET runway_is_override = true
WHERE runway IS NOT NULL;
