import { useState, useEffect, useCallback, useMemo, lazy, Suspense, type CSSProperties } from "react";
import { formatDistanceToNow } from "date-fns";
import { AppSidebar } from "@/components/AppSidebar";
import { type CompanyData, type AnalysisResult } from "@/components/CompanyProfile";
import { getCompletionPercent, EMPTY_FORM, sanitizeCompanyData } from "@/components/company-profile/types";
import { safeTrim } from "@/lib/utils";
import { SectorClassification } from "@/components/SectorTags";
import { HomeView } from "@/components/dashboard/HomeView";
import { GlobalTopNav, type InvestorDirectoryPick } from "@/components/GlobalTopNav";
import { useSearchParams, useLocation } from "react-router-dom";
import { VEKTA_OPEN_VC_REVIEW_EVENT, type VcReviewOpenDetail } from "@/lib/vcReviewNavigation";
import { VEKTA_APP_NAVIGATE_EVENT, type NavigateableAppView } from "@/lib/appShellNavigate";

const ConnectionsPage = lazy(() => import("@/components/ConnectionsPage").then((module) => ({ default: module.ConnectionsPage })));
const SettingsPage = lazy(() => import("@/components/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const GroupsView = lazy(() => import("@/components/community/GroupsView").then((module) => ({ default: module.GroupsView })));
const MarketFundingView = lazy(() => import("@/components/community/MarketFundingView").then((module) => ({ default: module.MarketFundingView })));
const HelpCenter = lazy(() => import("@/components/HelpCenter").then((module) => ({ default: module.HelpCenter })));
const DeckAuditView = lazy(() => import("@/components/DeckAuditView").then((module) => ({ default: module.DeckAuditView })));
const CompetitiveBenchmarking = lazy(() => import("@/components/CompetitiveBenchmarking").then((module) => ({ default: module.CompetitiveBenchmarking })));
const InvestorMatch = lazy(() => import("@/components/InvestorMatch").then((module) => ({ default: module.InvestorMatch })));
const CompetitorsView = lazy(() => import("@/components/CompetitorsView").then((module) => ({ default: module.CompetitorsView })));
const CompanyView = lazy(() => import("@/components/dashboard/CompanyView").then((module) => ({ default: module.CompanyView })));
const CompetitiveView = lazy(() => import("@/components/dashboard/CompetitiveView").then((module) => ({ default: module.CompetitiveView })));
const IndustryView = lazy(() => import("@/components/dashboard/IndustryView").then((module) => ({ default: module.IndustryView })));
const CommunityView = lazy(() => import("@/components/dashboard/CommunityView").then((module) => ({ default: module.CommunityView })));
const RecentFundingFeed = lazy(() =>
  import("@/components/investor-match/RecentFundingFeed").then((module) => ({ default: module.RecentFundingFeed })),
);
const IntelligencePage = lazy(() => import("@/components/intelligence/IntelligencePage").then((module) => ({ default: module.IntelligencePage })));
const MarketIntelligenceInvestors = lazy(() => import("@/components/market-intelligence/InvestorIntelligence").then((module) => ({ default: module.MarketIntelligenceInvestors })));
const NetworkWorkspacePage = lazy(() =>
  import("@/components/network-workspace/NetworkWorkspacePage").then((m) => ({ default: m.NetworkWorkspacePage })),
);
const TargetingPage = lazy(() =>
  import("@/components/targeting/TargetingPage").then((m) => ({ default: m.TargetingPage })),
);
const CirclesPage = lazy(() =>
  import("@/components/targeting/CirclesPage").then((m) => ({ default: m.CirclesPage })),
);
const IntegrationsPage = lazy(() => import("@/components/IntegrationsPage"));
const DataHubPage = lazy(() => import("@/components/DataHubPage").then((m) => ({ default: m.DataHubPage })));

type ViewType =
  | "home"
  | "company"
  | "dashboard"
  | "industry"
  | "competitive"
  | "audit"
  | "benchmarks"
  | "market-intelligence"
  | "market-investors"
  | "market-market"
  | "market-tech"
  | "market-network"
  | "investors"
  | "investor-search"
  | "investor-funding"
  | "network-workspace"
  | "network"
  | "directory"
  | "connections"
  | "messages"
  | "events"
  | "competitors"
  | "sector"
  | "groups"
  | "data-room"
  | "resources"
  | "workspace"
  | "settings"
  | "profile-workspace"
  | "targeting"
  | "circles"
  | "integrations"
  | "data-hub"
  | "market-data-room";

function getStoredCompanyLogoUrl(): string | null {
  try {
    const explicitLogoUrl = localStorage.getItem("company-logo-url");
    if (explicitLogoUrl) return explicitLogoUrl;

    const savedProfile = localStorage.getItem("company-profile");
    if (!savedProfile) return null;

    const parsedProfile = JSON.parse(savedProfile);
    return typeof parsedProfile?.logo_url === "string" && parsedProfile.logo_url.trim().length > 0
      ? parsedProfile.logo_url.trim()
      : null;
  } catch {
    return null;
  }
}

function SectionLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-border/60 bg-card/70 px-6 py-10 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function DeferredSection({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return <Suspense fallback={<SectionLoader label={label} />}>{children}</Suspense>;
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = "vekta-app-sidebar-collapsed";

function readSidebarCollapsedFromStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const Index = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // Read post-onboarding-view on first Index mount (not module load) so /onboarding can set it first.
  const [activeView, setActiveView] = useState<ViewType>(() => {
    try {
      if (typeof window !== "undefined" && window.location.pathname === "/intelligence") {
        return "market-intelligence";
      }
    } catch {
      /* ignore */
    }
    try {
      const post = localStorage.getItem("post-onboarding-view");
      if (post === "settings") {
        localStorage.removeItem("post-onboarding-view");
        return "settings";
      }
    } catch {
      /* ignore */
    }
    try {
      const params = new URLSearchParams(window.location.search);
      const view = params.get("view");
      if (view === "settings") return "settings";
      if (view === "profile-workspace") return "settings";
      if (view === "intelligence" || view === "market-intelligence") return "market-intelligence";
      if (view === "investor-funding") return "investor-funding";
      if (view === "resources") return "resources";
      if (view === "directory") return "directory";
      if (view === "targeting") return "targeting";
      if (view === "circles") return "circles";
      if (view === "integrations") return "integrations";
    } catch {
      /* ignore */
    }
    return "home";
  });
  /** Syncs GlobalTopNav investor search UI with CommunityView (investor-search) grid */
  const [investorDirectoryTab, setInvestorDirectoryTab] = useState("all");
  const [investorListQuery, setInvestorListQuery] = useState("");
  const [investorScrollTo, setInvestorScrollTo] = useState<{
    vcFirmId: string;
    filterQuery?: string;
    personId?: string;
    nonce: number;
  } | null>(null);
  const [vcReviewBootstrap, setVcReviewBootstrap] = useState<VcReviewOpenDetail | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsedFromStorage);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSidebarCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (location.pathname === "/intelligence") {
      setActiveView("market-intelligence");
    }
  }, [location.pathname]);

  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "intelligence" || v === "market-intelligence") {
      setActiveView("market-intelligence");
    }
    if (v === "settings") {
      setActiveView("settings");
    }
    if (v === "profile-workspace") {
      setActiveView("settings");
    }
    if (v === "investor-funding") {
      setActiveView("investor-funding");
    }
    if (v === "resources") {
      setActiveView("resources");
    }
    if (v === "directory") {
      setActiveView("directory");
    }
    if (v === "targeting") {
      setActiveView("targeting");
    }
    if (v === "circles") {
      setActiveView("circles");
    }
    if (v === "integrations") {
      setActiveView("integrations");
    }
  }, [searchParams]);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<VcReviewOpenDetail>).detail;
      if (!safeTrim(d?.vcFirmId) || !safeTrim(d?.firmName) || !safeTrim(d?.ratingId)) return;
      setVcReviewBootstrap(d);
      setActiveView("investors");
    };
    window.addEventListener(VEKTA_OPEN_VC_REVIEW_EVENT, handler);
    return () => window.removeEventListener(VEKTA_OPEN_VC_REVIEW_EVENT, handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent<{ view: NavigateableAppView }>).detail?.view;
      if (v === "connections" || v === "network" || v === "network-workspace" || v === "investor-search") {
        setActiveView(v as ViewType);
      }
    };
    window.addEventListener(VEKTA_APP_NAVIGATE_EVENT, handler);
    return () => window.removeEventListener(VEKTA_APP_NAVIGATE_EVENT, handler);
  }, []);
  const [companyData, setCompanyData] = useState<CompanyData | null>(() => {
    try {
      const saved = localStorage.getItem("company-profile");
      if (saved) {
        const parsed = JSON.parse(saved);
        const c = sanitizeCompanyData(parsed);
        if (c) return c;
      }
    } catch {}
    return null;
  });

  const [navLogoUrl, setNavLogoUrl] = useState<string | null>(() => getStoredCompanyLogoUrl());
  useEffect(() => {
    const sync = () => {
      const url = getStoredCompanyLogoUrl();
      setNavLogoUrl(prev => url !== prev ? url : prev);
    };
    window.addEventListener("storage", sync);
    window.addEventListener("company-logo-changed", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("company-logo-changed", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(() => {
    try {
      const saved = localStorage.getItem("company-analysis");
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
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

  const handleAnalysis = (result: AnalysisResult) => {
    setAnalysisResult(result);
    setIsAnalysisRunning(false);
    const now = new Date();
    setLastSyncedAt(now);
    try { localStorage.setItem("last-synced-at", now.toISOString()); } catch {}
    setSyncFlash(true);
    setTimeout(() => setSyncFlash(false), 1500);
  };

  const handleInvestorNavChip = useCallback((chip: string) => {
    setInvestorDirectoryTab(chip);
    setInvestorListQuery("");
    setActiveView("investor-search");
  }, []);

  const handleInvestorSuggestion = useCallback(
    (suggestion: string) => {
      const s = companyData?.sector || "Technology";
      const st = companyData?.stage || "Seed";
      if (suggestion === `Lead ${s} investors`) setInvestorDirectoryTab("sector");
      else if (suggestion === `Top ${s} funds actively deploying`) setInvestorDirectoryTab("matches");
      else if (suggestion === `Investors writing ${st} checks`) setInvestorDirectoryTab("stage");
      else setInvestorDirectoryTab("all");
      setInvestorListQuery("");
      setActiveView("investor-search");
    },
    [companyData?.sector, companyData?.stage]
  );

  const handleInvestorSearchQuery = useCallback((q: string) => {
    setInvestorListQuery(q);
    if (q.trim()) setActiveView("investor-search");
  }, []);

  const handleInvestorDirectoryPick = useCallback((pick: InvestorDirectoryPick) => {
    const firmId = safeTrim(pick.vcFirmId);
    if (!firmId) return;
    setInvestorDirectoryTab("all");
    setInvestorListQuery(pick.filterQuery);
    setActiveView("investor-search");
    setInvestorScrollTo((prev) => ({
      vcFirmId: firmId,
      filterQuery: pick.filterQuery,
      personId: safeTrim(pick.personId) || undefined,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  }, []);

  const shellStyle = {
    "--app-sidebar-width": sidebarCollapsed ? "3.5rem" : "13rem",
  } as CSSProperties;

  return (
    <div className="flex h-screen min-h-0 overflow-hidden" style={shellStyle}>
      <AppSidebar
        activeView={activeView}
        onViewChange={setActiveView}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
      />
      <main className="flex-1 overflow-y-auto relative">
        <GlobalTopNav
          companyName={companyData?.name}
          logoUrl={navLogoUrl}
          hasProfile={!!companyData?.name}
          lastSyncedAt={lastSyncedAt}
          syncFlash={syncFlash}
          relativeTime={relativeTime}
          onNavigateProfile={() => setActiveView("company")}
          activeView={activeView}
          onViewChange={setActiveView}
          investorSearchChip={investorDirectoryTab}
          onInvestorSearchChipChange={handleInvestorNavChip}
          investorSearchQuery={investorListQuery}
          onInvestorSearchQueryChange={handleInvestorSearchQuery}
          onInvestorDirectoryPick={handleInvestorDirectoryPick}
          onInvestorSuggestionSelect={handleInvestorSuggestion}
          userSector={companyData?.sector}
          userStage={companyData?.stage}
          profileCompletion={profileCompletion}
          personalCompletion={personalCompletion}
        />
        <div className="px-8 pt-16 pb-6">
          {activeView === "home" ? (
            <HomeView
              companyName={companyData?.name}
              onViewChange={(view) => setActiveView(view as ViewType)}
            />
          ) : activeView === "dashboard" ? (
            <div className="space-y-0">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">Mission Control</h1>
                  <p className="text-xs text-muted-foreground mt-0.5">Company health, metrics, and executive summary</p>
                </div>
              </div>

              <div className="mt-6 animate-fade-in">
                <DeferredSection label="Loading mission control…">
                  <CompanyView
                    companyData={companyData}
                    analysisResult={analysisResult}
                    onMetricEdit={handleMetricEdit}
                    onNavigateProfile={() => setActiveView("company")}
                    stageClassification={stageClassification}
                  />
                </DeferredSection>
              </div>
            </div>
          ) : activeView === "industry" ? (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Industry</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Sector heatmaps and full market landscape</p>
              </div>
              <DeferredSection label="Loading industry view…">
                <IndustryView
                  sector={companyData?.sector}
                  onNavigateBenchmarks={() => setActiveView("benchmarks")}
                  onNavigateProfile={() => setActiveView("company")}
                />
              </DeferredSection>
            </div>
          ) : activeView === "competitive" ? (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Competitive</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Benchmarking, scorecard, and competitive context</p>
              </div>
              <DeferredSection label="Loading competitive view…">
                <CompetitiveView
                  companyData={companyData}
                  analysisResult={analysisResult}
                  onNavigateProfile={() => setActiveView("company")}
                />
              </DeferredSection>
            </div>
          ) : activeView === "benchmarks" ? (
            <DeferredSection label="Loading benchmarks…">
              <CompetitiveBenchmarking metricTable={analysisResult?.metricTable} companyData={companyData} analysisResult={analysisResult} onScrollToProfile={() => setActiveView("company")} isLocked={!isProfileVerified} />
            </DeferredSection>
          ) : activeView === "competitors" ? (
            <DeferredSection label="Loading competitors…">
              <CompetitorsView companyData={companyData} onNavigateProfile={() => setActiveView("company")} onAddCompetitor={(name) => {
                if (companyData && !companyData.competitors.includes(name)) {
                  const updated = { ...companyData, competitors: [...companyData.competitors, name] };
                  const profile = sanitizeCompanyData(updated) ?? updated;
                  setCompanyData(profile);
                  try { localStorage.setItem("company-profile", JSON.stringify(profile)); } catch {}
                }
              }} onCompetitorsChanged={(names) => {
                if (companyData) {
                  const sorted = [...names].sort();
                  const current = [...companyData.competitors].sort();
                  if (JSON.stringify(sorted) !== JSON.stringify(current)) {
                    const updated = { ...companyData, competitors: names };
                    const profile = sanitizeCompanyData(updated) ?? updated;
                    setCompanyData(profile);
                    try { localStorage.setItem("company-profile", JSON.stringify(profile)); } catch {}
                  }
                }
              }} />
            </DeferredSection>
          ) : activeView === "investors" ? (
            <DeferredSection label="Loading investor workflow…">
              <InvestorMatch
                companyData={companyData}
                analysisResult={analysisResult}
                sectorClassification={sectorClassification}
                isLocked={!isProfileVerified}
                vcReviewBootstrap={vcReviewBootstrap}
                onVcReviewBootstrapConsumed={() => setVcReviewBootstrap(null)}
              />
            </DeferredSection>
          ) : activeView === "investor-funding" ? (
            <DeferredSection label="Loading funding feed…">
              <RecentFundingFeed />
            </DeferredSection>
          ) : activeView === "sector" ? (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Sector</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Your sector positioning and benchmarks</p>
              </div>
              <DeferredSection label="Loading sector view…">
                <IndustryView
                  variant="sectorFocus"
                  sector={companyData?.sector}
                  onNavigateBenchmarks={() => setActiveView("benchmarks")}
                  onNavigateProfile={() => setActiveView("company")}
                />
              </DeferredSection>
            </div>
          ) : activeView === "network-workspace" ? (
            <DeferredSection label="Loading network workspace…">
              <NetworkWorkspacePage />
            </DeferredSection>
          ) : activeView === "network" ? (
            <DeferredSection label="Loading network view…">
              <CommunityView
                key="cv-network"
                companyData={companyData}
                analysisResult={analysisResult}
                onNavigateProfile={() => setActiveView("company")}
                variant="directory"
              />
            </DeferredSection>
          ) : activeView === "directory" || activeView === "investor-search" ? (
            <DeferredSection label="Loading directory…">
              <CommunityView
                key={activeView === "investor-search" ? "cv-investor-search" : "cv-directory"}
                companyData={companyData}
                analysisResult={analysisResult}
                onNavigateProfile={() => setActiveView("company")}
                variant={activeView === "investor-search" ? "investor-search" : "directory"}
                investorTab={activeView === "investor-search" ? investorDirectoryTab : undefined}
                investorListSearchQuery={activeView === "investor-search" ? investorListQuery : undefined}
                investorScrollTo={activeView === "investor-search" ? investorScrollTo : undefined}
              />
            </DeferredSection>
          ) : activeView === "connections" ? (
            <DeferredSection label="Loading connections…">
              <ConnectionsPage
                companyData={companyData}
                analysisResult={analysisResult}
                onNavigateProfile={() => setActiveView("company")}
              />
            </DeferredSection>
          ) : activeView === "groups" ? (
            <DeferredSection label="Loading groups…">
              <GroupsView />
            </DeferredSection>
          ) : activeView === "events" ? (
            <DeferredSection label="Loading funding…">
              <MarketFundingView />
            </DeferredSection>
          ) : activeView === "audit" || activeView === "data-room" ? (
            <DeferredSection label="Loading deck tools…">
              <DeckAuditView />
            </DeferredSection>
          ) : activeView === "resources" ? (
            <DeferredSection label="Loading help center…">
              <HelpCenter />
            </DeferredSection>
          ) : activeView === "workspace" ? (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Workspace coming soon</div>
          ) : activeView === "targeting" ? (
            <DeferredSection label="Loading targeting…">
              <TargetingPage />
            </DeferredSection>
          ) : activeView === "circles" ? (
            <DeferredSection label="Loading circles…">
              <CirclesPage />
            </DeferredSection>
          ) : activeView === "integrations" ? (
            <DeferredSection label="Loading integrations…">
              <IntegrationsPage />
            </DeferredSection>
          ) : activeView === "data-hub" || activeView === "market-data-room" ? (
            <DeferredSection label="Loading data hub…">
              <DataHubPage />
            </DeferredSection>
          ) : activeView === "settings" ? (
            <DeferredSection label="Loading settings…">
              <SettingsPage />
            </DeferredSection>
          ) : activeView === "market-intelligence" ? (
            <DeferredSection label="Loading intelligence…">
              <IntelligencePage variant="all" />
            </DeferredSection>
          ) : activeView === "market-investors" ? (
            <DeferredSection label="Loading investor intelligence…">
              <MarketIntelligenceInvestors sector={companyData?.sector} stage={companyData?.stage} />
            </DeferredSection>
          ) : activeView === "market-market" ? (
            <DeferredSection label="Loading market intelligence…">
              <IntelligencePage variant="market" />
            </DeferredSection>
          ) : activeView === "market-tech" ? (
            <DeferredSection label="Loading tech intelligence…">
              <IntelligencePage variant="tech" />
            </DeferredSection>
          ) : activeView === "market-network" ? (
            <DeferredSection label="Loading network intelligence…">
              <IntelligencePage variant="network" />
            </DeferredSection>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Coming soon</div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
