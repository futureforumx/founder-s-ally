import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";

import { AppSidebar } from "@/components/AppSidebar";
import { CompanyProfile, CompanyData, AnalysisResult } from "@/components/CompanyProfile";
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
import { RefreshCw, ShieldCheck, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";

type ViewType = "company" | "dashboard" | "audit" | "benchmarks" | "investors" | "directory" | "connections" | "messages" | "events";

const Index = () => {
  const [activeView, setActiveView] = useState<ViewType>("company");
  const [companyData, setCompanyData] = useState<CompanyData | null>(() => {
    try {
      const saved = localStorage.getItem("company-profile");
      if (saved) { const p = JSON.parse(saved); if (p.name) return p; }
    } catch {}
    return null;
  });
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(() => {
    try {
      const saved = localStorage.getItem("company-analysis");
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  const [dashboardView, setDashboardView] = useState<DashboardView>("company");
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      const saved = localStorage.getItem("company-profile");
      if (saved) {
        const p = JSON.parse(saved);
        if (p.name) return false; // Already onboarded
      }
    } catch {}
    return true;
  });
  const [showTerminal, setShowTerminal] = useState(false);
  const [profileKey, setProfileKey] = useState(0);
  
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

  // Last synced state
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(() => {
    try {
      const saved = localStorage.getItem("last-synced-at");
      return saved ? new Date(saved) : null;
    } catch { return null; }
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFlash, setSyncFlash] = useState(false);
  const [relativeTime, setRelativeTime] = useState("");

  // Update relative time every 30s
  useEffect(() => {
    const update = () => {
      if (lastSyncedAt) {
        setRelativeTime(formatDistanceToNow(lastSyncedAt, { addSuffix: true }));
      }
    };
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  const handleResync = useCallback(async () => {
    setIsSyncing(true);
    // Simulate re-sync (in production this would trigger actual re-analysis)
    await new Promise(r => setTimeout(r, 2000));
    const now = new Date();
    setLastSyncedAt(now);
    try { localStorage.setItem("last-synced-at", now.toISOString()); } catch {}
    setIsSyncing(false);
    setSyncFlash(true);
    setTimeout(() => setSyncFlash(false), 1500);
  }, []);

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


  const handleOnboardingComplete = (company: CompanyData, analysis: AnalysisResult) => {
    setCompanyData(company);
    setAnalysisResult(analysis);
    setShowOnboarding(false);
    setShowTerminal(true);

    // Update Index-level state directly from analysis
    if (analysis.stageClassification) {
      setStageClassification(analysis.stageClassification);
    }
    if (analysis.sectorMapping) {
      setSectorClassification({
        primary_sector: analysis.sectorMapping.sector,
        modern_tags: analysis.sectorMapping.keywords || [],
      });
    }

    // Persist to localStorage so CompanyProfile picks it up on remount
    try {
      localStorage.setItem("company-profile", JSON.stringify(company));
      localStorage.setItem("company-analysis", JSON.stringify(analysis));
      if (analysis.stageClassification) {
        localStorage.setItem("company-stage-classification", JSON.stringify(analysis.stageClassification));
      }
      if (analysis.sectorMapping) {
        localStorage.setItem("company-sector-tags", JSON.stringify(analysis.sectorMapping));
      }
      if (analysis.sourceVerification) {
        localStorage.setItem("company-source-verification", JSON.stringify(analysis.sourceVerification));
      }
      if (analysis.metricSources) {
        localStorage.setItem("company-metric-sources", JSON.stringify(analysis.metricSources));
      }
      // Persist logo URL from website
      if (company.website) {
        const domain = (() => {
          try {
            let u = company.website.trim();
            if (!/^https?:\/\//i.test(u)) u = "https://" + u;
            return new URL(u).hostname.replace(/^www\./, "");
          } catch { return null; }
        })();
        if (domain) {
          const logoUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
          localStorage.setItem("company-logo-url", logoUrl);
        }
      }
      // Sync timestamp
      const now = new Date();
      setLastSyncedAt(now);
      localStorage.setItem("last-synced-at", now.toISOString());
    } catch {}

    // Force CompanyProfile to remount with fresh localStorage data
    setProfileKey(k => k + 1);
  };

  const handleTerminalComplete = () => {
    setShowTerminal(false);
    setActiveView("dashboard");
  };


  const handleCompanyFieldEdit = (field: keyof CompanyData, value: string) => {
    if (!companyData) return;
    setCompanyData({ ...companyData, [field]: value });
  };

  // Track when analysis starts/stops via the analysis result callback
  const handleAnalysis = (result: AnalysisResult) => {
    setAnalysisResult(result);
    setIsAnalysisRunning(false);
    // Update sync timestamp on every analysis completion
    const now = new Date();
    setLastSyncedAt(now);
    try { localStorage.setItem("last-synced-at", now.toISOString()); } catch {}
    setSyncFlash(true);
    setTimeout(() => setSyncFlash(false), 1500);
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
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      const input = document.getElementById("page-logo-input") as HTMLInputElement;
                      input?.click();
                    }}
                    className="relative w-12 h-12 rounded-xl border border-border bg-muted/30 shadow-sm hover:ring-2 hover:ring-accent/20 transition-all cursor-pointer flex items-center justify-center overflow-hidden group shrink-0"
                  >
                    {(() => {
                      try {
                        const url = localStorage.getItem("company-logo-url");
                        if (url) return <img src={url} alt="" className="w-full h-full object-contain rounded-xl" />;
                      } catch {}
                      const name = companyData?.name || "";
                      if (name) return <span className="text-lg font-bold text-muted-foreground">{name.charAt(0).toUpperCase()}</span>;
                      return <span className="text-lg font-bold text-muted-foreground">?</span>;
                    })()}
                  </button>
                  <input id="page-logo-input" type="file" accept="image/*" className="hidden" onChange={e => {
                    const f = e.target.files?.[0];
                    if (f && f.type.startsWith("image/")) {
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const url = ev.target?.result as string;
                        try { localStorage.setItem("company-logo-url", url); } catch {}
                        setProfileKey(k => k + 1); // force re-render
                      };
                      reader.readAsDataURL(f);
                    }
                  }} />
                  <div>
                    <h1 className="text-xl font-semibold tracking-tight text-foreground">{companyData?.name || "My Company"}</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Your company profile and real-time pulse</p>
                  </div>
                </div>
                <div className="flex items-center">
                  {/* Last analyzed timecode */}
                  {lastSyncedAt ? (
                    <span
                      className={`text-xs font-medium transition-colors duration-500 ${syncFlash ? "text-success" : "text-muted-foreground"}`}
                      title={lastSyncedAt.toLocaleString()}
                    >
                      {syncFlash ? "Analyzed just now" : `Last analyzed ${relativeTime}`}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Company Profile - inline editable */}
              <CompanyProfile key={profileKey} onSave={setCompanyData} onAnalysis={handleAnalysis} onSectorChange={setSectorClassification} onStageClassification={setStageClassification} onProfileVerified={setIsProfileVerified} />


              {/* Strategy Room — at the bottom */}
              {stageClassification && (
                <StrategyRoom
                  stageClassification={stageClassification}
                  currentStage={companyData?.stage}
                />
              )}

              {/* Confirm Profile — below everything */}
              {analysisResult && (
                <div className="rounded-xl border border-border bg-card/95 backdrop-blur-sm px-5 py-3 shadow-sm">
                  <div className="flex items-center justify-between">
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
                          <button
                            className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-5 py-2 text-[13px] font-medium text-success hover:bg-success/20 transition-colors"
                            onClick={() => {
                              setIsProfileVerified(true);
                              try { localStorage.setItem("company-profile-verified", "true"); } catch {}
                            }}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Confirm Profile
                          </button>
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
