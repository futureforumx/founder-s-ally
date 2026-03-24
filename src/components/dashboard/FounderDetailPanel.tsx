import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, MapPin, Layers, Building2, Users, Sparkles,
  TrendingUp, Zap, MessageSquare, CheckCircle2, ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { QuickFact } from "./founder-detail/QuickFact";
import { StatusIndicator } from "./founder-detail/StatusIndicator";
import { LatestActivity } from "./founder-detail/LatestActivity";
import { SocialIcons } from "./founder-detail/SocialIcons";
import { InvestorsTab } from "./founder-detail/InvestorsTab";
import { AIInsightBanner } from "./founder-detail/AIInsightBanner";
import { TABS, type Tab, type FounderEntry } from "./founder-detail/types";

interface FounderDetailPanelProps {
  founder: FounderEntry | null;
  companyName?: string;
  onClose: () => void;
  isOwner?: boolean;
}

export type { FounderEntry };

export function FounderDetailPanel({ founder, companyName, onClose, isOwner = false }: FounderDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  const matchScore = founder?.matchReason ? 92 : Math.floor(Math.random() * 30) + 55;
  const displayCompany = companyName || "your company";

  return (
    <AnimatePresence>
      {founder && (
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

          {/* Centered Floating Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto max-w-2xl w-full bg-card rounded-3xl shadow-2xl border border-border/50 overflow-hidden relative max-h-[90vh] flex flex-col"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            >
              {/* ─── Hero Banner ─── */}
              <div className="relative h-28 w-full shrink-0" style={{ background: "linear-gradient(135deg, hsl(var(--secondary)), hsl(var(--accent) / 0.08))" }}>
                {/* Match Badge */}
                <div className="absolute top-4 left-6">
                  <div className="inline-flex items-center gap-2 rounded-full bg-card/80 backdrop-blur-md border border-border/40 px-3 py-1.5 shadow-sm">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                    </span>
                    <span className="text-xs font-semibold text-accent">{matchScore}% Match</span>
                  </div>
                </div>

                {/* Close Button */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-card/50 hover:bg-card/80 transition-colors backdrop-blur-sm"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>

                {/* Logo overlapping banner */}
                <div className="absolute -bottom-6 left-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-card border-4 border-card shadow-surface text-xl font-bold text-muted-foreground">
                  {founder.initial}
                </div>
              </div>

              {/* ─── Header Content ─── */}
              <div className="px-6 pt-10 pb-4 shrink-0">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-bold text-foreground truncate">{founder.name}</h2>
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-accent fill-accent/20" />
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5">{founder.stage}</Badge>
                      <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{founder.sector}</Badge>
                      <StatusIndicator isOwner={isOwner} />
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

              {/* ─── AI Insight ─── */}
              <div className="mx-6 mb-4 shrink-0" style={{ background: "linear-gradient(135deg, hsl(var(--accent) / 0.06), hsl(var(--accent) / 0.03))" }}>
                <div className="rounded-xl p-4">
                  <AIInsightBanner founder={founder} displayCompany={displayCompany} />
                </div>
              </div>

              {/* ─── Pill Tabs ─── */}
              <div className="mx-6 mb-4 shrink-0">
                <div className="inline-flex bg-secondary/60 p-1 rounded-lg">
                  {TABS.map((tab) => {
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

              {/* ─── Tab Content (scrollable) ─── */}
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
                      {/* Latest Activity */}
                      <LatestActivity companyName={founder.name} />

                      {/* Quick facts grid */}
                      <div>
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">Quick Facts</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <QuickFact icon={MapPin} label="Location" value={founder.location || "—"} />
                          <QuickFact icon={Layers} label="Stage" value={founder.stage} />
                          <QuickFact icon={Building2} label="Sector" value={founder.sector} />
                          <QuickFact icon={Users} label="Team Size" value={`${Math.floor(Math.random() * 40) + 5} people`} />
                        </div>
                      </div>

                      {/* UVP */}
                      <div>
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                          <Sparkles className="h-3 w-3 inline mr-1 text-accent" />
                          Unique Value Proposition
                        </h4>
                        <div className="rounded-xl bg-secondary/30 p-4">
                          <p className="text-sm text-foreground leading-relaxed">{founder.description}</p>
                        </div>
                      </div>

                      {/* Business model */}
                      <div>
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Business Model</h4>
                        <Badge variant="outline" className="text-xs px-3 py-1">{founder.model}</Badge>
                      </div>

                      {/* Social Icons */}
                      <SocialIcons />
                    </motion.div>
                  )}

                  {activeTab === "Market Insights" && (
                    <motion.div
                      key="insights"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-5"
                    >
                      <div>
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">
                          <Sparkles className="h-3 w-3 inline mr-1 text-accent" />
                          AI Analysis
                        </h4>
                        <div className="rounded-xl bg-accent/5 p-4 space-y-3">
                          <div className="flex gap-2">
                            <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                            <p className="text-sm text-foreground leading-relaxed">
                              <strong>{founder.name}</strong> operates in the <strong>{founder.sector}</strong> space, which has strong overlap with {displayCompany}'s target market.
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                            <p className="text-sm text-foreground leading-relaxed">
                              Their {founder.model} model at the {founder.stage} stage positions them as a {founder.stage === "Series A" || founder.stage === "Series B" ? "more mature" : "earlier-stage"} player worth monitoring.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">Market Sentiment</h4>
                        <div className="rounded-xl bg-secondary/30 p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-success" />
                              <span className="text-sm font-semibold text-foreground">Trending Up</span>
                            </div>
                            <Badge className="text-[9px] px-2 py-0.5 bg-success/10 text-success border-success/20">
                              +18% activity
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Mentions increased 18% this month across investor networks.
                          </p>
                          <div className="flex items-end gap-1 mt-3 h-8">
                            {[3, 5, 4, 7, 6, 8, 9, 7, 10, 12, 11, 14].map((v, i) => (
                              <div
                                key={i}
                                className="flex-1 rounded-sm bg-success/30"
                                style={{ height: `${(v / 14) * 100}%` }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Funding Context</h4>
                        <div className="rounded-xl bg-secondary/30 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground font-medium">Current Stage</span>
                            <Badge variant="outline" className="text-[10px]">{founder.stage}</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground font-medium">Location</span>
                            <span className="text-sm text-muted-foreground">{founder.location}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "Connections" && (
                    <motion.div
                      key="connections"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-5"
                    >
                      <div className="rounded-xl bg-secondary/30 p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-foreground">Mutual Connections</h4>
                        <p className="text-xs text-muted-foreground">No mutual connections yet. Connect with {founder.name} to start building your network.</p>
                      </div>
                      <div className="rounded-xl bg-secondary/30 p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-foreground">Shared Investors</h4>
                        <p className="text-xs text-muted-foreground">
                          Shared investors are computed from your cap table. Add investors in your Company Profile to see overlap.
                        </p>
                      </div>
                      <div className="rounded-xl bg-secondary/30 p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-foreground">Similar Companies</h4>
                        <div className="space-y-2">
                          {["NovaBuild", "ClearPath Logistics"].map((name) => (
                            <div key={name} className="flex items-center justify-between">
                              <span className="text-sm text-foreground">{name}</span>
                              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "Investors" && (
                    <motion.div
                      key="investors"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <InvestorsTab />
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
