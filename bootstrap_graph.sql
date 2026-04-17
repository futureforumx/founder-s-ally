-- =============================================================================
-- VEKTA RELATIONSHIP GRAPH BOOTSTRAP
-- Run this in full against: zmnlsdohtwztneamvwaq (Supabase SQL Editor)
-- Fully idempotent — safe to re-run.
-- =============================================================================

-- ─── PROGRESS LOGGING HELPER ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.graph_bootstrap_log (
  id         serial PRIMARY KEY,
  phase      text NOT NULL,
  message    text NOT NULL,
  row_count  integer,
  logged_at  timestamptz DEFAULT now()
);

-- ─── PHASE 0: SCHEMA ─────────────────────────────────────────────────────────

-- ORGANIZATIONS
CREATE TABLE IF NOT EXISTS public.graph_organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text,
  org_type      text NOT NULL CHECK (org_type IN ('vc_firm','startup','portfolio_company','accelerator')),
  website_url   text,
  linkedin_url  text,
  hq_city       text,
  hq_state      text,
  hq_country    text,
  sector_tags   text[],
  stage_tags    text[],
  logo_url      text,
  description   text,
  is_active     boolean DEFAULT true,
  source_table  text,
  source_id     text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_org_source
  ON public.graph_organizations(source_table, source_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_org_type     ON public.graph_organizations(org_type);
CREATE INDEX IF NOT EXISTS idx_graph_org_name_ci  ON public.graph_organizations(lower(name));

-- PEOPLE (VC-domain: founders, investors, operators)
CREATE TABLE IF NOT EXISTS public.graph_people (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    text NOT NULL,
  slug         text,
  person_type  text CHECK (person_type IN ('founder','investor','operator','advisor')),
  linkedin_url text,
  location     text,
  photo_url    text,
  bio          text,
  source_table text,
  source_id    text,
  created_at   timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_people_source
  ON public.graph_people(source_table, source_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_people_name_ci ON public.graph_people(lower(full_name));

-- PERSON EXTERNAL IDENTITIES
CREATE TABLE IF NOT EXISTS public.graph_person_external_identities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   uuid NOT NULL REFERENCES public.graph_people(id) ON DELETE CASCADE,
  platform    text NOT NULL,   -- 'linkedin', 'twitter', 'crunchbase'
  external_id text NOT NULL,
  profile_url text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(person_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_graph_pei_person ON public.graph_person_external_identities(person_id);

-- PERSON → ORG MEMBERSHIP
CREATE TABLE IF NOT EXISTS public.graph_person_org_edges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  uuid NOT NULL REFERENCES public.graph_people(id)      ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES public.graph_organizations(id) ON DELETE CASCADE,
  role       text,
  title      text,
  is_current boolean DEFAULT true,
  start_year integer,
  end_year   integer,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_poe_unique
  ON public.graph_person_org_edges(person_id, org_id, coalesce(role,''));
CREATE INDEX IF NOT EXISTS idx_graph_poe_person ON public.graph_person_org_edges(person_id);
CREATE INDEX IF NOT EXISTS idx_graph_poe_org    ON public.graph_person_org_edges(org_id);

-- PERSON ↔ PERSON RELATIONSHIP EDGES
CREATE TABLE IF NOT EXISTS public.graph_person_relationship_edges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_a_id       uuid NOT NULL REFERENCES public.graph_people(id) ON DELETE CASCADE,
  person_b_id       uuid NOT NULL REFERENCES public.graph_people(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  strength_score    numeric DEFAULT 0.5 CHECK (strength_score BETWEEN 0 AND 1),
  trust_score       numeric DEFAULT 0.5 CHECK (trust_score BETWEEN 0 AND 1),
  recency_score     numeric DEFAULT 0.5 CHECK (recency_score BETWEEN 0 AND 1),
  interaction_count integer DEFAULT 0,
  is_warm           boolean DEFAULT false,
  evidence          jsonb,
  created_at        timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_pre_unique
  ON public.graph_person_relationship_edges(
    LEAST(person_a_id::text, person_b_id::text),
    GREATEST(person_a_id::text, person_b_id::text),
    relationship_type
  );
CREATE INDEX IF NOT EXISTS idx_graph_pre_a ON public.graph_person_relationship_edges(person_a_id);
CREATE INDEX IF NOT EXISTS idx_graph_pre_b ON public.graph_person_relationship_edges(person_b_id);

-- ORG ↔ ORG RELATIONSHIP EDGES (co-investment backbone)
CREATE TABLE IF NOT EXISTS public.graph_org_relationship_edges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_org_id       uuid NOT NULL REFERENCES public.graph_organizations(id) ON DELETE CASCADE,
  to_org_id         uuid NOT NULL REFERENCES public.graph_organizations(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  strength_score    numeric DEFAULT 0.5 CHECK (strength_score BETWEEN 0 AND 1),
  trust_score       numeric DEFAULT 0.5 CHECK (trust_score BETWEEN 0 AND 1),
  is_warm           boolean DEFAULT false,
  shared_count      integer DEFAULT 1,
  evidence          jsonb,
  created_at        timestamptz DEFAULT now(),
  UNIQUE(from_org_id, to_org_id, relationship_type)
);
CREATE INDEX IF NOT EXISTS idx_graph_ore_from ON public.graph_org_relationship_edges(from_org_id);
CREATE INDEX IF NOT EXISTS idx_graph_ore_to   ON public.graph_org_relationship_edges(to_org_id);
CREATE INDEX IF NOT EXISTS idx_graph_ore_type ON public.graph_org_relationship_edges(relationship_type);
CREATE INDEX IF NOT EXISTS idx_graph_ore_strength
  ON public.graph_org_relationship_edges(strength_score DESC);

-- INTRO PATH CANDIDATES
CREATE TABLE IF NOT EXISTS public.graph_intro_path_candidates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_org_id    uuid REFERENCES public.graph_organizations(id) ON DELETE CASCADE,
  target_person_id uuid REFERENCES public.graph_people(id) ON DELETE CASCADE,
  source_person_id uuid REFERENCES public.graph_people(id) ON DELETE CASCADE,
  source_org_id    uuid REFERENCES public.graph_organizations(id) ON DELETE CASCADE,
  hop_count        integer NOT NULL,
  path_score       numeric,
  rank_in_target   integer,
  explanation      jsonb,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_graph_ipc_target_org    ON public.graph_intro_path_candidates(target_org_id)    WHERE target_org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_ipc_target_person ON public.graph_intro_path_candidates(target_person_id) WHERE target_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_ipc_source_person ON public.graph_intro_path_candidates(source_person_id) WHERE source_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_ipc_score         ON public.graph_intro_path_candidates(path_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_graph_ipc_hops          ON public.graph_intro_path_candidates(hop_count);

-- INTRO PATH STEPS
CREATE TABLE IF NOT EXISTS public.graph_intro_path_steps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id        uuid NOT NULL REFERENCES public.graph_intro_path_candidates(id) ON DELETE CASCADE,
  step_order     integer NOT NULL,
  from_org_id    uuid REFERENCES public.graph_organizations(id),
  to_org_id      uuid REFERENCES public.graph_organizations(id),
  from_person_id uuid REFERENCES public.graph_people(id),
  to_person_id   uuid REFERENCES public.graph_people(id),
  via_org_id     uuid REFERENCES public.graph_organizations(id),
  edge_type      text,
  edge_strength  numeric,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(path_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_graph_ips_path     ON public.graph_intro_path_steps(path_id);
CREATE INDEX IF NOT EXISTS idx_graph_ips_from_org ON public.graph_intro_path_steps(from_org_id) WHERE from_org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_ips_to_org   ON public.graph_intro_path_steps(to_org_id)   WHERE to_org_id IS NOT NULL;

INSERT INTO public.graph_bootstrap_log(phase, message) VALUES ('schema', 'All tables and indexes created');

-- =============================================================================
-- PHASE 1: ORGANIZATIONS — VC FIRMS
-- Source: investormatch_vc_firms (6,386 rows)
-- =============================================================================

INSERT INTO public.graph_organizations (
  name, slug, org_type, website_url, linkedin_url,
  hq_city, hq_country,
  sector_tags, stage_tags,
  logo_url, description,
  source_table, source_id
)
SELECT
  trim(name),
  slug,
  'vc_firm',
  nullif(trim(coalesce(website_url,'')), ''),
  nullif(trim(coalesce(linkedin_url,'')), ''),
  nullif(trim(split_part(coalesce(hq_geo,''), ', ', 1)), ''),
  nullif(trim(split_part(coalesce(hq_geo,''), ', ', 2)), ''),
  coalesce(sector_tags::text[], ARRAY[]::text[]),
  coalesce(stage_focus::text[], ARRAY[]::text[]),
  nullif(trim(coalesce(logo_url,'')), ''),
  nullif(trim(coalesce(thesis_summary,'')), ''),
  'investormatch_vc_firms',
  id::text
FROM public.investormatch_vc_firms
WHERE name IS NOT NULL AND trim(name) != ''
  AND id::text NOT IN (
    SELECT source_id FROM public.graph_organizations
    WHERE source_table = 'investormatch_vc_firms'
  );

WITH cnt AS (SELECT COUNT(*) n FROM public.graph_organizations WHERE org_type = 'vc_firm')
INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT 'phase_1', 'VC firms loaded into graph_organizations', n FROM cnt;

-- =============================================================================
-- PHASE 2: ORGANIZATIONS — STARTUPS (from public.startups)
-- =============================================================================

INSERT INTO public.graph_organizations (
  name, org_type, website_url,
  hq_city, hq_state, hq_country,
  description, logo_url,
  source_table, source_id
)
SELECT
  company_name,
  'startup',
  company_url,
  hq_city,
  hq_state,
  hq_country,
  coalesce(description_short, description_long),
  logo_url,
  'startups',
  id::text
FROM public.startups
WHERE company_name IS NOT NULL
  AND id::text NOT IN (
    SELECT source_id FROM public.graph_organizations
    WHERE source_table = 'startups'
  );

WITH cnt AS (SELECT COUNT(*) n FROM public.graph_organizations WHERE org_type = 'startup')
INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT 'phase_2', 'Startups loaded into graph_organizations', n FROM cnt;

-- =============================================================================
-- PHASE 3: PEOPLE — FOUNDERS (from public.startup_founders)
-- =============================================================================

INSERT INTO public.graph_people (
  full_name, slug, person_type, linkedin_url, location,
  source_table, source_id
)
SELECT
  full_name,
  lower(regexp_replace(trim(full_name), '\s+', '-', 'g')),
  'founder',
  nullif(trim(coalesce(linkedin_url,'')), ''),
  nullif(trim(coalesce(location,'')), ''),
  'startup_founders',
  id
FROM public.startup_founders
WHERE full_name IS NOT NULL AND trim(full_name) != ''
  AND id NOT IN (
    SELECT source_id FROM public.graph_people
    WHERE source_table = 'startup_founders'
  );

-- Populate LinkedIn external identities
INSERT INTO public.graph_person_external_identities (person_id, platform, external_id, profile_url)
SELECT
  gp.id,
  'linkedin',
  -- extract handle from URL e.g. "https://linkedin.com/in/patrickcollison" → "patrickcollison"
  regexp_replace(sf.linkedin_url, '^.*linkedin\.com/in/', ''),
  sf.linkedin_url
FROM public.startup_founders sf
JOIN public.graph_people gp
  ON gp.source_table = 'startup_founders' AND gp.source_id = sf.id
WHERE sf.linkedin_url IS NOT NULL AND sf.linkedin_url != ''
ON CONFLICT (person_id, platform) DO NOTHING;

WITH cnt AS (SELECT COUNT(*) n FROM public.graph_people)
INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT 'phase_3', 'Founders loaded into graph_people', n FROM cnt;

-- =============================================================================
-- PHASE 4: PERSON → ORG EDGES — founders to their startups
-- =============================================================================

INSERT INTO public.graph_person_org_edges (person_id, org_id, role, is_current)
SELECT DISTINCT
  gp.id AS person_id,
  go.id AS org_id,
  sf.role,
  true
FROM public.startup_founders sf
JOIN public.graph_people gp
  ON gp.source_table = 'startup_founders' AND gp.source_id = sf.id
JOIN public.startups s
  ON s.id::text = sf.startup_id
JOIN public.graph_organizations go
  ON go.source_table = 'startups' AND go.source_id = s.id::text
WHERE NOT EXISTS (
  SELECT 1 FROM public.graph_person_org_edges e2
  WHERE e2.person_id = gp.id AND e2.org_id = go.id AND coalesce(e2.role,'') = coalesce(sf.role,'')
);

WITH cnt AS (SELECT COUNT(*) n FROM public.graph_person_org_edges)
INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT 'phase_4', 'Person→org edges created (founders↔startups)', n FROM cnt;

-- =============================================================================
-- PHASE 5: PERSON RELATIONSHIP EDGES — co-founders within same startup
-- =============================================================================

INSERT INTO public.graph_person_relationship_edges (
  person_a_id, person_b_id,
  relationship_type,
  strength_score, trust_score, recency_score,
  interaction_count, is_warm, evidence
)
SELECT DISTINCT
  gp_a.id,
  gp_b.id,
  'co_founder',
  0.95,   -- highest strength
  0.9,
  0.8,
  100,    -- heuristic interaction proxy
  true,
  jsonb_build_object('shared_startup', go.name)
FROM public.startup_founders sf_a
JOIN public.startup_founders sf_b
  ON sf_b.startup_id = sf_a.startup_id AND sf_b.id > sf_a.id  -- avoid self + dedup
JOIN public.graph_people gp_a
  ON gp_a.source_table = 'startup_founders' AND gp_a.source_id = sf_a.id
JOIN public.graph_people gp_b
  ON gp_b.source_table = 'startup_founders' AND gp_b.source_id = sf_b.id
JOIN public.graph_organizations go
  ON go.source_table = 'startups'
  AND go.source_id IN (
    SELECT id::text FROM public.startups WHERE id::text = sf_a.startup_id
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.graph_person_relationship_edges e2
  WHERE LEAST(e2.person_a_id::text, e2.person_b_id::text) = LEAST(gp_a.id::text, gp_b.id::text)
    AND GREATEST(e2.person_a_id::text, e2.person_b_id::text) = GREATEST(gp_a.id::text, gp_b.id::text)
    AND e2.relationship_type = 'co_founder'
);

WITH cnt AS (SELECT COUNT(*) n FROM public.graph_person_relationship_edges)
INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT 'phase_5', 'Co-founder person relationship edges created', n FROM cnt;

-- =============================================================================
-- PHASE 6: PORTFOLIO COMPANIES — extract from investormatch_vc_firms.portfolio jsonb
-- Clean filter: skip date-like names, empty strings, very short strings
-- Deduplicate by normalized name (md5 used as source_id for idempotency)
-- =============================================================================

INSERT INTO public.graph_organizations (
  name, org_type,
  website_url, hq_city, hq_country,
  description, sector_tags,
  source_table, source_id
)
SELECT DISTINCT ON (lower(trim(pc_name)))
  trim(pc_name),
  'portfolio_company',
  nullif(trim(coalesce(pc_website,'')), ''),
  nullif(trim(coalesce(pc_city,'')), ''),
  nullif(trim(coalesce(pc_country,'')), ''),
  nullif(trim(coalesce(pc_desc,'')), ''),
  CASE WHEN pc_sector IS NOT NULL AND pc_sector != ''
    THEN ARRAY[trim(pc_sector)] ELSE ARRAY[]::text[]
  END,
  'investormatch_vc_firms_portfolio',
  md5(lower(trim(pc_name)))
FROM (
  SELECT
    pe->>'name'        AS pc_name,
    pe->>'website'     AS pc_website,
    pe->>'hq_city'     AS pc_city,
    pe->>'hq_country'  AS pc_country,
    pe->>'description' AS pc_desc,
    pe->>'sector'      AS pc_sector
  FROM public.investormatch_vc_firms,
       jsonb_array_elements(portfolio) AS pe
  WHERE portfolio IS NOT NULL
) sub
WHERE pc_name IS NOT NULL
  AND trim(pc_name) != ''
  AND length(trim(pc_name)) > 2
  AND pc_name !~ '^\d'           -- skip date-like entries
  AND pc_name !~ '^(http|www)'   -- skip URL-as-name entries
  AND md5(lower(trim(pc_name))) NOT IN (
    SELECT source_id FROM public.graph_organizations
    WHERE source_table = 'investormatch_vc_firms_portfolio'
  )
ORDER BY lower(trim(pc_name)), trim(pc_name);

WITH cnt AS (SELECT COUNT(*) n FROM public.graph_organizations WHERE org_type = 'portfolio_company')
INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT 'phase_6', 'Portfolio companies loaded into graph_organizations', n FROM cnt;

-- =============================================================================
-- PHASE 7: ORG EDGES — investor → portfolio (HIGH STRENGTH)
-- strength 0.9, is_warm = true
-- =============================================================================

INSERT INTO public.graph_org_relationship_edges (
  from_org_id, to_org_id,
  relationship_type,
  strength_score, trust_score,
  is_warm, shared_count, evidence
)
SELECT
  go_firm.id                AS from_org_id,
  go_pc.id                  AS to_org_id,
  'investor_portfolio',
  0.90,
  0.85,
  true,
  1,
  jsonb_build_object('source', 'investormatch_vc_firms.portfolio')
FROM public.investormatch_vc_firms f
  CROSS JOIN LATERAL jsonb_array_elements(f.portfolio) AS pe
  JOIN public.graph_organizations go_firm
    ON go_firm.source_table = 'investormatch_vc_firms'
    AND go_firm.source_id   = f.id::text
  JOIN public.graph_organizations go_pc
    ON go_pc.source_table   = 'investormatch_vc_firms_portfolio'
    AND go_pc.source_id     = md5(lower(trim(pe->>'name')))
WHERE f.portfolio IS NOT NULL
  AND pe->>'name' IS NOT NULL
  AND trim(pe->>'name') != ''
  AND length(trim(pe->>'name')) > 2
  AND (pe->>'name') !~ '^\d'
  AND (pe->>'name') !~ '^(http|www)'
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_org_relationship_edges e2
    WHERE e2.from_org_id = go_firm.id
      AND e2.to_org_id   = go_pc.id
      AND e2.relationship_type = 'investor_portfolio'
  );

WITH cnt AS (
  SELECT COUNT(*) n FROM public.graph_org_relationship_edges
  WHERE relationship_type = 'investor_portfolio'
)
INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT 'phase_7', 'investor→portfolio org edges created', n FROM cnt;

-- =============================================================================
-- PHASE 8: CO-INVESTOR EDGES — firms sharing portfolio companies
-- Strength scales with number of shared companies:
--   1 shared  → 0.35 (LOW)
--   2 shared  → 0.50 (MEDIUM)
--   3+        → 0.65+ (HIGH, capped at 0.92)
-- is_warm = true if ≥ 2 shared
-- =============================================================================

-- Build co-investor pairs with shared count
WITH co_invest AS (
  SELECT
    a.from_org_id AS firm_a,
    b.from_org_id AS firm_b,
    COUNT(*)      AS shared_cos
  FROM public.graph_org_relationship_edges a
  JOIN public.graph_org_relationship_edges b
    ON  b.to_org_id         = a.to_org_id
    AND b.from_org_id      != a.from_org_id
    AND b.relationship_type = 'investor_portfolio'
  WHERE a.relationship_type = 'investor_portfolio'
    AND a.from_org_id < b.from_org_id   -- canonical ordering
  GROUP BY a.from_org_id, b.from_org_id
)
INSERT INTO public.graph_org_relationship_edges (
  from_org_id, to_org_id,
  relationship_type,
  strength_score, trust_score,
  is_warm, shared_count, evidence
)
SELECT
  firm_a,
  firm_b,
  'co_investor',
  LEAST(0.92, 0.30 + (shared_cos::numeric * 0.12)) AS strength_score,
  LEAST(0.88, 0.28 + (shared_cos::numeric * 0.10)) AS trust_score,
  shared_cos >= 2                                   AS is_warm,
  shared_cos::integer,
  jsonb_build_object('shared_portfolio_companies', shared_cos)
FROM co_invest
WHERE NOT EXISTS (
  SELECT 1 FROM public.graph_org_relationship_edges e2
  WHERE e2.from_org_id       = co_invest.firm_a
    AND e2.to_org_id         = co_invest.firm_b
    AND e2.relationship_type = 'co_investor'
);

-- Mirror edges (b → a) for symmetric traversal
INSERT INTO public.graph_org_relationship_edges (
  from_org_id, to_org_id,
  relationship_type,
  strength_score, trust_score,
  is_warm, shared_count, evidence
)
SELECT
  to_org_id   AS from_org_id,
  from_org_id AS to_org_id,
  'co_investor',
  strength_score,
  trust_score,
  is_warm,
  shared_count,
  evidence
FROM public.graph_org_relationship_edges
WHERE relationship_type = 'co_investor'
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_org_relationship_edges e2
    WHERE e2.from_org_id       = graph_org_relationship_edges.to_org_id
      AND e2.to_org_id         = graph_org_relationship_edges.from_org_id
      AND e2.relationship_type = 'co_investor'
  );

WITH cnt AS (
  SELECT COUNT(*) n FROM public.graph_org_relationship_edges
  WHERE relationship_type = 'co_investor'
)
INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT 'phase_8', 'Co-investor org edges created (both directions)', n FROM cnt;

-- =============================================================================
-- PHASE 9: INTRO PATH CANDIDATES
-- Seed set: all founders in graph_people
-- For each founder's startup, find:
--   • 1-hop: VC firms that invested in that startup by name match
--   • 2-hop: VC firms that co-invested with 1-hop firms
--   • 3-hop: VC firms reachable via 2-hop firms
-- Path score = strength of weakest link (bottleneck) × recency bonus
-- =============================================================================

-- ── 1-HOP: startup appears in VC firm's portfolio ──────────────────────────
INSERT INTO public.graph_intro_path_candidates (
  source_person_id, source_org_id,
  target_org_id,
  hop_count, path_score,
  explanation
)
SELECT DISTINCT
  gp.id                AS source_person_id,
  go_startup.id        AS source_org_id,
  go_firm.id           AS target_org_id,
  1                    AS hop_count,
  -- 1-hop with direct investment = near-perfect score
  ROUND(0.90 * ore_inv.strength_score, 3)::numeric AS path_score,
  jsonb_build_object(
    'summary',  gp.full_name || ' → ' || go_firm.name || ' (direct portfolio relationship)',
    'reasons',  jsonb_build_array(
      go_firm.name || ' has ' || go_startup.name || ' in their portfolio',
      'Direct portfolio relationship = strongest possible intro signal',
      'Warm connection: VC already knows the founder''s work'
    ),
    'hop_count', 1,
    'via', ARRAY[go_startup.name]
  )
FROM public.graph_person_org_edges poe
JOIN public.graph_people gp         ON gp.id = poe.person_id
JOIN public.graph_organizations go_startup
                                     ON go_startup.id = poe.org_id
                                     AND go_startup.org_type = 'startup'
-- Find portfolio companies whose name closely matches the startup name
JOIN public.graph_organizations go_pc
  ON lower(go_pc.name) = lower(go_startup.name)
  AND go_pc.org_type = 'portfolio_company'
-- Find the VC firm that invested in that portfolio company
JOIN public.graph_org_relationship_edges ore_inv
  ON ore_inv.to_org_id = go_pc.id
  AND ore_inv.relationship_type = 'investor_portfolio'
JOIN public.graph_organizations go_firm
  ON go_firm.id = ore_inv.from_org_id
  AND go_firm.org_type = 'vc_firm'
WHERE NOT EXISTS (
  SELECT 1 FROM public.graph_intro_path_candidates ipc2
  WHERE ipc2.source_person_id = gp.id
    AND ipc2.target_org_id    = go_firm.id
    AND ipc2.hop_count        = 1
);

WITH cnt AS (
  SELECT COUNT(*) n FROM public.graph_intro_path_candidates WHERE hop_count = 1
)
INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT 'phase_9a', '1-hop intro paths generated', n FROM cnt;

-- ── 2-HOP: via co-invested VC ──────────────────────────────────────────────
-- founder's startup → known VC (1-hop) → co-investing VC (2-hop)
INSERT INTO public.graph_intro_path_candidates (
  source_person_id, source_org_id,
  target_org_id,
  hop_count, path_score,
  explanation
)
SELECT DISTINCT ON (gp.id, co.to_org_id)
  gp.id              AS source_person_id,
  go_startup.id      AS source_org_id,
  co.to_org_id       AS target_org_id,
  2                  AS hop_count,
  -- Path score = product of both edge strengths (bottleneck heuristic)
  ROUND(
    LEAST(ore_inv.strength_score, co.strength_score) * 0.88,
    3
  )::numeric         AS path_score,
  jsonb_build_object(
    'summary',  gp.full_name || ' → ' || go_firm.name || ' → ' || go_target.name,
    'reasons',  jsonb_build_array(
      go_firm.name || ' is a co-investor with ' || go_target.name,
      go_target.name || ' has ' || co.shared_count || ' shared portfolio company(ies) with ' || go_firm.name,
      CASE WHEN co.is_warm THEN 'Warm path: strong co-investment relationship'
           ELSE 'Pathway exists via shared portfolio signal' END
    ),
    'hop_count', 2,
    'via', ARRAY[go_startup.name, go_firm.name]
  )
FROM public.graph_person_org_edges poe
JOIN public.graph_people gp            ON gp.id = poe.person_id
JOIN public.graph_organizations go_startup
                                        ON go_startup.id = poe.org_id
                                        AND go_startup.org_type = 'startup'
-- 1st hop: startup → known VC (via portfolio name match)
JOIN public.graph_organizations go_pc
  ON lower(go_pc.name) = lower(go_startup.name)
  AND go_pc.org_type = 'portfolio_company'
JOIN public.graph_org_relationship_edges ore_inv
  ON ore_inv.to_org_id = go_pc.id
  AND ore_inv.relationship_type = 'investor_portfolio'
JOIN public.graph_organizations go_firm
  ON go_firm.id = ore_inv.from_org_id
  AND go_firm.org_type = 'vc_firm'
-- 2nd hop: known VC → co-investor VC
JOIN public.graph_org_relationship_edges co
  ON co.from_org_id = go_firm.id
  AND co.relationship_type = 'co_investor'
JOIN public.graph_organizations go_target
  ON go_target.id = co.to_org_id
  AND go_target.org_type = 'vc_firm'
  AND go_target.id != go_firm.id
-- Skip if already a 1-hop target
WHERE NOT EXISTS (
  SELECT 1 FROM public.graph_intro_path_candidates ipc2
  WHERE ipc2.source_person_id = gp.id
    AND ipc2.target_org_id    = co.to_org_id
    AND ipc2.hop_count        <= 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.graph_intro_path_candidates ipc3
  WHERE ipc3.source_person_id = gp.id
    AND ipc3.target_org_id    = co.to_org_id
    AND ipc3.hop_count        = 2
)
ORDER BY gp.id, co.to_org_id, path_score DESC;

WITH cnt AS (
  SELECT COUNT(*) n FROM public.graph_intro_path_candidates WHERE hop_count = 2
)
INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT 'phase_9b', '2-hop intro paths generated', n FROM cnt;

-- ── 3-HOP: extend 2-hop paths one more step ────────────────────────────────
INSERT INTO public.graph_intro_path_candidates (
  source_person_id, source_org_id,
  target_org_id,
  hop_count, path_score,
  explanation
)
SELECT DISTINCT ON (ipc2.source_person_id, co3.to_org_id)
  ipc2.source_person_id,
  ipc2.source_org_id,
  co3.to_org_id      AS target_org_id,
  3                  AS hop_count,
  ROUND(ipc2.path_score * co3.strength_score * 0.75, 3)::numeric AS path_score,
  jsonb_build_object(
    'summary',  COALESCE((ipc2.explanation->>'summary'),'') || ' → ' || go_t3.name,
    'reasons',  jsonb_build_array(
      '3-hop path via co-investment chain',
      go_t3.name || ' shares portfolio companies with your 2-hop connection',
      'Longer path — prioritize shorter routes when available'
    ),
    'hop_count', 3,
    'via', (ipc2.explanation->'via') || jsonb_build_array(go_mid.name)
  )
FROM public.graph_intro_path_candidates ipc2
-- Extend from the target of 2-hop
JOIN public.graph_org_relationship_edges co3
  ON co3.from_org_id       = ipc2.target_org_id
  AND co3.relationship_type = 'co_investor'
  AND co3.strength_score   >= 0.40   -- only reasonably strong 3rd hops
JOIN public.graph_organizations go_t3
  ON go_t3.id = co3.to_org_id
  AND go_t3.org_type = 'vc_firm'
JOIN public.graph_organizations go_mid
  ON go_mid.id = ipc2.target_org_id
WHERE ipc2.hop_count = 2
  -- Don't add a 3-hop if already reachable in ≤ 2 hops
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_intro_path_candidates ipc_existing
    WHERE ipc_existing.source_person_id = ipc2.source_person_id
      AND ipc_existing.target_org_id    = co3.to_org_id
      AND ipc_existing.hop_count        <= 2
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_intro_path_candidates ipc_existing
    WHERE ipc_existing.source_person_id = ipc2.source_person_id
      AND ipc_existing.target_org_id    = co3.to_org_id
      AND ipc_existing.hop_count        = 3
  )
ORDER BY ipc2.source_person_id, co3.to_org_id, path_score DESC;

WITH cnt AS (
  SELECT COUNT(*) n FROM public.graph_intro_path_candidates WHERE hop_count = 3
)
INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT 'phase_9c', '3-hop intro paths generated', n FROM cnt;

-- =============================================================================
-- PHASE 10: RANK PATHS PER TARGET (top 5 paths per target org)
-- =============================================================================

UPDATE public.graph_intro_path_candidates ipc
SET rank_in_target = ranked.rn
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY target_org_id
      ORDER BY
        hop_count    ASC,
        path_score   DESC NULLS LAST
    ) AS rn
  FROM public.graph_intro_path_candidates
  WHERE target_org_id IS NOT NULL
) ranked
WHERE ipc.id = ranked.id;

INSERT INTO public.graph_bootstrap_log(phase, message)
VALUES ('phase_10', 'Intro paths ranked per target org');

-- =============================================================================
-- PHASE 11: INTRO PATH STEPS — materialise step records for 1-hop + 2-hop
-- =============================================================================

-- 1-hop steps
INSERT INTO public.graph_intro_path_steps (
  path_id, step_order,
  from_org_id, to_org_id,
  edge_type, edge_strength
)
SELECT
  ipc.id,
  1,
  ipc.source_org_id,
  ipc.target_org_id,
  'investor_portfolio_match',
  ipc.path_score
FROM public.graph_intro_path_candidates ipc
WHERE ipc.hop_count = 1
  AND ipc.source_org_id IS NOT NULL
  AND ipc.target_org_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_intro_path_steps s2
    WHERE s2.path_id = ipc.id AND s2.step_order = 1
  );

-- 2-hop step 1: founder startup → bridging VC
-- (stored in explanation->via array)
INSERT INTO public.graph_intro_path_steps (
  path_id, step_order,
  from_org_id, to_org_id,
  via_org_id,
  edge_type, edge_strength
)
SELECT
  ipc.id,
  1,
  ipc.source_org_id,
  -- via[1] is the bridging VC firm name; resolve to id
  bridge_org.id,
  -- via[0] is the startup itself
  ipc.source_org_id,
  'investor_portfolio_match',
  ipc.path_score
FROM public.graph_intro_path_candidates ipc
JOIN public.graph_organizations bridge_org
  ON lower(bridge_org.name) = lower(ipc.explanation->'via'->>1)
  AND bridge_org.org_type   = 'vc_firm'
WHERE ipc.hop_count = 2
  AND ipc.source_org_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_intro_path_steps s2
    WHERE s2.path_id = ipc.id AND s2.step_order = 1
  );

-- 2-hop step 2: bridging VC → target VC
INSERT INTO public.graph_intro_path_steps (
  path_id, step_order,
  from_org_id, to_org_id,
  edge_type, edge_strength
)
SELECT
  s1.path_id,
  2,
  s1.to_org_id,
  ipc.target_org_id,
  'co_investor',
  ore.strength_score
FROM public.graph_intro_path_steps s1
JOIN public.graph_intro_path_candidates ipc ON ipc.id = s1.path_id
JOIN public.graph_org_relationship_edges ore
  ON ore.from_org_id       = s1.to_org_id
  AND ore.to_org_id        = ipc.target_org_id
  AND ore.relationship_type = 'co_investor'
WHERE ipc.hop_count = 2
  AND s1.step_order = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_intro_path_steps s2
    WHERE s2.path_id = s1.path_id AND s2.step_order = 2
  );

WITH cnt AS (SELECT COUNT(*) n FROM public.graph_intro_path_steps)
INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT 'phase_11', 'Intro path steps materialised', n FROM cnt;

-- =============================================================================
-- FINAL: SUMMARY STATS
-- =============================================================================

INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
VALUES ('complete', 'Bootstrap pipeline finished', NULL);

-- Return full stats
SELECT
  'vc_firms'                AS entity,
  COUNT(*)                  AS count
FROM public.graph_organizations WHERE org_type = 'vc_firm'
UNION ALL
SELECT 'startups',             COUNT(*) FROM public.graph_organizations WHERE org_type = 'startup'
UNION ALL
SELECT 'portfolio_companies',  COUNT(*) FROM public.graph_organizations WHERE org_type = 'portfolio_company'
UNION ALL
SELECT 'people_founders',      COUNT(*) FROM public.graph_people WHERE person_type = 'founder'
UNION ALL
SELECT 'person_org_edges',     COUNT(*) FROM public.graph_person_org_edges
UNION ALL
SELECT 'person_rel_edges',     COUNT(*) FROM public.graph_person_relationship_edges
UNION ALL
SELECT 'org_edges_total',      COUNT(*) FROM public.graph_org_relationship_edges
UNION ALL
SELECT 'org_edges_inv_port',   COUNT(*) FROM public.graph_org_relationship_edges WHERE relationship_type = 'investor_portfolio'
UNION ALL
SELECT 'org_edges_co_invest',  COUNT(*) FROM public.graph_org_relationship_edges WHERE relationship_type = 'co_investor'
UNION ALL
SELECT 'intro_paths_1hop',     COUNT(*) FROM public.graph_intro_path_candidates WHERE hop_count = 1
UNION ALL
SELECT 'intro_paths_2hop',     COUNT(*) FROM public.graph_intro_path_candidates WHERE hop_count = 2
UNION ALL
SELECT 'intro_paths_3hop',     COUNT(*) FROM public.graph_intro_path_candidates WHERE hop_count = 3
UNION ALL
SELECT 'intro_path_steps',     COUNT(*) FROM public.graph_intro_path_steps
ORDER BY entity;
