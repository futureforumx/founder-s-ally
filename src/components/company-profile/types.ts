export const stages = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+"];

export const SECTOR_TAXONOMY = {
  "Construction & Real Estate": ["ConTech (Construction Tech)", "PropTech", "Sustainable Materials", "Infrastructure & Civil Engineering", "Digital Twins & BIM", "Residential Construction"],
  "Industrial & Manufacturing": ["Industrial Tech (Industry 4.0)", "Robotics & Automation", "Supply Chain Tech", "Warehousing Tech", "Advanced Manufacturing", "3D Printing"],
  "Enterprise Software & SaaS": ["Vertical SaaS", "Horizontal SaaS", "DevTools & Open Source", "Cybersecurity", "HRTech", "MarTech", "LegalTech"],
  "Artificial Intelligence": ["Vertical AI Agents", "LLMOps & Infrastructure", "Computer Vision", "Generative Media", "AI Safety & Governance", "Edge AI"],
  "Fintech": ["Embedded Finance", "Payments Infrastructure", "Insurtech", "Real World Asset (RWA) Tokenization", "RegTech", "WealthTech"],
  "Climate & Energy": ["Carbon Capture", "Energy Storage", "Circular Economy", "Grid Optimization", "AgTech", "Water Tech"],
  "Health & Biotech": ["Longevity", "Digital Health", "MedTech", "Biopharma", "Genomics", "Neurotech"],
  "Consumer & Retail": ["E-commerce Infrastructure", "Gaming & Interactive", "EdTech", "Social Commerce", "AdTech"],
  "Deep Tech & Space": ["Quantum Computing", "Space Infrastructure", "Satcom", "Photonics", "Semiconductors"],
  "Defense & GovTech": ["Dual-Use Tech", "Public Safety", "Civic Engagement", "National Security", "Drones & UAVs"],
} as const;

export const sectors = Object.keys(SECTOR_TAXONOMY);
export const subsectorsFor = (sector: string): string[] =>
  (SECTOR_TAXONOMY[sector as keyof typeof SECTOR_TAXONOMY] as unknown as string[]) ?? [];
export const businessModels = ["SaaS", "Marketplace", "E-Commerce", "Hardware", "Services", "Freemium", "Usage-Based", "Other"];
export const targetCustomers = ["B2C", "B2B2C", "SMB", "Enterprise", "Government"];
export const targetMarkets = targetCustomers;

export interface CompanyData {
  name: string;
  stage: string;
  sector: string;
  subsectors: string[];
  description: string;
  website: string;
  teamSize: string;
  // Expanded fields
  businessModel: string[];
  targetCustomer: string[];
  hqLocation: string;
  competitors: string[];
  uniqueValueProp: string;
  currentARR: string;
  yoyGrowth: string;
  momGrowth: string;
  totalHeadcount: string;
  // Social & additional metrics
  socialTwitter: string;
  socialLinkedin: string;
  socialInstagram: string;
  /** Public or drive link to one-pager; shown under Company Health → Data */
  onePagerUrl: string;
  burnRate: string;
  nrr: string;
  cac: string;
  ltv: string;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface MetricWithConfidence {
  value: string | null;
  confidence: ConfidenceLevel;
}

export interface AnalysisResult {
  header: string;
  valueProposition: string;
  pricingStructure?: string;
  executiveSummary: string;
  healthScore: number;
  metrics: {
    mrr: MetricWithConfidence;
    burnRate: MetricWithConfidence;
    cac: MetricWithConfidence;
    ltv: MetricWithConfidence;
    runway: MetricWithConfidence;
  };
  metricTable: {
    metric: string;
    value: string;
    benchmark: string;
    status: "healthy" | "warning" | "critical";
    confidence: ConfidenceLevel;
  }[];
  agentData?: {
    teamSize?: string;
    lastFunding?: string;
    fundingAmount?: string;
    sources: string[];
  };
  // AI-extracted extended fields
  aiExtracted?: {
    businessModel?: string;
    targetCustomer?: string;
    hqLocation?: string;
    competitors?: string[];
    uniqueValueProp?: string;
    currentARR?: string;
    yoyGrowth?: string;
    totalHeadcount?: string;
    description?: string;
    stage?: string;
    sector?: string;
    socialTwitter?: string;
    socialLinkedin?: string;
    socialInstagram?: string;
  };
  // Source attribution for extracted metrics
  metricSources?: {
    currentARR?: string;
    yoyGrowth?: string;
    totalHeadcount?: string;
    [key: string]: string | undefined;
  };
  // Triple-source triangulation
  sourceVerification?: {
    [field: string]: {
      sources: ("deck" | "website" | "realtime")[];
      status: "verified" | "deck-only" | "predictive" | "conflict";
      conflictDetail?: string;
    };
  };
  // Semantic sector mapping
  sectorMapping?: {
    sector: string;
    subTag: string;
    keywords: string[];
  };
  // Stage classification
  stageClassification?: {
    detected_stage: string;
    confidence_score: number;
    reasoning: string;
    conflicting_signals?: string;
  };
  // AI-extracted investors from deck/web
  extractedInvestors?: {
    investorName: string;
    entityType: string;
    instrument: string;
    amount: number;
    date?: string;
    source: "deck" | "web" | "exa";
    highlight?: string;
    sourceUrl?: string;
    domain?: string;
  }[];
  totalFundingRaised?: number;
}

export const EMPTY_FORM: CompanyData = {
  name: "", stage: "", sector: "", subsectors: [], description: "", website: "", teamSize: "",
  businessModel: [], targetCustomer: [], hqLocation: "", competitors: [],
  uniqueValueProp: "", currentARR: "", yoyGrowth: "", momGrowth: "", totalHeadcount: "",
  socialTwitter: "", socialLinkedin: "", socialInstagram: "",
  onePagerUrl: "",
  burnRate: "", nrr: "", cac: "", ltv: "",
};

const COMPANY_DATA_KEYS = new Set<string>([
  "name",
  "stage",
  "sector",
  "subsectors",
  "description",
  "website",
  "teamSize",
  "businessModel",
  "targetCustomer",
  "hqLocation",
  "competitors",
  "uniqueValueProp",
  "currentARR",
  "yoyGrowth",
  "momGrowth",
  "totalHeadcount",
  "socialTwitter",
  "socialLinkedin",
  "socialInstagram",
  "onePagerUrl",
  "burnRate",
  "nrr",
  "cac",
  "ltv",
]);

/** Coerce localStorage / API shapes into CompanyData; preserves unknown keys (e.g. logo_url). */
export function sanitizeCompanyData(raw: unknown): CompanyData | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const name = String(p.name ?? "").trim();
  if (!name) return null;

  const extras: Record<string, unknown> = {};
  for (const key of Object.keys(p)) {
    if (!COMPANY_DATA_KEYS.has(key)) extras[key] = p[key];
  }

  const str = (v: unknown) => (v == null ? "" : String(v).trim());
  const strArray = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x ?? "").trim()).filter(Boolean);
  };

  return {
    ...EMPTY_FORM,
    ...extras,
    name,
    stage: str(p.stage),
    sector: str(p.sector),
    subsectors: strArray(p.subsectors),
    description: str(p.description),
    website: str(p.website),
    teamSize: str(p.teamSize),
    businessModel: strArray(p.businessModel),
    targetCustomer: strArray(p.targetCustomer),
    hqLocation: str(p.hqLocation),
    competitors: strArray(p.competitors),
    uniqueValueProp: str(p.uniqueValueProp),
    currentARR: str(p.currentARR),
    yoyGrowth: str(p.yoyGrowth),
    momGrowth: str(p.momGrowth),
    totalHeadcount: str(p.totalHeadcount),
    socialTwitter: str(p.socialTwitter),
    socialLinkedin: str(p.socialLinkedin),
    socialInstagram: str(p.socialInstagram),
    onePagerUrl: str(p.onePagerUrl),
    burnRate: str(p.burnRate),
    nrr: str(p.nrr),
    cac: str(p.cac),
    ltv: str(p.ltv),
  } as CompanyData;
}

export function getCompletionPercent(form: CompanyData): number {
  const fields: (keyof CompanyData)[] = [
    // Overview
    "name", "stage", "sector", "website", "description", "hqLocation",
    // Positioning
    "businessModel", "targetCustomer", "uniqueValueProp",
    // Metrics — Financials
    "currentARR", "momGrowth", "burnRate",
    // Metrics — Unit Economics
    "cac", "ltv",
    // Metrics — Health & Ops
    "nrr", "totalHeadcount",
    // Social Links
    "socialTwitter", "socialLinkedin", "socialInstagram",
  ];
  const filled = fields.filter(k => {
    const v = form[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
  return Math.round((filled.length / fields.length) * 100);
}
