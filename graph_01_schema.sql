-- ============================================================
-- STEP 1 of 7: CREATE SCHEMA
-- Run this first. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.graph_bootstrap_log (
  id        serial PRIMARY KEY,
  phase     text NOT NULL,
  message   text NOT NULL,
  row_count integer,
  logged_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.graph_organizations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text,
  org_type     text NOT NULL CHECK (org_type IN ('vc_firm','startup','portfolio_company','accelerator')),
  website_url  text,
  linkedin_url text,
  hq_city      text,
  hq_state     text,
  hq_country   text,
  sector_tags  text[],
  stage_tags   text[],
  logo_url     text,
  description  text,
  is_active    boolean DEFAULT true,
  source_table text,
  source_id    text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_org_source
  ON public.graph_organizations(source_table, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_org_type    ON public.graph_organizations(org_type);
CREATE INDEX IF NOT EXISTS idx_graph_org_name_ci ON public.graph_organizations(lower(name));

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
  ON public.graph_people(source_table, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_people_name_ci ON public.graph_people(lower(full_name));

CREATE TABLE IF NOT EXISTS public.graph_person_external_identities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   uuid NOT NULL REFERENCES public.graph_people(id) ON DELETE CASCADE,
  platform    text NOT NULL,
  external_id text NOT NULL,
  profile_url text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(person_id, platform)
);

CREATE TABLE IF NOT EXISTS public.graph_person_org_edges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  uuid NOT NULL REFERENCES public.graph_people(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_graph_ore_from     ON public.graph_org_relationship_edges(from_org_id);
CREATE INDEX IF NOT EXISTS idx_graph_ore_to       ON public.graph_org_relationship_edges(to_org_id);
CREATE INDEX IF NOT EXISTS idx_graph_ore_type     ON public.graph_org_relationship_edges(relationship_type);
CREATE INDEX IF NOT EXISTS idx_graph_ore_strength ON public.graph_org_relationship_edges(strength_score DESC);

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
CREATE INDEX IF NOT EXISTS idx_graph_ipc_target_org  ON public.graph_intro_path_candidates(target_org_id) WHERE target_org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_ipc_score       ON public.graph_intro_path_candidates(path_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_graph_ipc_hops        ON public.graph_intro_path_candidates(hop_count);

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
CREATE INDEX IF NOT EXISTS idx_graph_ips_path ON public.graph_intro_path_steps(path_id);

INSERT INTO public.graph_bootstrap_log(phase, message) VALUES ('01_schema', 'Schema created ✓');
SELECT phase, message FROM public.graph_bootstrap_log ORDER BY id DESC LIMIT 1;
