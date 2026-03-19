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
    label: "Construction & Real Estate",
    description: "Building, property, and infrastructure technology",
    search_tags: ["construction", "contech", "proptech", "real estate", "property", "building", "bim", "digital twin", "infrastructure", "housing", "architecture"],
    default_subsectors: ["ConTech (Construction Tech)", "PropTech", "Sustainable Materials", "Infrastructure & Civil Engineering", "Digital Twins & BIM", "Residential Construction"],
  },
  {
    label: "Industrial & Manufacturing",
    description: "Factory automation, robotics, and supply chain",
    search_tags: ["industrial", "manufacturing", "robotics", "automation", "factory", "industry 4.0", "warehouse", "3d printing", "additive", "supply chain", "logistics"],
    default_subsectors: ["Industrial Tech (Industry 4.0)", "Robotics & Automation", "Supply Chain Tech", "Warehousing Tech", "Advanced Manufacturing", "3D Printing"],
  },
  {
    label: "Enterprise Software & SaaS",
    description: "Horizontal & vertical B2B software",
    search_tags: ["saas", "software", "enterprise", "b2b", "cybersecurity", "security", "devtools", "open source", "hr", "hrtech", "martech", "marketing", "legaltech", "legal", "crm", "erp", "cloud"],
    default_subsectors: ["Vertical SaaS", "Horizontal SaaS", "DevTools & Open Source", "Cybersecurity", "HRTech", "MarTech", "LegalTech"],
  },
  {
    label: "Artificial Intelligence",
    description: "AI/ML models, agents, and infrastructure",
    search_tags: ["ai", "artificial intelligence", "machine learning", "ml", "llm", "gpt", "chatbot", "agent", "copilot", "neural", "diffusion", "generative", "computer vision", "nlp", "deep learning"],
    default_subsectors: ["Vertical AI Agents", "LLMOps & Infrastructure", "Computer Vision", "Generative Media", "AI Safety & Governance", "Edge AI"],
  },
  {
    label: "Fintech",
    description: "Financial services and payments technology",
    search_tags: ["fintech", "finance", "payments", "banking", "insurance", "insurtech", "crypto", "blockchain", "web3", "bitcoin", "wallet", "stripe", "compliance", "kyc", "aml", "regtech", "wealthtech", "lending", "neobank"],
    default_subsectors: ["Embedded Finance", "Payments Infrastructure", "Insurtech", "Real World Asset (RWA) Tokenization", "RegTech", "WealthTech"],
  },
  {
    label: "Climate & Energy",
    description: "Clean energy, carbon, and sustainability",
    search_tags: ["climate", "energy", "cleantech", "solar", "wind", "carbon", "battery", "ev", "grid", "farming", "agriculture", "agtech", "water", "sustainability", "circular economy", "green"],
    default_subsectors: ["Carbon Capture", "Energy Storage", "Circular Economy", "Grid Optimization", "AgTech", "Water Tech"],
  },
  {
    label: "Health & Biotech",
    description: "Healthcare, pharma, and life sciences",
    search_tags: ["health", "healthcare", "biotech", "medtech", "telehealth", "patient", "ehr", "drug", "pharma", "biopharma", "dna", "genome", "genomics", "longevity", "neuro", "brain", "medical", "clinical", "diagnostics"],
    default_subsectors: ["Longevity", "Digital Health", "MedTech", "Biopharma", "Genomics", "Neurotech"],
  },
  {
    label: "Consumer & Retail",
    description: "E-commerce, gaming, education, and social",
    search_tags: ["consumer", "retail", "ecommerce", "e-commerce", "d2c", "dtc", "gaming", "esport", "education", "edtech", "learning", "social", "creator", "adtech", "advertising", "commerce", "subscription box"],
    default_subsectors: ["E-commerce Infrastructure", "Gaming & Interactive", "EdTech", "Social Commerce", "AdTech"],
  },
  {
    label: "Deep Tech & Space",
    description: "Quantum, semiconductors, and space infrastructure",
    search_tags: ["deep tech", "quantum", "satellite", "space", "rocket", "chip", "semiconductor", "photonics", "materials science", "advanced computing", "satcom"],
    default_subsectors: ["Quantum Computing", "Space Infrastructure", "Satcom", "Photonics", "Semiconductors"],
  },
  {
    label: "Defense & GovTech",
    description: "Military, civic tech, and public sector",
    search_tags: ["defense", "defence", "military", "drone", "uav", "govtech", "government", "dual-use", "public safety", "civic", "national security", "intelligence"],
    default_subsectors: ["Dual-Use Tech", "Public Safety", "Civic Engagement", "National Security", "Drones & UAVs"],
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
