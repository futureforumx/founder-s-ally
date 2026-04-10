-- =============================================================================
-- Migration: Form ADV Schedule D columns for fund_records + SEC identifiers
--            for firm_records (adviser linkage)
-- =============================================================================

-- ---------------------------------------------------------------
-- 1. firm_records — add SEC / CRD identifiers (adviser linking)
-- ---------------------------------------------------------------

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS sec_file_number    text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS adviser_crd_number text DEFAULT NULL;

COMMENT ON COLUMN public.firm_records.sec_file_number
  IS 'SEC investment adviser file number, e.g. "801-122957"';
COMMENT ON COLUMN public.firm_records.adviser_crd_number
  IS 'IARD/FINRA CRD number for the registered investment adviser';

CREATE INDEX IF NOT EXISTS firm_records_sec_file_number_idx
  ON public.firm_records (sec_file_number)
  WHERE sec_file_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS firm_records_adviser_crd_number_idx
  ON public.firm_records (adviser_crd_number)
  WHERE adviser_crd_number IS NOT NULL;

-- ---------------------------------------------------------------
-- 2. fund_records — Form ADV Schedule D specific columns
-- ---------------------------------------------------------------

-- Adviser identity (denormalized from the adviser record for query convenience)
ALTER TABLE public.fund_records
  ADD COLUMN IF NOT EXISTS adviser_legal_name        text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS adviser_sec_file_number   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS adviser_crd_number        text DEFAULT NULL;

COMMENT ON COLUMN public.fund_records.adviser_legal_name
  IS 'Legal name of the investment adviser that filed this fund on Form ADV';
COMMENT ON COLUMN public.fund_records.adviser_sec_file_number
  IS 'SEC file number of the adviser (e.g. "801-122957")';
COMMENT ON COLUMN public.fund_records.adviser_crd_number
  IS 'IARD/FINRA CRD number of the adviser';

-- Private fund identification (SEC-assigned)
ALTER TABLE public.fund_records
  ADD COLUMN IF NOT EXISTS private_fund_identification_number text DEFAULT NULL;

COMMENT ON COLUMN public.fund_records.private_fund_identification_number
  IS 'SEC-assigned private fund ID from Schedule D 7B1 (e.g. "805-1534393064")';

CREATE UNIQUE INDEX IF NOT EXISTS fund_records_pfin_idx
  ON public.fund_records (private_fund_identification_number)
  WHERE private_fund_identification_number IS NOT NULL;

-- Jurisdiction & category
ALTER TABLE public.fund_records
  ADD COLUMN IF NOT EXISTS fund_organization_jurisdiction text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fund_category                  text DEFAULT NULL;

COMMENT ON COLUMN public.fund_records.fund_organization_jurisdiction
  IS 'State/country of fund organization from Schedule D (e.g. "DE", "Cayman Islands")';
COMMENT ON COLUMN public.fund_records.fund_category
  IS 'Fund type per Schedule D 7B1 (e.g. "Hedge Fund", "Venture Capital Fund", "Private Equity Fund")';

-- Financials from Schedule D
ALTER TABLE public.fund_records
  ADD COLUMN IF NOT EXISTS current_gross_asset_value_usd      double precision DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS minimum_investment_commitment_usd   double precision DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approximate_beneficial_owner_count  integer DEFAULT NULL;

COMMENT ON COLUMN public.fund_records.current_gross_asset_value_usd
  IS 'Gross asset value as of most recent Schedule D filing (USD)';
COMMENT ON COLUMN public.fund_records.minimum_investment_commitment_usd
  IS 'Minimum investment commitment required from investors (USD)';
COMMENT ON COLUMN public.fund_records.approximate_beneficial_owner_count
  IS 'Approximate number of beneficial owners as reported on Schedule D';

-- Ownership breakdown
ALTER TABLE public.fund_records
  ADD COLUMN IF NOT EXISTS percent_owned_by_related_persons  numeric(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS percent_owned_by_funds_of_funds   numeric(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS percent_owned_by_non_us_persons   numeric(5,2) DEFAULT NULL;

COMMENT ON COLUMN public.fund_records.percent_owned_by_related_persons
  IS '% of fund owned by adviser and related persons (Schedule D %Owned You or Related)';
COMMENT ON COLUMN public.fund_records.percent_owned_by_funds_of_funds
  IS '% of fund owned by funds of funds (Schedule D %Owned Funds)';
COMMENT ON COLUMN public.fund_records.percent_owned_by_non_us_persons
  IS '% of fund owned by non-US persons (Schedule D %Owned Non-US)';

-- Boolean flags from Schedule D
ALTER TABLE public.fund_records
  ADD COLUMN IF NOT EXISTS adviser_is_subadviser  boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS other_advisers         boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS solicited_to_invest    boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS regulation_d_relied_on boolean DEFAULT NULL;

COMMENT ON COLUMN public.fund_records.adviser_is_subadviser
  IS 'Whether the filing adviser acts as sub-adviser to this fund';
COMMENT ON COLUMN public.fund_records.other_advisers
  IS 'Whether other investment advisers also advise this fund';
COMMENT ON COLUMN public.fund_records.solicited_to_invest
  IS 'Whether clients were solicited to invest in this fund';
COMMENT ON COLUMN public.fund_records.regulation_d_relied_on
  IS 'Whether the fund relied on Regulation D exemption from registration';

-- Cross-reference identifiers
ALTER TABLE public.fund_records
  ADD COLUMN IF NOT EXISTS form_d_file_number text DEFAULT NULL;

COMMENT ON COLUMN public.fund_records.form_d_file_number
  IS 'SEC Form D file number if cross-referenced (e.g. "021-123456")';

-- Service provider names (from sub-tables 7B1A22-7B1A28)
ALTER TABLE public.fund_records
  ADD COLUMN IF NOT EXISTS auditor_name      text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prime_broker_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS marketer_name     text DEFAULT NULL;

COMMENT ON COLUMN public.fund_records.auditor_name
  IS 'Name of the independent public accountant auditing this fund (Schedule D 7B1A22)';
COMMENT ON COLUMN public.fund_records.prime_broker_name
  IS 'Name of the prime broker for this fund (Schedule D 7B1A24)';
COMMENT ON COLUMN public.fund_records.marketer_name
  IS 'Name of the marketing agent for this fund (Schedule D 7B1A28)';

-- Source metadata
ALTER TABLE public.fund_records
  ADD COLUMN IF NOT EXISTS source_filing_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_filed_at    timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.fund_records.source_filing_type
  IS 'Which filing type produced this record (e.g. "form_adv_schedule_d", "form_d")';
COMMENT ON COLUMN public.fund_records.source_filed_at
  IS 'Date/time the source filing was submitted to the SEC';

-- ---------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------

CREATE INDEX IF NOT EXISTS fund_records_adviser_crd_idx
  ON public.fund_records (adviser_crd_number)
  WHERE adviser_crd_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS fund_records_adviser_sec_idx
  ON public.fund_records (adviser_sec_file_number)
  WHERE adviser_sec_file_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS fund_records_fund_category_idx
  ON public.fund_records (fund_category)
  WHERE fund_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS fund_records_source_filing_type_idx
  ON public.fund_records (source_filing_type)
  WHERE source_filing_type IS NOT NULL;
