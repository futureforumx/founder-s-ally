import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Sparkles, Zap, MessageSquare, CheckCircle2,
  TrendingUp, ArrowUpRight, Building2, Briefcase, Globe, Activity, MapPin, Users, Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InvestorActivity } from "./investor-detail/InvestorActivity";
import { StageTimeline } from "./investor-detail/StageTimeline";
import { DealDynamics } from "./investor-detail/DealDynamics";
import { GeographicFocus } from "./investor-detail/GeographicFocus";
import { SectorAlignment } from "./investor-detail/SectorAlignment";
import { InvestorAIInsightBanner } from "./investor-detail/InvestorAIInsight";
import { InvestorPartnersTab } from "./investor-detail/InvestorPartnersTab";
import { ConnectionsTab } from "./investor-detail/ConnectionsTab";
import { INVESTOR_TABS, type InvestorTab, type InvestorEntry } from "./investor-detail/types";
import { useInvestorEnrich, type EnrichResult } from "@/hooks/useInvestorEnrich";
import { DataProvenanceBadge } from "./investor-detail/DataProvenanceBadge";
import type { VCFirm, VCPerson } from "@/hooks/useVCDirectory";

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
}

export type { InvestorEntry };

export function InvestorDetailPanel({ investor, companyName, companyData, onClose, vcFirm, vcPartners = [], onSelectPerson, onCloseVCFirm }: InvestorDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<InvestorTab>("Updates");
  const { session } = useAuth();
  const { enrich, cache: enrichCache } = useInvestorEnrich();
  const [enrichedData, setEnrichedData] = useState<EnrichResult | null>(null);

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
    };
  }, [investor, vcFirm]);

  const matchScore = effectiveInvestor?.matchReason ? 92 : Math.floor(Math.random() * 30) + 55;

  const displayName = effectiveInvestor?.name || "";

  useEffect(() => {
    if (!displayName) { setEnrichedData(null); return; }
    const key = displayName.toLowerCase().trim();
    if (enrichCache[key]) { setEnrichedData(enrichCache[key]); return; }
    let cancelled = false;
    enrich(displayName).then(result => { if (!cancelled) setEnrichedData(result); });
    return () => { cancelled = true; };
  }, [displayName]);

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

  const metaFacts = [
    { label: "AUM", value: vcFirm?.aum || "$85B" },
    { label: "Sweet Spot", value: vcFirm?.sweet_spot || effectiveInvestor?.model || "$1M–$10M" },
    { label: "Team", value: vcPartners.length > 0 ? String(vcPartners.length) : "—" },
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
            className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm supports-[backdrop-filter]:bg-foreground/15"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto max-w-6xl w-full bg-card rounded-3xl shadow-2xl border border-border/50 overflow-hidden relative max-h-[85vh] flex flex-col"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            >
              {/* Header */}
              <div className="px-8 pt-6 pb-5 border-b border-border shrink-0">
                <div className="flex justify-end mb-3">
                  <DataProvenanceBadge
                    dataSource={enrichedData ? "live" : "verified"}
                    lastSynced={enrichedData ? new Date(enrichedData.profile.lastVerified) : null}
                  />
                </div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary border border-border text-xl font-bold text-muted-foreground shrink-0">
                      {effectiveInvestor.initial}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-2xl font-bold text-foreground truncate">{effectiveInvestor.name}</h2>
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-accent fill-accent/20" />
                        {/* Match Score Badge */}
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-success/10 border border-success/20 text-success rounded-full text-sm font-bold tracking-tight shadow-sm shrink-0">
                          <Sparkles className="w-3 h-3" />
                          {matchScore}% Match
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5">{effectiveInvestor.stage}</Badge>
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{effectiveInvestor.sector}</Badge>
                        <Badge className="text-[9px] px-2 py-0.5 bg-success/10 text-success border-success/20">
                          <Briefcase className="h-2.5 w-2.5 mr-0.5" /> Capital Deployer
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-2.5 text-xs font-medium text-muted-foreground">
                        {metaFacts.map((fact, i) => (
                          <span key={fact.label} className="flex items-center gap-1">
                            {i > 0 && <span className="text-border mr-3">•</span>}
                            <span className="text-muted-foreground/70">{fact.label}:</span>
                            <span className="text-foreground">{fact.value}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <button className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors shadow-sm">
                      <Zap className="h-4 w-4" /> Connect
                    </button>
                    <button className="inline-flex items-center gap-2 rounded-xl border-2 border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary/60 transition-colors">
                      <MessageSquare className="h-4 w-4" /> Request Intro
                    </button>
                    <button
                      onClick={handleClose}
                      className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary/60 transition-colors ml-1"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-8 py-6 space-y-5">
                  {/* AI Compatibility Banner */}
                  <InvestorAIInsightBanner
                    firmName={effectiveInvestor.name}
                    matchScore={matchScore}
                    companyContext={companyData}
                    investorContext={investorContext}
                  />

                  {/* Tabs */}
                  <div className="inline-flex bg-secondary/60 p-1 rounded-lg">
                    {INVESTOR_TABS.map((tab) => {
                      const isActive = activeTab === tab;
                      return (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`relative px-3.5 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                            isActive
                              ? "bg-card text-foreground shadow-surface"
                              : "text-muted-foreground hover:text-foreground"
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
                        <InvestorActivity firmName={effectiveInvestor.name} />
                      </motion.div>
                    )}

                    {activeTab === "Activity" && (
                      <motion.div key="activity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="space-y-5">
                        <div className="rounded-xl border border-success/20 bg-success/5 p-5 space-y-2">
                          <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-success animate-pulse" />
                            <span className="text-sm font-semibold text-foreground">Actively Deploying</span>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            Recently closed $1.5B Fund III (Jan 2026). Making 2–3 Seed investments per month.
                          </p>
                        </div>
                        <div className="rounded-xl bg-secondary/30 border border-border p-5">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-success" />
                              <span className="text-sm font-semibold text-foreground">Deal Flow</span>
                            </div>
                            <Badge className="text-[9px] px-2 py-0.5 bg-success/10 text-success border-success/20">
                              +24% QoQ
                            </Badge>
                          </div>
                          <div className="flex items-end gap-1 h-24">
                            {[4, 6, 5, 8, 7, 10, 12, 9, 13, 15, 14, 18].map((v, i) => (
                              <div
                                key={i}
                                className="flex-1 rounded-sm bg-success/30 hover:bg-success/50 transition-colors"
                                style={{ height: `${(v / 18) * 100}%` }}
                              />
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-2">
                            Activity across focus verticals (12 months)
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {activeTab === "Investment Thesis" && (
                      <motion.div key="thesis" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="space-y-6">
                        <StageTimeline />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <DealDynamics />
                          <SectorAlignment
                            vcSectors={vcFirm?.sectors || effectiveInvestor.sector.split(", ").map(s => s.trim())}
                            primarySector={companyData?.sector}
                            secondarySectors={(companyData as any)?.subsectors || []}
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <GeographicFocus />
                        </div>
                      </motion.div>
                    )}

                    {activeTab === "Portfolio" && (
                      <motion.div key="portfolio" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="space-y-5">
                        <div>
                          <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">Recent Investments</h4>
                          <div className="space-y-2">
                            {[
                              { name: "NovaBuild", stage: "Seed", sector: "PropTech", amount: "$4M" },
                              { name: "Synthara Bio", stage: "Series A", sector: "Biotech", amount: "$12M" },
                              { name: "GridShift Energy", stage: "Series A", sector: "Climate", amount: "$8M" },
                              { name: "CodeVault", stage: "Pre-Seed", sector: "DevTools", amount: "$1.5M" },
                            ].map((co) => (
                              <div key={co.name} className="flex items-center justify-between rounded-xl border border-border bg-card p-3 hover:border-accent/20 transition-colors">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary border border-border text-sm font-bold text-muted-foreground">
                                    {co.name.charAt(0)}
                                  </div>
                                  <div>
                                    <span className="text-sm font-medium text-foreground">{co.name}</span>
                                    <div className="flex gap-1.5 mt-0.5">
                                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">{co.stage}</Badge>
                                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{co.sector}</Badge>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-foreground">{co.amount}</span>
                                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Portfolio Stats</h4>
                          <div className="rounded-xl bg-secondary/30 p-4 space-y-2">
                            {[
                              { label: "Active Portfolio", value: "87 companies" },
                              { label: "Exits (Last 3yr)", value: "12 (4 IPOs, 8 M&A)" },
                              { label: "Follow-on Rate", value: "78%" },
                            ].map((row) => (
                              <div key={row.label} className="flex items-center justify-between">
                                <span className="text-sm text-foreground font-medium">{row.label}</span>
                                <span className="text-sm text-muted-foreground">{row.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {activeTab === "Investors" && (
                      <motion.div key="partners" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                        <InvestorPartnersTab firmId={vcFirm?.id || ""} firmName={effectiveInvestor.name} partners={vcPartners} onSelectPerson={onSelectPerson} />
                      </motion.div>
                    )}

                    {activeTab === "Connections" && (
                      <motion.div key="connections" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                        <ConnectionsTab investorName={effectiveInvestor.name} currentUserId={session?.user?.id} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
