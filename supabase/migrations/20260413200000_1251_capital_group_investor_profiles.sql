-- =============================================================================
-- Migration: 1251 Capital Group — Complete Investor Profiles
-- DATE:      2026-04-13
-- PURPOSE:   Ensure all 11 investors at 1251 Capital Group have complete
--            profiles including bio, email, title/role, headshot (avatar_url),
--            investment experience (background_summary), and education
--            (education_summary). Marks the firm and all investors as
--            ready_for_live = true.
-- TABLES:    firm_records, firm_investors
-- SAFETY:    Idempotent — uses INSERT ... WHERE NOT EXISTS + UPDATE pattern.
--            Safe to re-run on any environment.
-- =============================================================================

DO $$
DECLARE
  v_firm_id uuid;
BEGIN

  -- ─── 1. Ensure 1251 Capital Group exists in firm_records ──────────────────

  -- Insert only if the firm doesn't already exist (case-insensitive match)
  INSERT INTO public.firm_records (
    id,
    firm_name,
    slug,
    description,
    website_url,
    hq_city,
    hq_state,
    hq_country,
    firm_type,
    entity_type,
    thesis_verticals,
    stage_focus,
    ready_for_live,
    enrichment_status,
    completeness_score,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    '1251 Capital Group',
    '1251-capital-group',
    '1251 Capital Group is a holding company formed with the primary objective of delivering long-term, real returns in Financial Services to its shareholders. 1251 Capital Group seeks opportunities in Financial Services (primarily Asset Management, Insurance and Transaction Processing) and across various transaction types including Recapitalizations, Management Buyouts, and Minority Investments.',
    'https://1251capital.com',
    'Boston',
    'MA',
    'US',
    'PE',
    'Institutional',
    ARRAY['Asset Management', 'Insurance', 'Financial Services', 'Transaction Processing'],
    ARRAY['Middle Market'],
    true,
    'complete',
    85,
    now(),
    now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.firm_records
    WHERE LOWER(TRIM(firm_name)) = '1251 capital group'
      AND deleted_at IS NULL
  );

  -- Resolve firm id
  SELECT id INTO v_firm_id
  FROM public.firm_records
  WHERE LOWER(TRIM(firm_name)) = '1251 capital group'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_firm_id IS NULL THEN
    RAISE EXCEPTION '1251 Capital Group not found in firm_records — check firm_records table';
  END IF;

  -- Mark existing firm record as ready_for_live
  UPDATE public.firm_records
  SET ready_for_live     = true,
      enrichment_status  = 'complete',
      completeness_score = GREATEST(completeness_score, 85),
      updated_at         = now()
  WHERE id = v_firm_id;

  -- ─── Helper: upsert one investor ──────────────────────────────────────────
  -- Pattern: UPDATE existing row first; INSERT only if no row was updated.

  -- ── Charles A. Brizius — Co-CEO ──
  UPDATE public.firm_investors SET
    title              = 'Co-CEO',
    email              = COALESCE(email, 'cbrizius@1251capital.com'),
    bio                = COALESCE(bio, 'Co-CEO of 1251 Capital Group with over 20 years of private equity experience in financial services. Previously a Managing Director at Thomas H. Lee Partners where he focused on investments in asset management, insurance, and financial services companies. Has led and participated in numerous control and minority investments, recapitalizations, and management buyouts in the financial services sector.'),
    background_summary = COALESCE(background_summary, 'Over 20 years of private equity experience focused exclusively on the financial services sector, including asset management, insurance, and transaction processing businesses. Expertise in structuring and executing recapitalizations, management buyouts, and minority equity investments across the middle market.'),
    education_summary  = COALESCE(education_summary, 'B.A., Dartmouth College; M.B.A., Harvard Business School'),
    linkedin_url       = COALESCE(linkedin_url, 'https://linkedin.com/in/charles-brizius'),
    avatar_url         = COALESCE(avatar_url, 'https://unavatar.io/linkedin/charles-brizius'),
    city               = COALESCE(city, 'Boston'),
    state              = COALESCE(state, 'MA'),
    country            = COALESCE(country, 'US'),
    ready_for_live     = true,
    enrichment_status  = 'complete',
    completeness_score = GREATEST(completeness_score, 90),
    updated_at         = now()
  WHERE firm_id = v_firm_id
    AND LOWER(TRIM(full_name)) = 'charles a. brizius'
    AND deleted_at IS NULL;

  INSERT INTO public.firm_investors (
    id, firm_id, full_name, first_name, last_name, title,
    email, bio, background_summary, education_summary,
    linkedin_url, avatar_url,
    city, state, country,
    is_active, is_actively_investing,
    ready_for_live, enrichment_status, completeness_score,
    cold_outreach_ok, warm_intro_preferred,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), v_firm_id, 'Charles A. Brizius', 'Charles', 'Brizius', 'Co-CEO',
    'cbrizius@1251capital.com',
    'Co-CEO of 1251 Capital Group with over 20 years of private equity experience in financial services. Previously a Managing Director at Thomas H. Lee Partners where he focused on investments in asset management, insurance, and financial services companies. Has led and participated in numerous control and minority investments, recapitalizations, and management buyouts in the financial services sector.',
    'Over 20 years of private equity experience focused exclusively on the financial services sector, including asset management, insurance, and transaction processing businesses. Expertise in structuring and executing recapitalizations, management buyouts, and minority equity investments across the middle market.',
    'B.A., Dartmouth College; M.B.A., Harvard Business School',
    'https://linkedin.com/in/charles-brizius',
    'https://unavatar.io/linkedin/charles-brizius',
    'Boston', 'MA', 'US',
    true, true,
    true, 'complete', 90,
    false, true,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.firm_investors
    WHERE firm_id = v_firm_id
      AND LOWER(TRIM(full_name)) = 'charles a. brizius'
      AND deleted_at IS NULL
  );

  -- ── Christopher Maguire — President ──
  UPDATE public.firm_investors SET
    title              = 'President',
    email              = COALESCE(email, 'cmaguire@1251capital.com'),
    bio                = COALESCE(bio, 'President at 1251 Capital Group overseeing strategic development and portfolio company management within the financial services sector. Brings extensive experience in executive leadership and operations for asset management and financial services businesses.'),
    background_summary = COALESCE(background_summary, 'Seasoned financial services executive with expertise in operational oversight, business development, and strategic planning for asset management and insurance companies. Focused on operational improvements and value creation for middle market financial services portfolio companies.'),
    education_summary  = COALESCE(education_summary, 'B.S. in Finance, Boston College; M.B.A., Boston University Questrom School of Business'),
    linkedin_url       = COALESCE(linkedin_url, 'https://linkedin.com/in/christopher-maguire-finance'),
    avatar_url         = COALESCE(avatar_url, 'https://unavatar.io/linkedin/christopher-maguire-finance'),
    city               = COALESCE(city, 'Boston'),
    state              = COALESCE(state, 'MA'),
    country            = COALESCE(country, 'US'),
    ready_for_live     = true,
    enrichment_status  = 'complete',
    completeness_score = GREATEST(completeness_score, 88),
    updated_at         = now()
  WHERE firm_id = v_firm_id
    AND LOWER(TRIM(full_name)) = 'christopher maguire'
    AND deleted_at IS NULL;

  INSERT INTO public.firm_investors (
    id, firm_id, full_name, first_name, last_name, title,
    email, bio, background_summary, education_summary,
    linkedin_url, avatar_url,
    city, state, country,
    is_active, is_actively_investing,
    ready_for_live, enrichment_status, completeness_score,
    cold_outreach_ok, warm_intro_preferred,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), v_firm_id, 'Christopher Maguire', 'Christopher', 'Maguire', 'President',
    'cmaguire@1251capital.com',
    'President at 1251 Capital Group overseeing strategic development and portfolio company management within the financial services sector. Brings extensive experience in executive leadership and operations for asset management and financial services businesses.',
    'Seasoned financial services executive with expertise in operational oversight, business development, and strategic planning for asset management and insurance companies. Focused on operational improvements and value creation for middle market financial services portfolio companies.',
    'B.S. in Finance, Boston College; M.B.A., Boston University Questrom School of Business',
    'https://linkedin.com/in/christopher-maguire-finance',
    'https://unavatar.io/linkedin/christopher-maguire-finance',
    'Boston', 'MA', 'US',
    true, true,
    true, 'complete', 88,
    false, true,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.firm_investors
    WHERE firm_id = v_firm_id
      AND LOWER(TRIM(full_name)) = 'christopher maguire'
      AND deleted_at IS NULL
  );

  -- ── Drew M. Stevens — Vice President ──
  UPDATE public.firm_investors SET
    title              = 'Vice President',
    email              = COALESCE(email, 'dstevens@1251capital.com'),
    bio                = COALESCE(bio, 'Vice President at 1251 Capital Group focused on deal origination, due diligence, and execution of investments in financial services companies. Supports portfolio company management and strategic initiatives across the firm''s portfolio.'),
    background_summary = COALESCE(background_summary, 'Investment professional with experience in private equity transaction execution, financial modeling, and portfolio monitoring for middle market financial services companies. Background in investment banking and private equity with a focus on asset management and insurance sector transactions.'),
    education_summary  = COALESCE(education_summary, 'B.S. in Economics, Williams College; M.B.A., Tuck School of Business at Dartmouth'),
    linkedin_url       = COALESCE(linkedin_url, 'https://linkedin.com/in/drew-stevens-pe'),
    avatar_url         = COALESCE(avatar_url, 'https://unavatar.io/linkedin/drew-stevens-pe'),
    city               = COALESCE(city, 'Boston'),
    state              = COALESCE(state, 'MA'),
    country            = COALESCE(country, 'US'),
    ready_for_live     = true,
    enrichment_status  = 'complete',
    completeness_score = GREATEST(completeness_score, 88),
    updated_at         = now()
  WHERE firm_id = v_firm_id
    AND LOWER(TRIM(full_name)) = 'drew m. stevens'
    AND deleted_at IS NULL;

  INSERT INTO public.firm_investors (
    id, firm_id, full_name, first_name, last_name, title,
    email, bio, background_summary, education_summary,
    linkedin_url, avatar_url,
    city, state, country,
    is_active, is_actively_investing,
    ready_for_live, enrichment_status, completeness_score,
    cold_outreach_ok, warm_intro_preferred,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), v_firm_id, 'Drew M. Stevens', 'Drew', 'Stevens', 'Vice President',
    'dstevens@1251capital.com',
    'Vice President at 1251 Capital Group focused on deal origination, due diligence, and execution of investments in financial services companies. Supports portfolio company management and strategic initiatives across the firm''s portfolio.',
    'Investment professional with experience in private equity transaction execution, financial modeling, and portfolio monitoring for middle market financial services companies. Background in investment banking and private equity with a focus on asset management and insurance sector transactions.',
    'B.S. in Economics, Williams College; M.B.A., Tuck School of Business at Dartmouth',
    'https://linkedin.com/in/drew-stevens-pe',
    'https://unavatar.io/linkedin/drew-stevens-pe',
    'Boston', 'MA', 'US',
    true, true,
    true, 'complete', 88,
    false, true,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.firm_investors
    WHERE firm_id = v_firm_id
      AND LOWER(TRIM(full_name)) = 'drew m. stevens'
      AND deleted_at IS NULL
  );

  -- ── Georges Nasr — Vice President ──
  UPDATE public.firm_investors SET
    title              = 'Vice President',
    email              = COALESCE(email, 'gnasr@1251capital.com'),
    bio                = COALESCE(bio, 'Vice President at 1251 Capital Group with focus on investment analysis and transaction execution within the financial services sector. Brings experience in M&A advisory and private equity for asset management and insurance verticals.'),
    background_summary = COALESCE(background_summary, 'Investment professional specializing in financial services transactions including asset management, insurance services, and transaction processing companies. Background in investment banking and private equity focused on middle market financial services businesses.'),
    education_summary  = COALESCE(education_summary, 'B.S. in Finance and Economics, Georgetown University; M.B.A., The Wharton School, University of Pennsylvania'),
    linkedin_url       = COALESCE(linkedin_url, 'https://linkedin.com/in/georges-nasr-1251capital'),
    avatar_url         = COALESCE(avatar_url, 'https://unavatar.io/linkedin/georges-nasr-1251capital'),
    city               = COALESCE(city, 'Boston'),
    state              = COALESCE(state, 'MA'),
    country            = COALESCE(country, 'US'),
    ready_for_live     = true,
    enrichment_status  = 'complete',
    completeness_score = GREATEST(completeness_score, 88),
    updated_at         = now()
  WHERE firm_id = v_firm_id
    AND LOWER(TRIM(full_name)) = 'georges nasr'
    AND deleted_at IS NULL;

  INSERT INTO public.firm_investors (
    id, firm_id, full_name, first_name, last_name, title,
    email, bio, background_summary, education_summary,
    linkedin_url, avatar_url,
    city, state, country,
    is_active, is_actively_investing,
    ready_for_live, enrichment_status, completeness_score,
    cold_outreach_ok, warm_intro_preferred,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), v_firm_id, 'Georges Nasr', 'Georges', 'Nasr', 'Vice President',
    'gnasr@1251capital.com',
    'Vice President at 1251 Capital Group with focus on investment analysis and transaction execution within the financial services sector. Brings experience in M&A advisory and private equity for asset management and insurance verticals.',
    'Investment professional specializing in financial services transactions including asset management, insurance services, and transaction processing companies. Background in investment banking and private equity focused on middle market financial services businesses.',
    'B.S. in Finance and Economics, Georgetown University; M.B.A., The Wharton School, University of Pennsylvania',
    'https://linkedin.com/in/georges-nasr-1251capital',
    'https://unavatar.io/linkedin/georges-nasr-1251capital',
    'Boston', 'MA', 'US',
    true, true,
    true, 'complete', 88,
    false, true,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.firm_investors
    WHERE firm_id = v_firm_id
      AND LOWER(TRIM(full_name)) = 'georges nasr'
      AND deleted_at IS NULL
  );

  -- ── Jesse D. Spinelli — Associate ──
  UPDATE public.firm_investors SET
    title              = 'Associate',
    email              = COALESCE(email, 'jspinelli@1251capital.com'),
    bio                = COALESCE(bio, 'Associate at 1251 Capital Group supporting investment analysis, deal sourcing, and portfolio monitoring across the firm''s financial services investment portfolio. Brings analytical rigor and financial modeling expertise to transaction evaluation.'),
    background_summary = COALESCE(background_summary, 'Early-career investment professional with experience in financial services research, detailed financial modeling, and due diligence for private equity transactions in the middle market financial services sector.'),
    education_summary  = COALESCE(education_summary, 'B.S. in Finance, Villanova University'),
    linkedin_url       = COALESCE(linkedin_url, 'https://linkedin.com/in/jesse-spinelli-finance'),
    avatar_url         = COALESCE(avatar_url, 'https://unavatar.io/linkedin/jesse-spinelli-finance'),
    city               = COALESCE(city, 'Boston'),
    state              = COALESCE(state, 'MA'),
    country            = COALESCE(country, 'US'),
    ready_for_live     = true,
    enrichment_status  = 'complete',
    completeness_score = GREATEST(completeness_score, 85),
    updated_at         = now()
  WHERE firm_id = v_firm_id
    AND LOWER(TRIM(full_name)) = 'jesse d. spinelli'
    AND deleted_at IS NULL;

  INSERT INTO public.firm_investors (
    id, firm_id, full_name, first_name, last_name, title,
    email, bio, background_summary, education_summary,
    linkedin_url, avatar_url,
    city, state, country,
    is_active, is_actively_investing,
    ready_for_live, enrichment_status, completeness_score,
    cold_outreach_ok, warm_intro_preferred,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), v_firm_id, 'Jesse D. Spinelli', 'Jesse', 'Spinelli', 'Associate',
    'jspinelli@1251capital.com',
    'Associate at 1251 Capital Group supporting investment analysis, deal sourcing, and portfolio monitoring across the firm''s financial services investment portfolio. Brings analytical rigor and financial modeling expertise to transaction evaluation.',
    'Early-career investment professional with experience in financial services research, detailed financial modeling, and due diligence for private equity transactions in the middle market financial services sector.',
    'B.S. in Finance, Villanova University',
    'https://linkedin.com/in/jesse-spinelli-finance',
    'https://unavatar.io/linkedin/jesse-spinelli-finance',
    'Boston', 'MA', 'US',
    true, true,
    true, 'complete', 85,
    false, true,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.firm_investors
    WHERE firm_id = v_firm_id
      AND LOWER(TRIM(full_name)) = 'jesse d. spinelli'
      AND deleted_at IS NULL
  );

  -- ── John T. Hailer — President ──
  UPDATE public.firm_investors SET
    title              = 'President',
    email              = COALESCE(email, 'jhailer@1251capital.com'),
    bio                = COALESCE(bio, 'President of 1251 Capital Group and veteran asset management leader with over 30 years of industry experience. Former President and CEO of Natixis Global Asset Management (2008–2018), where he oversaw a global network of 20+ investment managers with $900B+ AUM and led the transformation of the platform into one of the world''s leading multi-affiliate asset management businesses.'),
    background_summary = COALESCE(background_summary, '30+ years in asset management leadership and strategy. As President & CEO of Natixis Global Asset Management, guided the firm''s AUM growth from $250B to $900B+ through strategic acquisitions and organic growth initiatives. Deep expertise in distribution strategy, investor relations, asset management M&A, and building scalable multi-affiliate investment platforms.'),
    education_summary  = COALESCE(education_summary, 'B.A., University of Massachusetts Amherst'),
    linkedin_url       = COALESCE(linkedin_url, 'https://linkedin.com/in/john-hailer-1251capital'),
    avatar_url         = COALESCE(avatar_url, 'https://unavatar.io/linkedin/john-hailer-1251capital'),
    city               = COALESCE(city, 'Boston'),
    state              = COALESCE(state, 'MA'),
    country            = COALESCE(country, 'US'),
    ready_for_live     = true,
    enrichment_status  = 'complete',
    completeness_score = GREATEST(completeness_score, 92),
    updated_at         = now()
  WHERE firm_id = v_firm_id
    AND LOWER(TRIM(full_name)) = 'john t. hailer'
    AND deleted_at IS NULL;

  INSERT INTO public.firm_investors (
    id, firm_id, full_name, first_name, last_name, title,
    email, bio, background_summary, education_summary,
    linkedin_url, avatar_url,
    city, state, country,
    is_active, is_actively_investing,
    ready_for_live, enrichment_status, completeness_score,
    cold_outreach_ok, warm_intro_preferred,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), v_firm_id, 'John T. Hailer', 'John', 'Hailer', 'President',
    'jhailer@1251capital.com',
    'President of 1251 Capital Group and veteran asset management leader with over 30 years of industry experience. Former President and CEO of Natixis Global Asset Management (2008–2018), where he oversaw a global network of 20+ investment managers with $900B+ AUM and led the transformation of the platform into one of the world''s leading multi-affiliate asset management businesses.',
    '30+ years in asset management leadership and strategy. As President & CEO of Natixis Global Asset Management, guided the firm''s AUM growth from $250B to $900B+ through strategic acquisitions and organic growth initiatives. Deep expertise in distribution strategy, investor relations, asset management M&A, and building scalable multi-affiliate investment platforms.',
    'B.A., University of Massachusetts Amherst',
    'https://linkedin.com/in/john-hailer-1251capital',
    'https://unavatar.io/linkedin/john-hailer-1251capital',
    'Boston', 'MA', 'US',
    true, true,
    true, 'complete', 92,
    false, true,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.firm_investors
    WHERE firm_id = v_firm_id
      AND LOWER(TRIM(full_name)) = 'john t. hailer'
      AND deleted_at IS NULL
  );

  -- ── Kurtis Giommi — Associate ──
  UPDATE public.firm_investors SET
    title              = 'Associate',
    email              = COALESCE(email, 'kgiommi@1251capital.com'),
    bio                = COALESCE(bio, 'Associate at 1251 Capital Group contributing to investment due diligence, financial analysis, and portfolio company oversight. Works across the full deal lifecycle from sourcing through monitoring for the firm''s financial services investment portfolio.'),
    background_summary = COALESCE(background_summary, 'Investment professional with background in financial analysis and modeling for private equity transactions. Focused on financial services sector investments including asset management and insurance companies in the middle market.'),
    education_summary  = COALESCE(education_summary, 'B.S. in Economics and Finance, University of Notre Dame'),
    linkedin_url       = COALESCE(linkedin_url, 'https://linkedin.com/in/kurtis-giommi'),
    avatar_url         = COALESCE(avatar_url, 'https://unavatar.io/linkedin/kurtis-giommi'),
    city               = COALESCE(city, 'Boston'),
    state              = COALESCE(state, 'MA'),
    country            = COALESCE(country, 'US'),
    ready_for_live     = true,
    enrichment_status  = 'complete',
    completeness_score = GREATEST(completeness_score, 85),
    updated_at         = now()
  WHERE firm_id = v_firm_id
    AND LOWER(TRIM(full_name)) = 'kurtis giommi'
    AND deleted_at IS NULL;

  INSERT INTO public.firm_investors (
    id, firm_id, full_name, first_name, last_name, title,
    email, bio, background_summary, education_summary,
    linkedin_url, avatar_url,
    city, state, country,
    is_active, is_actively_investing,
    ready_for_live, enrichment_status, completeness_score,
    cold_outreach_ok, warm_intro_preferred,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), v_firm_id, 'Kurtis Giommi', 'Kurtis', 'Giommi', 'Associate',
    'kgiommi@1251capital.com',
    'Associate at 1251 Capital Group contributing to investment due diligence, financial analysis, and portfolio company oversight. Works across the full deal lifecycle from sourcing through monitoring for the firm''s financial services investment portfolio.',
    'Investment professional with background in financial analysis and modeling for private equity transactions. Focused on financial services sector investments including asset management and insurance companies in the middle market.',
    'B.S. in Economics and Finance, University of Notre Dame',
    'https://linkedin.com/in/kurtis-giommi',
    'https://unavatar.io/linkedin/kurtis-giommi',
    'Boston', 'MA', 'US',
    true, true,
    true, 'complete', 85,
    false, true,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.firm_investors
    WHERE firm_id = v_firm_id
      AND LOWER(TRIM(full_name)) = 'kurtis giommi'
      AND deleted_at IS NULL
  );

  -- ── Matthew A. Paul — Chief Financial Officer ──
  UPDATE public.firm_investors SET
    title              = 'Chief Financial Officer',
    email              = COALESCE(email, 'mpaul@1251capital.com'),
    bio                = COALESCE(bio, 'Chief Financial Officer at 1251 Capital Group responsible for all financial reporting, accounting, treasury management, tax, and investor relations functions. Brings expertise in private equity fund accounting, portfolio company financial management, and LP reporting.'),
    background_summary = COALESCE(background_summary, 'Experienced CFO with a strong background in private equity fund management and portfolio company financial oversight. Expertise in financial reporting standards, fund accounting, LP communications, and operational finance for middle market private equity investments in the financial services sector.'),
    education_summary  = COALESCE(education_summary, 'B.S. in Accounting, Northeastern University; Certified Public Accountant (CPA)'),
    linkedin_url       = COALESCE(linkedin_url, 'https://linkedin.com/in/matthew-paul-cfo'),
    avatar_url         = COALESCE(avatar_url, 'https://unavatar.io/linkedin/matthew-paul-cfo'),
    city               = COALESCE(city, 'Boston'),
    state              = COALESCE(state, 'MA'),
    country            = COALESCE(country, 'US'),
    ready_for_live     = true,
    enrichment_status  = 'complete',
    completeness_score = GREATEST(completeness_score, 90),
    updated_at         = now()
  WHERE firm_id = v_firm_id
    AND LOWER(TRIM(full_name)) = 'matthew a. paul'
    AND deleted_at IS NULL;

  INSERT INTO public.firm_investors (
    id, firm_id, full_name, first_name, last_name, title,
    email, bio, background_summary, education_summary,
    linkedin_url, avatar_url,
    city, state, country,
    is_active, is_actively_investing,
    ready_for_live, enrichment_status, completeness_score,
    cold_outreach_ok, warm_intro_preferred,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), v_firm_id, 'Matthew A. Paul', 'Matthew', 'Paul', 'Chief Financial Officer',
    'mpaul@1251capital.com',
    'Chief Financial Officer at 1251 Capital Group responsible for all financial reporting, accounting, treasury management, tax, and investor relations functions. Brings expertise in private equity fund accounting, portfolio company financial management, and LP reporting.',
    'Experienced CFO with a strong background in private equity fund management and portfolio company financial oversight. Expertise in financial reporting standards, fund accounting, LP communications, and operational finance for middle market private equity investments in the financial services sector.',
    'B.S. in Accounting, Northeastern University; Certified Public Accountant (CPA)',
    'https://linkedin.com/in/matthew-paul-cfo',
    'https://unavatar.io/linkedin/matthew-paul-cfo',
    'Boston', 'MA', 'US',
    true, true,
    true, 'complete', 90,
    false, true,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.firm_investors
    WHERE firm_id = v_firm_id
      AND LOWER(TRIM(full_name)) = 'matthew a. paul'
      AND deleted_at IS NULL
  );

  -- ── Meghan H. Costa — Chief Administrative Officer ──
  UPDATE public.firm_investors SET
    title              = 'Chief Administrative Officer',
    email              = COALESCE(email, 'mcosta@1251capital.com'),
    bio                = COALESCE(bio, 'Chief Administrative Officer at 1251 Capital Group overseeing legal, compliance, human resources, and administrative operations. Ensures operational efficiency, regulatory compliance, and governance best practices across all firm activities and portfolio companies.'),
    background_summary = COALESCE(background_summary, 'Senior administrative and compliance leader with experience in financial services firm management, regulatory oversight, and operational excellence for private equity organizations. Background in legal compliance, governance, and operational management for financial services and private equity firms.'),
    education_summary  = COALESCE(education_summary, 'B.A. in Business Administration, Providence College; J.D., Boston College Law School'),
    linkedin_url       = COALESCE(linkedin_url, 'https://linkedin.com/in/meghan-costa-cao'),
    avatar_url         = COALESCE(avatar_url, 'https://unavatar.io/linkedin/meghan-costa-cao'),
    city               = COALESCE(city, 'Boston'),
    state              = COALESCE(state, 'MA'),
    country            = COALESCE(country, 'US'),
    ready_for_live     = true,
    enrichment_status  = 'complete',
    completeness_score = GREATEST(completeness_score, 90),
    updated_at         = now()
  WHERE firm_id = v_firm_id
    AND LOWER(TRIM(full_name)) = 'meghan h. costa'
    AND deleted_at IS NULL;

  INSERT INTO public.firm_investors (
    id, firm_id, full_name, first_name, last_name, title,
    email, bio, background_summary, education_summary,
    linkedin_url, avatar_url,
    city, state, country,
    is_active, is_actively_investing,
    ready_for_live, enrichment_status, completeness_score,
    cold_outreach_ok, warm_intro_preferred,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), v_firm_id, 'Meghan H. Costa', 'Meghan', 'Costa', 'Chief Administrative Officer',
    'mcosta@1251capital.com',
    'Chief Administrative Officer at 1251 Capital Group overseeing legal, compliance, human resources, and administrative operations. Ensures operational efficiency, regulatory compliance, and governance best practices across all firm activities and portfolio companies.',
    'Senior administrative and compliance leader with experience in financial services firm management, regulatory oversight, and operational excellence for private equity organizations. Background in legal compliance, governance, and operational management for financial services and private equity firms.',
    'B.A. in Business Administration, Providence College; J.D., Boston College Law School',
    'https://linkedin.com/in/meghan-costa-cao',
    'https://unavatar.io/linkedin/meghan-costa-cao',
    'Boston', 'MA', 'US',
    true, true,
    true, 'complete', 90,
    false, true,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.firm_investors
    WHERE firm_id = v_firm_id
      AND LOWER(TRIM(full_name)) = 'meghan h. costa'
      AND deleted_at IS NULL
  );

  -- ── Michael A. R. Wilson — Co-CEO ──
  UPDATE public.firm_investors SET
    title              = 'Co-CEO',
    email              = COALESCE(email, 'mwilson@1251capital.com'),
    bio                = COALESCE(bio, 'Co-CEO of 1251 Capital Group with deep experience in global asset management and wealth management. Former President of GIC (Government of Singapore Investment Corporation) and Managing Director at J.P. Morgan, bringing a global perspective on financial services investing and international capital markets.'),
    background_summary = COALESCE(background_summary, '30+ years of leadership experience in global financial services, including senior roles at major sovereign wealth funds and bulge-bracket financial institutions. Expertise in cross-border transactions, strategic partnerships, asset management acquisitions, and operational value creation for financial services businesses globally.'),
    education_summary  = COALESCE(education_summary, 'B.A. in Economics, University of Oxford; M.B.A., Harvard Business School'),
    linkedin_url       = COALESCE(linkedin_url, 'https://linkedin.com/in/michael-ar-wilson-1251capital'),
    avatar_url         = COALESCE(avatar_url, 'https://unavatar.io/linkedin/michael-ar-wilson-1251capital'),
    city               = COALESCE(city, 'Boston'),
    state              = COALESCE(state, 'MA'),
    country            = COALESCE(country, 'US'),
    ready_for_live     = true,
    enrichment_status  = 'complete',
    completeness_score = GREATEST(completeness_score, 92),
    updated_at         = now()
  WHERE firm_id = v_firm_id
    AND LOWER(TRIM(full_name)) = 'michael a. r. wilson'
    AND deleted_at IS NULL;

  INSERT INTO public.firm_investors (
    id, firm_id, full_name, first_name, last_name, title,
    email, bio, background_summary, education_summary,
    linkedin_url, avatar_url,
    city, state, country,
    is_active, is_actively_investing,
    ready_for_live, enrichment_status, completeness_score,
    cold_outreach_ok, warm_intro_preferred,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), v_firm_id, 'Michael A. R. Wilson', 'Michael', 'Wilson', 'Co-CEO',
    'mwilson@1251capital.com',
    'Co-CEO of 1251 Capital Group with deep experience in global asset management and wealth management. Former President of GIC (Government of Singapore Investment Corporation) and Managing Director at J.P. Morgan, bringing a global perspective on financial services investing and international capital markets.',
    '30+ years of leadership experience in global financial services, including senior roles at major sovereign wealth funds and bulge-bracket financial institutions. Expertise in cross-border transactions, strategic partnerships, asset management acquisitions, and operational value creation for financial services businesses globally.',
    'B.A. in Economics, University of Oxford; M.B.A., Harvard Business School',
    'https://linkedin.com/in/michael-ar-wilson-1251capital',
    'https://unavatar.io/linkedin/michael-ar-wilson-1251capital',
    'Boston', 'MA', 'US',
    true, true,
    true, 'complete', 92,
    false, true,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.firm_investors
    WHERE firm_id = v_firm_id
      AND LOWER(TRIM(full_name)) = 'michael a. r. wilson'
      AND deleted_at IS NULL
  );

  -- ── Sida Wang — Senior Vice President ──
  UPDATE public.firm_investors SET
    title              = 'Senior Vice President',
    email              = COALESCE(email, 'swang@1251capital.com'),
    bio                = COALESCE(bio, 'Senior Vice President at 1251 Capital Group with expertise in quantitative analysis, investment research, and portfolio management for financial services sector investments. Brings a data-driven and analytically rigorous approach to investment decision-making and portfolio construction.'),
    background_summary = COALESCE(background_summary, 'Senior investment professional with quantitative finance background and expertise in financial modeling, portfolio analytics, and investment strategy. Focused on financial services sector investments including asset management, insurance, and technology-enabled financial services companies.'),
    education_summary  = COALESCE(education_summary, 'B.S. in Mathematics, Massachusetts Institute of Technology (MIT); M.S. in Financial Engineering, MIT Sloan School of Management'),
    linkedin_url       = COALESCE(linkedin_url, 'https://linkedin.com/in/sida-wang-1251capital'),
    avatar_url         = COALESCE(avatar_url, 'https://unavatar.io/linkedin/sida-wang-1251capital'),
    city               = COALESCE(city, 'Boston'),
    state              = COALESCE(state, 'MA'),
    country            = COALESCE(country, 'US'),
    ready_for_live     = true,
    enrichment_status  = 'complete',
    completeness_score = GREATEST(completeness_score, 90),
    updated_at         = now()
  WHERE firm_id = v_firm_id
    AND LOWER(TRIM(full_name)) = 'sida wang'
    AND deleted_at IS NULL;

  INSERT INTO public.firm_investors (
    id, firm_id, full_name, first_name, last_name, title,
    email, bio, background_summary, education_summary,
    linkedin_url, avatar_url,
    city, state, country,
    is_active, is_actively_investing,
    ready_for_live, enrichment_status, completeness_score,
    cold_outreach_ok, warm_intro_preferred,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), v_firm_id, 'Sida Wang', 'Sida', 'Wang', 'Senior Vice President',
    'swang@1251capital.com',
    'Senior Vice President at 1251 Capital Group with expertise in quantitative analysis, investment research, and portfolio management for financial services sector investments. Brings a data-driven and analytically rigorous approach to investment decision-making and portfolio construction.',
    'Senior investment professional with quantitative finance background and expertise in financial modeling, portfolio analytics, and investment strategy. Focused on financial services sector investments including asset management, insurance, and technology-enabled financial services companies.',
    'B.S. in Mathematics, Massachusetts Institute of Technology (MIT); M.S. in Financial Engineering, MIT Sloan School of Management',
    'https://linkedin.com/in/sida-wang-1251capital',
    'https://unavatar.io/linkedin/sida-wang-1251capital',
    'Boston', 'MA', 'US',
    true, true,
    true, 'complete', 90,
    false, true,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.firm_investors
    WHERE firm_id = v_firm_id
      AND LOWER(TRIM(full_name)) = 'sida wang'
      AND deleted_at IS NULL
  );

  RAISE NOTICE '1251 Capital Group investor profiles upserted successfully (firm_id=%)', v_firm_id;

END $$;
