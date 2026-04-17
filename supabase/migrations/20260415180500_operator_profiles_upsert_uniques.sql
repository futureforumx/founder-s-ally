-- Idempotent upserts from scripts/seed-operator-profiles.ts require unique targets for ON CONFLICT.
-- Use full unique indexes (Postgres allows many NULLs); partial uniques are not usable by PostgREST upsert.

CREATE UNIQUE INDEX IF NOT EXISTS operator_profiles_people_id_unique
  ON public.operator_profiles (people_id);

CREATE UNIQUE INDEX IF NOT EXISTS operator_profiles_source_source_id_unique
  ON public.operator_profiles (source, source_id);
