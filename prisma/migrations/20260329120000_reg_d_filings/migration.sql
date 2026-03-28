-- SEC Form D (Regulation D) filings: VC funds vs startup issuers.

CREATE TYPE "RegDFilingKind" AS ENUM ('VC_FUND', 'STARTUP');

CREATE TABLE "reg_d_filings" (
  "id" TEXT NOT NULL,
  "kind" "RegDFilingKind" NOT NULL,
  "entity_name" TEXT NOT NULL,
  "industry_group" TEXT,
  "total_offering_raw" TEXT,
  "amount_raised_usd" DOUBLE PRECISION,
  "filing_date" TIMESTAMP(3),
  "source_url" TEXT NOT NULL,
  "index_url" TEXT,
  "sec_cik" TEXT,
  "sec_accession" TEXT,
  "vc_firm_id" TEXT,
  "vc_fund_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reg_d_filings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reg_d_filings_source_url_key" UNIQUE ("source_url")
);

CREATE INDEX "reg_d_filings_kind_filing_date_idx" ON "reg_d_filings"("kind", "filing_date");
CREATE INDEX "reg_d_filings_sec_cik_idx" ON "reg_d_filings"("sec_cik");
CREATE INDEX "reg_d_filings_vc_firm_id_idx" ON "reg_d_filings"("vc_firm_id");
CREATE INDEX "reg_d_filings_vc_fund_id_idx" ON "reg_d_filings"("vc_fund_id");

ALTER TABLE "reg_d_filings" ADD CONSTRAINT "reg_d_filings_vc_firm_id_fkey"
  FOREIGN KEY ("vc_firm_id") REFERENCES "vc_firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reg_d_filings" ADD CONSTRAINT "reg_d_filings_vc_fund_id_fkey"
  FOREIGN KEY ("vc_fund_id") REFERENCES "vc_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
