import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { CompanyProfile, CompanyData, AnalysisResult } from "@/components/CompanyProfile";
import { HealthDashboard } from "@/components/HealthDashboard";
import { DeckAuditView } from "@/components/DeckAuditView";
import { CompetitiveBenchmarking } from "@/components/CompetitiveBenchmarking";
import { InvestorExport } from "@/components/InvestorExport";
import { AgentMode } from "@/components/AgentMode";
import { InvestorMatch } from "@/components/InvestorMatch";

const Index = () => {
  const [activeView, setActiveView] = useState<"dashboard" | "audit" | "benchmarks" | "investors">("dashboard");
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  const handleMetricEdit = (key: string, value: string) => {
    if (!analysisResult) return;
    setAnalysisResult({
      ...analysisResult,
      metrics: {
        ...analysisResult.metrics,
        [key]: { value, confidence: "high" as const },
      },
    });
  };

  const handleAgentData = (agentData: AnalysisResult["agentData"]) => {
    if (!analysisResult) return;
    setAnalysisResult({ ...analysisResult, agentData });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-6">
          {activeView === "dashboard" ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div />
                <div className="flex items-center gap-2">
                  <AgentMode companyData={companyData} onAgentData={handleAgentData} />
                  <InvestorExport companyData={companyData} analysisResult={analysisResult} />
                </div>
              </div>
              <CompanyProfile onSave={setCompanyData} onAnalysis={setAnalysisResult} />
              <HealthDashboard
                stage={companyData?.stage}
                sector={companyData?.sector}
                analysisResult={analysisResult}
                onMetricEdit={handleMetricEdit}
              />
            </div>
          ) : activeView === "benchmarks" ? (
            <CompetitiveBenchmarking metricTable={analysisResult?.metricTable} />
          ) : (
            <DeckAuditView />
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
