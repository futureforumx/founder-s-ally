export type ToolCategory = "AI Agents" | "AI Models" | "AI Skills" | "Startup Tools";

export type ToolSkillLevel = "No-code" | "Low-code" | "Technical" | "Mixed" | "Unknown";

export type ToolAutonomy = "Low" | "Medium" | "High" | "Very High" | "N/A";

export interface Tool {
  name: string;
  slug: string;
  category: ToolCategory;
  subcategory: string;
  type: string;
  shortDescription: string;
  description: string;
  websiteUrl: string | null;
  pricing: string;
  freeTier: boolean | null;
  openSource: boolean | null;
  skillLevel: ToolSkillLevel;
  autonomy?: ToolAutonomy;
  popularity: number | null;
  userRating: number | null;
  mobileApp: boolean | null;
  bestFor: string[];
  useCases: string[];
  pros: string[];
  cons: string[];
  alternatives: string[];
  tags: string[];
  featured: boolean;
  trending: boolean;
}

export interface ToolFilterState {
  search: string;
  category: ToolCategory | "All";
  subcategory: string;
  pricing: string;
  freeTier: "all" | "yes" | "no" | "unknown";
  skillLevel: ToolSkillLevel | "All";
  useCase: string;
  openSource: "all" | "yes" | "no" | "unknown";
  mobileApp: "all" | "yes" | "no" | "unknown";
}

export interface ToolFaqItem {
  question: string;
  answer: string;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}
