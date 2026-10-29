-- The admin startup editor uses lower-case stage keys. Keep the enum in sync
-- so the canonical series_b option is accepted by Postgres.
ALTER TYPE public."OperatorCompanyStage" ADD VALUE IF NOT EXISTS 'series_b';
