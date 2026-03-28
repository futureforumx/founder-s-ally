-- Dead-letter queue for failed API/scraper/enrichment operations.
-- Keep raw payloads so retries can recover without losing source data.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE "DeadLetterStatus" AS ENUM ('Pending Retry', 'Failed Permanent', 'Resolved');

CREATE TABLE "dead_letter_queue" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "target_table" TEXT NOT NULL,
    "target_id" TEXT,
    "failed_operation" TEXT NOT NULL,
    "error_message" TEXT,
    "raw_payload" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "status" "DeadLetterStatus" NOT NULL DEFAULT 'Pending Retry',
    "failed_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "dead_letter_queue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dead_letter_queue_status_failed_at_idx" ON "dead_letter_queue"("status", "failed_at");
CREATE INDEX "dead_letter_queue_target_table_target_id_idx" ON "dead_letter_queue"("target_table", "target_id");
