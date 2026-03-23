import { useState, useEffect, useCallback, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { ConnectionsPage } from "@/components/ConnectionsPage";
import { SettingsPage } from "@/components/SettingsPage";
import { GroupsView } from "@/components/community/GroupsView";
import { EventsView } from "@/components/community/EventsView";

import { AppSidebar } from "@/components/AppSidebar";
import { type CompanyData, type AnalysisResult } from "@/components/CompanyProfile";
import { SectorClassification } from "@/components/SectorTags";
import { DeckAuditView } from "@/components/DeckAuditView";
import { CompetitiveBenchmarking } from "@/components/CompetitiveBenchmarking";
import { InvestorMatch } from "@/components/InvestorMatch";
import { CompetitorsView } from "@/components/CompetitorsView";
import { OnboardingStepper } from "@/components/OnboardingStepper";
import { AnalysisTerminal } from "@/components/AnalysisTerminal";
import { DashboardSegmentedControl, type DashboardView } from "@/components/dashboard/DashboardSegmentedControl";
import { CompanyView } from "@/components/dashboard/CompanyView";
import { CompetitiveView } from "@/components/dashboard/CompetitiveView";
import { IndustryView } from "@/components/dashboard/IndustryView";
import { CommunityView } from "@/components/dashboard/CommunityView";
import { ArrowRight } from "lucide-react";
import { GlobalTopNav } from "@/components/GlobalTopNav";
import { supabase } from "@/integrations/supabase/client";
import { useCapTable } from "@/hooks/useCapTable";

type ViewType = "company" | "dashboard" | "audit" | "benchmarks" | "investors" | "investor-search" | "directory" | "connections" | "messages" | "events" | "competitors" | "sector" | "groups" | "settings";

const Index = () => {
  const capTable = useCapTable();
  const [activeView, setActiveView] = useState<ViewType>(() => {
    // Default to dashboard instead of company since company is now in settings
    return "dashboard";
  });
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
        if (p.name) return false;
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

  // Redirect "company" sidebar to Settings > Entity
  useEffect(() => {
    if (activeView === "company") {
      setActiveView("settings");
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "company");
      window.history.replaceState({}, "", url.toString());
    }
  }, [activeView]);

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

    if (analysis.stageClassification) {
      setStageClassification(analysis.stageClassification);
    }
    if (analysis.sectorMapping) {
      setSectorClassification({
        primary_sector: analysis.sectorMapping.sector,
        modern_tags: analysis.sectorMapping.keywords || [],
      });
    }

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
      const now = new Date();
      setLastSyncedAt(now);
      localStorage.setItem("last-synced-at", now.toISOString());
    } catch {}

    setProfileKey(k => k + 1);
  };

  const handleTerminalComplete = () => {
    setShowTerminal(false);
    setActiveView("settings");
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "company");
    window.history.replaceState({}, "", url.toString());
  };

  const handleAnalysis = (result: AnalysisResult) => {
    setAnalysisResult(result);
    setIsAnalysisRunning(false);
    const now = new Date();
    setLastSyncedAt(now);
    try { localStorage.setItem("last-synced-at", now.toISOString()); } catch {}
    setSyncFlash(true);
    setTimeout(() => setSyncFlash(false), 1500);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {showOnboarding && !profileComplete && (
        <OnboardingStepper
          onComplete={handleOnboardingComplete}
          onSkip={() => setShowOnboarding(false)}
        />
      )}

      {showTerminal && (
        <AnalysisTerminal
          companyName={companyData?.name}
          onComplete={handleTerminalComplete}
        />
      )}

      <AppSidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-y-auto relative">
        <GlobalTopNav
          companyName={companyData?.name}
          logoUrl={(() => { try { return localStorage.getItem("company-logo-url"); } catch { return null; } })()}
          hasProfile={!!companyData?.name}
          lastSyncedAt={lastSyncedAt}
          syncFlash={syncFlash}
          relativeTime={relativeTime}
          onNavigateProfile={() => setActiveView("company")}
          activeView={activeView}
          onViewChange={setActiveView}
          userSector={companyData?.sector}
          userStage={companyData?.stage}
        />
        <div className="px-8 pt-16 pb-6">
          {activeView === "dashboard" ? (
            <div className="space-y-0">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
                  <p className="text-xs text-muted-foreground mt-0.5">Market intelligence, community pulse, and company health</p>
                </div>
              </div>

              <DashboardSegmentedControl active={dashboardView} onChange={setDashboardView} />

              <div className="mt-6 animate-fade-in" key={dashboardView}>
                {dashboardView === "company" && (
                  <CompanyView
                    companyData={companyData}
                    analysisResult={analysisResult}
                    onMetricEdit={handleMetricEdit}
                    onNavigateProfile={() => setActiveView("company")}
                    stageClassification={stageClassification}
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
                  <CommunityView companyData={companyData} analysisResult={analysisResult} onNavigateProfile={() => setActiveView("company")} />
                )}
              </div>
            </div>
          ) : activeView === "benchmarks" ? (
            <CompetitiveBenchmarking metricTable={analysisResult?.metricTable} companyData={companyData} analysisResult={analysisResult} onScrollToProfile={() => setActiveView("company")} isLocked={!isProfileVerified} />
          ) : activeView === "competitors" ? (
            <CompetitorsView companyData={companyData} onNavigateProfile={() => setActiveView("company")} onAddCompetitor={(name) => {
              if (companyData && !companyData.competitors.includes(name)) {
                const updated = { ...companyData, competitors: [...companyData.competitors, name] };
                setCompanyData(updated);
                try { localStorage.setItem("company-profile", JSON.stringify(updated)); } catch {}
              }
            }} onCompetitorsChanged={(names) => {
              if (companyData) {
                const sorted = [...names].sort();
                const current = [...companyData.competitors].sort();
                if (JSON.stringify(sorted) !== JSON.stringify(current)) {
                  const updated = { ...companyData, competitors: names };
                  setCompanyData(updated);
                  try { localStorage.setItem("company-profile", JSON.stringify(updated)); } catch {}
                }
              }
            }} />
          ) : activeView === "investors" ? (
            <InvestorMatch companyData={companyData} analysisResult={analysisResult} sectorClassification={sectorClassification} isLocked={!isProfileVerified} externalBackers={capTable.backers} externalTotalRaised={capTable.totalRaised} />
          ) : activeView === "sector" ? (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Sector</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Sector intelligence and market positioning</p>
              </div>
              <div className="flex items-center justify-center h-64 rounded-xl border border-border bg-card/50 text-muted-foreground text-sm">Coming soon</div>
            </div>
          ) : activeView === "directory" || activeView === "investor-search" ? (
            <CommunityView companyData={companyData} analysisResult={analysisResult} onNavigateProfile={() => setActiveView("company")} variant={activeView === "investor-search" ? "investor-search" : "directory"} />
          ) : activeView === "connections" ? (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Connections</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Network intelligence, warm intros, and founder experiences</p>
              </div>
              <ConnectionsPage />
            </div>
          ) : activeView === "groups" ? (
            <GroupsView />
          ) : activeView === "events" ? (
            <EventsView />
          ) : activeView === "audit" ? (
            <DeckAuditView />
          ) : activeView === "settings" ? (
            <SettingsPage />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Coming soon</div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
