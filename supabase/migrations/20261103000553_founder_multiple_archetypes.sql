ALTER TABLE public.startup_founders
  ADD COLUMN IF NOT EXISTS founder_archetypes text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.operator_profiles
  ADD COLUMN IF NOT EXISTS founder_archetypes text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE public.startup_founders
SET founder_archetypes = ARRAY[founder_archetype::text]
WHERE founder_archetype IS NOT NULL
  AND founder_archetype::text <> 'SERIAL_ENTREPRENEUR'
  AND cardinality(founder_archetypes) = 0;

COMMENT ON COLUMN public.startup_founders.founder_archetypes IS
  'Multiple founder archetypes, stored as normalized labels such as TECHNICAL, PRODUCT, or DOMAIN_EXPERT.';
COMMENT ON COLUMN public.operator_profiles.founder_archetypes IS
  'Founder archetypes when an operator profile is represented as a founder; stored as normalized labels.';
