// ═══════════════════════════════════════════════════════════
// Centralized Taxonomy Engine
// Single source of truth for all categorical fields
// ═══════════════════════════════════════════════════════════

export interface TaxonomyOption {
  label: string;
  description?: string;
  search_tags: string[];
}

export interface SectorOption extends TaxonomyOption {
  default_subsectors: string[];
}

// ── Stage Options (strict chronological order — do NOT sort) ──

export const STAGE_OPTIONS: TaxonomyOption[] = [
  { label: "Pre-Seed", description: "Idea stage, no product yet", search_tags: ["idea", "concept", "pre-seed", "preseed", "friends and family", "f&f", "bootstrapping"] },
  { label: "Seed", description: "MVP built, early traction", search_tags: ["seed", "mvp", "early", "angel", "pre-revenue", "pilot", "beta"] },
  { label: "Series A", description: "Product-market fit, scaling GTM", search_tags: ["series a", "growth", "pmf", "product market fit", "scaling", "gtm"] },
  { label: "Series B", description: "Scaling revenue & team", search_tags: ["series b", "expansion", "scale", "revenue growth", "unit economics"] },
  { label: "Series C+", description: "Late-stage growth or pre-IPO", search_tags: ["series c", "series d", "series e", "late stage", "pre-ipo", "growth equity", "pre ipo"] },
];

// ── Sector Options (with default subsectors & deep search tags) ──

export const SECTOR_OPTIONS: SectorOption[] = [
  {
    label: "Fintech",
    description: "Financial services, payments, banking, and insurance technology",
    search_tags: ["fintech", "finance", "payments", "banking", "insurance", "insurtech", "crypto", "blockchain", "lending", "neobank", "wealthtech", "regtech", "compliance", "kyc"],
    default_subsectors: ["Embedded Finance", "Payments Infrastructure", "Insurtech", "WealthTech", "RegTech", "Lending & Credit"],
  },
  {
    label: "Enterprise Software & SaaS",
    description: "Horizontal & vertical B2B software",
    search_tags: ["saas", "software", "enterprise", "b2b", "devtools", "open source", "hr", "hrtech", "legaltech", "crm", "erp", "cloud", "workflow", "productivity"],
    default_subsectors: ["Vertical SaaS", "Horizontal SaaS", "DevTools & Open Source", "HRTech", "LegalTech", "Workflow Automation"],
  },
  {
    label: "AI, Data & Analytics",
    description: "AI/ML models, agents, data infrastructure, and analytics",
    search_tags: ["ai", "artificial intelligence", "machine learning", "ml", "llm", "gpt", "agent", "copilot", "neural", "generative", "computer vision", "nlp", "deep learning", "data", "analytics", "big data"],
    default_subsectors: ["Vertical AI Agents", "LLMOps & Infrastructure", "Computer Vision", "Generative Media", "AI Safety & Governance", "Data Infrastructure"],
  },
  {
    label: "HealthTech, Biotech & Life Sciences",
    description: "Healthcare, pharma, biotech, and life sciences",
    search_tags: ["health", "healthcare", "biotech", "medtech", "telehealth", "pharma", "biopharma", "genomics", "longevity", "neurotech", "medical", "clinical", "diagnostics", "digital health", "life sciences"],
    default_subsectors: ["Digital Health", "MedTech", "Biopharma", "Genomics", "Neurotech", "Longevity"],
  },
  {
    label: "Consumer, E‑commerce & CPG",
    description: "Consumer products, e-commerce, D2C, and social",
    search_tags: ["consumer", "retail", "ecommerce", "e-commerce", "d2c", "dtc", "cpg", "consumer packaged goods", "social commerce", "subscription", "marketplace"],
    default_subsectors: ["E-commerce Infrastructure", "Social Commerce", "D2C Brands", "Subscription Commerce", "Consumer Marketplace"],
  },
  {
    label: "Climate, Energy & Sustainability",
    description: "Clean energy, carbon, agtech, and sustainability",
    search_tags: ["climate", "energy", "cleantech", "solar", "wind", "carbon", "battery", "ev", "sustainability", "circular economy", "green", "agtech", "water"],
    default_subsectors: ["Carbon Capture", "Energy Storage", "Circular Economy", "Grid Optimization", "AgTech", "Water Tech"],
  },
  {
    label: "Mobility, Transportation & Logistics",
    description: "Autonomous vehicles, logistics, and supply chain",
    search_tags: ["mobility", "transportation", "logistics", "autonomous", "ev", "electric vehicle", "fleet", "shipping", "freight", "last mile", "supply chain"],
    default_subsectors: ["Autonomous Vehicles", "Fleet Management", "Last-Mile Delivery", "Freight Tech", "Micro-Mobility"],
  },
  {
    label: "IndustrialTech, Manufacturing & Robotics",
    description: "Factory automation, robotics, and industrial IoT",
    search_tags: ["industrial", "manufacturing", "robotics", "automation", "factory", "industry 4.0", "3d printing", "additive", "iot", "warehouse"],
    default_subsectors: ["Industrial IoT", "Robotics & Automation", "Advanced Manufacturing", "3D Printing", "Warehouse Automation"],
  },
  {
    label: "PropTech & Construction Tech",
    description: "Property, real estate, and construction technology",
    search_tags: ["construction", "contech", "proptech", "real estate", "property", "building", "bim", "digital twin", "infrastructure", "housing"],
    default_subsectors: ["ConTech", "PropTech", "Digital Twins & BIM", "Sustainable Materials", "Smart Buildings"],
  },
  {
    label: "Cybersecurity & Privacy",
    description: "Security, privacy, and identity management",
    search_tags: ["cybersecurity", "security", "privacy", "identity", "authentication", "zero trust", "soc", "threat", "encryption", "infosec"],
    default_subsectors: ["Identity & Access", "Threat Detection", "Cloud Security", "Privacy Engineering", "Zero Trust"],
  },
  {
    label: "Media, Gaming & Creator Economy",
    description: "Gaming, streaming, content creation, and entertainment",
    search_tags: ["media", "gaming", "esport", "creator", "streaming", "entertainment", "content", "social media", "video", "music", "podcast"],
    default_subsectors: ["Gaming & Interactive", "Creator Tools", "Streaming Platforms", "Digital Media", "AdTech"],
  },
  {
    label: "Web3, Crypto & DeFi",
    description: "Blockchain, decentralized finance, and crypto infrastructure",
    search_tags: ["web3", "crypto", "blockchain", "defi", "nft", "dao", "token", "decentralized", "bitcoin", "ethereum", "solana", "wallet"],
    default_subsectors: ["DeFi Protocols", "NFT Infrastructure", "L1/L2 Chains", "Crypto Wallets", "RWA Tokenization"],
  },
  {
    label: "EdTech & Future of Work",
    description: "Education, training, and workforce transformation",
    search_tags: ["edtech", "education", "learning", "training", "upskilling", "workforce", "future of work", "remote work", "collaboration", "talent"],
    default_subsectors: ["Online Learning", "Corporate Training", "Skills Assessment", "Remote Collaboration", "Talent Marketplace"],
  },
  {
    label: "GovTech, Defense & Space",
    description: "Government, military, space, and civic technology",
    search_tags: ["govtech", "government", "defense", "defence", "military", "space", "satellite", "drone", "uav", "public safety", "civic", "deep tech", "quantum"],
    default_subsectors: ["Dual-Use Tech", "Public Safety", "Space Infrastructure", "Quantum Computing", "Drones & UAVs"],
  },
  {
    label: "Marketing, Sales & Retail Infrastructure",
    description: "MarTech, AdTech, sales enablement, and retail tech",
    search_tags: ["martech", "marketing", "adtech", "advertising", "sales", "retail tech", "commerce enablement", "attribution", "seo", "crm", "lead gen"],
    default_subsectors: ["Sales Enablement", "Marketing Automation", "Retail Analytics", "Attribution & Measurement", "Commerce Infrastructure"],
  },
];

// ── Business Model Options ──

export const BUSINESS_MODEL_OPTIONS: TaxonomyOption[] = [
  { label: "B2B SaaS", description: "Recurring subscription software", search_tags: ["saas", "subscription", "cloud", "software", "recurring revenue", "mrr", "arr"] },
  { label: "Marketplace", description: "Two-sided platform connecting buyers & sellers", search_tags: ["marketplace", "platform", "two-sided", "network effect", "supply demand", "matching"] },
  { label: "E-Commerce", description: "Direct online retail or D2C", search_tags: ["ecommerce", "e-commerce", "d2c", "dtc", "online store", "retail", "shop", "cart"] },
  { label: "Hardware", description: "Physical product or device", search_tags: ["hardware", "device", "iot", "sensor", "wearable", "physical product", "embedded", "gadget"] },
  { label: "Services", description: "Professional or managed services", search_tags: ["services", "consulting", "agency", "managed", "professional", "outsourcing", "staffing"] },
  { label: "Freemium", description: "Free tier + paid premium upgrade", search_tags: ["freemium", "free tier", "premium", "upgrade", "free trial", "conversion"] },
  { label: "Usage-Based", description: "Pay-per-use or consumption pricing", search_tags: ["usage", "consumption", "metered", "pay per use", "api calls", "credits", "utility"] },
  { label: "Licensing", description: "One-time or recurring license fees", search_tags: ["license", "licensing", "perpetual", "seat license", "enterprise license"] },
  { label: "Advertising", description: "Revenue from ads and sponsorships", search_tags: ["advertising", "ads", "ad-supported", "cpm", "cpc", "sponsorship", "media"] },
  { label: "Transaction Fee", description: "Revenue from per-transaction commissions", search_tags: ["transaction", "commission", "take rate", "payment processing", "interchange", "fee per transaction"] },
];

// ── Target Customer Options ──

export const TARGET_CUSTOMER_OPTIONS: TaxonomyOption[] = [
  { label: "B2B", description: "Selling to other businesses", search_tags: ["b2b", "business to business", "enterprise sales", "corporate", "company"] },
  { label: "B2C", description: "Selling directly to consumers", search_tags: ["b2c", "consumer", "direct to consumer", "retail", "end user", "individual"] },
  { label: "B2B2C", description: "Reaching consumers through business partners", search_tags: ["b2b2c", "channel", "partner", "distribution", "embedded", "white label"] },
  { label: "SMB", description: "Small & medium businesses", search_tags: ["smb", "small business", "medium business", "sme", "local business", "self-serve"] },
  { label: "Enterprise", description: "Large corporations (500+ employees)", search_tags: ["enterprise", "large company", "fortune 500", "global", "multi-national", "complex sale"] },
  { label: "Government", description: "Federal, state, or local government", search_tags: ["government", "gov", "b2g", "federal", "state", "municipal", "public sector", "procurement"] },
  { label: "Prosumer", description: "Professional consumers or power users", search_tags: ["prosumer", "power user", "professional", "creator", "freelancer", "solopreneur"] },
];

// ── Helper: semantic search across all fields ──

export function filterTaxonomyOptions<T extends TaxonomyOption>(
  options: T[],
  query: string
): T[] {
  const q = query.toLowerCase().trim();
  if (!q) return options;

  type ScoredOption = { option: T; score: number };
  const scored: ScoredOption[] = [];

  for (const opt of options) {
    let score = 0;
    const labelLower = opt.label.toLowerCase();
    const descLower = (opt.description || "").toLowerCase();

    // Exact label match = highest
    if (labelLower === q) { score = 100; }
    // Label starts with query
    else if (labelLower.startsWith(q)) { score = 80; }
    // Label contains query
    else if (labelLower.includes(q)) { score = 60; }
    // Description contains query
    else if (descLower.includes(q)) { score = 40; }
    // Search tags contain query (partial match)
    else {
      for (const tag of opt.search_tags) {
        if (tag.includes(q) || q.includes(tag)) {
          score = 30;
          break;
        }
      }
    }

    if (score > 0) scored.push({ option: opt, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map(s => s.option);
}
