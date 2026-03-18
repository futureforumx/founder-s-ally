import { useState, useEffect } from "react";
import { InvestorBacking } from "@/components/InvestorBacking";
import { AppSidebar } from "@/components/AppSidebar";
import { CompanyProfile, CompanyData, AnalysisResult } from "@/components/CompanyProfile";
import { SectorClassification } from "@/components/SectorTags";
import { HealthDashboard } from "@/components/HealthDashboard";
import { DeckAuditView } from "@/components/DeckAuditView";
import { CompetitiveBenchmarking } from "@/components/CompetitiveBenchmarking";
import { InvestorExport } from "@/components/InvestorExport";
import { AgentMode } from "@/components/AgentMode";
import { InvestorMatch } from "@/components/InvestorMatch";
import { OnboardingStepper } from "@/components/OnboardingStepper";
import { AnalysisTerminal } from "@/components/AnalysisTerminal";
import { PulseCards } from "@/components/PulseCards";
import { DashboardSegmentedControl, type DashboardView } from "@/components/dashboard/DashboardSegmentedControl";
import { CompanyView } from "@/components/dashboard/CompanyView";
import { CompetitiveView } from "@/components/dashboard/CompetitiveView";
import { IndustryView } from "@/components/dashboard/IndustryView";
import { CommunityView } from "@/components/dashboard/CommunityView";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type ViewType = "company" | "dashboard" | "audit" | "benchmarks" | "investors" | "directory" | "connections" | "messages" | "events";

const Index = () => {
  const [activeView, setActiveView] = useState<ViewType>("company");
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [dashboardView, setDashboardView] = useState<DashboardView>("company");
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sectorClassification, setSectorClassification] = useState<SectorClassification | null>(() => {
    try {
      const saved = localStorage.getItem("company-sector-tags");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const profileComplete = !!companyData && !!analysisResult;

  // Listen for navigate-view events from child components
  useEffect(() => {
    const handler = (e: Event) => {
      const view = (e as CustomEvent).detail as ViewType;
      if (view) setActiveView(view);
    };
    window.addEventListener("navigate-view", handler);
    return () => window.removeEventListener("navigate-view", handler);
  }, []);

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

  const handleOnboardingComplete = (company: CompanyData, analysis: AnalysisResult) => {
    setCompanyData(company);
    setAnalysisResult(analysis);
    setShowOnboarding(false);
  };

  const handleSyncNow = async () => {
    if (!companyData) return;
    setIsSyncing(true);
    try {
      let websiteMarkdown = "";
      if (companyData.website?.trim()) {
        const { data } = await supabase.functions.invoke("scrape-website", {
          body: { url: companyData.website.trim() },
        });
        websiteMarkdown = data?.markdown || "";
      }

      const { data: analysisData, error } = await supabase.functions.invoke("analyze-company", {
        body: {
          websiteText: websiteMarkdown,
          deckText: "",
          companyName: companyData.name,
          stage: companyData.stage,
          sector: companyData.sector,
        },
      });
      if (error) throw error;
      if (analysisData?.error) throw new Error(analysisData.error);
      setAnalysisResult(analysisData as AnalysisResult);
    } catch (e) {
      console.error("Sync failed:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCompanyFieldEdit = (field: keyof CompanyData, value: string) => {
    if (!companyData) return;
    setCompanyData({ ...companyData, [field]: value });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Onboarding modal */}
      {showOnboarding && !profileComplete && (
        <OnboardingStepper
          onComplete={handleOnboardingComplete}
          onSkip={() => setShowOnboarding(false)}
        />
      )}

      <AppSidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-6">
          {activeView === "company" ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">My Company</h1>
                  <p className="text-xs text-muted-foreground mt-0.5">Your company profile and real-time pulse</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSyncNow} disabled={isSyncing || !companyData}>
                    {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {isSyncing ? "Syncing..." : "Sync Now"}
                  </Button>
                  <AgentMode companyData={companyData} onAgentData={handleAgentData} />
                  <InvestorExport companyData={companyData} analysisResult={analysisResult} />
                </div>
              </div>

              {/* Company Profile - inline editable */}
              <CompanyProfile onSave={setCompanyData} onAnalysis={setAnalysisResult} onSectorChange={setSectorClassification} />


              {/* Investor Backing */}
              <InvestorBacking />

              {/* Health Dashboard below */}
              {profileComplete && (
                <HealthDashboard
                  stage={companyData?.stage}
                  sector={companyData?.sector}
                  analysisResult={analysisResult}
                  onMetricEdit={handleMetricEdit}
                />
              )}
            </div>
          ) : activeView === "dashboard" ? (
            <div className="space-y-0">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
                  <p className="text-xs text-muted-foreground mt-0.5">Market intelligence, community pulse, and company health</p>
                </div>
                <div className="flex items-center gap-2">
                  <AgentMode companyData={companyData} onAgentData={handleAgentData} />
                  <InvestorExport companyData={companyData} analysisResult={analysisResult} />
                </div>
              </div>

              <DashboardSegmentedControl active={dashboardView} onChange={setDashboardView} />

              {/* Cross-fade content */}
              <div className="mt-6 animate-fade-in" key={dashboardView}>
                {dashboardView === "company" && (
                  <CompanyView
                    companyData={companyData}
                    analysisResult={analysisResult}
                    onMetricEdit={handleMetricEdit}
                    onNavigateProfile={() => setActiveView("company")}
                  />
                )}
                {dashboardView === "competitive" && (
                  <CompetitiveView
                    companyData={companyData}
                    analysisResult={analysisResult}
                    onNavigateProfile={() => setActiveView("company")}
                  />
                )}
                {dashboardView === "industry" && (
                  <IndustryView
                    sector={companyData?.sector}
                    onNavigateBenchmarks={() => setActiveView("benchmarks")}
                    onNavigateProfile={() => setActiveView("company")}
                  />
                )}
                {dashboardView === "community" && (
                  <CommunityView />
                )}
              </div>
            </div>
          ) : activeView === "benchmarks" ? (
            <CompetitiveBenchmarking metricTable={analysisResult?.metricTable} companyData={companyData} analysisResult={analysisResult} onScrollToProfile={() => setActiveView("company")} />
          ) : activeView === "investors" ? (
            <InvestorMatch companyData={companyData} analysisResult={analysisResult} sectorClassification={sectorClassification} />
          ) : (
            <DeckAuditView />
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
