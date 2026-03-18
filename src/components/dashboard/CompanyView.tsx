import { HealthDashboard } from "@/components/HealthDashboard";
import { Sparkles } from "lucide-react";
import type { CompanyData, AnalysisResult } from "@/components/company-profile/types";

interface Props {
  companyData: CompanyData | null;
  analysisResult: AnalysisResult | null;
  onMetricEdit: (key: string, value: string) => void;
  onNavigateProfile: () => void;
}

export function CompanyView({ companyData, analysisResult, onMetricEdit, onNavigateProfile }: Props) {
  const profileComplete = !!companyData && !!analysisResult;

  if (!profileComplete) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-4">
          <Sparkles className="h-6 w-6 text-accent" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Complete your Company Profile</h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-4">
          Add your company details and run an analysis to see health metrics, key scores, and executive summary.
        </p>
        <button
          onClick={onNavigateProfile}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
        >
          Go to Company Profile
        </button>
      </div>
    );
  }

  return (
    <HealthDashboard
      stage={companyData?.stage}
      sector={companyData?.sector}
      analysisResult={analysisResult}
      onMetricEdit={onMetricEdit}
    />
  );
}
