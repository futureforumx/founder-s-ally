import { useState, useEffect, useCallback, useRef } from "react";
import { formatDistanceToNow } from "date-fns";

import { AppSidebar } from "@/components/AppSidebar";
import { CompanyProfile, CompanyData, AnalysisResult } from "@/components/CompanyProfile";
import { MissionControlInvestors } from "@/components/company-profile/MissionControlInvestors";
import { useCapTable } from "@/hooks/useCapTable";
import { SectorClassification } from "@/components/SectorTags";
import { HealthDashboard } from "@/components/HealthDashboard";
import { DeckAuditView } from "@/components/DeckAuditView";
import { CompetitiveBenchmarking } from "@/components/CompetitiveBenchmarking";
import { InvestorMatch } from "@/components/InvestorMatch";
import { CompetitorsView } from "@/components/CompetitorsView";
import { OnboardingStepper } from "@/components/OnboardingStepper";
import { AnalysisTerminal } from "@/components/AnalysisTerminal";
import { PulseCards } from "@/components/PulseCards";
import { DashboardSegmentedControl, type DashboardView } from "@/components/dashboard/DashboardSegmentedControl";
import { CompanyView } from "@/components/dashboard/CompanyView";
import { CompetitiveView } from "@/components/dashboard/CompetitiveView";
import { IndustryView } from "@/components/dashboard/IndustryView";
import { CommunityView } from "@/components/dashboard/CommunityView";
import { RefreshCw, ShieldCheck, Check, ArrowRight, Eye, Zap, CheckCircle2, Sparkles, Circle, ChevronRight, Briefcase, Target, TrendingUp, Link } from "lucide-react";
import { GlobalTopNav } from "@/components/GlobalTopNav";
import { ProfileStrength } from "@/components/company-profile/ProfileStrength";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";



type ViewType = "company" | "dashboard" | "audit" | "benchmarks" | "investors" | "investor-search" | "directory" | "connections" | "messages" | "events" | "competitors" | "sector";

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
        <div className={`px-8 py-6 ${activeView === "company" && analysisResult && !isProfileVerified ? "pb-24" : ""}`}>
          {activeView === "company" ? (
            <div className="space-y-6">
              {/* Page Header */}
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
                        setProfileKey(k => k + 1);
                      };
                      reader.readAsDataURL(f);
                    }
                  }} />
                  <div>
                    <h1 className="text-xl font-semibold tracking-tight text-foreground">{companyData?.name || "My Company"}</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Your company profile and real-time pulse</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {companyData?.name && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-success">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                      </span>
                      Live
                    </span>
                  )}
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

              {/* ═══ Asymmetric 2-Column Grid ═══ */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                {/* ── Left Column: Performance & Status (sticky) ── */}
                <div className="lg:col-span-4 sticky top-8 flex flex-col gap-5">

                  {/* ── Section Header: Profile Analytics ── */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Profile Analytics</h3>
                    <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
                      {profileCompletion.percent >= 100 && isProfileVerified ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Investor Views</p>
                            <p className="text-lg font-bold text-foreground">12</p>
                            <p className="text-[9px] text-success font-medium">+3 this week</p>
                          </div>
                          <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Search Appearances</p>
                            <p className="text-lg font-bold text-foreground">45</p>
                            <p className="text-[9px] text-success font-medium">+8 this week</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Investor Views</p>
                            <p className="text-lg font-bold text-muted-foreground/40">—</p>
                          </div>
                          <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Search Appearances</p>
                            <p className="text-lg font-bold text-muted-foreground/40">—</p>
                          </div>
                        </div>
                      )}
                      {profileCompletion.percent < 100 && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" /> Complete your profile to unlock analytics.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ── Section Header: Profile Strength ── */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Profile Strength</h3>
                    <ProfileStrength
                      completionPercent={profileCompletion.percent}
                      sectionConfirmed={sectionConfirmed}
                      investorsConfirmed={investorsConfirmed}
                      investorSectionRef={investorSectionRef}
                    />
                  </div>

                  {/* ── Card 3: AI Profile Insight ── */}
                  <div className="rounded-2xl border border-accent/20 bg-gradient-to-b from-accent/5 to-card p-5 space-y-2.5">
                    <p className="text-[10px] font-bold text-accent uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3" /> AI Insight
                    </p>
                    <p className="text-xs text-foreground leading-relaxed">
                      Founders in <span className="font-semibold">{companyData?.sector || "B2B SaaS"}</span> who verify their financial metrics see a <span className="font-bold text-accent">3× higher</span> response rate from {companyData?.stage || "Seed"} investors.
                    </p>
                    {!sectionConfirmed.metrics && (
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent("scroll-to-section", { detail: "metrics" }))}
                        className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors inline-flex items-center gap-1 mt-1"
                      >
                        Verify Metrics <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Right Column: The Payload/Editor ── */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                  {/* Company Profile (Data Sources + Generated Profile) */}
                  <CompanyProfile
                    key={profileKey}
                    onSave={setCompanyData}
                    onAnalysis={handleAnalysis}
                    onSectorChange={setSectorClassification}
                    onStageClassification={setStageClassification}
                    onProfileVerified={setIsProfileVerified}
                    onSectionConfirmedChange={setSectionConfirmed}
                    onCompletionChange={setProfileCompletion}
                  />

                  {/* Investors Section */}
                  <div ref={investorSectionRef}>
                    <MissionControlInvestors
                      backers={capTable.backers}
                      totalRaised={capTable.totalRaised}
                      formatCurrency={capTable.formatCurrency}
                      addInvestor={capTable.addInvestor}
                      onNavigateInvestors={() => setActiveView("investors")}
                      analysisResult={analysisResult}
                      companyData={companyData}
                      previousSectionApproved={!!sectionConfirmed.social}
                      onConfirmedChange={setInvestorsConfirmed}
                    />
                  </div>
                </div>
              </div>
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
            <CommunityView companyData={companyData} analysisResult={analysisResult} onNavigateProfile={() => setActiveView("company")} variant={activeView === "investor-search" ? "investor-search" : "directory"} lastSyncedAt={lastSyncedAt} syncFlash={syncFlash} relativeTime={relativeTime} />
          ) : activeView === "audit" ? (
            <DeckAuditView />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Coming soon</div>
          )}
        </div>

        {/* ═══ Global Sticky Footer ═══ */}
        {activeView === "company" && analysisResult && !isProfileVerified && (
          <StickyProfileFooter
            sectionConfirmed={sectionConfirmed}
            investorsConfirmed={investorsConfirmed}
            onComplete={() => {
              setIsProfileVerified(true);
              try { localStorage.setItem("company-profile-verified", "true"); } catch {}
            }}
          />
        )}
      </main>
    </div>
  );
};

export default Index;
