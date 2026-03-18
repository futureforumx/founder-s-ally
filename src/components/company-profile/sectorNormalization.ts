import { SECTOR_TAXONOMY, sectors, subsectorsFor } from "./types";

/**
 * Normalize a raw AI-extracted sector string to a canonical sector from our taxonomy.
 * Uses fuzzy matching, keyword extraction, and synonym mapping.
 */

const SECTOR_ALIASES: Record<string, string> = {
  // Exact canonical names (lowercase)
  "construction & real estate": "Construction & Real Estate",
  "industrial & manufacturing": "Industrial & Manufacturing",
  "enterprise software & saas": "Enterprise Software & SaaS",
  "artificial intelligence": "Artificial Intelligence",
  "fintech": "Fintech",
  "climate & energy": "Climate & Energy",
  "health & biotech": "Health & Biotech",
  "consumer & retail": "Consumer & Retail",
  "deep tech & space": "Deep Tech & Space",
  "defense & govtech": "Defense & GovTech",

  // Common AI output variations
  "enterprise software": "Enterprise Software & SaaS",
  "saas": "Enterprise Software & SaaS",
  "b2b software": "Enterprise Software & SaaS",
  "software": "Enterprise Software & SaaS",
  "saas / b2b software": "Enterprise Software & SaaS",

  "ai": "Artificial Intelligence",
  "ai / ml": "Artificial Intelligence",
  "machine learning": "Artificial Intelligence",

  "health tech": "Health & Biotech",
  "healthtech": "Health & Biotech",
  "biotech": "Health & Biotech",
  "healthcare": "Health & Biotech",
  "digital health": "Health & Biotech",
  "medtech": "Health & Biotech",

  "climate tech": "Climate & Energy",
  "cleantech": "Climate & Energy",
  "clean tech": "Climate & Energy",
  "energy": "Climate & Energy",
  "agtech": "Climate & Energy",
  "agriculture": "Climate & Energy",

  "construction": "Construction & Real Estate",
  "real estate": "Construction & Real Estate",
  "contech": "Construction & Real Estate",
  "proptech": "Construction & Real Estate",
  "building": "Construction & Real Estate",
  "building software": "Construction & Real Estate",

  "manufacturing": "Industrial & Manufacturing",
  "industrial": "Industrial & Manufacturing",
  "robotics": "Industrial & Manufacturing",
  "supply chain": "Industrial & Manufacturing",
  "logistics": "Industrial & Manufacturing",

  "financial technology": "Fintech",
  "financial services": "Fintech",
  "payments": "Fintech",
  "crypto": "Fintech",
  "blockchain": "Fintech",
  "web3": "Fintech",
  "defi": "Fintech",
  "insurtech": "Fintech",

  "consumer": "Consumer & Retail",
  "retail": "Consumer & Retail",
  "ecommerce": "Consumer & Retail",
  "e-commerce": "Consumer & Retail",
  "d2c": "Consumer & Retail",
  "edtech": "Consumer & Retail",
  "gaming": "Consumer & Retail",

  "deep tech": "Deep Tech & Space",
  "space": "Deep Tech & Space",
  "quantum": "Deep Tech & Space",
  "semiconductors": "Deep Tech & Space",

  "defense": "Defense & GovTech",
  "govtech": "Defense & GovTech",
  "government": "Defense & GovTech",
  "military": "Defense & GovTech",
  "dual-use": "Defense & GovTech",
};

// Maps common subsector keywords to their canonical subsector + parent sector
const SUBSECTOR_KEYWORDS: Record<string, { sector: string; subsector: string }> = {
  "contech": { sector: "Construction & Real Estate", subsector: "ConTech (Construction Tech)" },
  "construction tech": { sector: "Construction & Real Estate", subsector: "ConTech (Construction Tech)" },
  "proptech": { sector: "Construction & Real Estate", subsector: "PropTech" },
  "property tech": { sector: "Construction & Real Estate", subsector: "PropTech" },
  "bim": { sector: "Construction & Real Estate", subsector: "Digital Twins & BIM" },
  "digital twin": { sector: "Construction & Real Estate", subsector: "Digital Twins & BIM" },
  "sustainable materials": { sector: "Construction & Real Estate", subsector: "Sustainable Materials" },

  "industry 4.0": { sector: "Industrial & Manufacturing", subsector: "Industrial Tech (Industry 4.0)" },
  "robotics": { sector: "Industrial & Manufacturing", subsector: "Robotics & Automation" },
  "automation": { sector: "Industrial & Manufacturing", subsector: "Robotics & Automation" },
  "supply chain": { sector: "Industrial & Manufacturing", subsector: "Supply Chain Tech" },
  "warehousing": { sector: "Industrial & Manufacturing", subsector: "Warehousing Tech" },
  "3d printing": { sector: "Industrial & Manufacturing", subsector: "3D Printing" },

  "vertical saas": { sector: "Enterprise Software & SaaS", subsector: "Vertical SaaS" },
  "horizontal saas": { sector: "Enterprise Software & SaaS", subsector: "Horizontal SaaS" },
  "cybersecurity": { sector: "Enterprise Software & SaaS", subsector: "Cybersecurity" },
  "devtools": { sector: "Enterprise Software & SaaS", subsector: "DevTools & Open Source" },
  "developer tools": { sector: "Enterprise Software & SaaS", subsector: "DevTools & Open Source" },
  "hrtech": { sector: "Enterprise Software & SaaS", subsector: "HRTech" },
  "martech": { sector: "Enterprise Software & SaaS", subsector: "MarTech" },
  "legaltech": { sector: "Enterprise Software & SaaS", subsector: "LegalTech" },

  "llm": { sector: "Artificial Intelligence", subsector: "LLMOps & Infrastructure" },
  "ai agent": { sector: "Artificial Intelligence", subsector: "Vertical AI Agents" },
  "computer vision": { sector: "Artificial Intelligence", subsector: "Computer Vision" },
  "generative ai": { sector: "Artificial Intelligence", subsector: "Generative Media" },
  "ai safety": { sector: "Artificial Intelligence", subsector: "AI Safety & Governance" },
  "edge ai": { sector: "Artificial Intelligence", subsector: "Edge AI" },

  "embedded finance": { sector: "Fintech", subsector: "Embedded Finance" },
  "payments": { sector: "Fintech", subsector: "Payments Infrastructure" },
  "insurtech": { sector: "Fintech", subsector: "Insurtech" },
  "rwa": { sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" },
  "tokenization": { sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" },
  "regtech": { sector: "Fintech", subsector: "RegTech" },
  "wealthtech": { sector: "Fintech", subsector: "WealthTech" },

  "carbon capture": { sector: "Climate & Energy", subsector: "Carbon Capture" },
  "energy storage": { sector: "Climate & Energy", subsector: "Energy Storage" },
  "circular economy": { sector: "Climate & Energy", subsector: "Circular Economy" },
  "grid": { sector: "Climate & Energy", subsector: "Grid Optimization" },
  "agtech": { sector: "Climate & Energy", subsector: "AgTech" },
  "water tech": { sector: "Climate & Energy", subsector: "Water Tech" },

  "digital health": { sector: "Health & Biotech", subsector: "Digital Health" },
  "medtech": { sector: "Health & Biotech", subsector: "MedTech" },
  "biopharma": { sector: "Health & Biotech", subsector: "Biopharma" },
  "genomics": { sector: "Health & Biotech", subsector: "Genomics" },
  "neurotech": { sector: "Health & Biotech", subsector: "Neurotech" },
  "longevity": { sector: "Health & Biotech", subsector: "Longevity" },

  "ecommerce": { sector: "Consumer & Retail", subsector: "E-commerce Infrastructure" },
  "gaming": { sector: "Consumer & Retail", subsector: "Gaming & Interactive" },
  "edtech": { sector: "Consumer & Retail", subsector: "EdTech" },
  "social commerce": { sector: "Consumer & Retail", subsector: "Social Commerce" },
  "adtech": { sector: "Consumer & Retail", subsector: "AdTech" },

  "quantum": { sector: "Deep Tech & Space", subsector: "Quantum Computing" },
  "satellite": { sector: "Deep Tech & Space", subsector: "Satcom" },
  "space infrastructure": { sector: "Deep Tech & Space", subsector: "Space Infrastructure" },
  "photonics": { sector: "Deep Tech & Space", subsector: "Photonics" },
  "semiconductor": { sector: "Deep Tech & Space", subsector: "Semiconductors" },

  "dual-use": { sector: "Defense & GovTech", subsector: "Dual-Use Tech" },
  "public safety": { sector: "Defense & GovTech", subsector: "Public Safety" },
  "drone": { sector: "Defense & GovTech", subsector: "Drones & UAVs" },
  "national security": { sector: "Defense & GovTech", subsector: "National Security" },
};

export interface NormalizationResult {
  sector: string;
  subsectors: string[];
  rawInput: string;
  confidence: "exact" | "alias" | "fuzzy" | "keyword";
}

/**
 * Normalizes a raw sector string from AI to a canonical taxonomy sector.
 * Also attempts to extract subsectors from the raw string and sectorMapping data.
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

  // 1. Exact match against canonical names
  const exactMatch = sectors.find(s => s.toLowerCase() === rawLower);
  if (exactMatch) {
    result.sector = exactMatch;
    result.confidence = "exact";
  }

  // 2. Alias lookup
  if (!result.sector) {
    const alias = SECTOR_ALIASES[rawLower];
    if (alias) {
      result.sector = alias;
      result.confidence = "alias";
    }
  }

  // 3. Fuzzy: check if raw contains any canonical sector name or vice versa
  if (!result.sector) {
    for (const s of sectors) {
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

  // 5. Word-level alias fallback — split raw into words and check each
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

  // If still nothing, pick closest match via substring overlap
  if (!result.sector) {
    let bestScore = 0;
    let bestSector = sectors[0];
    for (const s of sectors) {
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
  if (rawSubTag) {
    const subTagLower = rawSubTag.toLowerCase().trim();
    // Check if it exactly matches any subsector in the resolved sector
    if (result.sector) {
      const subs = subsectorsFor(result.sector);
      const exactSub = subs.find(s => s.toLowerCase() === subTagLower);
      if (exactSub && !result.subsectors.includes(exactSub)) {
        result.subsectors.push(exactSub);
      } else {
        // Fuzzy match within the sector's subsectors
        const fuzzySub = subs.find(s => s.toLowerCase().includes(subTagLower) || subTagLower.includes(s.toLowerCase()));
        if (fuzzySub && !result.subsectors.includes(fuzzySub)) {
          result.subsectors.push(fuzzySub);
        }
      }
    }
    // Also check global keyword map
    const kwMatch = SUBSECTOR_KEYWORDS[subTagLower];
    if (kwMatch && !result.subsectors.includes(kwMatch.subsector)) {
      result.subsectors.push(kwMatch.subsector);
    }
  }

  // Extract subsectors from keywords array too
  if (keywords?.length) {
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase().trim();
      const kwMatch = SUBSECTOR_KEYWORDS[kwLower];
      if (kwMatch && !result.subsectors.includes(kwMatch.subsector)) {
        result.subsectors.push(kwMatch.subsector);
      }
    }
  }

  // Cap at 3 subsectors
  result.subsectors = result.subsectors.slice(0, 3);

  console.log(`[AI Extraction] Raw: "${raw}" | Mapped to: "${result.sector}" (${result.confidence}) | Subsectors: [${result.subsectors.join(", ")}]`);

  return result;
}

/**
 * Normalize a subsector string from AI to match canonical subsector names.
 */
export function normalizeSubsector(raw: string, parentSector?: string): string | null {
  if (!raw) return null;
  const rawLower = raw.toLowerCase().trim();

  // Check within parent sector first
  if (parentSector) {
    const subs = subsectorsFor(parentSector);
    const exact = subs.find(s => s.toLowerCase() === rawLower);
    if (exact) return exact;
    const fuzzy = subs.find(s => s.toLowerCase().includes(rawLower) || rawLower.includes(s.toLowerCase()));
    if (fuzzy) return fuzzy;
  }

  // Check global keyword map
  const kwMatch = SUBSECTOR_KEYWORDS[rawLower];
  if (kwMatch) return kwMatch.subsector;

  // Check all sectors
  for (const s of sectors) {
    const subs = subsectorsFor(s);
    const match = subs.find(sub => sub.toLowerCase() === rawLower || sub.toLowerCase().includes(rawLower));
    if (match) return match;
  }

  return null;
}
