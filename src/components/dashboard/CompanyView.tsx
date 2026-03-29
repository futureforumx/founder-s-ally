import { HealthDashboard } from "@/components/HealthDashboard";
import { StrategyRoom } from "@/components/company-profile/StrategyRoom";
import { Link } from "react-router-dom";
import { Radar, Sparkles } from "lucide-react";
import type { CompanyData, AnalysisResult } from "@/components/company-profile/types";

interface Props {
  companyData: CompanyData | null;
  analysisResult: AnalysisResult | null;
  onMetricEdit: (key: string, value: string) => void;
  onNavigateProfile: () => void;
  stageClassification?: {
    detected_stage: string;
    confidence_score: number;
    reasoning: string;
    conflicting_signals?: string;
  } | null;
}

export function CompanyView({ companyData, analysisResult, onMetricEdit, onNavigateProfile, stageClassification }: Props) {
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
        <p className="text-[11px] text-muted-foreground max-w-sm mt-5 mb-2">
          You can still open the Intelligence feed (investor, market, tech, and network events) without a full profile.
        </p>
        <Link
          to="/intelligence"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
        >
          <Radar className="h-3.5 w-3.5" />
          Open Intelligence feed
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Intelligence</span> — investors, market, tech, and network signals
        </p>
        <Link
          to="/intelligence"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent/25 transition-colors"
        >
          <Radar className="h-3.5 w-3.5" />
          Open feed
        </Link>
      </div>
      {stageClassification && (
        <StrategyRoom
          stageClassification={stageClassification}
          currentStage={companyData?.stage}
        />
      )}
      <HealthDashboard
        stage={companyData?.stage}
        sector={companyData?.sector}
        analysisResult={analysisResult}
        onMetricEdit={onMetricEdit}
        linkedinProfileUrl={
          companyData?.socialLinkedin && /linkedin\.com\/in\//i.test(companyData.socialLinkedin)
            ? companyData.socialLinkedin
            : null
        }
      />
    </div>
  );
}
