export type FirmFocusSourceType =
  | "official_site"
  | "official_blog"
  | "techcrunch"
  | "press_release"
  | "other";

export interface UnderrepresentedFoundersFocus {
  value: boolean | null;
  label: string | null;
  rationale: string | null;
}

export interface FirmFocusEvidence {
  field: string;
  value: unknown;
  source_type: FirmFocusSourceType;
  source_url: string;
  source_title: string | null;
  quote_or_snippet: string;
  confidence: number;
}

export interface FirmFocusExtraction {
  firm_name: string;
  website: string | null;
  stage_focus: string[];
  sector_focus: string[];
  themes: string[];
  geo_focus: string[];
  latest_fund_name: string | null;
  latest_fund_size_usd: number | null;
  latest_fund_announcement_date: string | null;
  underrepresented_founders_focus: UnderrepresentedFoundersFocus;
  evidence: FirmFocusEvidence[];
  extraction_confidence: number;
  extraction_notes: string[];
}

export interface FirmFocusFirmRow {
  id: string;
  firm_name: string;
  website_url: string | null;
  blog_url: string | null;
  firm_blog_url: string | null;
  stage_focus: string[] | null;
  sector_focus: string[] | null;
  investment_themes: string[] | null;
  geo_focus: string[] | null;
  latest_fund_name: string | null;
  latest_fund_size_usd: number | null;
  latest_fund_announcement_date: string | null;
  last_fund_announcement_date: string | null;
  underrepresented_founders_focus: boolean | null;
  evidence_urls: string[] | null;
  extraction_confidence: number | null;
  intel_confidence_score: number | null;
  last_verified_at: string | null;
  manual_review_status: string | null;
}

export interface FirmFocusRunStats {
  processed: number;
  updated: number;
  reviewed: number;
  failed: number;
  skipped: number;
}

export interface FirmFocusReportRow {
  firm_name: string;
  missing_fields_before: string[];
  fields_filled: string[];
  extraction_confidence: number;
  latest_fund_name: string | null;
  latest_fund_size_usd: number | null;
  evidence_count: number;
  needs_manual_review: boolean;
}
