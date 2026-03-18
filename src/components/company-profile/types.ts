export const stages = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+"];

export const SECTOR_TAXONOMY = {
  "Artificial Intelligence": ["Vertical AI (SaaS)", "AI Infrastructure & LLMOps", "Autonomous Agents", "Computer Vision", "Natural Language Processing", "Generative Media"],
  "Fintech": ["Payments & Infrastructure", "Neobanking", "DeFi & Web3 Finance", "Insurtech", "RegTech & Compliance", "Embedded Finance"],
  "Climate & Energy": ["Carbon Capture & Storage", "Renewable Energy (Solar/Wind/Fusion)", "Battery Tech & Storage", "Circular Economy", "AgTech & Food Science", "Water Tech"],
  "Health & Biotech": ["Longevity & Anti-Aging", "Digital Health & Telemedicine", "Biopharmaceuticals", "Medical Devices", "Genomics", "Mental Health Tech"],
  "Enterprise Software": ["Cybersecurity", "DevTools & Open Source", "HRTech & Future of Work", "MarTech", "Supply Chain & Logistics", "ERP & CRM"],
  "Deep Tech & Space": ["Quantum Computing", "Space Infrastructure", "Satellite Communications", "Advanced Materials", "Semiconductors", "Photonics"],
  "Consumer & Retail": ["E-commerce & D2C", "Gaming & Esport", "EdTech", "PropTech", "Social Media & Creators", "AR/VR Platforms"],
} as const;

export const sectors = Object.keys(SECTOR_TAXONOMY);
export const subsectorsFor = (sector: string): string[] =>
  (SECTOR_TAXONOMY[sector as keyof typeof SECTOR_TAXONOMY] as unknown as string[]) ?? [];
export const businessModels = ["SaaS", "Marketplace", "E-Commerce", "Hardware", "Services", "Freemium", "Usage-Based", "Other"];
export const targetCustomers = ["B2B", "B2C", "B2B2C", "B2G"];

export interface CompanyData {
  name: string;
  stage: string;
  sector: string;
  description: string;
  website: string;
  teamSize: string;
  // New expanded fields
  businessModel: string;
  targetCustomer: string;
  hqLocation: string;
  competitors: string[];
  uniqueValueProp: string;
  currentARR: string;
  yoyGrowth: string;
  totalHeadcount: string;
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
}

export const EMPTY_FORM: CompanyData = {
  name: "", stage: "", sector: "", description: "", website: "", teamSize: "",
  businessModel: "", targetCustomer: "", hqLocation: "", competitors: [],
  uniqueValueProp: "", currentARR: "", yoyGrowth: "", totalHeadcount: "",
};

export function getCompletionPercent(form: CompanyData): number {
  const fields: (keyof CompanyData)[] = [
    "name", "stage", "sector", "website", "description",
    "businessModel", "targetCustomer", "hqLocation",
    "uniqueValueProp", "currentARR", "totalHeadcount",
  ];
  const filled = fields.filter(k => {
    const v = form[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
  return Math.round((filled.length / fields.length) * 100);
}
