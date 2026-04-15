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
  competitors?: string[];
  /** Directory row: company / org site (favicon + header link). */
  _websiteUrl?: string | null;
  _linkedinUrl?: string | null;
  _twitterUrl?: string | null;
  /** When set (network directory), drives org-name line for company cards. */
  category?: "founder" | "investor" | "company" | "operator";
}

export const TABS = ["Overview", "Market Insights", "Connections", "Investors", "Jobs"] as const;
export type Tab = typeof TABS[number];
