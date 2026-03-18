import { CompetitiveBenchmarking } from "@/components/CompetitiveBenchmarking";
import { Target } from "lucide-react";
import type { CompanyData, AnalysisResult } from "@/components/company-profile/types";

interface Props {
  companyData: CompanyData | null;
  analysisResult: AnalysisResult | null;
  onNavigateProfile: () => void;
}

export function CompetitiveView({ companyData, analysisResult, onNavigateProfile }: Props) {
  const hasData = !!analysisResult;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-4">
          <Target className="h-6 w-6 text-accent" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Competitive Insights Locked</h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-4">
          Run an analysis on your company profile to unlock competitive benchmarking, scorecard, and competitor mapping.
        </p>
        <button
          onClick={onNavigateProfile}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
        >
          Run Analysis to Unlock Competitive Insights
        </button>
      </div>
    );
  }

  return (
    <CompetitiveBenchmarking
      metricTable={analysisResult?.metricTable}
      companyData={companyData}
      analysisResult={analysisResult}
      onScrollToProfile={onNavigateProfile}
    />
  );
}
