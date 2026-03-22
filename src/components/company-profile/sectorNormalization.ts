import { SECTOR_OPTIONS, BUSINESS_MODEL_OPTIONS, TARGET_CUSTOMER_OPTIONS } from "@/constants/taxonomy";
import { SECTOR_TAXONOMY, sectors, subsectorsFor } from "./types";

/**
 * Normalize a raw AI-extracted sector string to a canonical sector from our taxonomy.
 * Uses fuzzy matching, keyword extraction, and synonym mapping.
 */

// New taxonomy labels from SECTOR_OPTIONS
const NEW_SECTOR_LABELS = SECTOR_OPTIONS.map(o => o.label);

// Bridge from old taxonomy → new taxonomy
const OLD_TO_NEW_SECTOR: Record<string, string> = {
  "Construction & Real Estate": "PropTech & Construction Tech",
  "Industrial & Manufacturing": "IndustrialTech, Manufacturing & Robotics",
  "Enterprise Software & SaaS": "Enterprise Software & SaaS",
  "Artificial Intelligence": "AI, Data & Analytics",
  "Fintech": "Fintech",
  "Climate & Energy": "Climate, Energy & Sustainability",
  "Health & Biotech": "HealthTech, Biotech & Life Sciences",
  "Consumer & Retail": "Consumer, E\u2011commerce & CPG",
  "Deep Tech & Space": "GovTech, Defense & Space",
  "Defense & GovTech": "GovTech, Defense & Space",
};

const SECTOR_ALIASES: Record<string, string> = {
  // Direct new taxonomy names (lowercase)
  ...Object.fromEntries(NEW_SECTOR_LABELS.map(l => [l.toLowerCase(), l])),

  // Old taxonomy names → new labels
  "construction & real estate": "PropTech & Construction Tech",
  "industrial & manufacturing": "IndustrialTech, Manufacturing & Robotics",
  "artificial intelligence": "AI, Data & Analytics",
  "climate & energy": "Climate, Energy & Sustainability",
  "health & biotech": "HealthTech, Biotech & Life Sciences",
  "consumer & retail": "Consumer, E\u2011commerce & CPG",
  "deep tech & space": "GovTech, Defense & Space",
  "defense & govtech": "GovTech, Defense & Space",

  // Common AI output variations
  "enterprise software": "Enterprise Software & SaaS",
  "saas": "Enterprise Software & SaaS",
  "b2b software": "Enterprise Software & SaaS",
  "software": "Enterprise Software & SaaS",
  "saas / b2b software": "Enterprise Software & SaaS",

  "ai": "AI, Data & Analytics",
  "ai / ml": "AI, Data & Analytics",
  "machine learning": "AI, Data & Analytics",
  "data analytics": "AI, Data & Analytics",
  "data": "AI, Data & Analytics",

  "health tech": "HealthTech, Biotech & Life Sciences",
  "healthtech": "HealthTech, Biotech & Life Sciences",
  "biotech": "HealthTech, Biotech & Life Sciences",
  "healthcare": "HealthTech, Biotech & Life Sciences",
  "digital health": "HealthTech, Biotech & Life Sciences",
  "medtech": "HealthTech, Biotech & Life Sciences",
  "life sciences": "HealthTech, Biotech & Life Sciences",

  "climate tech": "Climate, Energy & Sustainability",
  "cleantech": "Climate, Energy & Sustainability",
  "clean tech": "Climate, Energy & Sustainability",
  "energy": "Climate, Energy & Sustainability",
  "agtech": "Climate, Energy & Sustainability",
  "agriculture": "Climate, Energy & Sustainability",
  "sustainability": "Climate, Energy & Sustainability",

  "construction": "PropTech & Construction Tech",
  "real estate": "PropTech & Construction Tech",
  "contech": "PropTech & Construction Tech",
  "proptech": "PropTech & Construction Tech",
  "building": "PropTech & Construction Tech",
  "building software": "PropTech & Construction Tech",
  "construction tech": "PropTech & Construction Tech",

  "manufacturing": "IndustrialTech, Manufacturing & Robotics",
  "industrial": "IndustrialTech, Manufacturing & Robotics",
  "robotics": "IndustrialTech, Manufacturing & Robotics",
  "supply chain": "Mobility, Transportation & Logistics",
  "logistics": "Mobility, Transportation & Logistics",
  "transportation": "Mobility, Transportation & Logistics",
  "mobility": "Mobility, Transportation & Logistics",

  "financial technology": "Fintech",
  "financial services": "Fintech",
  "payments": "Fintech",
  "crypto": "Web3, Crypto & DeFi",
  "blockchain": "Web3, Crypto & DeFi",
  "web3": "Web3, Crypto & DeFi",
  "defi": "Web3, Crypto & DeFi",
  "insurtech": "Fintech",

  "consumer": "Consumer, E\u2011commerce & CPG",
  "retail": "Consumer, E\u2011commerce & CPG",
  "ecommerce": "Consumer, E\u2011commerce & CPG",
  "e-commerce": "Consumer, E\u2011commerce & CPG",
  "d2c": "Consumer, E\u2011commerce & CPG",
  "cpg": "Consumer, E\u2011commerce & CPG",

  "edtech": "EdTech & Future of Work",
  "education": "EdTech & Future of Work",
  "future of work": "EdTech & Future of Work",

  "gaming": "Media, Gaming & Creator Economy",
  "media": "Media, Gaming & Creator Economy",
  "creator economy": "Media, Gaming & Creator Economy",
  "entertainment": "Media, Gaming & Creator Economy",

  "deep tech": "GovTech, Defense & Space",
  "space": "GovTech, Defense & Space",
  "quantum": "GovTech, Defense & Space",
  "semiconductors": "GovTech, Defense & Space",
  "defense": "GovTech, Defense & Space",
  "govtech": "GovTech, Defense & Space",
  "government": "GovTech, Defense & Space",
  "military": "GovTech, Defense & Space",
  "dual-use": "GovTech, Defense & Space",

  "cybersecurity": "Cybersecurity & Privacy",
  "security": "Cybersecurity & Privacy",
  "privacy": "Cybersecurity & Privacy",
  "identity": "Cybersecurity & Privacy",

  "martech": "Marketing, Sales & Retail Infrastructure",
  "marketing": "Marketing, Sales & Retail Infrastructure",
  "adtech": "Marketing, Sales & Retail Infrastructure",
  "sales enablement": "Marketing, Sales & Retail Infrastructure",
};

// Business model normalization: AI might return "SaaS" → we need "B2B SaaS"
const BIZ_MODEL_ALIASES: Record<string, string> = {
  ...Object.fromEntries(BUSINESS_MODEL_OPTIONS.map(o => [o.label.toLowerCase(), o.label])),
  "saas": "B2B SaaS",
  "b2b saas": "B2B SaaS",
  "subscription": "B2B SaaS",
  "platform": "Marketplace",
  "two-sided": "Marketplace",
  "d2c": "E-Commerce",
  "dtc": "E-Commerce",
  "online retail": "E-Commerce",
  "device": "Hardware",
  "iot": "Hardware",
  "consulting": "Services",
  "agency": "Services",
  "managed services": "Services",
  "free tier": "Freemium",
  "consumption": "Usage-Based",
  "metered": "Usage-Based",
  "pay per use": "Usage-Based",
  "license": "Licensing",
  "perpetual": "Licensing",
  "ads": "Advertising",
  "ad-supported": "Advertising",
  "commission": "Transaction Fee",
  "take rate": "Transaction Fee",
};

// Target customer normalization
const TARGET_ALIASES: Record<string, string> = {
  ...Object.fromEntries(TARGET_CUSTOMER_OPTIONS.map(o => [o.label.toLowerCase(), o.label])),
  "business to business": "B2B",
  "business": "B2B",
  "consumer": "B2C",
  "direct to consumer": "B2C",
  "small business": "SMB",
  "medium business": "SMB",
  "sme": "SMB",
  "large enterprise": "Enterprise",
  "fortune 500": "Enterprise",
  "corporate": "Enterprise",
  "federal": "Government",
  "public sector": "Government",
  "gov": "Government",
  "b2g": "Government",
  "power user": "Prosumer",
  "creator": "Prosumer",
  "freelancer": "Prosumer",
};

// Maps common subsector keywords to their canonical subsector + parent sector (NEW taxonomy)
const SUBSECTOR_KEYWORDS: Record<string, { sector: string; subsector: string }> = {
  "contech": { sector: "PropTech & Construction Tech", subsector: "ConTech" },
  "construction tech": { sector: "PropTech & Construction Tech", subsector: "ConTech" },
  "proptech": { sector: "PropTech & Construction Tech", subsector: "PropTech" },
  "property tech": { sector: "PropTech & Construction Tech", subsector: "PropTech" },
  "bim": { sector: "PropTech & Construction Tech", subsector: "Digital Twins & BIM" },
  "digital twin": { sector: "PropTech & Construction Tech", subsector: "Digital Twins & BIM" },
  "sustainable materials": { sector: "PropTech & Construction Tech", subsector: "Sustainable Materials" },

  "industry 4.0": { sector: "IndustrialTech, Manufacturing & Robotics", subsector: "Industrial IoT" },
  "robotics": { sector: "IndustrialTech, Manufacturing & Robotics", subsector: "Robotics & Automation" },
  "automation": { sector: "IndustrialTech, Manufacturing & Robotics", subsector: "Robotics & Automation" },
  "3d printing": { sector: "IndustrialTech, Manufacturing & Robotics", subsector: "3D Printing" },

  "vertical saas": { sector: "Enterprise Software & SaaS", subsector: "Vertical SaaS" },
  "horizontal saas": { sector: "Enterprise Software & SaaS", subsector: "Horizontal SaaS" },
  "devtools": { sector: "Enterprise Software & SaaS", subsector: "DevTools & Open Source" },
  "developer tools": { sector: "Enterprise Software & SaaS", subsector: "DevTools & Open Source" },
  "hrtech": { sector: "Enterprise Software & SaaS", subsector: "HRTech" },
  "legaltech": { sector: "Enterprise Software & SaaS", subsector: "LegalTech" },

  "llm": { sector: "AI, Data & Analytics", subsector: "LLMOps & Infrastructure" },
  "ai agent": { sector: "AI, Data & Analytics", subsector: "Vertical AI Agents" },
  "computer vision": { sector: "AI, Data & Analytics", subsector: "Computer Vision" },
  "generative ai": { sector: "AI, Data & Analytics", subsector: "Generative Media" },
  "ai safety": { sector: "AI, Data & Analytics", subsector: "AI Safety & Governance" },

  "embedded finance": { sector: "Fintech", subsector: "Embedded Finance" },
  "payments": { sector: "Fintech", subsector: "Payments Infrastructure" },
  "insurtech": { sector: "Fintech", subsector: "Insurtech" },
  "regtech": { sector: "Fintech", subsector: "RegTech" },
  "wealthtech": { sector: "Fintech", subsector: "WealthTech" },

  "carbon capture": { sector: "Climate, Energy & Sustainability", subsector: "Carbon Capture" },
  "energy storage": { sector: "Climate, Energy & Sustainability", subsector: "Energy Storage" },
  "circular economy": { sector: "Climate, Energy & Sustainability", subsector: "Circular Economy" },
  "agtech": { sector: "Climate, Energy & Sustainability", subsector: "AgTech" },
  "water tech": { sector: "Climate, Energy & Sustainability", subsector: "Water Tech" },

  "digital health": { sector: "HealthTech, Biotech & Life Sciences", subsector: "Digital Health" },
  "medtech": { sector: "HealthTech, Biotech & Life Sciences", subsector: "MedTech" },
  "biopharma": { sector: "HealthTech, Biotech & Life Sciences", subsector: "Biopharma" },
  "genomics": { sector: "HealthTech, Biotech & Life Sciences", subsector: "Genomics" },
  "neurotech": { sector: "HealthTech, Biotech & Life Sciences", subsector: "Neurotech" },
  "longevity": { sector: "HealthTech, Biotech & Life Sciences", subsector: "Longevity" },

  "cybersecurity": { sector: "Cybersecurity & Privacy", subsector: "Cloud Security" },
  "zero trust": { sector: "Cybersecurity & Privacy", subsector: "Zero Trust" },

  "quantum": { sector: "GovTech, Defense & Space", subsector: "Quantum Computing" },
  "satellite": { sector: "GovTech, Defense & Space", subsector: "Space Infrastructure" },
  "drone": { sector: "GovTech, Defense & Space", subsector: "Drones & UAVs" },
  "dual-use": { sector: "GovTech, Defense & Space", subsector: "Dual-Use Tech" },
};

export interface NormalizationResult {
  sector: string;
  subsectors: string[];
  rawInput: string;
  confidence: "exact" | "alias" | "fuzzy" | "keyword";
}

/**
 * Normalizes a raw sector string from AI to a canonical taxonomy sector.
 * Targets the NEW taxonomy labels from SECTOR_OPTIONS.
 */
export function normalizeSector(
  rawSector: string | undefined | null,
  rawSubTag?: string | undefined | null,
  keywords?: string[] | undefined | null
): NormalizationResult {
  const result: NormalizationResult = {
    sector: "",
    subsectors: [],
    rawInput: rawSector || "",
    confidence: "fuzzy",
  };

  if (!rawSector) {
    console.log("[AI Extraction] Raw: (empty) | Mapped to: (none)");
    return result;
  }

  const raw = rawSector.trim();
  const rawLower = raw.toLowerCase();

  // 1. Exact match against new taxonomy labels
  const exactMatch = NEW_SECTOR_LABELS.find(s => s.toLowerCase() === rawLower);
  if (exactMatch) {
    result.sector = exactMatch;
    result.confidence = "exact";
  }

  // 1b. Exact match against old taxonomy → bridge to new
  if (!result.sector) {
    const oldMatch = sectors.find(s => s.toLowerCase() === rawLower);
    if (oldMatch && OLD_TO_NEW_SECTOR[oldMatch]) {
      result.sector = OLD_TO_NEW_SECTOR[oldMatch];
      result.confidence = "exact";
    }
  }

  // 2. Alias lookup
  if (!result.sector) {
    const alias = SECTOR_ALIASES[rawLower];
    if (alias) {
      result.sector = alias;
      result.confidence = "alias";
    }
  }

  // 3. Fuzzy: check if raw contains any new taxonomy label or vice versa
  if (!result.sector) {
    for (const s of NEW_SECTOR_LABELS) {
      if (rawLower.includes(s.toLowerCase()) || s.toLowerCase().includes(rawLower)) {
        result.sector = s;
        result.confidence = "fuzzy";
        break;
      }
    }
  }

  // 4. Keyword extraction: scan the raw string for subsector keywords
  if (!result.sector) {
    for (const [kw, mapping] of Object.entries(SUBSECTOR_KEYWORDS)) {
      if (rawLower.includes(kw)) {
        result.sector = mapping.sector;
        result.confidence = "keyword";
        if (!result.subsectors.includes(mapping.subsector)) {
          result.subsectors.push(mapping.subsector);
        }
        break;
      }
    }
  }

  // 5. Word-level alias fallback
  if (!result.sector) {
    const words = rawLower.split(/[\s,&/+\-]+/).filter(Boolean);
    for (const word of words) {
      const alias = SECTOR_ALIASES[word];
      if (alias) {
        result.sector = alias;
        result.confidence = "fuzzy";
        break;
      }
    }
  }

  // 6. Substring overlap fallback
  if (!result.sector) {
    let bestScore = 0;
    let bestSector = NEW_SECTOR_LABELS[0];
    for (const s of NEW_SECTOR_LABELS) {
      const sLower = s.toLowerCase();
      const words = rawLower.split(/\s+/);
      let score = 0;
      for (const w of words) {
        if (sLower.includes(w) && w.length > 2) score += w.length;
      }
      if (score > bestScore) {
        bestScore = score;
        bestSector = s;
      }
    }
    if (bestScore > 0) {
      result.sector = bestSector;
      result.confidence = "fuzzy";
    }
  }

  // Resolve subsectors from subTag
  if (rawSubTag && result.sector) {
    const subTagLower = rawSubTag.toLowerCase().trim();
    const subs = subsectorsFor(result.sector);
    const exactSub = subs.find(s => s.toLowerCase() === subTagLower);
    if (exactSub && !result.subsectors.includes(exactSub)) {
      result.subsectors.push(exactSub);
    } else {
      const fuzzySub = subs.find(s => s.toLowerCase().includes(subTagLower) || subTagLower.includes(s.toLowerCase()));
      if (fuzzySub && !result.subsectors.includes(fuzzySub)) {
        result.subsectors.push(fuzzySub);
      }
    }
    const kwMatch = SUBSECTOR_KEYWORDS[subTagLower];
    if (kwMatch && !result.subsectors.includes(kwMatch.subsector)) {
      result.subsectors.push(kwMatch.subsector);
    }
  }

  // Extract subsectors from keywords array
  if (keywords?.length) {
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase().trim();
      const kwMatch = SUBSECTOR_KEYWORDS[kwLower];
      if (kwMatch && !result.subsectors.includes(kwMatch.subsector)) {
        result.subsectors.push(kwMatch.subsector);
      }
    }
  }

  result.subsectors = result.subsectors.slice(0, 3);

  console.log(`[AI Extraction] Raw: "${raw}" | Mapped to: "${result.sector}" (${result.confidence}) | Subsectors: [${result.subsectors.join(", ")}]`);

  return result;
}

/**
 * Normalize a business model string from AI output to canonical label.
 */
export function normalizeBusinessModel(raw: string): string | null {
  if (!raw) return null;
  const rawLower = raw.toLowerCase().trim();
  const alias = BIZ_MODEL_ALIASES[rawLower];
  if (alias) return alias;
  // Fuzzy: check if any label contains the raw or vice versa
  for (const opt of BUSINESS_MODEL_OPTIONS) {
    if (opt.label.toLowerCase().includes(rawLower) || rawLower.includes(opt.label.toLowerCase())) {
      return opt.label;
    }
  }
  return null;
}

/**
 * Normalize a target customer string from AI output to canonical label.
 */
export function normalizeTargetCustomer(raw: string): string | null {
  if (!raw) return null;
  const rawLower = raw.toLowerCase().trim();
  const alias = TARGET_ALIASES[rawLower];
  if (alias) return alias;
  for (const opt of TARGET_CUSTOMER_OPTIONS) {
    if (opt.label.toLowerCase().includes(rawLower) || rawLower.includes(opt.label.toLowerCase())) {
      return opt.label;
    }
  }
  return null;
}

/**
 * Bridge: convert an old taxonomy sector name to the new taxonomy label.
 */
export function bridgeOldSector(oldSector: string): string {
  if (!oldSector) return oldSector;
  // Already a new label?
  if (NEW_SECTOR_LABELS.includes(oldSector)) return oldSector;
  // Check bridge map
  const bridged = OLD_TO_NEW_SECTOR[oldSector];
  if (bridged) return bridged;
  // Try alias
  const alias = SECTOR_ALIASES[oldSector.toLowerCase()];
  if (alias) return alias;
  return oldSector;
}

/**
 * Normalize a subsector string from AI to match canonical subsector names.
 */
export function normalizeSubsector(raw: string, parentSector?: string): string | null {
  if (!raw) return null;
  const rawLower = raw.toLowerCase().trim();

  if (parentSector) {
    const subs = subsectorsFor(parentSector);
    const exact = subs.find(s => s.toLowerCase() === rawLower);
    if (exact) return exact;
    const fuzzy = subs.find(s => s.toLowerCase().includes(rawLower) || rawLower.includes(s.toLowerCase()));
    if (fuzzy) return fuzzy;
  }

  const kwMatch = SUBSECTOR_KEYWORDS[rawLower];
  if (kwMatch) return kwMatch.subsector;

  for (const s of [...NEW_SECTOR_LABELS, ...sectors]) {
    const subs = subsectorsFor(s);
    const match = subs.find(sub => sub.toLowerCase() === rawLower || sub.toLowerCase().includes(rawLower));
    if (match) return match;
  }

  return null;
}
