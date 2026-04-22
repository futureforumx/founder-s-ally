-- ============================================================
-- firm_records.aum_usd backfill + get_new_vc_funds RPC fix
-- ============================================================
-- 1. Populates aum_usd (bigint, whole USD) for all VC-fund-linked firms
--    where we have confident data, using a single batch UPDATE.
-- 2. Fixes broken aum text values (wiki markup, mis-scaled bare numbers).
-- 3. Recreates get_new_vc_funds to read fr.aum_usd directly instead of
--    the unreliable fr.aum::numeric text-cast that returned NULL for
--    every non-numeric string like "$20B", "€70M", "{{US$", etc.
-- ============================================================

-- ── 1. Batch-populate aum_usd ──────────────────────────────
UPDATE public.firm_records AS fr
SET
  aum_usd    = v.aum_usd_val,
  updated_at = now()
FROM (VALUES
  -- Mega funds (>$10B)
  ('e63728aa-a93a-4977-895d-0d98e6e2e748'::uuid,  90000000000::bigint),  -- Andreessen Horowitz $90B
  ('777463be-026f-4c34-ba5e-34985da25249'::uuid,  20000000000::bigint),  -- Lightspeed Venture Partners $20B
  ('d3e75ddc-167b-495f-89ad-34beca9c872a'::uuid,  20000000000::bigint),  -- Accel $20B
  ('eb9d7b0e-aa09-4e38-ac87-b466ddffea84'::uuid,  20000000000::bigint),  -- Sequoia Capital $20B
  ('284f7647-32a6-4a39-ad18-0f6cfc009b37'::uuid,  13000000000::bigint),  -- Battery Ventures $13B
  ('923e07f8-14fd-4ef1-a5c8-5f2ecafc0c9d'::uuid,  10000000000::bigint),  -- Thrive Capital $10B
  -- Large funds ($1B–$10B)
  ('973cd115-2405-4ed1-a5a5-a2629206d72e'::uuid,   9000000000::bigint),  -- Kleiner Perkins $9B
  ('b0cb5e44-e46e-42b0-a44d-e07438f10b40'::uuid,   7000000000::bigint),  -- Dragoneer Investment Group $7B
  ('26e22b82-1a10-43e8-9f7b-0846c7bcfda1'::uuid,   7000000000::bigint),  -- Lux Capital $7B
  ('16217914-5610-4607-9d9e-84df6914bbf3'::uuid,   4000000000::bigint),  -- CRV $4B
  ('5fdb2084-aca8-4d42-b950-ce0a6952dba3'::uuid,   3000000000::bigint),  -- Pitango $3B
  ('dfd02382-80e9-418a-8de1-c6f0acbe784d'::uuid,   1200000000::bigint),  -- Gradient Ventures $1.2B
  ('fc87019a-3851-43e2-ad7e-c5afaea263cb'::uuid,   1300000000::bigint),  -- Viola Ventures $1.3B
  ('56f5030a-1493-42fd-92ef-1d37b2c79dbc'::uuid,   1000000000::bigint),  -- Hummingbird Ventures $1B
  ('6ff18b84-3dc8-4e44-ab49-1762cffbe372'::uuid,   1000000000::bigint),  -- Nexus Venture Partners $1B
  ('d295547a-2c4b-4c44-ae43-ce7f4ed70dc7'::uuid,   1000000000::bigint),  -- Pegasus Tech Ventures $1B
  ('4b60811b-af1a-486e-b899-72d11cc58bf9'::uuid,   1650000000::bigint),  -- Forbion €1.5B
  -- Mid funds ($500M–$999M)
  ('48aca64e-674f-483a-8ad5-fe71fc21996e'::uuid,    880000000::bigint),  -- Lakestar €800M
  ('7a0e8369-609f-42d2-be8e-3faf33102e00'::uuid,    800000000::bigint),  -- Santé Ventures $800M
  ('dabbf392-bb51-42e6-ae01-0755eb0bdd64'::uuid,    750000000::bigint),  -- Obvious Ventures ~$750M (mid of $500M–$1B)
  ('6e09b32f-f17d-4577-b221-a6428a690de4'::uuid,    550000000::bigint),  -- Kibo Ventures €500M+
  ('60c6652c-952a-4a59-9d41-14de0c8ced45'::uuid,    500000000::bigint),  -- BECO Capital $500M
  ('c20c3e00-1cd8-4b66-99b2-146d540b347b'::uuid,    500000000::bigint),  -- BoxGroup $500M
  ('a5e90dc4-7e54-42ad-a49c-e234c28a5a35'::uuid,    500000000::bigint),  -- Primary Venture Partners $500M
  ('d6b33ca0-e996-46bc-a8ec-8dd4b00e1592'::uuid,    500000000::bigint),  -- Archetype $500M
  -- Smaller funds ($100M–$499M)
  ('922bbf35-b786-41e2-a4df-ad833ba5fa79'::uuid,    450000000::bigint),  -- Entrée Capital $450M
  ('60c3d827-e262-4fb0-a5f5-d4c075048178'::uuid,    400000000::bigint),  -- S3 Ventures $400M
  ('8043e1a4-9b5e-4d64-b96a-5beb98ea5f9c'::uuid,    400000000::bigint),  -- Air Street Capital $400M
  ('6c32b474-05fe-4d67-8cd5-de062a0ceaa2'::uuid,    386000000::bigint),  -- AppWorks $386M
  ('2e82e82a-5d4d-4994-9d36-accb2f7c2bcb'::uuid,    385000000::bigint),  -- XAnge €350M
  ('ad4805a7-05ea-460a-8b9e-bee4004eb73f'::uuid,    330000000::bigint),  -- Picus Capital €300M
  ('854be6b3-11c8-48d2-97a6-53e8dbe08f26'::uuid,    330000000::bigint),  -- 2150 €300M
  ('265d0122-661b-4818-bc0b-e81b18ffe1f3'::uuid,    330000000::bigint),  -- Future Energy Ventures €300M
  ('69df2d6f-6ba3-4bc4-872b-6043bca921c7'::uuid,    300000000::bigint),  -- Root Ventures $300M
  ('c1e61979-6532-4877-9a87-aa35085680bd'::uuid,    252000000::bigint),  -- Seraphim Space £200M
  ('8b21112c-6c75-4111-98bd-94a5705219bd'::uuid,    230000000::bigint),  -- Breakout Ventures $230M
  ('4451c876-345b-4304-860b-497d458d42c0'::uuid,    200000000::bigint),  -- Kindred Ventures $200M
  ('99d713aa-4eb1-43bb-b957-c412a2192778'::uuid,    200000000::bigint),  -- Boost VC $200M
  ('b2a0df53-99fb-467b-b9de-b05b64cc8db1'::uuid,    200000000::bigint),  -- Coefficient Capital $200M
  ('dd259219-b2a6-4794-84c2-809f8f612e99'::uuid,    200000000::bigint),  -- Daphni €200M (aum text "$10" was a scrape artifact)
  ('21ad9d2e-b7d0-4273-8507-5c9074da28b3'::uuid,    200000000::bigint),  -- Glasswing Ventures $200M
  ('7115a340-6a68-4589-9f5f-279f8228135f'::uuid,    200000000::bigint),  -- J2 Ventures $200M
  ('4c1aa9b0-de6a-45a8-a91c-19cd32c15b7c'::uuid,    200000000::bigint),  -- Corazon Capital ~$200M
  ('6fbb872d-f25e-427c-a83a-746b5ff4c571'::uuid,    187000000::bigint),  -- Samaipata €170M
  ('2a3bd712-1a2d-4ccf-bbe4-08b8153ad071'::uuid,    165000000::bigint),  -- 360 Capital €150M
  ('e9728127-66c4-4da6-80df-62677c7283f0'::uuid,    165000000::bigint),  -- Ring Capital €150M
  ('b5e52ada-c3ce-4eb2-9e29-0daf8792bdbf'::uuid,    160000000::bigint),  -- Antler $160M
  ('27bd692a-7a08-46fc-9a19-d08d0bae4285'::uuid,    150000000::bigint),  -- Backed VC £100M
  ('8d80001a-d0a5-45fe-9282-d5abf7b658d9'::uuid,    138000000::bigint),  -- Indico Capital Partners €125M
  ('69f10d0c-bc4b-4464-b308-5845cfd2831a'::uuid,    125000000::bigint),  -- Scout Ventures $125M
  ('179e5a1e-6535-4ff3-9205-881c5851f66b'::uuid,    123000000::bigint),  -- Hetz Ventures $123M
  ('ff96f38d-8f3b-43fd-9fd5-ac4712b5302a'::uuid,    110000000::bigint),  -- Vendep Capital €100M
  ('c2f5f154-a476-4f70-b968-cb6b51f9adbf'::uuid,    110000000::bigint),  -- DVC $110M
  ('eb0b5eb0-4ff9-4465-bdf8-2d664085d9e5'::uuid,    110000000::bigint),  -- StageOne Ventures $110M
  ('af043da1-401a-43c6-b660-d067a121f2dd'::uuid,    100000000::bigint),  -- Arkin Bio Ventures ~$100M
  ('694bbd91-0f47-49a6-b182-dff2fefca8f9'::uuid,    100000000::bigint),  -- Flybridge $100M
  ('47dc1253-3260-4737-8325-718059a69587'::uuid,    100000000::bigint),  -- Voyager Ventures $100M
  -- Smaller funds (<$100M)
  ('dc769081-4cdb-4751-a702-756205107229'::uuid,     99000000::bigint),  -- Credo Ventures €90M
  ('b0fbbd49-7234-47f4-82ae-4764db819dc6'::uuid,     80000000::bigint),  -- nvp capital $80M
  ('847571c2-dd45-4131-8980-4bffb9d53698'::uuid,     77000000::bigint),  -- Balnord €70M
  ('0063b0f6-92d0-469e-9209-65537a84c697'::uuid,     60000000::bigint),  -- Cyberstarts $60M
  ('b2f0cb15-34f5-4d95-91ff-63cd76900aea'::uuid,     60000000::bigint),  -- Female Founders Fund ~$60M
  ('17a05cc4-9779-4060-bef4-8b9f8841be1e'::uuid,     50000000::bigint),  -- Also Capital $50M
  ('4d2dcc7d-80a0-4164-b86a-b09f65d8ceca'::uuid,     50000000::bigint),  -- Founders Co-Op $50M
  ('e5997f19-64c3-49d2-929a-070da76ee864'::uuid,     50000000::bigint),  -- SNAK Venture Partners $50M
  ('b04f8da4-6171-4605-a39b-e55010492ddf'::uuid,     50000000::bigint),  -- 2048 Ventures ~$50M
  ('1e160bf5-ada7-4a13-a0a5-3c70e06bc4a7'::uuid,     50000000::bigint),  -- Redbud VC ~$50M
  ('04d3221f-f4f7-4a5b-97e8-219424024555'::uuid,     45000000::bigint),  -- Valkyrie $45M
  ('dcb3185a-e071-44cc-8460-cd243d7d8bf6'::uuid,     40000000::bigint),  -- Lulu Cheng Meservey $40M
  ('a44ea76e-c758-423a-8b92-e23a4e2fd929'::uuid,     38000000::bigint),  -- Eka Ventures £30M
  ('41b4e3f6-4311-4c14-91f4-b1992dbb020d'::uuid,     35000000::bigint),  -- Remagine Ventures $35M
  ('25e1247e-6195-4ad1-a5fb-8603d5e9dbec'::uuid,     15000000::bigint),  -- Baobab Ventures $15M
  ('ed170ca1-f2c0-4270-8095-5307edb1262c'::uuid,     20000000::bigint),  -- Belief Capital $20M
  ('b0f97238-1a21-42ae-828e-1b34b6946b88'::uuid,      4000000::bigint)   -- Park Rangers Capital $4M
) AS v(id, aum_usd_val)
WHERE fr.id = v.id
  AND fr.deleted_at IS NULL;


-- ── 2. Fix broken / mis-scaled aum text values ──────────────
-- These are used as display fallbacks in the investor panel; clean them up now
-- that aum_usd is the authoritative numeric source for the RPC.

UPDATE public.firm_records
SET aum = '90000000000', updated_at = now()
WHERE id = 'e63728aa-a93a-4977-895d-0d98e6e2e748'  -- Andreessen Horowitz (was wiki markup)
  AND deleted_at IS NULL;

UPDATE public.firm_records
SET aum = '7000000000', updated_at = now()
WHERE id = 'b0cb5e44-e46e-42b0-a44d-e07438f10b40'  -- Dragoneer (was "{{US$")
  AND deleted_at IS NULL;

UPDATE public.firm_records
SET aum = '200000000', updated_at = now()
WHERE id = 'dd259219-b2a6-4794-84c2-809f8f612e99'  -- Daphni (was "$10" scrape artifact)
  AND deleted_at IS NULL;

UPDATE public.firm_records
SET aum = '3000000000', updated_at = now()
WHERE id = '5fdb2084-aca8-4d42-b950-ce0a6952dba3'  -- Pitango (was "USD $3 billion")
  AND deleted_at IS NULL;


-- ── 3. Recreate get_new_vc_funds — use fr.aum_usd directly ──
DROP FUNCTION IF EXISTS public.get_new_vc_funds(integer, integer, text[], text[], text[], numeric, numeric, text[]);

CREATE OR REPLACE FUNCTION public.get_new_vc_funds(
  p_limit integer DEFAULT 50,
  p_days integer DEFAULT 90,
  p_stage text[] DEFAULT NULL,
  p_sector text[] DEFAULT NULL,
  p_geography text[] DEFAULT NULL,
  p_fund_size_min numeric DEFAULT NULL,
  p_fund_size_max numeric DEFAULT NULL,
  p_firm_type text[] DEFAULT NULL
)
RETURNS TABLE (
  vc_fund_id uuid,
  firm_record_id uuid,
  firm_name text,
  fund_name text,
  fund_type text,
  fund_sequence_number integer,
  vintage_year integer,
  announced_date date,
  close_date date,
  target_size_usd numeric,
  final_size_usd numeric,
  status public.vc_fund_status_enum,
  source_confidence numeric,
  announcement_url text,
  announcement_title text,
  stage_focus text[],
  sector_focus text[],
  geography_focus text[],
  has_fresh_capital boolean,
  fresh_capital_priority_score numeric,
  likely_actively_deploying boolean,
  firm_logo_url text,
  firm_domain text,
  firm_location text,
  firm_website_url text,
  firm_aum_usd numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lim AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)::integer AS n
  )
  SELECT
    vf.id AS vc_fund_id,
    fr.id AS firm_record_id,
    fr.firm_name,
    vf.name AS fund_name,
    vf.fund_type,
    vf.fund_sequence_number,
    vf.vintage_year,
    vf.announced_date,
    vf.close_date,
    vf.target_size_usd,
    vf.final_size_usd,
    vf.status,
    vf.source_confidence,
    vf.announcement_url,
    vf.announcement_title,
    vf.stage_focus,
    vf.sector_focus,
    vf.geography_focus,
    fr.has_fresh_capital,
    fr.fresh_capital_priority_score,
    COALESCE(
      vf.likely_actively_deploying,
      (
        vf.active_deployment_window_start IS NOT NULL
        AND vf.active_deployment_window_end IS NOT NULL
        AND CURRENT_DATE BETWEEN vf.active_deployment_window_start AND vf.active_deployment_window_end
      )
    ) AS likely_actively_deploying,
    fr.logo_url AS firm_logo_url,
    CASE
      WHEN fr.domain IS NOT NULL AND btrim(fr.domain::text) <> '' THEN btrim(fr.domain::text)
      WHEN fr.website_url ~ '^https?://[^/]+' THEN (regexp_match(fr.website_url, '^https?://([^/]+)'))[1]
      ELSE NULL
    END AS firm_domain,
    COALESCE(
      CASE
        WHEN NULLIF(btrim(fr.hq_city), '') IS NOT NULL
          AND NULLIF(btrim(fr.hq_state), '') IS NOT NULL
        THEN concat_ws(
          ', ',
          initcap(lower(btrim(fr.hq_city))),
          CASE
            WHEN btrim(fr.hq_state) ~ '^[A-Za-z]{2}$' THEN upper(btrim(fr.hq_state))
            ELSE initcap(lower(btrim(fr.hq_state)))
          END
        )
        WHEN NULLIF(btrim(fr.hq_city), '') IS NOT NULL
          AND NULLIF(btrim(fr.hq_country), '') IS NOT NULL
        THEN concat_ws(', ', initcap(lower(btrim(fr.hq_city))), trim(fr.hq_country))
        ELSE NULL
      END,
      NULLIF(btrim(fr.location), ''),
      NULLIF(
        concat_ws(
          ', ',
          NULLIF(btrim(fr.hq_city), ''),
          NULLIF(btrim(fr.hq_state), ''),
          NULLIF(btrim(fr.hq_country), '')
        ),
        ''
      )
    ) AS firm_location,
    NULLIF(btrim(fr.website_url), '') AS firm_website_url,
    -- Read directly from the authoritative bigint column — no text-cast guesswork.
    fr.aum_usd::numeric AS firm_aum_usd
  FROM public.vc_funds vf
  JOIN public.firm_records fr
    ON fr.id = vf.firm_record_id
  CROSS JOIN lim
  WHERE vf.deleted_at IS NULL
    AND (
      COALESCE(vf.announced_date, vf.close_date, (vf.created_at AT TIME ZONE 'UTC')::date) >= CURRENT_DATE - GREATEST(COALESCE(p_days, 90), 1)
    )
    AND (p_stage IS NULL OR vf.stage_focus && p_stage)
    AND (p_sector IS NULL OR vf.sector_focus && p_sector)
    AND (p_geography IS NULL OR vf.geography_focus && p_geography)
    AND (p_fund_size_min IS NULL OR COALESCE(vf.final_size_usd, vf.target_size_usd) >= p_fund_size_min)
    AND (p_fund_size_max IS NULL OR COALESCE(vf.final_size_usd, vf.target_size_usd) <= p_fund_size_max)
    AND (p_firm_type IS NULL OR fr.entity_type::text = ANY (p_firm_type))
  ORDER BY
    COALESCE(vf.announced_date, vf.close_date, (vf.created_at AT TIME ZONE 'UTC')::date) DESC NULLS LAST,
    vf.updated_at DESC
  LIMIT (SELECT n FROM lim);
$$;

COMMENT ON FUNCTION public.get_new_vc_funds(integer, integer, text[], text[], text[], numeric, numeric, text[]) IS
  'Public-safe VC fund rows. firm_aum_usd reads from firm_records.aum_usd (bigint) — no text-cast. firm_location = HQ (City, ST).';

GRANT EXECUTE ON FUNCTION public.get_new_vc_funds(integer, integer, text[], text[], text[], numeric, numeric, text[]) TO anon, authenticated, service_role;
