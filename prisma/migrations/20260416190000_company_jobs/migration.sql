-- Normalized job postings per organization (ingested by scripts/company-jobs-ingest).

CREATE TYPE "company_job_source_type" AS ENUM ('WEBSITE', 'ASHBY', 'GREENHOUSE', 'LEVER');

CREATE TABLE "company_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "source_type" "company_job_source_type" NOT NULL,
    "source_url" TEXT,
    "external_job_id" VARCHAR(256),
    "title" TEXT NOT NULL,
    "department" TEXT,
    "team" TEXT,
    "location" TEXT,
    "location_type" VARCHAR(32),
    "employment_type" VARCHAR(64),
    "posted_at" TIMESTAMPTZ(6),
    "apply_url" TEXT NOT NULL,
    "description_snippet" TEXT,
    "description_raw" TEXT,
    "compensation_text" TEXT,
    "compensation_min" DECIMAL(18,2),
    "compensation_max" DECIMAL(18,2),
    "compensation_currency" VARCHAR(8),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupe_key" VARCHAR(512) NOT NULL,
    "raw_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_jobs_organization_id_dedupe_key_key" ON "company_jobs"("organization_id", "dedupe_key");
CREATE INDEX "company_jobs_organization_id_is_active_idx" ON "company_jobs"("organization_id", "is_active");
CREATE INDEX "company_jobs_organization_id_last_seen_at_idx" ON "company_jobs"("organization_id", "last_seen_at" DESC);

ALTER TABLE "company_jobs" ADD CONSTRAINT "company_jobs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "company_job_ingestion_runs" (
    "id" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "status" VARCHAR(24) NOT NULL,
    "error_message" TEXT,
    "jobs_upserted" INTEGER NOT NULL DEFAULT 0,
    "jobs_deactivated" INTEGER NOT NULL DEFAULT 0,
    "source_detection_json" JSONB,

    CONSTRAINT "company_job_ingestion_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "company_job_ingestion_runs_organization_id_started_at_idx"
  ON "company_job_ingestion_runs"("organization_id", "started_at" DESC);

ALTER TABLE "company_job_ingestion_runs" ADD CONSTRAINT "company_job_ingestion_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
