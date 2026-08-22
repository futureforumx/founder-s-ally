-- Shared raw listing cache for GHA ingest jobs (TechCrunch / AlleyWatch RSS).
-- Distinct from source_articles (processed extraction state).

CREATE TABLE "raw_source_articles" (
  "id" TEXT NOT NULL,
  "source_key" "FundingIngestSourceKey" NOT NULL,
  "canonical_url" TEXT NOT NULL,
  "article_url" TEXT NOT NULL,
  "listing_url" TEXT,
  "title" TEXT NOT NULL,
  "published_at" TIMESTAMPTZ(6),
  "summary" TEXT,
  "raw_payload" JSONB NOT NULL,
  "content_hash" VARCHAR(128) NOT NULL,
  "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "raw_source_articles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "raw_source_articles_source_key_canonical_url_key"
  ON "raw_source_articles" ("source_key", "canonical_url");

CREATE INDEX "raw_source_articles_source_key_published_at_idx"
  ON "raw_source_articles" ("source_key", "published_at");

CREATE INDEX "raw_source_articles_source_key_fetched_at_idx"
  ON "raw_source_articles" ("source_key", "fetched_at");
