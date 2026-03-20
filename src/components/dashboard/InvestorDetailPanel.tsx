import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Sparkles, Zap, MessageSquare, CheckCircle2,
  TrendingUp, ArrowUpRight, Building2, Briefcase, Globe,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusIndicator } from "./founder-detail/StatusIndicator";
import { InvestorQuickFacts } from "./investor-detail/InvestorQuickFacts";
import { InvestorActivity } from "./investor-detail/InvestorActivity";
import { InvestorAIInsight } from "./investor-detail/InvestorAIInsight";
import { InvestorPartnersTab } from "./investor-detail/InvestorPartnersTab";
import { INVESTOR_TABS, type InvestorTab, type InvestorEntry } from "./investor-detail/types";

interface InvestorDetailPanelProps {
  investor: InvestorEntry | null;
  companyName?: string;
  onClose: () => void;
}

export type { InvestorEntry };

export function InvestorDetailPanel({ investor, companyName, onClose }: InvestorDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<InvestorTab>("Overview");

  const matchScore = investor?.matchReason ? 92 : Math.floor(Math.random() * 30) + 55;

  return (
    <AnimatePresence>
      {investor && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm supports-[backdrop-filter]:bg-foreground/15"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto max-w-2xl w-full bg-card rounded-3xl shadow-2xl border border-border/50 overflow-hidden relative max-h-[90vh] flex flex-col"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            >
              {/* ─── Hero Banner ─── */}
              <div
                className="relative h-28 w-full shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(45 80% 55% / 0.12), hsl(160 60% 45% / 0.10), hsl(var(--secondary)))" }}
              >
                {/* Match Badge */}
                <div className="absolute top-4 left-6">
                  <div className="inline-flex items-center gap-2 rounded-full bg-card/80 backdrop-blur-md border border-border/40 px-3 py-1.5 shadow-sm">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full" style={{ backgroundColor: "hsl(160 60% 45% / 0.6)" }} />
                      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: "hsl(160 60% 45%)" }} />
                    </span>
                    <span className="text-xs font-semibold" style={{ color: "hsl(160 60% 40%)" }}>{matchScore}% Match</span>
                  </div>
                </div>

                {/* Close */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-card/50 hover:bg-card/80 transition-colors backdrop-blur-sm"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>

                {/* Logo */}
                <div className="absolute -bottom-6 left-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-card border-4 border-card shadow-surface text-xl font-bold text-muted-foreground">
                  {investor.initial}
                </div>
              </div>

              {/* ─── Header ─── */}
              <div className="px-6 pt-10 pb-4 shrink-0">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-bold text-foreground truncate">{investor.name}</h2>
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-accent fill-accent/20" />
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5">{investor.stage}</Badge>
                      <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{investor.sector}</Badge>
                      <Badge className="text-[9px] px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        <Briefcase className="h-2.5 w-2.5 mr-0.5" /> Capital Deployer
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-4">
                    <button className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors shadow-sm">
                      <Zap className="h-4 w-4" /> Connect
                    </button>
                    <button className="inline-flex items-center gap-2 rounded-xl border-2 border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary/60 transition-colors">
                      <MessageSquare className="h-4 w-4" /> Request Intro
                    </button>
                  </div>
                </div>
              </div>

              {/* ─── AI Insight (gold/emerald) ─── */}
              <div className="mx-6 mb-4 shrink-0">
                <InvestorAIInsight firmName={investor.name} />
              </div>

              {/* ─── Pill Tabs ─── */}
              <div className="mx-6 mb-4 shrink-0">
                <div className="inline-flex bg-secondary/60 p-1 rounded-lg">
                  {INVESTOR_TABS.map((tab) => {
                    const isActive = activeTab === tab;
                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`relative px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
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
              </div>

              {/* ─── Tab Content ─── */}
              <div className="flex-1 overflow-y-auto px-6 pb-6">
                <AnimatePresence mode="wait">
                  {activeTab === "Overview" && (
                    <motion.div
                      key="overview"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-5"
                    >
                      <InvestorActivity firmName={investor.name} />
                      <InvestorQuickFacts checkSize={investor.model} stageFocus={investor.stage} />

                      {/* About */}
                      <div>
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                          <Building2 className="h-3 w-3 inline mr-1 text-accent" />
                          About
                        </h4>
                        <div className="rounded-xl bg-secondary/30 p-4">
                          <p className="text-sm text-foreground leading-relaxed">{investor.description}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "Investment Thesis" && (
                    <motion.div
                      key="thesis"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-5"
                    >
                      <div>
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">
                          <Sparkles className="h-3 w-3 inline mr-1 text-accent" />
                          Thesis Summary
                        </h4>
                        <div className="rounded-xl bg-accent/5 p-4 space-y-3">
                          <div className="flex gap-2">
                            <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                            <p className="text-sm text-foreground leading-relaxed">
                              <strong>{investor.name}</strong> focuses on <strong>{investor.sector}</strong> with a conviction-driven approach, typically leading rounds at the <strong>{investor.stage}</strong> stage.
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                            <p className="text-sm text-foreground leading-relaxed">
                              They prefer founders with deep domain expertise and look for 10x market opportunities in under-penetrated verticals.
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                            <p className="text-sm text-foreground leading-relaxed">
                              Recent thesis publications emphasize Climate Tech, vertical AI, and defense/dual-use technologies.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">Sector Activity</h4>
                        <div className="rounded-xl bg-secondary/30 p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-success" />
                              <span className="text-sm font-semibold text-foreground">Deploying Actively</span>
                            </div>
                            <Badge className="text-[9px] px-2 py-0.5 bg-success/10 text-success border-success/20">
                              +24% deal flow
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Deal activity increased 24% this quarter across their focus verticals.
                          </p>
                          <div className="flex items-end gap-1 mt-3 h-8">
                            {[4, 6, 5, 8, 7, 10, 12, 9, 13, 15, 14, 18].map((v, i) => (
                              <div
                                key={i}
                                className="flex-1 rounded-sm bg-success/30"
                                style={{ height: `${(v / 18) * 100}%` }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Preferred Terms</h4>
                        <div className="rounded-xl bg-secondary/30 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground font-medium">Lead / Follow</span>
                            <Badge variant="outline" className="text-[10px]">Typically Leads</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground font-medium">Board Seat</span>
                            <span className="text-sm text-muted-foreground">Required at Series A+</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground font-medium">Pro-Rata Rights</span>
                            <span className="text-sm text-muted-foreground">Always</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "Portfolio" && (
                    <motion.div
                      key="portfolio"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-5"
                    >
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
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground font-medium">Active Portfolio</span>
                            <span className="text-sm text-muted-foreground">87 companies</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground font-medium">Exits (Last 3yr)</span>
                            <span className="text-sm text-muted-foreground">12 (4 IPOs, 8 M&A)</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground font-medium">Follow-on Rate</span>
                            <span className="text-sm text-muted-foreground">78%</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "Partners" && (
                    <motion.div
                      key="partners"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <InvestorPartnersTab firmName={investor.name} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
