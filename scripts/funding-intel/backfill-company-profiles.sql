UPDATE funding_deals AS fd
SET
  company_hq = v.hq,
  deal_summary = v.summary,
  updated_at = NOW()
FROM (VALUES
  ('Aegis AI', 'San Francisco, CA', $s$We're a team of ex-Google engineers who built some of the largest defensive platforms on the planet — Safe Browsing and reCAPTCHA. Now we're striking out on our own to tackle an even bigger challenge: stopping the new wave of adversarial AI attacks already hitting organizations today.$s$),
  ('Andera', 'San Francisco, CA', $s$Andera is building reliable AI agents for back-office financial work, starting with automating audits for the world's largest public companies.$s$),
  ('Candid Health', 'San Francisco, CA', $s$Candid Health is building a modern medical payments platform that enables healthcare providers to focus on delivering high-quality, affordable and accessible care, rather than spending half their time figuring out how to get paid by insurance.$s$),
  ('Decade', 'São Paulo, Brazil', $s$Decade combines artificial intelligence and human expertise to help people put their money to work. Founded by former Nubank CTO Vitor Olivier and Hyperplane founder Felipe Meneses, Decade gives each client an integrated view of their financial life and personalized guidance to make the correct financial decision for them.$s$),
  ('Enigma', 'San Francisco, CA', $s$Enigma is building foundational AI models and simple control interfaces to make robots easier to deploy and operate across multiple hardware setups.$s$),
  ('Fish Audio', 'San Francisco, CA', $s$Fish Audio is a voice AI platform. Every core feature is available three ways: in the web app (no code), through the REST API, and via the official SDK.$s$),
  ('Henry', 'New York, NY', $s$Henry is the context engine for commercial real estate. Our platform pulls your firm's data and brand into one place, then turns it into the underwriting, comps, research, buyer and lender lists, and decks that win the deal.$s$),
  ('Natural', 'San Francisco, CA', $s$Natural is building payments infrastructure for the agent economy — making it easy for agents to send, receive, and manage payments with businesses, consumers, and other agents.$s$),
  ('Passionfroot', 'Berlin, Germany', $s$Passionfroot provides a centralized location for creators and media companies to manage sponsorships, collaboration requests, bookings, and payments.$s$),
  ('Alloy Robotics', 'San Francisco, CA', $s$Alloy is how modern robotics teams build great robots. Alloy helps robotics teams organise, search and analyse across all types of multimodal robot data in one platform using natural language, without waiting for labels.$s$),
  ('Ambrook', 'New York, NY', $s$Ambrook's mission is to build a more prosperous and resilient future for America's family-run businesses. We're starting with accounting tools to help businesses manage finances, improve margins, and stay independent.$s$),
  ('Antares', 'Los Angeles, CA', $s$Antares is building compact nuclear microreactors to deliver reliable, mobile energy where it's needed most: remote military bases, austere industrial sites, and, one day, deep space and underwater missions.$s$),
  ('Atoms', 'San Francisco, CA', $s$Founded by Uber co-founder Travis Kalanick, ATOMS develops robotics, software, and infrastructure that automate how things are produced and moved through the physical world.$s$),
  ('Base', 'Austin, TX', $s$Base is building the foundation of American power. We're deploying a nationwide network of distributed batteries that strengthens critical infrastructure and saves Americans money.$s$),
  ('Convex', 'San Francisco, CA', $s$Convex is a full cloud backend designed to replace your database, server functions, backend functionality, and the interface all the way out to your application.$s$),
  ('CuspAI', 'London, UK', $s$While nature took billions of years to perfect molecules, we are harnessing AI to unlock trillion-dollar materials breakthroughs in months, not millennia.$s$),
  ('Etched', 'San Jose, CA', $s$Etched is building the world's first AI inference system purpose-built for transformers — delivering over 10x higher performance and dramatically lower cost and latency than a B200.$s$),
  ('Function Health', 'Austin, TX', $s$Function Health is a comprehensive health data platform for routine whole-body lab testing and personalized guidance from top doctors, helping people understand personal disease risk and stay healthy.$s$),
  ('HappyRobot', 'San Francisco, CA', $s$HappyRobot is the AI-native operating system for supply chain enterprises — evolving manual work into autonomous operations that deliver resilience, speed, and growth.$s$),
  ('Humanoid', 'London, UK', $s$Humanoid is the first AI and robotics company in the UK, creating advanced, reliable, commercially scalable, and safe humanoid robots, starting with industrial applications.$s$),
  ('Multiplier', 'New York, NY', $s$Founded by Ian McInnis, Ben Finch, and Ryan Winkler, Multiplier develops a customized coding agent platform engineered specifically for fundamental equity hedge funds.$s$),
  ('Onyx Security', 'San Francisco, CA', $s$Onyx (formerly Danswer) is the AI platform connected to your company's docs, apps, and people. It plugs into any LLM of your choice and keeps knowledge and access controls synced across 40+ connectors.$s$),
  ('Osmo Studio', 'San Francisco, CA', $s$Osmo is building the AI-native motion graphics studio. The Osmo editor is a real-time canvas where a chat agent generates motion graphics as a timeline, inspector, and preview update together.$s$),
  ('Paper', 'San Francisco, CA', $s$Paper is a powerful canvas that helps designers make beautiful art and experiences with fast, reliable tools.$s$),
  ('Rillet', 'New York, NY', $s$Rillet is the first accounting platform made to tailor fit the workflows of accountants and a full replacement for legacy ERPs like NetSuite and Sage Intacct.$s$),
  ('River AI', 'Palo Alto, CA', $s$At River AI, our mission is to create personal AI owned and shaped by each individual. The team is rewriting the stack from personal hardware for local inference to custom training infrastructure and frontier deep learning research.$s$),
  ('Sent', 'New York, NY', $s$Sent is a unified API and A2P communications platform that identifies and delivers messages to contacts' primary channels, helping businesses reach people globally while reducing messaging costs.$s$),
  ('Simile', 'Palo Alto, CA', $s$Simile is building the first AI simulation of society, populated by agents based on real humans, combining Stanford generative-agent research with large-scale AI systems engineering.$s$),
  ('Throne', 'Austin, TX', $s$Throne is building the first wearable for your toilet that tracks gut health and hydration with every flush, with a mission to make gut health as easy to track as sleep.$s$),
  ('Town', 'San Francisco, CA', $s$Town is an applied AI company in San Francisco. We build tools that make it easy for anyone to create and use software in their everyday work.$s$),
  ('Valar Atomics', 'Los Angeles, CA', $s$Valar Atomics is scaling nuclear energy for heavy industrial power and clean hydrocarbon fuel production by building nuclear reactors on Valar Atomics gigasites.$s$),
  ('Also', 'Palo Alto, CA', $s$ALSO is an electric mobility company originally conceived as a part of Rivian, building vertically integrated small EVs designed to meet global mobility challenges.$s$),
  ('Callosum', 'London, UK', $s$Callosum is the Intelligent Systems Company. We believe the next generation of AI won't be defined by any single model or chip, but by intelligent systems in which hardware and intelligence co-evolve.$s$),
  ('Veeda', 'Toronto, Canada', $s$Veeda AI builds multimodal foundation world models that simulate physical reality, creating infinitely scalable environments where embodied agents can learn through interaction. Founded by Sanja Fidler.$s$),
  ('Prime Intellect', 'San Francisco, CA', $s$Prime Intellect democratizes AI development at scale. Our platform makes it easy to find global compute resources and train state-of-the-art models through distributed training across clusters.$s$),
  ('Norm AI', 'New York, NY', $s$Norm Ai is a legal and compliance AI company. By turning legal code into AI code, Norm enables enterprises to move faster in legal and compliance processes with auditability, reliability, and trust.$s$),
  ('Ollama', 'Palo Alto, CA', $s$Ollama lets developers get up and running with large language models locally, including open models from labs such as Google, Meta, DeepSeek, and others.$s$),
  ('Senra Systems', 'Redondo Beach, CA', $s$Senra Systems is building the first software-powered wire harness manufacturing company, turning skilled assembly tasks into high-throughput production lines for faster harness builds.$s$),
  ('TerraFirma', 'Austin, TX', $s$TerraFirma is redefining how the world moves earth for construction. Founded by former SpaceX engineers, TerraFirma is automating construction to make it faster, cheaper, and safer.$s$),
  ('InstaLILY AI', 'New York, NY', $s$InstaLILY built Lily, the first AI Forward Deployed Engineer. Lily learns how a business operates, builds the software the work needs, and runs it inside the systems already in place.$s$),
  ('Sable', 'San Francisco, CA', $s$Sable built Aidan, an AI employee who can lead customer calls using realtime voice, vision, and browser use inside a real product environment.$s$),
  ('Gradial', 'Seattle, WA', $s$Gradial helps marketers and creatives move from idea to execution faster by automating website updates, design system migrations, and ongoing content optimization while preserving brand integrity.$s$),
  ('Helcim', 'Calgary, Canada', $s$Helcim is a payments company that lets businesses accept credit cards with ease, offering payments for businesses in Canada and the US.$s$),
  ('Astromech', 'San Francisco, CA', $s$Astromech designs semantically precise and biologically grounded prompts for large AI models used in genomic inference, synthesis design, and ancestral modeling. Co-founded by the CEO of Colossal Biosciences, Ben Lamm.$s$),
  ('Aligned Marketplace', 'New York, NY', $s$Aligned Marketplace is an advanced primary care marketplace that helps self-insured employers reduce healthcare costs by connecting members to independent advanced and direct primary care practices across all 50 states.$s$),
  ('WashWise', 'New York, NY', $s$WashWise is a clothing care company building products that refresh, de-wrinkle, deodorize, and lightly cleanse garments between washes so people can wear more and wash less.$s$),
  ('Pinegap', 'New York, NY', $s$Pinegap is an AI-powered equity research platform for institutional analysts and portfolio managers, automating idea generation, earnings analysis, and ramping up on new companies.$s$),
  ('Speakeasy', 'New York, NY', $s$Speakeasy is the operations and intelligence platform for live experiences, combining ticketing, reservations, payments, and CRM for venues, festivals, and hospitality groups.$s$),
  ('Pearl Health', 'New York, NY', $s$Pearl Health partners with primary care providers and health systems to succeed in value-based Medicare care through technology, analytics, and operational enablement.$s$),
  ('Stepful', 'New York, NY', $s$Stepful trains people for entry-level healthcare jobs through virtual instructor-led courses and coaching, then places graduates with hospitals and health systems.$s$),
  ('SONATA', 'New York, NY', $s$SONATA is a doctor-led preventive healthcare membership that combines whole-genome sequencing, biomarker testing, and clinical AI with ongoing care from board-certified physicians.$s$),
  ('Uniti AI', 'New York, NY', $s$Uniti is the agentic AI layer for real estate operators. Its agents handle leasing, maintenance, collections, and resident communications across voice, email, SMS, and chat inside the property systems operators already use.$s$),
  ('InduPro', 'Seattle, WA', $s$InduPro is a biotechnology company that develops cell-surface platform technologies to define and manipulate protein interactions for therapeutic applications.$s$),
  ('Moove', 'Dubai, UAE', $s$Moove finances, owns, and operates vehicle fleets for ride-hail and robotaxi platforms. Founded in Nigeria and now headquartered in Dubai, it is a fleet partner for companies including Uber and Waymo.$s$)
) AS v(company_name, hq, summary)
WHERE fd.duplicate_of_deal_id IS NULL
  AND lower(btrim(fd.company_name)) = lower(v.company_name);

UPDATE funding_deals
SET company_hq = 'Seattle, WA', updated_at = NOW()
WHERE duplicate_of_deal_id IS NULL
  AND (company_hq IS NULL OR btrim(company_hq) = '')
  AND company_name ILIKE '%seattle%'
  AND (
    company_name ILIKE '%startup%'
    OR company_name ILIKE '%seattle''s%'
    OR company_name ILIKE '%seattle’s%'
  );

UPDATE funding_deals
SET company_hq = 'Portland, OR', updated_at = NOW()
WHERE duplicate_of_deal_id IS NULL
  AND (company_hq IS NULL OR btrim(company_hq) = '')
  AND company_name ILIKE 'portland%';
