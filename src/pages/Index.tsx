import { useState, useEffect, useCallback, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { ConnectionsPage } from "@/components/ConnectionsPage";
import { SettingsPage } from "@/components/SettingsPage";
import { GroupsView } from "@/components/community/GroupsView";
import { EventsView } from "@/components/community/EventsView";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { AppSidebar } from "@/components/AppSidebar";
import { type CompanyData, type AnalysisResult } from "@/components/CompanyProfile";
import { getCompletionPercent, EMPTY_FORM } from "@/components/company-profile/types";
import { SectorClassification } from "@/components/SectorTags";
import { DeckAuditView } from "@/components/DeckAuditView";
import { CompetitiveBenchmarking } from "@/components/CompetitiveBenchmarking";
import { InvestorMatch } from "@/components/InvestorMatch";
import { SectorHeatmapCard } from "@/components/investor-match/IntelligenceCards";
import { type TimeRange } from "@/components/investor-match/TimeRangeControl";
import { CompetitorsView } from "@/components/CompetitorsView";
import { OnboardingStepper } from "@/components/OnboardingStepper";
import { AnalysisTerminal } from "@/components/AnalysisTerminal";
import { type DashboardView, type CompanySubView, COMPANY_SUBTABS } from "@/components/dashboard/DashboardSegmentedControl";
import { CompanyView } from "@/components/dashboard/CompanyView";
import { CompetitiveView } from "@/components/dashboard/CompetitiveView";
import { IndustryView } from "@/components/dashboard/IndustryView";
import { CommunityView } from "@/components/dashboard/CommunityView";
import { ArrowRight } from "lucide-react";
import { GlobalTopNav } from "@/components/GlobalTopNav";
import { HelpCenter } from "@/components/HelpCenter";
import { supabase } from "@/integrations/supabase/client";
import { completeFounderOnboardingEdge } from "@/lib/completeFounderOnboardingEdge";
import { ensureCompanyWorkspace } from "@/lib/ensureCompanyWorkspace";
import { useCapTable } from "@/hooks/useCapTable";
import { useAuth } from "@/hooks/useAuth";
import { getFaviconUrl } from "@/utils/company-utils";

type ViewType = "company" | "dashboard" | "audit" | "benchmarks" | "market-intelligence" | "market-investors" | "market-market" | "market-tech" | "market-network" | "investors" | "investor-search" | "directory" | "connections" | "messages" | "events" | "competitors" | "sector" | "groups" | "data-room" | "settings" | "help";

/** Persist stepper output via edge function (avoids PostgREST RLS when Clerk has no supabase JWT). */
function buildCompanyAnalysisPatchForDb(company: CompanyData, analysis: AnalysisResult): Record<string, unknown> {
  type AR = AnalysisResult & {
    scrapedHeader?: string;
    scrapedValueProp?: string;
    scrapedPricing?: string;
  };
  const a = analysis as AR;
  const deckParts = [
    a.scrapedHeader,
    a.scrapedValueProp,
    analysis.header,
    analysis.valueProposition,
  ].filter(Boolean);
  const deck_text = deckParts.length ? deckParts.join("\n\n") : null;

  const patch: Record<string, unknown> = {
    company_name: company.name,
    website_url: company.website || null,
    deck_text,
    stage: company.stage || null,
    sector: company.sector || null,
    executive_summary: analysis.executiveSummary || null,
    health_score: analysis.healthScore,
    mrr: analysis.metrics?.mrr?.value || null,
    burn_rate: analysis.metrics?.burnRate?.value || null,
    runway: analysis.metrics?.runway?.value || null,
    cac: analysis.metrics?.cac?.value || null,
    ltv: analysis.metrics?.ltv?.value || null,
    scraped_header: a.scrapedHeader || analysis.header || null,
    scraped_value_prop: a.scrapedValueProp || analysis.valueProposition || null,
    scraped_pricing: a.scrapedPricing || analysis.pricingStructure || null,
  };
  if (typeof patch.health_score !== "number" || Number.isNaN(patch.health_score as number)) {
    delete patch.health_score;
  }
  return patch;
}

// Module-level: read once, survives StrictMode double-mount
let _postOnboardingView: string | null = null;
try {
  _postOnboardingView = localStorage.getItem("post-onboarding-view");
  if (_postOnboardingView) localStorage.removeItem("post-onboarding-view");
} catch {}

const Index = () => {
  const { user: authUser } = useAuth();
  const capTable = useCapTable();
  const [activeView, setActiveView] = useState<ViewType>(() => {
    if (_postOnboardingView === "settings") {
      _postOnboardingView = null; // consume so HMR doesn't re-trigger
      return "settings";
    }
    try {
      const params = new URLSearchParams(window.location.search);
      const view = params.get("view");
      if (view === "settings") return "settings";
    } catch {}
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
  const [companySubView, setCompanySubView] = useState<CompanySubView>("health");
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      // If there's a pending company seed, always show the stepper (validation happens in OnboardingStepper's readSeed)
      const seed = localStorage.getItem("pending-company-seed");
      if (seed) {
        JSON.parse(seed); // validates JSON; throws if corrupt
        return true;
      }
      // Otherwise only show for users who haven't set up a company profile yet
      if (localStorage.getItem("pending-company-seed")) {
        return true;
      }
    } catch {}
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
  const profileCompletion = useMemo(() => {
    if (!companyData) return 0;
    return getCompletionPercent({ ...EMPTY_FORM, ...companyData });
  }, [companyData]);
  const personalCompletion = useMemo(() => {
    try {
      const raw = localStorage.getItem("user-profile-snapshot");
      if (!raw) return 0;
      const p = JSON.parse(raw);
      const fields = [p.full_name, p.title, p.bio, p.location, p.linkedin_url, p.twitter_url];
      const filled = fields.filter(Boolean).length;
      return Math.round((filled / fields.length) * 100);
    } catch { return 0; }
  }, [companyData]);
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

  // Listen for show-onboarding events (e.g. triggered after company creation in settings)
  useEffect(() => {
    const handler = () => {
      try {
        const seed = localStorage.getItem("pending-company-seed");
        if (seed) {
          JSON.parse(seed); // validate JSON before showing modal
          setShowOnboarding(true);
        }
      } catch {
        // localStorage unavailable or seed is corrupt — skip showing the modal
      }
    };
    window.addEventListener("show-onboarding", handler);
    return () => window.removeEventListener("show-onboarding", handler);
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

  const handleOnboardingComplete = async (company: CompanyData, analysis: AnalysisResult) => {
    setCompanyData(company);
    setAnalysisResult(analysis);
    setShowOnboarding(false);
    setShowTerminal(true);

    try {
      if (authUser) {
        const ws = await ensureCompanyWorkspace(authUser.id, company);
        if (!ws.ok) {
          console.warn("[onboarding] ensureCompanyWorkspace:", ws.error);
        } else {
          const sync = await completeFounderOnboardingEdge({
            userId: authUser.id,
            companyId: ws.companyId,
            companyFields: buildCompanyAnalysisPatchForDb(company, analysis),
            profile: {
              has_completed_onboarding: true,
              company_id: ws.companyId,
            },
          });
          if (!sync.ok) {
            if (sync.fallbackToClient) {
              const { error: pe } = await (supabase as any)
                .from("profiles")
                .update({ has_completed_onboarding: true, company_id: ws.companyId })
                .eq("user_id", authUser.id);
              if (pe) {
                console.warn("[onboarding] profile sync (RLS — deploy complete-founder-onboarding):", pe.message);
              }
            } else {
              console.warn("[onboarding] complete-founder-onboarding:", sync.error);
            }
          }
        }
      }
    } catch (e) {
      console.warn("[onboarding] profile/workspace sync:", e);
    }

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
        const logoUrl = getFaviconUrl(company.website, 128);
        if (logoUrl) {
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
      {showOnboarding && (
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

      <AppSidebar 
        activeView={activeView} 
        onViewChange={setActiveView} 
        onAgentClick={() => setShowTerminal(true)}
      />
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
          profileCompletion={profileCompletion}
          personalCompletion={personalCompletion}
          dashboardView={dashboardView}
          onDashboardViewChange={setDashboardView}
        />
        <div className="px-8 pt-16 pb-6">
          {activeView === "dashboard" ? (
            <div className="space-y-0">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-lg font-medium tracking-tight text-foreground uppercase">Dashboard</h1>
                </div>
              </div>

              <div className="mt-6 animate-fade-in" key={dashboardView}>
                {dashboardView === "company" && (
                  <div className="space-y-4">
                    {/* Company Sub-tabs */}
                    <div className="flex items-center gap-1 border-b border-border">
                      {COMPANY_SUBTABS.map((tab) => (
                        <button
                          key={tab.key}
                          onClick={() => setCompanySubView(tab.key)}
                          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                            companySubView === tab.key
                              ? "border-foreground text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Company Sub-view Content */}
                    {companySubView === "health" && (
                      <CompanyView
                        companyData={companyData}
                        analysisResult={analysisResult}
                        onMetricEdit={handleMetricEdit}
                        onNavigateProfile={() => setActiveView("company")}
                        stageClassification={stageClassification}
                      />
                    )}
                    {companySubView === "benchmarks" && (
                      <CompetitiveBenchmarking
                        metricTable={analysisResult?.metricTable}
                        companyData={companyData}
                        analysisResult={analysisResult}
                        onScrollToProfile={() => setActiveView("company")}
                        isLocked={!isProfileVerified}
                      />
                    )}
                  </div>
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
                    onNavigateBenchmarks={() => setDashboardView("benchmarks")}
                    onNavigateProfile={() => setActiveView("company")}
                  />
                )}
                {dashboardView === "competitors" && (
                  <CompetitorsView
                    companyData={companyData}
                    onNavigateProfile={() => {
                      setActiveView("settings");
                      const url = new URL(window.location.href);
                      url.searchParams.set("tab", "company");
                      window.history.replaceState({}, "", url.toString());
                    }}
                    onAddCompetitor={(name) => {
                      if (companyData && !companyData.competitors.includes(name)) {
                        const updated = { ...companyData, competitors: [...companyData.competitors, name] };
                        setCompanyData(updated);
                        try { localStorage.setItem("company-profile", JSON.stringify(updated)); } catch {}
                      }
                    }}
                    onCompetitorsChanged={(names) => {
                      if (companyData) {
                        const sorted = [...names].sort();
                        const current = [...companyData.competitors].sort();
                        if (JSON.stringify(sorted) !== JSON.stringify(current)) {
                          const updated = { ...companyData, competitors: names };
                          setCompanyData(updated);
                          try { localStorage.setItem("company-profile", JSON.stringify(updated)); } catch {}
                        }
                      }
                    }}
                  />
                )}
                {dashboardView === "sector" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h2 className="text-lg font-semibold tracking-tight text-foreground">Sector Intelligence</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Sector intelligence and market positioning</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-center h-64 rounded-xl border border-border bg-card/50 text-muted-foreground text-sm">Coming soon</div>
                  </div>
                )}
                {dashboardView === "benchmarks" && (
                  <CompetitiveBenchmarking
                    metricTable={analysisResult?.metricTable}
                    companyData={companyData}
                    analysisResult={analysisResult}
                    onScrollToProfile={() => setActiveView("company")}
                    isLocked={!isProfileVerified}
                  />
                )}
              </div>
            </div>
          ) : activeView === "benchmarks" ? (
            <CompetitiveBenchmarking metricTable={analysisResult?.metricTable} companyData={companyData} analysisResult={analysisResult} onScrollToProfile={() => setActiveView("company")} isLocked={!isProfileVerified} />
          ) : activeView === "market-investors" ? (
            <MarketIntelligenceInvestors sector={companyData?.sector} stage={companyData?.stage} />
          ) : activeView === "market-intelligence" || activeView === "market-market" || activeView === "market-tech" || activeView === "market-network" ? (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  {activeView === "market-market" ? "Market" : activeView === "market-tech" ? "Tech" : activeView === "market-network" ? "Network" : "Market Intelligence"}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeView === "market-market" ? "Market trends and insights" : activeView === "market-tech" ? "Technology landscape" : activeView === "market-network" ? "Network analysis" : "Market trends, competitive landscape, and industry insights"}
                </p>
              </div>
              {(activeView === "market-intelligence" || activeView === "market-market") && (
                <SectorHeatmapCard sector={companyData?.sector} timeRange={"ytd" as TimeRange} />
              )}
            </div>
          ) : activeView === "competitors" ? (
            <CompetitorsView
              companyData={companyData}
              onNavigateProfile={() => {
                setActiveView("settings");
                const url = new URL(window.location.href);
                url.searchParams.set("tab", "company");
                window.history.replaceState({}, "", url.toString());
              }}
              onAddCompetitor={(name) => {
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
          ) : activeView === "investors" || activeView === "investor-search" || activeView === "connections" ? (
            <Tabs
              value={activeView === "investor-search" ? "search" : activeView === "connections" ? "connections" : "matches"}
              onValueChange={(v) => {
                if (v === "matches") setActiveView("investors");
                else if (v === "search") setActiveView("investor-search");
                else if (v === "connections") setActiveView("connections");
              }}
              className="space-y-4"
            >
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Investors</h1>
              </div>
              <TabsContent value="matches">
                <InvestorMatch companyData={companyData} analysisResult={analysisResult} sectorClassification={sectorClassification} isLocked={!isProfileVerified} externalBackers={capTable.backers} externalTotalRaised={capTable.totalRaised} />
              </TabsContent>
              <TabsContent value="search">
                <CommunityView companyData={companyData} analysisResult={analysisResult} onNavigateProfile={() => setActiveView("company")} variant="investor-search" />
              </TabsContent>
              <TabsContent value="connections">
                <div className="space-y-4">
                  <ConnectionsPage />
                </div>
              </TabsContent>
            </Tabs>
          ) : activeView === "sector" ? (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Sector</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Sector intelligence and market positioning</p>
              </div>
              <div className="flex items-center justify-center h-64 rounded-xl border border-border bg-card/50 text-muted-foreground text-sm">Coming soon</div>
            </div>
          ) : activeView === "directory" ? (
            <CommunityView companyData={companyData} analysisResult={analysisResult} onNavigateProfile={() => setActiveView("company")} variant="directory" />
          ) : activeView === "groups" ? (
            <GroupsView />
          ) : activeView === "events" ? (
            <EventsView />
          ) : activeView === "audit" || activeView === "data-room" ? (
            <DeckAuditView />
          ) : activeView === "settings" ? (
            <SettingsPage tourEnabled={!showOnboarding && !showTerminal} />
          ) : activeView === "help" ? (
            <HelpCenter />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Coming soon</div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
