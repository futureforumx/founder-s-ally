export interface InvestorEntry {
  name: string;
  sector: string;
  stage: string;
  description: string;
  location: string;
  model: string; // check size range
  initial: string;
  matchReason: string | null;
  category: "investor";
}

export const INVESTOR_TABS = ["Overview", "Investment Thesis", "Portfolio", "Partners"] as const;
export type InvestorTab = typeof INVESTOR_TABS[number];
