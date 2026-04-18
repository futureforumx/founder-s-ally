-- =============================================================================
-- People Intelligence Graph — additive schema
-- All refs to canonical entities are polymorphic (entity_type, entity_id).
-- Canonical person types : 'firm_investor' | 'operator_profile' | 'startup_founder' | 'generic'
-- Canonical org types    : 'firm_record'   | 'organization'     | 'startup'         | 'generic'
-- This keeps the layer additive and decoupled from upstream table renames.
-- =============================================================================

-- ── Utility: updated_at trigger function (shared, safe to re-create) ─────────

CREATE OR REPLACE FUNCTION public.pig_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- A. EXTERNAL IDENTITY MAPPING
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.person_external_identities (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text    NOT NULL,
  entity_id      text    NOT NULL,
  provider       text    NOT NULL,   -- 'linkedin' | 'x' | 'github' | 'crunchbase' | 'angellist' | etc.
  external_id    text,
  external_url   text,
  username       text,
  domain         text,
  confidence     numeric(4,3) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  is_primary     boolean DEFAULT false,
  first_seen_at  timestamptz DEFAULT now(),
  last_seen_at   timestamptz DEFAULT now(),
  metadata       jsonb    DEFAULT '{}'::jsonb,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_pei_entity         ON public.person_external_identities (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_pei_provider_extid ON public.person_external_identities (provider, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pei_url            ON public.person_external_identities (external_url) WHERE external_url IS NOT NULL;

CREATE OR REPLACE TRIGGER pig_pei_updated_at
  BEFORE UPDATE ON public.person_external_identities
  FOR EACH ROW EXECUTE FUNCTION public.pig_set_updated_at();


CREATE TABLE IF NOT EXISTS public.organization_external_identities (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text    NOT NULL,
  entity_id      text    NOT NULL,
  provider       text    NOT NULL,
  external_id    text,
  external_url   text,
  username       text,
  domain         text,
  confidence     numeric(4,3) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  is_primary     boolean DEFAULT false,
  first_seen_at  timestamptz DEFAULT now(),
  last_seen_at   timestamptz DEFAULT now(),
  metadata       jsonb    DEFAULT '{}'::jsonb,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_oei_entity         ON public.organization_external_identities (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_oei_provider_extid ON public.organization_external_identities (provider, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oei_domain         ON public.organization_external_identities (domain) WHERE domain IS NOT NULL;

CREATE OR REPLACE TRIGGER pig_oei_updated_at
  BEFORE UPDATE ON public.organization_external_identities
  FOR EACH ROW EXECUTE FUNCTION public.pig_set_updated_at();


-- =============================================================================
-- B. SOURCE SNAPSHOTS / RAW PROFILES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.person_source_profiles (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type        text    NOT NULL,
  entity_id          text    NOT NULL,
  provider           text    NOT NULL,
  source_url         text,
  fetched_at         timestamptz NOT NULL DEFAULT now(),
  content_hash       text,
  parse_status       text    NOT NULL DEFAULT 'pending'
                             CHECK (parse_status IN ('pending','parsed','failed','skipped')),
  raw_payload        jsonb,
  normalized_payload jsonb,
  provenance         jsonb   DEFAULT '{}'::jsonb,
  created_at         timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_id, provider, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_psp_entity    ON public.person_source_profiles (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_psp_provider  ON public.person_source_profiles (provider);
CREATE INDEX IF NOT EXISTS idx_psp_fetched   ON public.person_source_profiles (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_psp_status    ON public.person_source_profiles (parse_status) WHERE parse_status != 'parsed';
CREATE INDEX IF NOT EXISTS idx_psp_url       ON public.person_source_profiles (source_url) WHERE source_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_psp_payload   ON public.person_source_profiles USING GIN (normalized_payload) WHERE normalized_payload IS NOT NULL;


CREATE TABLE IF NOT EXISTS public.organization_source_profiles (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type        text    NOT NULL,
  entity_id          text    NOT NULL,
  provider           text    NOT NULL,
  source_url         text,
  fetched_at         timestamptz NOT NULL DEFAULT now(),
  content_hash       text,
  parse_status       text    NOT NULL DEFAULT 'pending'
                             CHECK (parse_status IN ('pending','parsed','failed','skipped')),
  raw_payload        jsonb,
  normalized_payload jsonb,
  provenance         jsonb   DEFAULT '{}'::jsonb,
  created_at         timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_id, provider, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_osp_entity    ON public.organization_source_profiles (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_osp_provider  ON public.organization_source_profiles (provider);
CREATE INDEX IF NOT EXISTS idx_osp_fetched   ON public.organization_source_profiles (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_osp_status    ON public.organization_source_profiles (parse_status) WHERE parse_status != 'parsed';
CREATE INDEX IF NOT EXISTS idx_osp_payload   ON public.organization_source_profiles USING GIN (normalized_payload) WHERE normalized_payload IS NOT NULL;


-- =============================================================================
-- C. EMPLOYMENT / ROLE HISTORY
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.person_organization_roles (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  person_entity_type    text    NOT NULL,
  person_entity_id      text    NOT NULL,
  org_entity_type       text    NOT NULL,
  org_entity_id         text    NOT NULL,
  title                 text,
  normalized_role_function text,   -- product | engineering | gtm | sales | finance | operations | legal | design | general_management | other
  seniority_level       text,      -- ic | manager | director | vp | c_suite | founder | advisor | board
  start_date            date,
  end_date              date,
  is_current            boolean DEFAULT false,
  confidence            numeric(4,3) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source_profile_id     uuid    REFERENCES public.person_source_profiles(id) ON DELETE SET NULL,
  provenance            jsonb   DEFAULT '{}'::jsonb,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_por_person ON public.person_organization_roles (person_entity_type, person_entity_id);
CREATE INDEX IF NOT EXISTS idx_por_org    ON public.person_organization_roles (org_entity_type, org_entity_id);
CREATE INDEX IF NOT EXISTS idx_por_current ON public.person_organization_roles (person_entity_type, person_entity_id) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_por_source_profile ON public.person_organization_roles (source_profile_id) WHERE source_profile_id IS NOT NULL;

CREATE OR REPLACE TRIGGER pig_por_updated_at
  BEFORE UPDATE ON public.person_organization_roles
  FOR EACH ROW EXECUTE FUNCTION public.pig_set_updated_at();


-- =============================================================================
-- D. ACTIVITY / SIGNAL TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.person_activity_signals (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type        text    NOT NULL,
  entity_id          text    NOT NULL,
  signal_type        text    NOT NULL,   -- job_change | blog_post | podcast_appearance | speaker_event | press_mention | fundraise | x_post | github_commit | award | board_join | etc.
  signal_subtype     text,
  signal_date        timestamptz,
  source_provider    text,
  source_url         text,
  extracted_text     text,
  structured_payload jsonb   DEFAULT '{}'::jsonb,
  confidence         numeric(4,3) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  provenance         jsonb   DEFAULT '{}'::jsonb,
  created_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pas_entity      ON public.person_activity_signals (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_pas_signal_type ON public.person_activity_signals (signal_type);
CREATE INDEX IF NOT EXISTS idx_pas_date        ON public.person_activity_signals (signal_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pas_provider    ON public.person_activity_signals (source_provider);
CREATE INDEX IF NOT EXISTS idx_pas_payload     ON public.person_activity_signals USING GIN (structured_payload);


CREATE TABLE IF NOT EXISTS public.organization_activity_signals (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type        text    NOT NULL,
  entity_id          text    NOT NULL,
  signal_type        text    NOT NULL,   -- funding_round | new_hire | departure | product_launch | press_mention | acquisition | partnership | job_post_surge | etc.
  signal_subtype     text,
  signal_date        timestamptz,
  source_provider    text,
  source_url         text,
  extracted_text     text,
  structured_payload jsonb   DEFAULT '{}'::jsonb,
  confidence         numeric(4,3) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  provenance         jsonb   DEFAULT '{}'::jsonb,
  created_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oas_entity      ON public.organization_activity_signals (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_oas_signal_type ON public.organization_activity_signals (signal_type);
CREATE INDEX IF NOT EXISTS idx_oas_date        ON public.organization_activity_signals (signal_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_oas_provider    ON public.organization_activity_signals (source_provider);


-- =============================================================================
-- E. RELATIONSHIP GRAPH EDGES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.person_relationship_edges (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_type     text    NOT NULL,
  from_entity_id       text    NOT NULL,
  to_entity_type       text    NOT NULL,
  to_entity_id         text    NOT NULL,
  edge_type            text    NOT NULL,  -- co_worker | co_founder | mentor | mentee | advisor | advisee | co_author | co_speaker | peer | introduced | classmate | reported_to
  weight               numeric DEFAULT 0  CHECK (weight >= 0 AND weight <= 1),
  evidence_count       integer DEFAULT 1,
  first_seen_at        timestamptz DEFAULT now(),
  last_seen_at         timestamptz DEFAULT now(),
  confidence           numeric(4,3) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  supporting_evidence  jsonb   DEFAULT '[]'::jsonb,
  provenance           jsonb   DEFAULT '{}'::jsonb,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  -- Canonical undirected uniqueness for symmetric relationships
  UNIQUE NULLS NOT DISTINCT (
    LEAST(from_entity_type || ':' || from_entity_id, to_entity_type || ':' || to_entity_id),
    GREATEST(from_entity_type || ':' || from_entity_id, to_entity_type || ':' || to_entity_id),
    edge_type
  )
);
CREATE INDEX IF NOT EXISTS idx_pre_from      ON public.person_relationship_edges (from_entity_type, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_pre_to        ON public.person_relationship_edges (to_entity_type, to_entity_id);
CREATE INDEX IF NOT EXISTS idx_pre_type      ON public.person_relationship_edges (edge_type);
CREATE INDEX IF NOT EXISTS idx_pre_weight    ON public.person_relationship_edges (weight DESC);
CREATE INDEX IF NOT EXISTS idx_pre_evidence  ON public.person_relationship_edges USING GIN (supporting_evidence);

CREATE OR REPLACE TRIGGER pig_pre_updated_at
  BEFORE UPDATE ON public.person_relationship_edges
  FOR EACH ROW EXECUTE FUNCTION public.pig_set_updated_at();


CREATE TABLE IF NOT EXISTS public.organization_relationship_edges (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_type     text    NOT NULL,
  from_entity_id       text    NOT NULL,
  to_entity_type       text    NOT NULL,
  to_entity_id         text    NOT NULL,
  edge_type            text    NOT NULL,  -- investor_in | portfolio_of | co_investor | acquirer | acquired_by | partner | competitor | parent | subsidiary
  weight               numeric DEFAULT 0  CHECK (weight >= 0 AND weight <= 1),
  evidence_count       integer DEFAULT 1,
  first_seen_at        timestamptz DEFAULT now(),
  last_seen_at         timestamptz DEFAULT now(),
  confidence           numeric(4,3) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  supporting_evidence  jsonb   DEFAULT '[]'::jsonb,
  provenance           jsonb   DEFAULT '{}'::jsonb,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE (from_entity_type, from_entity_id, to_entity_type, to_entity_id, edge_type)
);
CREATE INDEX IF NOT EXISTS idx_ore_from    ON public.organization_relationship_edges (from_entity_type, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_ore_to      ON public.organization_relationship_edges (to_entity_type, to_entity_id);
CREATE INDEX IF NOT EXISTS idx_ore_type    ON public.organization_relationship_edges (edge_type);
CREATE INDEX IF NOT EXISTS idx_ore_weight  ON public.organization_relationship_edges (weight DESC);

CREATE OR REPLACE TRIGGER pig_ore_updated_at
  BEFORE UPDATE ON public.organization_relationship_edges
  FOR EACH ROW EXECUTE FUNCTION public.pig_set_updated_at();


CREATE TABLE IF NOT EXISTS public.person_org_relationship_edges (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  person_entity_type   text    NOT NULL,
  person_entity_id     text    NOT NULL,
  org_entity_type      text    NOT NULL,
  org_entity_id        text    NOT NULL,
  edge_type            text    NOT NULL,  -- founder_of | investor_at | employed_at | board_member | advisor | alumni | lp_at
  weight               numeric DEFAULT 0  CHECK (weight >= 0 AND weight <= 1),
  evidence_count       integer DEFAULT 1,
  first_seen_at        timestamptz DEFAULT now(),
  last_seen_at         timestamptz DEFAULT now(),
  confidence           numeric(4,3) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  supporting_evidence  jsonb   DEFAULT '[]'::jsonb,
  provenance           jsonb   DEFAULT '{}'::jsonb,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE (person_entity_type, person_entity_id, org_entity_type, org_entity_id, edge_type)
);
CREATE INDEX IF NOT EXISTS idx_pore_person ON public.person_org_relationship_edges (person_entity_type, person_entity_id);
CREATE INDEX IF NOT EXISTS idx_pore_org    ON public.person_org_relationship_edges (org_entity_type, org_entity_id);
CREATE INDEX IF NOT EXISTS idx_pore_type   ON public.person_org_relationship_edges (edge_type);
CREATE INDEX IF NOT EXISTS idx_pore_weight ON public.person_org_relationship_edges (weight DESC);

CREATE OR REPLACE TRIGGER pig_pore_updated_at
  BEFORE UPDATE ON public.person_org_relationship_edges
  FOR EACH ROW EXECUTE FUNCTION public.pig_set_updated_at();


-- =============================================================================
-- F. INFERRED ATTRIBUTES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.person_inferred_attributes (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type           text    NOT NULL,
  entity_id             text    NOT NULL,
  attribute_key         text    NOT NULL,  -- seniority_level | role_function | domain_expertise | career_velocity | activity_score | profile_completeness | investor_relevance | operator_relevance
  attribute_value       jsonb   NOT NULL,
  model_version         text    DEFAULT 'rules-v1',
  inferred_at           timestamptz DEFAULT now(),
  confidence            numeric(4,3) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  supporting_source_ids jsonb   DEFAULT '[]'::jsonb,
  explanation_summary   text,
  provenance            jsonb   DEFAULT '{}'::jsonb,
  created_at            timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_id, attribute_key)
);
CREATE INDEX IF NOT EXISTS idx_pia_entity    ON public.person_inferred_attributes (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_pia_key       ON public.person_inferred_attributes (attribute_key);
CREATE INDEX IF NOT EXISTS idx_pia_inferred  ON public.person_inferred_attributes (inferred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pia_value     ON public.person_inferred_attributes USING GIN (attribute_value);


CREATE TABLE IF NOT EXISTS public.organization_inferred_attributes (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type           text    NOT NULL,
  entity_id             text    NOT NULL,
  attribute_key         text    NOT NULL,  -- org_type | sector_focus | stage_focus | visibility | momentum | hiring_intensity | deal_velocity
  attribute_value       jsonb   NOT NULL,
  model_version         text    DEFAULT 'rules-v1',
  inferred_at           timestamptz DEFAULT now(),
  confidence            numeric(4,3) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  supporting_source_ids jsonb   DEFAULT '[]'::jsonb,
  explanation_summary   text,
  provenance            jsonb   DEFAULT '{}'::jsonb,
  created_at            timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_id, attribute_key)
);
CREATE INDEX IF NOT EXISTS idx_oia_entity    ON public.organization_inferred_attributes (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_oia_key       ON public.organization_inferred_attributes (attribute_key);
CREATE INDEX IF NOT EXISTS idx_oia_inferred  ON public.organization_inferred_attributes (inferred_at DESC);


-- =============================================================================
-- G. REPUTATION / SCORING
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.person_reputation_scores (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       text    NOT NULL,
  entity_id         text    NOT NULL,
  score_key         text    NOT NULL,  -- expertise_credibility | network_centrality_proxy | public_visibility | consistency_score | data_completeness | investor_relevance | operator_relevance
  score_value       numeric NOT NULL CHECK (score_value >= 0 AND score_value <= 1),
  score_components  jsonb   DEFAULT '{}'::jsonb,
  model_version     text    DEFAULT 'rules-v1',
  scored_at         timestamptz DEFAULT now(),
  provenance        jsonb   DEFAULT '{}'::jsonb,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_id, score_key)
);
CREATE INDEX IF NOT EXISTS idx_prs_entity    ON public.person_reputation_scores (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_prs_key       ON public.person_reputation_scores (score_key);
CREATE INDEX IF NOT EXISTS idx_prs_value     ON public.person_reputation_scores (score_value DESC);
CREATE INDEX IF NOT EXISTS idx_prs_scored_at ON public.person_reputation_scores (scored_at DESC);


CREATE TABLE IF NOT EXISTS public.organization_reputation_scores (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       text    NOT NULL,
  entity_id         text    NOT NULL,
  score_key         text    NOT NULL,
  score_value       numeric NOT NULL CHECK (score_value >= 0 AND score_value <= 1),
  score_components  jsonb   DEFAULT '{}'::jsonb,
  model_version     text    DEFAULT 'rules-v1',
  scored_at         timestamptz DEFAULT now(),
  provenance        jsonb   DEFAULT '{}'::jsonb,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_id, score_key)
);
CREATE INDEX IF NOT EXISTS idx_ors_entity    ON public.organization_reputation_scores (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ors_key       ON public.organization_reputation_scores (score_key);
CREATE INDEX IF NOT EXISTS idx_ors_value     ON public.organization_reputation_scores (score_value DESC);


-- =============================================================================
-- H. CAPABILITIES / TOPICS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.person_capabilities (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      text    NOT NULL,
  entity_id        text    NOT NULL,
  normalized_label text    NOT NULL,   -- e.g. 'developer-tools' | 'growth' | 'fintech'
  score            numeric DEFAULT 0   CHECK (score >= 0 AND score <= 1),
  is_inferred      boolean DEFAULT false,
  source_basis     jsonb   DEFAULT '{}'::jsonb,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_id, normalized_label)
);
CREATE INDEX IF NOT EXISTS idx_pcap_entity ON public.person_capabilities (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_pcap_label  ON public.person_capabilities (normalized_label);
CREATE INDEX IF NOT EXISTS idx_pcap_score  ON public.person_capabilities (score DESC);

CREATE OR REPLACE TRIGGER pig_pcap_updated_at
  BEFORE UPDATE ON public.person_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.pig_set_updated_at();


CREATE TABLE IF NOT EXISTS public.person_topics (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      text    NOT NULL,
  entity_id        text    NOT NULL,
  normalized_label text    NOT NULL,
  score            numeric DEFAULT 0   CHECK (score >= 0 AND score <= 1),
  is_inferred      boolean DEFAULT false,
  source_basis     jsonb   DEFAULT '{}'::jsonb,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_id, normalized_label)
);
CREATE INDEX IF NOT EXISTS idx_ptop_entity ON public.person_topics (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ptop_label  ON public.person_topics (normalized_label);

CREATE OR REPLACE TRIGGER pig_ptop_updated_at
  BEFORE UPDATE ON public.person_topics
  FOR EACH ROW EXECUTE FUNCTION public.pig_set_updated_at();


CREATE TABLE IF NOT EXISTS public.organization_topics (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      text    NOT NULL,
  entity_id        text    NOT NULL,
  normalized_label text    NOT NULL,
  score            numeric DEFAULT 0   CHECK (score >= 0 AND score <= 1),
  is_inferred      boolean DEFAULT false,
  source_basis     jsonb   DEFAULT '{}'::jsonb,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_id, normalized_label)
);
CREATE INDEX IF NOT EXISTS idx_otop_entity ON public.organization_topics (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_otop_label  ON public.organization_topics (normalized_label);

CREATE OR REPLACE TRIGGER pig_otop_updated_at
  BEFORE UPDATE ON public.organization_topics
  FOR EACH ROW EXECUTE FUNCTION public.pig_set_updated_at();


-- =============================================================================
-- I. CHANGE TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.person_change_log (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       text    NOT NULL,
  entity_id         text    NOT NULL,
  field_name        text    NOT NULL,
  old_value         jsonb,
  new_value         jsonb,
  detected_at       timestamptz DEFAULT now(),
  source_provider   text,
  source_profile_id uuid    REFERENCES public.person_source_profiles(id) ON DELETE SET NULL,
  diff_summary      text,
  provenance        jsonb   DEFAULT '{}'::jsonb,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcl_entity   ON public.person_change_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_pcl_field    ON public.person_change_log (field_name);
CREATE INDEX IF NOT EXISTS idx_pcl_detected ON public.person_change_log (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcl_provider ON public.person_change_log (source_provider);


CREATE TABLE IF NOT EXISTS public.organization_change_log (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       text    NOT NULL,
  entity_id         text    NOT NULL,
  field_name        text    NOT NULL,
  old_value         jsonb,
  new_value         jsonb,
  detected_at       timestamptz DEFAULT now(),
  source_provider   text,
  source_profile_id uuid    REFERENCES public.organization_source_profiles(id) ON DELETE SET NULL,
  diff_summary      text,
  provenance        jsonb   DEFAULT '{}'::jsonb,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocl_entity   ON public.organization_change_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ocl_field    ON public.organization_change_log (field_name);
CREATE INDEX IF NOT EXISTS idx_ocl_detected ON public.organization_change_log (detected_at DESC);


-- =============================================================================
-- J. JOB / RUN TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pig_enrichment_runs (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key           text    UNIQUE NOT NULL,  -- deterministic, e.g. 'person:firm_investor:abc123:2026-04-23'
  entity_type       text    NOT NULL,
  entity_id         text    NOT NULL,
  trigger           text    NOT NULL DEFAULT 'manual',  -- manual | sweep | schedule | seed
  status            text    NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running','completed','partial','failed','skipped')),
  started_at        timestamptz DEFAULT now(),
  finished_at       timestamptz,
  steps_total       integer DEFAULT 0,
  steps_succeeded   integer DEFAULT 0,
  steps_failed      integer DEFAULT 0,
  sources_attempted text[]  DEFAULT '{}',
  sources_succeeded text[]  DEFAULT '{}',
  error_summary     text,
  result_summary    jsonb   DEFAULT '{}'::jsonb,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_per_entity    ON public.pig_enrichment_runs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_per_status    ON public.pig_enrichment_runs (status);
CREATE INDEX IF NOT EXISTS idx_per_started   ON public.pig_enrichment_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_per_trigger   ON public.pig_enrichment_runs (trigger);

CREATE OR REPLACE TRIGGER pig_per_updated_at
  BEFORE UPDATE ON public.pig_enrichment_runs
  FOR EACH ROW EXECUTE FUNCTION public.pig_set_updated_at();


CREATE TABLE IF NOT EXISTS public.pig_enrichment_run_steps (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid    NOT NULL REFERENCES public.pig_enrichment_runs(id) ON DELETE CASCADE,
  step_name       text    NOT NULL,  -- 'source_discovery' | 'fetch:linkedin' | 'parse:linkedin' | 'persist_snapshot' | 'inference' | 'relationship_extraction' | 'change_detection' | 'reputation_scoring'
  source_provider text,
  status          text    NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','running','succeeded','failed','skipped')),
  started_at      timestamptz,
  finished_at     timestamptz,
  duration_ms     integer,
  records_written integer DEFAULT 0,
  error_message   text,
  metadata        jsonb   DEFAULT '{}'::jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pers_run_id  ON public.pig_enrichment_run_steps (run_id);
CREATE INDEX IF NOT EXISTS idx_pers_status  ON public.pig_enrichment_run_steps (status);
CREATE INDEX IF NOT EXISTS idx_pers_step    ON public.pig_enrichment_run_steps (step_name);

CREATE OR REPLACE TRIGGER pig_pers_updated_at
  BEFORE UPDATE ON public.pig_enrichment_run_steps
  FOR EACH ROW EXECUTE FUNCTION public.pig_set_updated_at();


-- =============================================================================
-- K. ROW LEVEL SECURITY — service_role gets full access; anon gets nothing
-- =============================================================================

DO $$ DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'person_external_identities','organization_external_identities',
    'person_source_profiles','organization_source_profiles',
    'person_organization_roles',
    'person_activity_signals','organization_activity_signals',
    'person_relationship_edges','organization_relationship_edges','person_org_relationship_edges',
    'person_inferred_attributes','organization_inferred_attributes',
    'person_reputation_scores','organization_reputation_scores',
    'person_capabilities','person_topics','organization_topics',
    'person_change_log','organization_change_log',
    'pig_enrichment_runs','pig_enrichment_run_steps'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    BEGIN
      EXECUTE format(
        'CREATE POLICY pig_service_role_full ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;


-- =============================================================================
-- L. HELPER VIEWS
-- =============================================================================

CREATE OR REPLACE VIEW public.person_current_roles AS
SELECT
  r.id,
  r.person_entity_type,
  r.person_entity_id,
  r.org_entity_type,
  r.org_entity_id,
  r.title,
  r.normalized_role_function,
  r.seniority_level,
  r.start_date,
  r.confidence
FROM public.person_organization_roles r
WHERE r.is_current = true;


CREATE OR REPLACE VIEW public.recent_person_role_changes AS
SELECT
  cl.entity_type,
  cl.entity_id,
  cl.field_name,
  cl.old_value,
  cl.new_value,
  cl.detected_at,
  cl.source_provider,
  cl.diff_summary
FROM public.person_change_log cl
WHERE cl.field_name IN ('title','employer','is_current','seniority_level')
  AND cl.detected_at > now() - interval '90 days'
ORDER BY cl.detected_at DESC;


CREATE OR REPLACE VIEW public.recent_org_activity AS
SELECT
  s.entity_type,
  s.entity_id,
  s.signal_type,
  s.signal_subtype,
  s.signal_date,
  s.source_provider,
  s.source_url,
  s.extracted_text,
  s.confidence
FROM public.organization_activity_signals s
WHERE s.signal_date > now() - interval '90 days'
ORDER BY s.signal_date DESC;


CREATE OR REPLACE VIEW public.organization_recent_hiring_signals AS
SELECT
  s.entity_type,
  s.entity_id,
  s.signal_date,
  s.source_url,
  s.structured_payload->>'role_title'  AS role_title,
  s.structured_payload->>'department'  AS department,
  s.structured_payload->>'seniority'   AS seniority
FROM public.organization_activity_signals s
WHERE s.signal_type = 'job_post_surge'
   OR (s.signal_type = 'new_hire' AND s.signal_date > now() - interval '180 days')
ORDER BY s.signal_date DESC;


CREATE OR REPLACE VIEW public.strongest_person_connectors AS
SELECT
  e.from_entity_type,
  e.from_entity_id,
  count(*) AS connection_count,
  avg(e.weight) AS avg_connection_weight,
  max(e.weight) AS max_connection_weight
FROM public.person_relationship_edges e
GROUP BY e.from_entity_type, e.from_entity_id
HAVING count(*) >= 2
ORDER BY connection_count DESC;


CREATE OR REPLACE VIEW public.strongest_founder_to_investor_paths_basis AS
SELECT
  pore_f.person_entity_type  AS founder_entity_type,
  pore_f.person_entity_id    AS founder_entity_id,
  pore_i.person_entity_type  AS investor_entity_type,
  pore_i.person_entity_id    AS investor_entity_id,
  pore_f.org_entity_type     AS shared_org_entity_type,
  pore_f.org_entity_id       AS shared_org_entity_id,
  pore_f.edge_type           AS founder_org_edge_type,
  pore_i.edge_type           AS investor_org_edge_type,
  pre.weight                 AS direct_relationship_weight
FROM public.person_org_relationship_edges pore_f
JOIN public.person_org_relationship_edges pore_i
  ON  pore_i.org_entity_type = pore_f.org_entity_type
  AND pore_i.org_entity_id   = pore_f.org_entity_id
  AND pore_i.person_entity_id != pore_f.person_entity_id
  AND pore_i.edge_type IN ('investor_at','board_member','advisor')
LEFT JOIN public.person_relationship_edges pre
  ON  pre.from_entity_type = pore_f.person_entity_type
  AND pre.from_entity_id   = pore_f.person_entity_id
  AND pre.to_entity_type   = pore_i.person_entity_type
  AND pre.to_entity_id     = pore_i.person_entity_id
WHERE pore_f.edge_type IN ('founder_of','employed_at','alumni');
