export interface OnboardingState {
  step: number;
  // Step 1: Identity
  userType: string;
  firstName: string;
  lastName: string;
  email: string;
  linkedinUrl: string;
  twitterUrl: string;
  substackUrl: string;
  tiktokUrl: string;
  fullName: string;
  title: string;
  bio: string;
  avatarUrl: string;
  location: string;
  // Step 3: Company DNA
  companyName: string;
  existingCompanyId: string; // set when user selects an existing (in-network) company to join
  websiteUrl: string;
  companyLogoUrl: string;
  deckText: string;
  deckFileName: string;
  deckFileUrl: string;
  role: string;
  stage: string;
  sectors: string[];
  revenueBand: string;
  cofounderCount: string;
  superpowers: string[];
  currentlyRaising: boolean;
  targetRaise: string;
  roundType: string;
  targetCloseDate: string;
  // Step 4: Connections
  connectedIntegrations: string[];
  // Step 5: Investor materials
  recurringRevenuePeriod: "mrr" | "arr";
  recurringRevenue: string;
  burnRate: string;
  cac: string;
  ltv: string;
  headcount: string;
  // Saved privacy defaults
  aiInboxPaths: boolean;
  shareAnonMetrics: boolean;
  discoverableToInvestors: boolean;
  useMeetingNotes: boolean;
}

export const defaultOnboardingState: OnboardingState = {
  step: 1,
  userType: "",
  firstName: "",
  lastName: "",
  email: "",
  linkedinUrl: "",
  twitterUrl: "",
  substackUrl: "",
  tiktokUrl: "",
  fullName: "",
  title: "",
  bio: "",
  avatarUrl: "",
  location: "",
  companyName: "",
  existingCompanyId: "",
  websiteUrl: "",
  companyLogoUrl: "",
  deckText: "",
  deckFileName: "",
  deckFileUrl: "",
  role: "",
  stage: "",
  sectors: [],
  revenueBand: "",
  cofounderCount: "",
  superpowers: [],
  currentlyRaising: false,
  targetRaise: "",
  roundType: "",
  targetCloseDate: "",
  connectedIntegrations: [],
  recurringRevenuePeriod: "mrr",
  recurringRevenue: "",
  burnRate: "",
  cac: "",
  ltv: "",
  headcount: "",
  aiInboxPaths: false,
  shareAnonMetrics: false,
  discoverableToInvestors: false,
  useMeetingNotes: false,
};

export const STAGES = ["MVP", "Accelerator", "Pre-Seed", "Seed", "Series A", "Series B +"];
export const REVENUE_BANDS = ["Pre-revenue", "<$10K MRR", "$10–50K", "$50–100K", "$100K+"];
export const COFOUNDER_OPTIONS = ["Solo", "2", "3", "4+"];
export const SUPERPOWERS = ["GTM", "Technical", "Fundraising", "Design", "Sales", "Operations", "Finance", "Community"];
export const TARGET_RAISES = ["$100K", "$250K", "$500K", "$1M", "$2M", "$5M+"];
export const ROUND_TYPES = ["SAFE", "Pre-Seed", "Seed", "Bridge", "Series A"];

export const SECTOR_OPTIONS = [
  "SaaS", "FinTech", "HealthTech", "EdTech", "CleanTech", "AI/ML",
  "E-Commerce", "Marketplace", "DevTools", "Cybersecurity", "PropTech",
  "FoodTech", "BioTech", "Logistics", "Media", "Gaming",
];
