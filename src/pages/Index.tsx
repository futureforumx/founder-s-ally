import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { CompanyProfile, CompanyData, AnalysisResult } from "@/components/CompanyProfile";
import { HealthDashboard } from "@/components/HealthDashboard";
import { DeckAuditView } from "@/components/DeckAuditView";
import { CompetitiveBenchmarking } from "@/components/CompetitiveBenchmarking";

const Index = () => {
  const [activeView, setActiveView] = useState<"dashboard" | "audit" | "benchmarks">("dashboard");
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-6">
          {activeView === "dashboard" ? (
            <div className="space-y-6">
              <CompanyProfile onSave={setCompanyData} onAnalysis={setAnalysisResult} />
              <HealthDashboard
                stage={companyData?.stage}
                sector={companyData?.sector}
                analysisResult={analysisResult}
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
