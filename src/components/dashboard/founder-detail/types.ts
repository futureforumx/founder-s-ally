export interface FounderEntry {
  name: string;
  sector: string;
  stage: string;
  description: string;
  location: string;
  model: string;
  initial: string;
  matchReason: string | null;
  companyName?: string;
  companyWebsite?: string;
}

export const TABS = ["Overview", "Market Insights", "Connections", "Investors"] as const;
export type Tab = typeof TABS[number];
