export const stages = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+"];
export const sectors = [
  "SaaS / B2B Software", "Fintech", "Health Tech", "Consumer / D2C",
  "AI / ML", "Climate Tech", "Marketplace", "Developer Tools", "Edtech", "Other",
];
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
