
CREATE TABLE public.investor_database (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_name text NOT NULL,
  lead_partner text,
  thesis_verticals text[] NOT NULL DEFAULT '{}',
  preferred_stage text,
  min_check_size integer DEFAULT 0,
  max_check_size integer DEFAULT 0,
  recent_deals text[] DEFAULT '{}',
  location text,
  lead_or_follow text DEFAULT 'Lead',
  ca_sb54_compliant boolean DEFAULT false,
  market_sentiment text DEFAULT 'Active',
  sentiment_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investor_database ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read investors" ON public.investor_database
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.investor_database (firm_name, lead_partner, thesis_verticals, preferred_stage, min_check_size, max_check_size, recent_deals, location, lead_or_follow, ca_sb54_compliant, market_sentiment, sentiment_detail) VALUES
('Andreessen Horowitz', 'Martin Casado', ARRAY['AI / ML', 'SaaS / B2B Software', 'Developer Tools'], 'Series A', 5000000, 50000000, ARRAY['Mistral AI', 'Databricks', 'Anysphere'], 'San Francisco, CA', 'Lead', true, 'Active', 'Doubling down on AI infrastructure and agentic workflows'),
('Sequoia Capital', 'Pat Grady', ARRAY['SaaS / B2B Software', 'AI / ML', 'Fintech'], 'Seed', 1000000, 15000000, ARRAY['Stripe', 'Notion', 'Arc'], 'Menlo Park, CA', 'Lead', true, 'Active', 'Actively deploying across AI-native SaaS'),
('Y Combinator', 'Garry Tan', ARRAY['AI / ML', 'SaaS / B2B Software', 'Health Tech', 'Climate Tech'], 'Pre-Seed', 125000, 500000, ARRAY['Airbnb', 'Stripe', 'DoorDash'], 'San Francisco, CA', 'Lead', true, 'Active', 'Thesis-shifting toward agentic AI and hard tech'),
('First Round Capital', 'Bill Trenchard', ARRAY['SaaS / B2B Software', 'Developer Tools', 'Marketplace'], 'Seed', 500000, 3000000, ARRAY['Notion', 'Roblox', 'Uber'], 'San Francisco, CA', 'Lead', false, 'Active', 'Focused on product-led growth companies'),
('General Catalyst', 'Hemant Taneja', ARRAY['Health Tech', 'Fintech', 'AI / ML'], 'Series A', 5000000, 25000000, ARRAY['Stripe', 'Snap', 'Grammarly'], 'Cambridge, MA', 'Lead', true, 'Thesis-Shifting', 'Pivoting from pure SaaS to AI-augmented healthcare'),
('Lightspeed Venture Partners', 'Mercedes Bent', ARRAY['Consumer / D2C', 'Fintech', 'SaaS / B2B Software'], 'Series A', 3000000, 20000000, ARRAY['Snap', 'Affirm', 'Epic Games'], 'Menlo Park, CA', 'Lead', false, 'Active', 'Strong interest in consumer AI applications'),
('Founders Fund', 'Keith Rabois', ARRAY['AI / ML', 'Climate Tech', 'Developer Tools'], 'Seed', 2000000, 10000000, ARRAY['SpaceX', 'Palantir', 'Anduril'], 'San Francisco, CA', 'Lead', false, 'Active', 'Favoring bold deep-tech and AI defense bets'),
('Accel', 'Sonali De Rycker', ARRAY['SaaS / B2B Software', 'Fintech', 'Marketplace'], 'Series A', 5000000, 30000000, ARRAY['Slack', 'CrowdStrike', 'Spotify'], 'Palo Alto, CA', 'Lead', true, 'Active', 'Backing category-defining enterprise software'),
('Bessemer Venture Partners', 'Mary D Arcy', ARRAY['SaaS / B2B Software', 'Health Tech', 'Developer Tools'], 'Seed', 1000000, 8000000, ARRAY['Shopify', 'Twilio', 'Toast'], 'San Francisco, CA', 'Follow', true, 'Paused', 'Pausing new investments pending portfolio review'),
('NEA', 'Scott Sandell', ARRAY['Health Tech', 'AI / ML', 'Edtech'], 'Series B', 10000000, 50000000, ARRAY['Robinhood', 'Cloudflare', 'Plaid'], 'Menlo Park, CA', 'Lead', false, 'Active', 'Actively seeking AI-first healthtech founders'),
('Initialized Capital', 'Alexis Ohanian', ARRAY['Consumer / D2C', 'Marketplace', 'AI / ML'], 'Pre-Seed', 250000, 1500000, ARRAY['Patreon', 'Coinbase', 'Instacart'], 'San Francisco, CA', 'Lead', true, 'Thesis-Shifting', 'Shifting from consumer social to AI-native consumer apps'),
('Kleiner Perkins', 'Mamoon Hamid', ARRAY['SaaS / B2B Software', 'Climate Tech', 'AI / ML'], 'Series A', 5000000, 25000000, ARRAY['Figma', 'Rippling', 'Nuro'], 'Menlo Park, CA', 'Lead', false, 'Active', 'Investing heavily in climate-AI intersection');
