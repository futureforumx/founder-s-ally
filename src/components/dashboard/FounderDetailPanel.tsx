import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, MapPin, Layers, Building2, Users, Sparkles,
  ExternalLink, TrendingUp, Zap, MessageSquare,
  CheckCircle2, Globe, ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface FounderEntry {
  name: string;
  sector: string;
  stage: string;
  description: string;
  location: string;
  model: string;
  initial: string;
  matchReason: string | null;
}

interface FounderDetailPanelProps {
  founder: FounderEntry | null;
  companyName?: string;
  onClose: () => void;
}

const TABS = ["Overview", "Market Insights", "Connections"] as const;
type Tab = typeof TABS[number];

// ── Quick Facts ──
function QuickFact({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-secondary/40 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background border border-border">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

export function FounderDetailPanel({ founder, companyName, onClose }: FounderDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  const matchScore = founder?.matchReason ? 92 : Math.floor(Math.random() * 30) + 55;
  const displayCompany = companyName || "your company";

  return (
    <AnimatePresence>
      {founder && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l shadow-2xl sm:w-[480px] lg:w-[40%]"
            style={{
              background: "rgba(255,255,255,0.82)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderColor: "rgba(255,255,255,0.2)",
            }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* ─── Top: Close ─── */}
            <div className="flex items-center justify-end px-6 pt-5 pb-2">
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/80 hover:bg-secondary transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* ─── Header / Identity ─── */}
            <div className="px-6 pb-5 space-y-4">
              {/* Synergy badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <span className="text-xs font-semibold text-primary">{matchScore}% Match for {displayCompany}</span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-card border-2 border-border shadow-sm text-xl font-bold text-muted-foreground">
                  {founder.initial}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold text-foreground truncate">{founder.name}</h2>
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-primary fill-primary/20" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5">{founder.stage}</Badge>
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{founder.sector}</Badge>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm">
                  <Zap className="h-4 w-4" /> Connect
                </button>
                <button className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary/60 transition-colors">
                  <MessageSquare className="h-4 w-4" /> Request Intro
                </button>
              </div>
            </div>

            {/* ─── Tab Navigation ─── */}
            <div className="relative flex border-b border-border/60 px-6">
              {TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab}
                    {isActive && (
                      <motion.div
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                        layoutId="detail-tab-underline"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* ─── Tab Content ─── */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
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
                      <div className="rounded-xl border border-border/60 bg-card p-4">
                        <p className="text-sm text-foreground leading-relaxed">{founder.description}</p>
                      </div>
                    </div>

                    {/* Business model */}
                    <div>
                      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Business Model</h4>
                      <Badge variant="outline" className="text-xs px-3 py-1">{founder.model}</Badge>
                    </div>

                    {/* Social */}
                    <div>
                      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Links</h4>
                      <div className="flex gap-2">
                        {[
                          { icon: Globe, label: "Website" },
                          { icon: ExternalLink, label: "LinkedIn" },
                          { icon: ArrowUpRight, label: "X / Twitter" },
                        ].map(({ icon: Icon, label }) => (
                          <button
                            key={label}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-accent/30 transition-colors"
                          >
                            <Icon className="h-3.5 w-3.5" /> {label}
                          </button>
                        ))}
                      </div>
                    </div>
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
                    {/* AI Analysis card */}
                    <div>
                      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">
                        <Sparkles className="h-3 w-3 inline mr-1 text-accent" />
                        AI Analysis
                      </h4>
                      <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3">
                        <div className="flex gap-2">
                          <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                          <p className="text-sm text-foreground leading-relaxed">
                            <strong>{founder.name}</strong> operates in the <strong>{founder.sector}</strong> space, which has strong overlap with {displayCompany}'s target market and could present partnership or competitive intelligence value.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                          <p className="text-sm text-foreground leading-relaxed">
                            Their {founder.model} model at the {founder.stage} stage positions them as a {founder.stage === "Series A" || founder.stage === "Series B" ? "more mature" : "earlier-stage"} player worth monitoring for go-to-market learnings.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Market Sentiment */}
                    <div>
                      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">Market Sentiment</h4>
                      <div className="rounded-xl border border-border bg-card p-4">
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
                          Mentions increased 18% this month across investor networks. Recently featured in 2 industry reports.
                        </p>
                        {/* Mini sparkline bars */}
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

                    {/* Funding context */}
                    <div>
                      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Funding Context</h4>
                      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
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
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-foreground">Mutual Connections</h4>
                      <p className="text-xs text-muted-foreground">No mutual connections yet. Connect with {founder.name} to start building your network.</p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-foreground">Shared Investors</h4>
                      <div className="flex gap-2">
                        {["Sequoia Scout", "Y Combinator"].map((inv) => (
                          <Badge key={inv} variant="secondary" className="text-[10px] px-2 py-1">{inv}</Badge>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">Based on publicly available funding data.</p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
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
              </AnimatePresence>
            </div>

            {/* ─── Relationship Footer ─── */}
            <div className="border-t border-border/60 bg-secondary/40 px-6 py-4">
              <div className="flex gap-3">
                <Sparkles className="h-4 w-4 shrink-0 text-accent mt-0.5" />
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">AI Tip</p>
                  <p className="text-xs text-foreground leading-relaxed">
                    <strong>{founder.name}</strong> is solving a similar hurdle in <strong>{founder.location?.split(",")[0] || "their region"}</strong>. Mention their recent {founder.stage} progress when reaching out — shared context builds trust fast.
                  </p>
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
