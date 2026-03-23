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
import { ArrowRight, ShieldCheck, Sparkles, ChevronRight } from "lucide-react";
import { GlobalTopNav } from "@/components/GlobalTopNav";
import { supabase } from "@/integrations/supabase/client";
import { useCapTable } from "@/hooks/useCapTable";



type ViewType = "company" | "dashboard" | "audit" | "benchmarks" | "investors" | "investor-search" | "directory" | "connections" | "messages" | "events" | "competitors" | "sector" | "groups" | "settings";

// ── Sticky Profile Footer ──
function StickyProfileFooter({
  sectionConfirmed,
  investorsConfirmed,
  onComplete,
}: {
  sectionConfirmed: Record<string, boolean>;
  investorsConfirmed: boolean;
  onComplete: () => void;
}) {
  const profileSections = ["overview", "positioning", "metrics", "social"];
  const approvedCount = profileSections.filter(s => sectionConfirmed[s]).length + (investorsConfirmed ? 1 : 0);
  const totalSteps = 5;
  const allReady = approvedCount === totalSteps;
  const progressPercent = (approvedCount / totalSteps) * 100;

  return (
    <div className="sticky bottom-0 left-0 w-full bg-background/90 backdrop-blur-md border-t border-border p-4 z-50 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-4">
        <span className="text-xs font-semibold text-foreground">Profile Setup</span>
        <div className="flex items-center gap-2">
          <div className="w-32 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${allReady ? "bg-success" : "bg-accent"}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            Step {approvedCount} of {totalSteps}
          </span>
        </div>
      </div>
      <button
        onClick={allReady ? onComplete : undefined}
        disabled={!allReady}
        className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all ${
          allReady
            ? "bg-accent text-accent-foreground shadow-lg hover:-translate-y-0.5 hover:bg-accent/90"
            : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
        }`}
      >
        Complete Profile <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

const Index = () => {
  const capTable = useCapTable();
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
  const [sectionConfirmed, setSectionConfirmed] = useState<Record<string, boolean>>({});
  const [investorsConfirmed, setInvestorsConfirmed] = useState(false);
  const investorSectionRef = useRef<HTMLDivElement>(null);
  const [profileCompletion, setProfileCompletion] = useState({ percent: 0, sectionsApproved: 0, totalSections: 4, allDone: false });

  // Auto-scroll to investors section when all profile sections are confirmed
  useEffect(() => {
    const handler = () => {
      setTimeout(() => {
        investorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    };
    window.addEventListener("scroll-to-investors", handler);
    return () => window.removeEventListener("scroll-to-investors", handler);
  }, []);

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

      {/* DEV: Re-trigger terminal */}
      <button
        onClick={() => setShowTerminal(true)}
        className="fixed bottom-4 right-4 z-[100] bg-destructive text-destructive-foreground text-[10px] font-mono px-2 py-1 rounded shadow-lg opacity-60 hover:opacity-100 transition-opacity"
      >
        ▶ Terminal
      </button>

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
        <div className={`px-8 pt-16 pb-6`}>
          {activeView === "dashboard" ? (
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
