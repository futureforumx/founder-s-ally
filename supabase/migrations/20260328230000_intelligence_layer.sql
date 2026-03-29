-- Event-driven intelligence layer: entities, sources, raw items, canonical events, user signals.
-- Clerk user ids are text (see 20260328120000_clerk_jwt_text_user_ids.sql).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Reference: extensible event taxonomy ─────────────────────────────────────────
CREATE TABLE public.intelligence_event_types (
  code text PRIMARY KEY,
  label text NOT NULL,
  default_category text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_event_types_category_chk CHECK (
    default_category IN (
      'investors', 'market', 'tech', 'network',
      'fundraising_signals', 'customer_demand', 'regulatory', 'talent_org', 'ecosystem'
    )
  )
);

CREATE INDEX intelligence_event_types_category_idx ON public.intelligence_event_types (default_category);
CREATE INDEX intelligence_event_types_active_idx ON public.intelligence_event_types (active) WHERE active = true;

-- ── Core entities ──────────────────────────────────────────────────────────────
CREATE TABLE public.intelligence_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  description text,
  website text,
  domain text,
  sectors text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  geography text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_entities_type_chk CHECK (
    type IN (
      'investor', 'fund', 'company', 'person', 'product', 'market', 'technology', 'sector', 'other'
    )
  )
);

CREATE INDEX intelligence_entities_type_idx ON public.intelligence_entities (type);
CREATE INDEX intelligence_entities_name_trgm_idx ON public.intelligence_entities USING gin (name gin_trgm_ops);
CREATE INDEX intelligence_entities_domain_idx ON public.intelligence_entities (domain) WHERE domain IS NOT NULL;

-- ── Sources (RSS, API, etc.) ───────────────────────────────────────────────────
CREATE TABLE public.intelligence_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  base_url text,
  credibility_score numeric(4,3) NOT NULL DEFAULT 0.700,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_sources_type_chk CHECK (
    type IN ('rss', 'api', 'website', 'social', 'internal')
  )
);

CREATE INDEX intelligence_sources_active_type_idx ON public.intelligence_sources (active, type);

-- ── Raw ingested rows ───────────────────────────────────────────────────────────
CREATE TABLE public.raw_intelligence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.intelligence_sources (id) ON DELETE CASCADE,
  source_url text,
  title text NOT NULL,
  body text,
  excerpt text,
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  author text,
  metadata jsonb NOT NULL DEFAULT '{}',
  content_hash text NOT NULL,
  processing_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raw_intelligence_items_status_chk CHECK (
    processing_status IN ('pending', 'processing', 'processed', 'failed', 'skipped')
  ),
  CONSTRAINT raw_intelligence_items_source_url_unique UNIQUE (source_id, content_hash)
);

CREATE INDEX raw_intelligence_items_published_at_idx ON public.raw_intelligence_items (published_at DESC NULLS LAST);
CREATE INDEX raw_intelligence_items_fetched_at_idx ON public.raw_intelligence_items (fetched_at DESC);
CREATE INDEX raw_intelligence_items_status_idx ON public.raw_intelligence_items (processing_status);
CREATE INDEX raw_intelligence_items_source_id_idx ON public.raw_intelligence_items (source_id);

-- ── Canonical deduped events ────────────────────────────────────────────────────
CREATE TABLE public.intelligence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL REFERENCES public.intelligence_event_types (code),
  category text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  why_it_matters text NOT NULL DEFAULT '',
  confidence_score numeric(5,4) NOT NULL DEFAULT 0.5,
  importance_score numeric(5,4) NOT NULL DEFAULT 0.5,
  relevance_score numeric(5,4) NOT NULL DEFAULT 0.5,
  sentiment text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  canonical_source_url text,
  source_count int NOT NULL DEFAULT 1,
  dedupe_key text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_events_category_chk CHECK (
    category IN (
      'investors', 'market', 'tech', 'network',
      'fundraising_signals', 'customer_demand', 'regulatory', 'talent_org', 'ecosystem'
    )
  )
);

CREATE UNIQUE INDEX intelligence_events_dedupe_key_unique_idx
  ON public.intelligence_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX intelligence_events_first_seen_idx ON public.intelligence_events (first_seen_at DESC);
CREATE INDEX intelligence_events_last_seen_idx ON public.intelligence_events (last_seen_at DESC);
CREATE INDEX intelligence_events_category_idx ON public.intelligence_events (category);
CREATE INDEX intelligence_events_event_type_idx ON public.intelligence_events (event_type);
CREATE INDEX intelligence_events_importance_idx ON public.intelligence_events (importance_score DESC);
CREATE INDEX intelligence_events_relevance_idx ON public.intelligence_events (relevance_score DESC);
CREATE INDEX intelligence_events_rank_idx ON public.intelligence_events (
  (relevance_score * 0.4 + importance_score * 0.35 + confidence_score * 0.25) DESC,
  last_seen_at DESC
);

-- ── Event ↔ entity links ────────────────────────────────────────────────────────
CREATE TABLE public.intelligence_event_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.intelligence_events (id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.intelligence_entities (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'subject',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_event_entities_unique UNIQUE (event_id, entity_id, role)
);

CREATE INDEX intelligence_event_entities_entity_idx ON public.intelligence_event_entities (entity_id);
CREATE INDEX intelligence_event_entities_event_idx ON public.intelligence_event_entities (event_id);

-- ── User watchlists ─────────────────────────────────────────────────────────────
CREATE TABLE public.intelligence_watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  entity_id uuid REFERENCES public.intelligence_entities (id) ON DELETE CASCADE,
  keyword text,
  category text,
  alert_threshold text,
  digest_frequency text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_watchlists_category_chk CHECK (
    category IS NULL OR category IN (
      'investors', 'market', 'tech', 'network',
      'fundraising_signals', 'customer_demand', 'regulatory', 'talent_org', 'ecosystem'
    )
  ),
  CONSTRAINT intelligence_watchlists_target_chk CHECK (
    entity_id IS NOT NULL OR (keyword IS NOT NULL AND length(trim(keyword)) > 0)
  )
);

CREATE INDEX intelligence_watchlists_user_idx ON public.intelligence_watchlists (user_id);
CREATE INDEX intelligence_watchlists_entity_idx ON public.intelligence_watchlists (entity_id) WHERE entity_id IS NOT NULL;

-- ── Saved / dismissed ───────────────────────────────────────────────────────────
CREATE TABLE public.intelligence_saved_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  event_id uuid NOT NULL REFERENCES public.intelligence_events (id) ON DELETE CASCADE,
  project_label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_saved_events_unique UNIQUE (user_id, event_id)
);

CREATE INDEX intelligence_saved_events_user_idx ON public.intelligence_saved_events (user_id);

CREATE TABLE public.intelligence_dismissed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  event_id uuid NOT NULL REFERENCES public.intelligence_events (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_dismissed_events_unique UNIQUE (user_id, event_id)
);

CREATE INDEX intelligence_dismissed_events_user_idx ON public.intelligence_dismissed_events (user_id);

-- ── Alerts ─────────────────────────────────────────────────────────────────────
CREATE TABLE public.intelligence_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  event_id uuid REFERENCES public.intelligence_events (id) ON DELETE CASCADE,
  watchlist_id uuid REFERENCES public.intelligence_watchlists (id) ON DELETE CASCADE,
  alert_type text NOT NULL DEFAULT 'instant',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_alerts_target_chk CHECK (
    (event_id IS NOT NULL)::int + (watchlist_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT intelligence_alerts_status_chk CHECK (status IN ('active', 'paused', 'triggered', 'cancelled'))
);

CREATE INDEX intelligence_alerts_user_idx ON public.intelligence_alerts (user_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.intelligence_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_intelligence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_event_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_saved_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_dismissed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_alerts ENABLE ROW LEVEL SECURITY;

-- Global read for signed-in users (intelligence is not user-private content)
CREATE POLICY "Authenticated read event types" ON public.intelligence_event_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read entities" ON public.intelligence_entities
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read sources" ON public.intelligence_sources
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read raw items" ON public.raw_intelligence_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read events" ON public.intelligence_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read event entities" ON public.intelligence_event_entities
  FOR SELECT TO authenticated USING (true);

-- User-owned rows
CREATE POLICY "Users manage own watchlists" ON public.intelligence_watchlists
  FOR ALL TO authenticated
  USING ((auth.jwt()->>'sub') = user_id)
  WITH CHECK ((auth.jwt()->>'sub') = user_id);

CREATE POLICY "Users manage own saved events" ON public.intelligence_saved_events
  FOR ALL TO authenticated
  USING ((auth.jwt()->>'sub') = user_id)
  WITH CHECK ((auth.jwt()->>'sub') = user_id);

CREATE POLICY "Users manage own dismissed" ON public.intelligence_dismissed_events
  FOR ALL TO authenticated
  USING ((auth.jwt()->>'sub') = user_id)
  WITH CHECK ((auth.jwt()->>'sub') = user_id);

CREATE POLICY "Users manage own alerts" ON public.intelligence_alerts
  FOR ALL TO authenticated
  USING ((auth.jwt()->>'sub') = user_id)
  WITH CHECK ((auth.jwt()->>'sub') = user_id);

-- Inserts/updates on global tables are service-role only (no policies for authenticated write)

-- ── Seed taxonomy ───────────────────────────────────────────────────────────────
INSERT INTO public.intelligence_event_types (code, label, default_category, description, sort_order) VALUES
  ('funding_round_announced', 'Funding round announced', 'investors', 'Company raises a priced or SAFE round.', 10),
  ('new_fund_closed', 'New fund closed', 'investors', 'GP announces final close or new vehicle.', 11),
  ('new_investment_made', 'New investment made', 'investors', 'Investor backs a company (portfolio add).', 12),
  ('partner_joined_firm', 'Partner joined firm', 'investors', 'New partner or principal at a fund.', 13),
  ('partner_left_firm', 'Partner left firm', 'investors', 'Partner departure or spin-out.', 14),
  ('thesis_shift_detected', 'Thesis shift', 'investors', 'Stated focus, sector, or stage change.', 15),
  ('product_launched', 'Product launched', 'market', 'New product, GA, or major module.', 20),
  ('pricing_changed', 'Pricing changed', 'market', 'List pricing, packaging, or enterprise motion.', 21),
  ('partnership_announced', 'Partnership announced', 'market', 'Strategic or channel partnership.', 22),
  ('acquisition_announced', 'Acquisition announced', 'market', 'M&A involving strategic or financial buyer.', 23),
  ('executive_hired', 'Executive hired', 'market', 'Senior leadership hire.', 24),
  ('executive_departed', 'Executive departed', 'market', 'Leadership transition or exit.', 25),
  ('competitor_hiring_spike', 'Hiring spike', 'market', 'Unusual hiring velocity vs baseline.', 26),
  ('customer_win_announced', 'Customer win', 'market', 'Logo win, case study, or enterprise rollout.', 27),
  ('layoffs_announced', 'Layoffs announced', 'market', 'Headcount reduction at scale.', 28),
  ('regulatory_update', 'Regulatory update', 'regulatory', 'Policy, rule, or enforcement shift.', 30),
  ('outage_reported', 'Outage reported', 'tech', 'Major platform/API incident.', 40),
  ('open_source_release', 'Open source release', 'tech', 'Notable OSS model, framework, or tool.', 41),
  ('founder_started_new_company', 'Founder started new company', 'network', 'Repeat founder or notable operator newco.', 50),
  ('stealth_company_detected', 'Stealth signal', 'network', 'Stealth hiring, domain, or teaser activity.', 51)
ON CONFLICT (code) DO NOTHING;

-- ── Demo sources + entities + events (realistic MVP feed) ───────────────────────
INSERT INTO public.intelligence_sources (id, name, type, base_url, credibility_score, active, metadata) VALUES
  ('11111111-1111-1111-1111-111111111101', 'Demo VC Wire', 'internal', 'https://example.com/vc-wire', 0.85, true, '{}'),
  ('11111111-1111-1111-1111-111111111102', 'Demo Tech Radar', 'internal', 'https://example.com/tech', 0.80, true, '{}'),
  ('11111111-1111-1111-1111-111111111103', 'Demo People Moves', 'internal', 'https://example.com/people', 0.75, true, '{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.intelligence_entities (id, type, name, aliases, description, website, domain, sectors, tags, geography, metadata) VALUES
  ('22222222-2222-2222-2222-222222222201', 'fund', 'Northline Ventures', ARRAY['Northline'], 'Early-stage B2B fund', 'https://northline.example', 'northline.example', ARRAY['B2B', 'SaaS'], ARRAY['seed', 'series-a'], 'San Francisco', '{}'),
  ('22222222-2222-2222-2222-222222222202', 'company', 'LatticeMind AI', ARRAY['LatticeMind'], 'Enterprise agents platform', 'https://latticemind.example', 'latticemind.example', ARRAY['Artificial Intelligence'], ARRAY['agents', 'enterprise'], 'New York', '{}'),
  ('22222222-2222-2222-2222-222222222203', 'investor', 'Jordan Lee', ARRAY['J. Lee'], 'Partner at Northline Ventures', NULL, NULL, ARRAY['Artificial Intelligence'], ARRAY['partner'], 'San Francisco', '{}'),
  ('22222222-2222-2222-2222-222222222204', 'company', 'Helio Security', ARRAY['Helio'], 'Cloud security posture', 'https://helio.example', 'helio.example', ARRAY['Enterprise Software & SaaS'], ARRAY['security'], 'Austin', '{}'),
  ('22222222-2222-2222-2222-222222222205', 'company', 'OpenPipe Labs', ARRAY['OpenPipe'], 'LLM infra', 'https://openpipe.example', 'openpipe.example', ARRAY['Artificial Intelligence'], ARRAY['infra'], 'Remote', '{}'),
  ('22222222-2222-2222-2222-222222222206', 'person', 'Morgan Patel', ARRAY['M. Patel'], 'Former VP Eng at Helio', NULL, NULL, ARRAY['Enterprise Software & SaaS'], ARRAY['operator'], 'Austin', '{}'),
  ('22222222-2222-2222-2222-222222222207', 'fund', 'Cedar Grove Capital', ARRAY['Cedar Grove'], 'Growth fund', 'https://cedar.example', 'cedar.example', ARRAY['Fintech'], ARRAY['growth'], 'NYC', '{}'),
  ('22222222-2222-2222-2222-222222222208', 'technology', 'GPT-5 class APIs', ARRAY[]::text[], 'Frontier model APIs', NULL, NULL, ARRAY['Artificial Intelligence'], ARRAY['api'], 'Global', '{}')
ON CONFLICT (id) DO NOTHING;

-- Demo events (dedupe_key set for idempotent re-runs)
INSERT INTO public.intelligence_events (
  id, event_type, category, title, summary, why_it_matters,
  confidence_score, importance_score, relevance_score, sentiment,
  first_seen_at, last_seen_at, canonical_source_url, source_count, dedupe_key, metadata
) VALUES
  (
    '33333333-3333-3333-3333-333333333301',
    'new_investment_made', 'investors',
    'Northline leads LatticeMind Series A',
    'Northline Ventures led a $42M Series A for LatticeMind AI to expand enterprise agent deployments.',
    'Signals continued dry powder in enterprise AI agents and a benchmark for your next raise conversations.',
    0.88, 0.82, 0.79, 'positive',
    now() - interval '6 hours', now() - interval '6 hours',
    'https://example.com/vc-wire/latticemind-a', 3,
    'demo:new_investment:latticemind:northline',
    '{"demo": true}'
  ),
  (
    '33333333-3333-3333-3333-333333333302',
    'partner_joined_firm', 'investors',
    'Jordan Lee joins Northline as Partner',
    'Lee joins from an operator role to lead AI infra investments at the firm.',
    'New coverage partner may reopen thesis on infra and tooling — worth a warm intro if you are raising.',
    0.81, 0.74, 0.71, 'neutral',
    now() - interval '14 hours', now() - interval '14 hours',
    'https://example.com/vc-wire/lee-northline', 2,
    'demo:partner_join:northline:lee',
    '{"demo": true}'
  ),
  (
    '33333333-3333-3333-3333-333333333303',
    'pricing_changed', 'market',
    'Helio Security revamps enterprise pricing',
    'Helio moved to usage-based seats with a platform fee, targeting mid-market expansion.',
    'Competitive pricing motion may pressure your sales cycle or create whitespace below enterprise.',
    0.77, 0.78, 0.80, 'neutral',
    now() - interval '20 hours', now() - interval '20 hours',
    'https://example.com/market/helio-pricing', 4,
    'demo:pricing:helio',
    '{"demo": true}'
  ),
  (
    '33333333-3333-3333-3333-333333333304',
    'product_launched', 'tech',
    'OpenPipe Labs ships realtime eval harness',
    'Open-sourced evaluation harness for streaming LLM outputs with latency SLOs.',
    'If you ship agents, this tooling could shorten your release QA loop or set buyer expectations on reliability.',
    0.84, 0.72, 0.76, 'positive',
    now() - interval '30 hours', now() - interval '30 hours',
    'https://example.com/tech/openpipe-eval', 2,
    'demo:oss:openpipe-eval',
    '{"demo": true}'
  ),
  (
    '33333333-3333-3333-3333-333333333305',
    'executive_departed', 'network',
    'Morgan Patel departs Helio Security',
    'VP Engineering exits; company cites scaling the platform org.',
    'Talent vacuum can slow roadmap — potential hiring window or partnership angle with Helio.',
    0.79, 0.70, 0.73, 'neutral',
    now() - interval '40 hours', now() - interval '40 hours',
    'https://example.com/people/patel-helio', 2,
    'demo:exec_depart:patel:helio',
    '{"demo": true}'
  ),
  (
    '33333333-3333-3333-3333-333333333306',
    'new_fund_closed', 'investors',
    'Cedar Grove closes $850M Fund V',
    'Cedar Grove announces final close with continued fintech and payments focus.',
    'Fresh capital in fintech vertical — relevant if you overlap or need growth-stage capital.',
    0.86, 0.80, 0.68, 'positive',
    now() - interval '52 hours', now() - interval '52 hours',
    'https://example.com/vc-wire/cedar-v', 5,
    'demo:fund_close:cedar:v',
    '{"demo": true}'
  ),
  (
    '33333333-3333-3333-3333-333333333307',
    'regulatory_update', 'regulatory',
    'EU AI Act: deployment obligations clarified for high-risk systems',
    'Draft guidance narrows documentation expectations for certain B2B workflows.',
    'May reduce compliance surface for EU GTM if your product is borderline high-risk.',
    0.72, 0.85, 0.77, 'neutral',
    now() - interval '70 hours', now() - interval '70 hours',
    'https://example.com/policy/eu-ai-act', 6,
    'demo:regulatory:eu-ai-act',
    '{"demo": true}'
  ),
  (
    '33333333-3333-3333-3333-333333333308',
    'customer_win_announced', 'market',
    'LatticeMind lands Fortune 500 logistics rollout',
    'Multi-year deployment referenced on earnings call commentary.',
    'Category validation — expect buyer RFPs to reference LatticeMind as incumbent alternative.',
    0.75, 0.76, 0.81, 'positive',
    now() - interval '90 hours', now() - interval '90 hours',
    'https://example.com/market/latticemind-win', 3,
    'demo:customer_win:latticemind',
    '{"demo": true}'
  )
ON CONFLICT (id) DO NOTHING;

-- Link entities to events (ignore if duplicate)
INSERT INTO public.intelligence_event_entities (event_id, entity_id, role) VALUES
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', 'investor'),
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222202', 'subject'),
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222201', 'subject'),
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222203', 'new_hire'),
  ('33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222204', 'subject'),
  ('33333333-3333-3333-3333-333333333304', '22222222-2222-2222-2222-222222222205', 'subject'),
  ('33333333-3333-3333-3333-333333333305', '22222222-2222-2222-2222-222222222204', 'subject'),
  ('33333333-3333-3333-3333-333333333305', '22222222-2222-2222-2222-222222222206', 'subject'),
  ('33333333-3333-3333-3333-333333333306', '22222222-2222-2222-2222-222222222207', 'subject'),
  ('33333333-3333-3333-3333-333333333308', '22222222-2222-2222-2222-222222222202', 'subject')
ON CONFLICT ON CONSTRAINT intelligence_event_entities_unique DO NOTHING;

-- Demo raw rows (processed) for pipeline demos
INSERT INTO public.raw_intelligence_items (
  source_id, source_url, title, body, excerpt, published_at, author, metadata, content_hash, processing_status
) VALUES
  (
    '11111111-1111-1111-1111-111111111101',
    'https://example.com/vc-wire/latticemind-a',
    'Northline leads LatticeMind Series A',
    'Full article body placeholder.',
    'Northline leads $42M Series A for LatticeMind AI.',
    now() - interval '6 hours',
    'Wire Desk',
    '{"ingest":"seed"}',
    'demo_hash_latticemind_a',
    'processed'
  ),
  (
    '11111111-1111-1111-1111-111111111102',
    'https://example.com/tech/openpipe-eval',
    'OpenPipe ships realtime eval harness',
    'Details on streaming eval harness.',
    'OSS harness for streaming LLM evals.',
    now() - interval '30 hours',
    'Radar',
    '{"ingest":"seed"}',
    'demo_hash_openpipe',
    'processed'
  )
ON CONFLICT (source_id, content_hash) DO NOTHING;

COMMENT ON TABLE public.intelligence_events IS 'Canonical deduplicated intelligence events surfaced to the product feed.';
COMMENT ON TABLE public.raw_intelligence_items IS 'Raw ingested documents; pipeline promotes into intelligence_events.';
COMMENT ON TABLE public.intelligence_event_types IS 'Extensible taxonomy; add rows to register new event_type codes.';
