-- PostgREST upsert(onConflict) requires a non-partial unique index it can infer.
-- Replace partial uniques from 20260415200000 with full unique indexes (Postgres allows many NULLs).

DROP INDEX IF EXISTS public.operator_profiles_people_id_unique;
DROP INDEX IF EXISTS public.operator_profiles_source_source_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS operator_profiles_people_id_unique
  ON public.operator_profiles (people_id);

CREATE UNIQUE INDEX IF NOT EXISTS operator_profiles_source_source_id_unique
  ON public.operator_profiles (source, source_id);
