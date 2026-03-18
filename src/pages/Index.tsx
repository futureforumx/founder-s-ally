import { useState, useEffect, useRef } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { CompanyProfile, CompanyData, AnalysisResult, CompanyProfileHandle } from "@/components/CompanyProfile";
import { StrategyRoom } from "@/components/company-profile/StrategyRoom";
import { SectorClassification } from "@/components/SectorTags";
import { HealthDashboard } from "@/components/HealthDashboard";
import { DeckAuditView } from "@/components/DeckAuditView";
import { CompetitiveBenchmarking } from "@/components/CompetitiveBenchmarking";
import { InvestorMatch } from "@/components/InvestorMatch";
import { OnboardingStepper } from "@/components/OnboardingStepper";
import { AnalysisTerminal } from "@/components/AnalysisTerminal";
import { PulseCards } from "@/components/PulseCards";
import { DashboardSegmentedControl, type DashboardView } from "@/components/dashboard/DashboardSegmentedControl";
import { CompanyView } from "@/components/dashboard/CompanyView";
import { CompetitiveView } from "@/components/dashboard/CompetitiveView";
import { IndustryView } from "@/components/dashboard/IndustryView";
import { CommunityView } from "@/components/dashboard/CommunityView";
import { Loader2, ShieldCheck, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";

type ViewType = "company" | "dashboard" | "audit" | "benchmarks" | "investors" | "directory" | "connections" | "messages" | "events";

const Index = () => {
  const profileRef = useRef<CompanyProfileHandle>(null);
  const [activeView, setActiveView] = useState<ViewType>("company");
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [dashboardView, setDashboardView] = useState<DashboardView>("company");
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isProfileVerified, setIsProfileVerified] = useState(() => {
    try { return localStorage.getItem("company-profile-verified") === "true"; } catch { return false; }
  });
  const [stageClassification, setStageClassification] = useState<{
    detected_stage: string; confidence_score: number; reasoning: string; conflicting_signals?: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem("company-stage-classification");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [sectorClassification, setSectorClassification] = useState<SectorClassification | null>(() => {
    try {
      const saved = localStorage.getItem("company-sector-tags");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const profileComplete = !!companyData && !!analysisResult;
  const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);

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
    setShowTerminal(true);
  };

  const handleTerminalComplete = () => {
    setShowTerminal(false);
    setActiveView("dashboard");
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

  // Track when analysis starts/stops via the analysis result callback
  const handleAnalysis = (result: AnalysisResult) => {
    setAnalysisResult(result);
    setIsAnalysisRunning(false);
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

      {/* AI Analysis Terminal transition */}
      {showTerminal && (
        <AnalysisTerminal
          companyName={companyData?.name}
          onComplete={handleTerminalComplete}
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
                <div>
                  <button
                    onClick={() => profileRef.current?.triggerAnalysis()}
                    disabled={!profileRef.current?.canAnalyze || profileRef.current?.isAnalyzing}
                    className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-[13px] font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {profileRef.current?.isAnalyzing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {profileRef.current?.analyzeStepLabel || "Run Analysis"}
                  </button>
                </div>
              </div>

              {/* Company Profile - inline editable */}
              <CompanyProfile onSave={setCompanyData} onAnalysis={handleAnalysis} onSectorChange={setSectorClassification} onStageClassification={setStageClassification} onProfileVerified={setIsProfileVerified} />


              {/* Strategy Room — at the bottom */}
              {stageClassification && (
                <StrategyRoom
                  stageClassification={stageClassification}
                  currentStage={companyData?.stage}
                />
              )}

              {/* Confirm Profile — below everything */}
              {analysisResult && (
                <div className="sticky bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur-sm px-5 py-3 -mx-8 -mb-6" style={{ width: "calc(100% + 4rem)" }}>
                  <div className="flex items-center justify-between px-3">
                    <p className="text-[10px] text-muted-foreground">
                      {isProfileVerified ? "Profile data locked. AI drafts cleared." : "Confirming your profile is required to view matches."}
                    </p>
                    {isProfileVerified ? (
                      <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-5 py-2 text-[13px] font-medium text-success cursor-default">
                        <Check className="h-3.5 w-3.5" />
                        Profile Verified
                      </div>
                    ) : (
                      <Tooltip delayDuration={200}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 border-success/30 bg-success/10 text-success hover:bg-success/20 hover:text-success"
                            onClick={() => {
                              setIsProfileVerified(true);
                              try { localStorage.setItem("company-profile-verified", "true"); } catch {}
                            }}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Confirm Profile
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[280px] text-xs">
                          Lock in your verified data to remove AI drafts and unlock the Competitive Benchmarking and Investor Match features.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
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
            <CompetitiveBenchmarking metricTable={analysisResult?.metricTable} companyData={companyData} analysisResult={analysisResult} onScrollToProfile={() => setActiveView("company")} isLocked={!isProfileVerified} />
          ) : activeView === "investors" ? (
            <InvestorMatch companyData={companyData} analysisResult={analysisResult} sectorClassification={sectorClassification} isLocked={!isProfileVerified} />
          ) : (
            <DeckAuditView />
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
