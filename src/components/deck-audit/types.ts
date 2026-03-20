export interface AuditMetadata {
  analyzed_at: string;
  target_investor: string;
  benchmark_cohort: string;
}

export interface DimensionScore {
  score: number;
  rationale: string[];
}

export interface MultiAxisScores {
  readiness_score: number;
  dimensions: {
    story_and_flow: DimensionScore;
    clarity_and_density: DimensionScore;
    market_and_financials: DimensionScore;
    team_credibility: DimensionScore;
    design_and_scannability: DimensionScore;
  };
}

export interface BenchmarkInsights {
  percentile: number;
  key_takeaway: string;
}

export interface SlideFeedback {
  concrete_edits: string[];
  missing_elements: string[];
  investor_objections: string[];
}

export interface SlideAnalysis {
  slide_number: number;
  detected_intent: string;
  predicted_dropoff_risk: number;
  feedback: SlideFeedback;
}

export interface VersionDelta {
  compared_to_version_id: string;
  improvements: string[];
  regressions: string[];
}

export interface AuditResult {
  audit_id: string;
  deck_version_id: string;
  metadata: AuditMetadata;
  multi_axis_scores: MultiAxisScores;
  benchmark_insights: BenchmarkInsights;
  slide_analysis: SlideAnalysis[];
  version_delta: VersionDelta;
}

/** Maps dimension keys to display labels */
export const DIMENSION_LABELS: Record<keyof MultiAxisScores["dimensions"], string> = {
  story_and_flow: "Story & Flow",
  clarity_and_density: "Clarity & Density",
  market_and_financials: "Market & Financials",
  team_credibility: "Team Credibility",
  design_and_scannability: "Design & Scannability",
};
