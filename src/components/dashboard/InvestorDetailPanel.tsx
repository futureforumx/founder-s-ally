import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLatestMyVcRating } from "@/hooks/useLatestMyVcRating";
import { formatMyReviewRateButton } from "@/lib/reviewRateButtonDisplay";
import { cn } from "@/lib/utils";
import { ReviewSubmissionModal } from "@/components/investor-match/ReviewSubmissionModal";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Zap, BookmarkPlus, CheckCircle2,
  ArrowUpRight, Landmark, Target, MapPin, Users, Star,
} from "lucide-react";
import { ActivityDashboard } from "./investor-detail/ActivityDashboard";
import { Badge } from "@/components/ui/badge";
import { FirmLogo } from "@/components/ui/firm-logo";
import { InvestorActivity } from "./investor-detail/InvestorActivity";
import { ThesisTabContent } from "./investor-detail/ThesisTabContent";
import { MatchScoreDropdown } from "./investor-detail/InvestorAIInsight";
import { InvestorPartnersTab } from "./investor-detail/InvestorPartnersTab";
import { ConnectionsTab } from "./investor-detail/ConnectionsTab";
import { FeedbackTab } from "./investor-detail/FeedbackTab";
import { PortfolioTab } from "./investor-detail/PortfolioTab";
import { INVESTOR_TABS, type InvestorTab, type InvestorEntry } from "./investor-detail/types";
import { useInvestorEnrich, type EnrichResult } from "@/hooks/useInvestorEnrich";
import { DataProvenanceBadge } from "./investor-detail/DataProvenanceBadge";
import { ScoreTilesRow } from "./investor-detail/ScoreTilesRow";
import { useInvestorProfileByName, type InvestorPartner } from "@/hooks/useInvestorProfile";
import { getPartnersForFirm, type PartnerPerson } from "./investor-detail/types";
import { Skeleton } from "@/components/ui/skeleton";
import type { VCFirm, VCPerson } from "@/hooks/useVCDirectory";
import { supabase } from "@/integrations/supabase/client";
import { useUserCredits } from "@/hooks/useContactReveal";
import { useInvestorMapping } from "@/hooks/useInvestorMapping";

interface CompanyContext {
  name?: string;
  sector?: string;
  stage?: string;
  model?: string;
  description?: string;
}

interface InvestorDetailPanelProps {
  investor: InvestorEntry | null;
  companyName?: string;
  companyData?: CompanyContext | null;
  onClose: () => void;
  vcFirm?: VCFirm | null;
  vcPartners?: VCPerson[];
  onSelectPerson?: (person: VCPerson) => void;
  onCloseVCFirm?: () => void;
  initialTab?: InvestorTab;
}

export type { InvestorEntry };

function investorPartnerToVCPerson(p: InvestorPartner, firmId: string): VCPerson {
  const parts = p.full_name.trim().split(/\s+/).filter(Boolean);
  return {
    id: p.id,
    full_name: p.full_name,
    title: p.title,
    firm_id: firmId,
    first_name: parts[0] ?? null,
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
    is_active: p.is_active,
  } as VCPerson;
}

function partnerPersonToVCPerson(p: PartnerPerson, firmId: string): VCPerson {
  return {
    id: p.id,
    full_name: p.full_name,
    title: p.title ?? null,
    firm_id: firmId,
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    is_active: p.is_active ?? true,
  } as VCPerson;
}

export function InvestorDetailPanel({ investor, companyName, companyData, onClose, vcFirm, vcPartners = [], onSelectPerson, onCloseVCFirm, initialTab }: InvestorDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<InvestorTab>(initialTab || "Updates");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ratingRefresh, setRatingRefresh] = useState(0);

  // Reset tab when initialTab or investor changes
  useEffect(() => {
    setActiveTab(initialTab || "Updates");
  }, [initialTab, investor?.name]);
  const { session } = useAuth();
  const { enrich, cache: enrichCache } = useInvestorEnrich();
  const [enrichedData, setEnrichedData] = useState<EnrichResult | null>(null);
  const [resolvedFirmId, setResolvedFirmId] = useState<string | null>(null);
  const { data: userCredits } = useUserCredits();
  const isAdmin = userCredits?.tier === "admin";

  // ── Investor mapping — determines which review form to show ──
  const investorName = investor?.name || vcFirm?.name || null;
  const { isMapped: investorIsMappedToProfile, mappingRecordId } = useInvestorMapping(investorName);

  // ── Live data hook ──
  const liveQuery = useInvestorProfileByName(
    investor?.name || vcFirm?.name || null
  );
  const liveProfile = liveQuery.data;
  const liveLoading = liveQuery.isLoading;

  // Synthesize an investor entry from vcFirm when opened directly from omnibox
  const effectiveInvestor: InvestorEntry | null = useMemo(() => {
    if (investor) return investor;
    if (!vcFirm) return null;
    return {
      name: vcFirm.name,
      sector: vcFirm.sectors?.slice(0, 2).join(", ") || "Multi-stage",
      stage: vcFirm.stages?.join(", ") || "Multi-stage",
      description: vcFirm.description || `${vcFirm.name} is an active investment firm.`,
      location: "",
      model: vcFirm.sweet_spot || vcFirm.aum || "",
      initial: vcFirm.name.charAt(0).toUpperCase(),
      matchReason: null,
      category: "investor" as const,
      logo_url: vcFirm.logo_url || null,
    };
  }, [investor, vcFirm]);

  const matchScore = effectiveInvestor?.matchReason ? 92 : Math.floor(Math.random() * 30) + 55;

  const displayName = effectiveInvestor?.name || "";

  const investorDbIdFromEntry =
    typeof investor?.investorDatabaseId === "string" && investor.investorDatabaseId.trim()
      ? investor.investorDatabaseId.trim()
      : null;
  /** `liveProfile.id` is only a Supabase `investor_database` row when `source === "live"`. JSON fallback uses MDM domain ids — do not let those override an explicit DB id from Matches. */
  const databaseFirmId =
    liveProfile?.source === "live"
      ? liveProfile.id
      : investorDbIdFromEntry ?? resolvedFirmId ?? null;
  const reviewVcFirmId =
    databaseFirmId ??
    vcFirm?.id ??
    (liveProfile?.source === "json-fallback" ? liveProfile?.id ?? null : null) ??
    null;
  const { starRatings: myFirmRatingJson } = useLatestMyVcRating(
    session?.user?.id,
    reviewVcFirmId,
    null,
    ratingRefresh,
    displayName,
  );
  const myFirmRateDisplay = useMemo(
    () => formatMyReviewRateButton(myFirmRatingJson),
    [myFirmRatingJson],
  );

  const mergedPartners = useMemo((): VCPerson[] => {
    const firmKey = databaseFirmId ?? vcFirm?.id ?? "";
    const byName = new Map<string, VCPerson>();

    for (const p of liveProfile?.partners ?? []) {
      byName.set(
        p.full_name.toLowerCase().trim(),
        investorPartnerToVCPerson(p, firmKey || p.id)
      );
    }
    for (const p of vcPartners) {
      const k = p.full_name.toLowerCase().trim();
      if (!byName.has(k)) byName.set(k, p);
    }
    if (byName.size === 0 && effectiveInvestor?.name) {
      for (const p of getPartnersForFirm(effectiveInvestor.name)) {
        const k = p.full_name.toLowerCase().trim();
        if (!byName.has(k)) byName.set(k, partnerPersonToVCPerson(p, firmKey || vcFirm?.id || p.id));
      }
    }
    return Array.from(byName.values());
  }, [
    liveProfile?.partners,
    liveProfile?.id,
    vcPartners,
    databaseFirmId,
    vcFirm?.id,
    effectiveInvestor?.name,
    resolvedFirmId,
  ]);

  const partnerNamesLower = useMemo(
    () => new Set(mergedPartners.map((p) => p.full_name.toLowerCase().trim())),
    [mergedPartners]
  );

  useEffect(() => {
    if (!displayName) { setEnrichedData(null); return; }
    const key = displayName.toLowerCase().trim();
    if (enrichCache[key]) { setEnrichedData(enrichCache[key]); return; }
    let cancelled = false;
    enrich(displayName).then(result => { if (!cancelled) setEnrichedData(result); });
    return () => { cancelled = true; };
  }, [displayName]);

  // Track 'viewed' interaction for collaborative filtering
  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!displayName || !session?.user?.id) return;
    // Only track once per panel open (avoid re-tracking on re-renders)
    if (viewedRef.current === displayName) return;
    viewedRef.current = displayName;

    (async () => {
      // Use live profile ID if available, else resolve by name
      let firmId = liveProfile?.id;
      if (!firmId) {
        const { data: firms } = await supabase
          .from("investor_database")
          .select("id")
          .ilike("firm_name", displayName.trim())
          .limit(1);
        firmId = firms?.[0]?.id;
      }
      if (!firmId) return;
      setResolvedFirmId(firmId);

      // Upsert a 'viewed' interaction (idempotent per founder+firm+action)
      await supabase
        .from("founder_vc_interactions")
        .upsert(
          { founder_id: session.user.id, firm_id: firmId, action_type: "viewed" },
          { onConflict: "founder_id,firm_id,action_type" }
        );
    })();
  }, [displayName, session?.user?.id]);

  // Reset viewed ref when panel closes
  useEffect(() => {
    if (!effectiveInvestor) viewedRef.current = null;
  }, [effectiveInvestor]);

  const investorContext = useMemo(() => {
    if (!effectiveInvestor) return null;
    const ep = enrichedData?.profile;
    return {
      name: effectiveInvestor.name,
      description: effectiveInvestor.description,
      stage: ep?.stage || effectiveInvestor.stage,
      sector: effectiveInvestor.sector,
      checkSize: ep?.typicalCheckSize || effectiveInvestor.model,
      recentDeals: ep?.recentDeals?.join(", ") || "",
      currentThesis: ep?.currentThesis || "",
      geography: ep?.geography || "",
      source: ep?.source || "",
    };
  }, [effectiveInvestor, enrichedData]);

  // Prefer live profile data, fallback to vcFirm/effectiveInvestor
  const heroName = liveProfile?.firm_name ?? effectiveInvestor?.name ?? "";
  const heroLogo = liveProfile?.logo_url ?? effectiveInvestor?.logo_url ?? null;
  const heroInitial = heroName.charAt(0).toUpperCase() || "?";
  const heroAum = liveProfile?.aum ?? vcFirm?.aum ?? "$85B";
  const heroLocation = liveProfile?.location ?? effectiveInvestor?.location ?? null;
  const heroPartnerCount = mergedPartners.length > 0 ? mergedPartners.length : null;
  const heroDataSource: "live" | "verified" = liveProfile?.source === "live" ? "live" : enrichedData ? "live" : "verified";
  const heroLastSynced = liveProfile?.last_enriched_at
    ? new Date(liveProfile.last_enriched_at)
    : enrichedData?.profile?.lastVerified
      ? new Date(enrichedData.profile.lastVerified)
      : null;

  const heroTagline = (liveProfile?.description ?? effectiveInvestor?.description ?? "").split(".")[0].trim() || null;

  const metaFacts = [
    { label: "AUM", value: heroAum },
    { label: "Sweet Spot", value: vcFirm?.sweet_spot || effectiveInvestor?.model || "$1M–$10M" },
    { label: "Team", value: heroPartnerCount ? String(heroPartnerCount) : "—" },
  ];

  const handleClose = () => {
    onClose();
    onCloseVCFirm?.();
  };

  return (
    <AnimatePresence>
      {effectiveInvestor && (
        <>
          <motion.div
            key="investor-backdrop"
            className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm supports-[backdrop-filter]:bg-foreground/15"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              key="investor-modal"
              className="pointer-events-auto max-w-6xl w-full bg-card rounded-3xl shadow-2xl border border-border/50 overflow-hidden relative max-h-[85vh] flex flex-col"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            >
              {/* Header */}
              <div className="shrink-0 border-b border-border/40 relative overflow-hidden">
                {/* Mesh gradient substrate — gives glass tiles something to bleed through */}
                <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
                  <div className="absolute -top-16 -left-16 w-72 h-72 rounded-full bg-violet-500/[0.07] blur-3xl" />
                  <div className="absolute -top-8 left-1/3 w-56 h-56 rounded-full bg-sky-500/[0.07] blur-3xl" />
                  <div className="absolute -top-8 right-0 w-64 h-64 rounded-full bg-emerald-500/[0.06] blur-3xl" />
                </div>
                {/* Identity + Actions row */}
                <div className="relative z-10 flex items-start justify-between gap-8 px-8 pt-6 pb-5">

                  {/* Left: Identity block */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    {liveLoading ? (
                      <Skeleton className="h-11 w-11 rounded-xl shrink-0 mt-0.5" />
                    ) : (
                      <FirmLogo
                        firmName={heroName}
                        logoUrl={heroLogo}
                        websiteUrl={liveProfile?.website_url ?? null}
                        size="lg"
                        className="h-11 w-11 shrink-0 mt-0.5 ring-1 ring-border/20"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      {liveLoading ? (
                        <>
                          <Skeleton className="h-[26px] w-44 rounded mb-1.5" />
                          <Skeleton className="h-3.5 w-60 rounded mb-3" />
                          <div className="flex gap-3">
                            <Skeleton className="h-3.5 w-14 rounded" />
                            <Skeleton className="h-3.5 w-10 rounded" />
                            <Skeleton className="h-3.5 w-20 rounded" />
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Name + verified */}
                          <div className="flex items-center gap-1.5 mb-1">
                            <h2 className="text-[21px] font-semibold tracking-[-0.4px] text-foreground truncate leading-tight">
                              {heroName}
                            </h2>
                            <CheckCircle2 className="h-[15px] w-[15px] shrink-0 text-accent fill-accent/15 mb-0.5" />
                          </div>

                          {/* Tagline */}
                          {heroTagline && (
                            <p className="text-[12px] text-muted-foreground/60 leading-snug mb-2.5 truncate max-w-sm">
                              {heroTagline}
                            </p>
                          )}

                          {/* Meta — inline dots, no pill background */}
                          <div className={cn("flex items-center gap-2 text-[11.5px]", !heroTagline && "mt-2")}>
                            {heroAum && (
                              <span className="flex items-center gap-1 text-foreground/70">
                                <Landmark className="w-[11px] h-[11px] opacity-40 shrink-0" />
                                <span className="font-medium">{heroAum}</span>
                              </span>
                            )}
                            {heroAum && (heroPartnerCount != null || heroLocation) && (
                              <span className="text-border/50 select-none">·</span>
                            )}
                            {heroPartnerCount != null && (
                              <span className="flex items-center gap-1 text-foreground/70">
                                <Users className="w-[11px] h-[11px] opacity-40 shrink-0" />
                                <span className="font-medium">{heroPartnerCount} partners</span>
                              </span>
                            )}
                            {heroPartnerCount != null && heroLocation && (
                              <span className="text-border/50 select-none">·</span>
                            )}
                            {heroLocation && (
                              <span className="flex items-center gap-1 text-foreground/70">
                                <MapPin className="w-[11px] h-[11px] opacity-40 shrink-0" />
                                <span className="font-medium">{heroLocation}</span>
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-col items-end gap-2.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      {/* Rate */}
                      {myFirmRateDisplay ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setActiveTab("Feedback"); }}
                          className={cn(
                            "inline-flex flex-col items-center justify-center rounded-xl px-3 py-1.5 leading-none transition-colors",
                            myFirmRateDisplay.className,
                          )}
                          aria-label={`Your rating: ${myFirmRateDisplay.label}. ${myFirmRateDisplay.ariaDetail}. Click to view your review.`}
                        >
                          <span className="text-[9px] font-semibold opacity-50 mb-0.5 uppercase tracking-widest">Your rating</span>
                          <span className="text-[13px] font-bold">{myFirmRateDisplay.label}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setReviewOpen(true); }}
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-[9px] text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                          aria-label="Rate this firm"
                        >
                          <Star className="h-3.5 w-3.5 shrink-0" />
                          Rate
                        </button>
                      )}
                      {/* Track — primary */}
                      <button className="inline-flex items-center gap-1.5 rounded-xl bg-foreground text-background px-4 py-[9px] text-[13px] font-semibold hover:bg-foreground/90 transition-colors shadow-sm">
                        <BookmarkPlus className="h-3.5 w-3.5 shrink-0" />
                        Track
                      </button>
                      {/* Close */}
                      <button
                        onClick={handleClose}
                        className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-secondary/60 transition-colors ml-0.5"
                      >
                        <X className="h-[14px] w-[14px]" />
                      </button>
                    </div>
                    <DataProvenanceBadge
                      dataSource={heroDataSource}
                      lastSynced={heroLastSynced}
                    />
                  </div>
                </div>

                {/* Score strip */}
                <div className="relative z-10 px-8 pb-5">
                  <ScoreTilesRow
                    matchScore={matchScore}
                    firmName={heroName}
                    companyContext={companyData}
                    investorContext={investorContext}
                  />
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-8 py-6 space-y-5">
                  {/* Tabs */}
                  <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-secondary/35 p-1 shadow-sm backdrop-blur-sm">
                    {INVESTOR_TABS.map((tab) => {
                      const isActive = activeTab === tab;
                      return (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] transition-all duration-200 ${
                            isActive
                              ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                              : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
                          }`}
                        >
                          {tab}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tab Content */}
                  <AnimatePresence mode="wait">
                    {activeTab === "Updates" && (
                      <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="space-y-5">
                        <InvestorActivity firmName={effectiveInvestor.name} firmId={databaseFirmId ?? vcFirm?.id ?? undefined} />
                      </motion.div>
                    )}

                    {activeTab === "Activity" && (
                      <motion.div key="activity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                        <ActivityDashboard firmName={effectiveInvestor.name} companySector={companyData?.sector || undefined} />
                      </motion.div>
                    )}

                    {activeTab === "Investment Thesis" && (
                      <ThesisTabContent
                        vcFirm={vcFirm}
                        effectiveInvestor={effectiveInvestor}
                        companyData={companyData}
                        enrichedData={enrichedData}
                        displayName={displayName}
                      />
                    
                    )}

                    {activeTab === "Portfolio" && (
                      <motion.div key="portfolio" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="space-y-5">
                        <PortfolioTab
                          companySector={companyData?.sector || effectiveInvestor.sector}
                          firmDeals={liveProfile?.source === "live" ? liveProfile.deals : undefined}
                          portfolioLoading={liveLoading && !liveProfile}
                          leadPartnerName={liveProfile?.lead_partner}
                          partnerNamesLower={partnerNamesLower}
                          onInvestorClick={(name) => {
                            const match = mergedPartners.find(
                              (p) => p.full_name.toLowerCase() === name.toLowerCase()
                            );
                            if (match && onSelectPerson) onSelectPerson(match);
                          }}
                        />
                      </motion.div>
                    )}

                    {activeTab === "Investors" && (
                      <motion.div key="partners" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                        <InvestorPartnersTab
                          firmId={databaseFirmId ?? vcFirm?.id ?? ""}
                          firmName={effectiveInvestor.name}
                          partners={mergedPartners}
                          onSelectPerson={onSelectPerson}
                        />
                      </motion.div>
                    )}

                    {activeTab === "Feedback" && (
                      <motion.div key="feedback" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                        <FeedbackTab
                          investorName={effectiveInvestor.name}
                          vcFirmId={reviewVcFirmId}
                          userId={session?.user?.id}
                          onLogInteraction={() => setReviewOpen(true)}
                          onEditReview={() => setReviewOpen(true)}
                        />
                      </motion.div>
                    )}

                    {activeTab === "Connect" && (
                      <motion.div key="connections" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                        <ConnectionsTab
                          investorName={effectiveInvestor.name}
                          currentUserId={session?.user?.id}
                          investorId={databaseFirmId || null}
                          isAdmin={isAdmin}
                          location={heroLocation || null}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
      <ReviewSubmissionModal
        key="review-modal"
        open={reviewOpen}
        onClose={() => {
          setReviewOpen(false);
          setRatingRefresh((n) => n + 1);
        }}
        firmName={heroName}
        firmLogoUrl={heroLogo}
        firmWebsiteUrl={
          liveProfile?.website_url ?? vcFirm?.website_url ?? investor?.websiteUrl ?? null
        }
        vcFirmId={reviewVcFirmId}
        investorIsMappedToProfile={investorIsMappedToProfile}
        mappingRecordId={mappingRecordId}
      />
    </AnimatePresence>
  );
}
