-- Hub / category URL the article was discovered from (for audit + source_url reporting).
ALTER TABLE "source_articles" ADD COLUMN IF NOT EXISTS "listing_url" TEXT;

CREATE INDEX IF NOT EXISTS "source_articles_listing_url_idx" ON "source_articles" ("listing_url");
