import { useState, useEffect, useCallback, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { ConnectionsPage } from "@/components/ConnectionsPage";
import { SettingsPage } from "@/components/SettingsPage";
import { GroupsView } from "@/components/community/GroupsView";
import { EventsView } from "@/components/community/EventsView";
import { HelpCenter } from "@/components/HelpCenter";

import { AppSidebar } from "@/components/AppSidebar";
import { type CompanyData, type AnalysisResult } from "@/components/CompanyProfile";
import { getCompletionPercent, EMPTY_FORM } from "@/components/company-profile/types";
import { SectorClassification } from "@/components/SectorTags";
import { DeckAuditView } from "@/components/DeckAuditView";
import { CompetitiveBenchmarking } from "@/components/CompetitiveBenchmarking";
import { InvestorMatch } from "@/components/InvestorMatch";
import { CompetitorsView } from "@/components/CompetitorsView";
import { OnboardingStepper } from "@/components/OnboardingStepper";
import { AnalysisTerminal } from "@/components/AnalysisTerminal";
import { CompanyView } from "@/components/dashboard/CompanyView";
import { CompetitiveView } from "@/components/dashboard/CompetitiveView";
import { IndustryView } from "@/components/dashboard/IndustryView";
import { CommunityView } from "@/components/dashboard/CommunityView";
import { GlobalTopNav, type InvestorDirectoryPick } from "@/components/GlobalTopNav";
import { IntelligencePage } from "@/components/intelligence/IntelligencePage";
import { supabase } from "@/integrations/supabase/client";
import { completeFounderOnboardingEdge } from "@/lib/completeFounderOnboardingEdge";
import { ensureCompanyWorkspace } from "@/lib/ensureCompanyWorkspace";
import { useCapTable } from "@/hooks/useCapTable";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams, useLocation } from "react-router-dom";
import { VEKTA_OPEN_VC_REVIEW_EVENT, type VcReviewOpenDetail } from "@/lib/vcReviewNavigation";

type ViewType =
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
  | "market-data-room"
  | "investors"
  | "investor-search"
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
  | "settings";

const INTEL_VIEWS: ViewType[] = [
  "market-intelligence",
  "market-investors",
  "market-market",
  "market-tech",
  "market-network",
  "market-data-room",
];

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

const Index = () => {
  const { user: authUser } = useAuth();
  const capTable = useCapTable();
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
      if (view === "intelligence" || view === "market-intelligence") return "market-intelligence";
    } catch {
      /* ignore */
    }
    return "dashboard";
  });
  /** Syncs GlobalTopNav investor search UI with CommunityView (investor-search) grid */
  const [investorDirectoryTab, setInvestorDirectoryTab] = useState("all");
  const [investorListQuery, setInvestorListQuery] = useState("");
  const [investorGridScrollTo, setInvestorGridScrollTo] = useState<{
    vcFirmId: string;
    nonce: number;
  } | null>(null);
  const [vcReviewBootstrap, setVcReviewBootstrap] = useState<VcReviewOpenDetail | null>(null);

  useEffect(() => {
    if (location.pathname !== "/intelligence") return;
    setActiveView((prev) =>
      INTEL_VIEWS.includes(prev) ? prev : "market-intelligence",
    );
  }, [location.pathname]);

  useEffect(() => {
    const v = searchParams.get("view");
    if (
      v === "market-investors" ||
      v === "market-market" ||
      v === "market-tech" ||
      v === "market-network" ||
      v === "market-data-room" ||
      v === "market-intelligence" ||
      v === "intelligence"
    ) {
      setActiveView(v === "intelligence" ? "market-intelligence" : (v as ViewType));
    }
    if (v === "settings") {
      setActiveView("settings");
    }
  }, [searchParams]);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<VcReviewOpenDetail>).detail;
      if (!d?.vcFirmId?.trim() || !d?.firmName?.trim() || !d?.ratingId?.trim()) return;
      setVcReviewBootstrap(d);
      setActiveView("investors");
    };
    window.addEventListener(VEKTA_OPEN_VC_REVIEW_EVENT, handler);
    return () => window.removeEventListener(VEKTA_OPEN_VC_REVIEW_EVENT, handler);
  }, []);
  const [companyData, setCompanyData] = useState<CompanyData | null>(() => {
    try {
      const saved = localStorage.getItem("company-profile");
      if (saved) { const p = JSON.parse(saved); if (p.name) return p; }
    } catch {}
    return null;
  });

  const [navLogoUrl, setNavLogoUrl] = useState<string | null>(() => getStoredCompanyLogoUrl());
  useEffect(() => {
    const sync = () => {
      setNavLogoUrl(getStoredCompanyLogoUrl());
    };
    window.addEventListener("storage", sync);
    window.addEventListener("company-logo-changed", sync);
    const interval = setInterval(sync, 2000);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("company-logo-changed", sync);
      clearInterval(interval);
    };
  }, []);

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(() => {
    try {
      const saved = localStorage.getItem("company-analysis");
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
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
        const domain = (() => {
          try {
            let u = company.website.trim();
            if (!/^https?:\/\//i.test(u)) u = "https://" + u;
            return new URL(u).hostname.replace(/^www\./, "");
          } catch { return null; }
        })();
        if (domain) {
          const logoUrl = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
          localStorage.setItem("company-logo-url", logoUrl);
          setNavLogoUrl(logoUrl);
          window.dispatchEvent(new Event("company-logo-changed"));
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
    if (pick.vcFirmId) {
      setInvestorGridScrollTo({ vcFirmId: pick.vcFirmId, nonce: Date.now() });
    }
  }, []);

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
          {activeView === "dashboard" ? (
            <div className="space-y-0">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">Mission Control</h1>
                  <p className="text-xs text-muted-foreground mt-0.5">Company health, metrics, and executive summary</p>
                </div>
              </div>

              <div className="mt-6 animate-fade-in">
                <CompanyView
                  companyData={companyData}
                  analysisResult={analysisResult}
                  onMetricEdit={handleMetricEdit}
                  onNavigateProfile={() => setActiveView("company")}
                  stageClassification={stageClassification}
                />
              </div>
            </div>
          ) : activeView === "industry" ? (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Industry</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Sector heatmaps and full market landscape</p>
              </div>
              <IndustryView
                sector={companyData?.sector}
                onNavigateBenchmarks={() => setActiveView("benchmarks")}
                onNavigateProfile={() => setActiveView("company")}
              />
            </div>
          ) : activeView === "competitive" ? (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Competitive</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Benchmarking, scorecard, and competitive context</p>
              </div>
              <CompetitiveView
                companyData={companyData}
                analysisResult={analysisResult}
                onNavigateProfile={() => setActiveView("company")}
              />
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
            <InvestorMatch
              companyData={companyData}
              analysisResult={analysisResult}
              sectorClassification={sectorClassification}
              isLocked={!isProfileVerified}
              externalBackers={capTable.backers}
              externalTotalRaised={capTable.totalRaised}
              vcReviewBootstrap={vcReviewBootstrap}
              onVcReviewBootstrapConsumed={() => setVcReviewBootstrap(null)}
            />
          ) : activeView === "sector" ? (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Sector</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Your sector positioning and benchmarks</p>
              </div>
              <IndustryView
                variant="sectorFocus"
                sector={companyData?.sector}
                onNavigateBenchmarks={() => setActiveView("benchmarks")}
                onNavigateProfile={() => setActiveView("company")}
              />
            </div>
          ) : activeView === "network" ? (
            <div className="flex min-h-[50vh] items-center justify-center px-6">
              <p className="text-center text-sm text-muted-foreground">
                First NETWORK view — swap this panel when you wire the hub.
              </p>
            </div>
          ) : activeView === "directory" || activeView === "investor-search" ? (
            <CommunityView
              companyData={companyData}
              analysisResult={analysisResult}
              onNavigateProfile={() => setActiveView("company")}
              variant={activeView === "investor-search" ? "investor-search" : "directory"}
              investorTab={activeView === "investor-search" ? investorDirectoryTab : undefined}
              investorListSearchQuery={activeView === "investor-search" ? investorListQuery : undefined}
              investorScrollTo={activeView === "investor-search" ? investorGridScrollTo : undefined}
            />
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
          ) : activeView === "market-data-room" ? (
            <DeckAuditView />
          ) : activeView === "audit" || activeView === "data-room" ? (
            <DeckAuditView />
          ) : activeView === "resources" ? (
            <HelpCenter />
          ) : activeView === "workspace" ? (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Workspace coming soon</div>
          ) : activeView === "settings" ? (
            <SettingsPage />
          ) : activeView === "market-intelligence" ? (
            <IntelligencePage variant="all" />
          ) : activeView === "market-investors" ? (
            <div className="h-full" />
          ) : activeView === "market-market" ? (
            <IntelligencePage variant="market" />
          ) : activeView === "market-tech" ? (
            <IntelligencePage variant="tech" />
          ) : activeView === "market-network" ? (
            <IntelligencePage variant="network" />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Coming soon</div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
