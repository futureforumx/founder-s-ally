import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, MapPin, Layers, Building2, Users, Sparkles,
  TrendingUp, Zap, MessageSquare, CheckCircle2, ArrowUpRight,
  Globe, ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { QuickFact } from "./founder-detail/QuickFact";
import { StatusIndicator } from "./founder-detail/StatusIndicator";
import { LatestActivity } from "./founder-detail/LatestActivity";
import { SocialIcons } from "./founder-detail/SocialIcons";
import { InvestorsTab } from "./founder-detail/InvestorsTab";
import { JobsTab } from "./founder-detail/JobsTab";
import { useCompanyJobs } from "@/hooks/useCompanyJobs";
import { FounderInsightCard } from "./founder-detail/FounderInsightCard";
import { TABS, type Tab, type FounderEntry } from "./founder-detail/types";

function trimUrl(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function withHttps(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function websiteHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0] ?? url;
  }
}

/** Google favicons API expects a host, not a full URL with path. */
function domainForFavicon(raw: string | null | undefined): string | null {
  const t = trimUrl(raw);
  if (!t) return null;
  try {
    const u = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    return new URL(u).hostname;
  } catch {
    const host = t.replace(/^https?:\/\//i, "").split("/")[0];
    return host || null;
  }
}

interface FounderDetailPanelProps {
  founder: FounderEntry | null;
  companyName?: string;
  /** When set (directory company row), enables the Jobs tab and loads `company_jobs`. */
  organizationId?: string | null;
  onClose: () => void;
  isOwner?: boolean;
}

export type { FounderEntry };

export function FounderDetailPanel({
  founder,
  companyName,
  organizationId = null,
  onClose,
  isOwner = false,
}: FounderDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  const tabList: Tab[] = useMemo(
    () => (organizationId ? [...TABS] : TABS.filter((t) => t !== "Jobs")) as Tab[],
    [organizationId],
  );

  const jobsQuery = useCompanyJobs(organizationId);

  useEffect(() => {
    if (!tabList.includes(activeTab)) {
      setActiveTab("Overview");
    }
  }, [tabList, activeTab, founder?.name]);

  const tabLabel = (tab: Tab) => {
    if (tab === "Jobs" && organizationId && (jobsQuery.data?.jobs.length ?? 0) > 0) {
      return `Jobs (${jobsQuery.data!.jobs.length})`;
    }
    return tab;
  };

  const matchScore = founder?.matchReason ? 92 : Math.floor(Math.random() * 30) + 55;
  const displayCompany = companyName || "your company";

  const headerLinks = useMemo(() => {
    if (!founder) {
      return { websiteHref: null as string | null, websiteLabel: null as string | null, linkedinUrl: null as string | null, twitterUrl: null as string | null };
    }
    const rawSite = trimUrl(founder._websiteUrl ?? founder.companyWebsite);
    const websiteHref = rawSite ? withHttps(rawSite) : null;
    const websiteLabel = websiteHref ? websiteHostname(websiteHref) : null;
    return {
      websiteHref,
      websiteLabel,
      linkedinUrl: trimUrl(founder._linkedinUrl),
      twitterUrl: trimUrl(founder._twitterUrl),
    };
  }, [founder]);

  const orgDisplayName =
    founder?.category === "company"
      ? founder.name
      : founder?._companyName ?? founder?.companyName;

  /** Company rows use `name` as the title already — skip a duplicate “at {name}” subtitle. */
  const showAtCompanySubtitle =
    Boolean(orgDisplayName) &&
    !(founder?.category === "company" && orgDisplayName === founder.name);

  const faviconSource =
    founder?.category === "company"
      ? founder._websiteUrl ?? founder.companyWebsite
      : founder?._websiteUrl ?? founder?.companyWebsite;
  const faviconDomain = domainForFavicon(faviconSource);

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

                {/* Right Action Cluster */}
                <div className="absolute top-4 right-14 flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <button className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-tight text-background hover:bg-foreground/90 transition-colors shadow-lg">
                      <Zap className="h-3 w-3" /> Add to Network
                    </button>
                    <button className="inline-flex items-center gap-1.5 rounded-md border border-foreground/20 bg-background/40 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-tight text-foreground hover:bg-background/60 backdrop-blur-sm transition-colors shadow-lg">
                      <MessageSquare className="h-3 w-3" /> Request Intro
                    </button>
                  </div>
                  <StatusIndicator isOwner={isOwner} />
                </div>

                {/* Close Button */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-md bg-muted/80 hover:bg-secondary/90 transition-colors backdrop-blur-sm border border-border/20 shadow-sm"
                >
                  <X className="h-4 w-4 text-foreground/70" />
                </button>

                {/* Logo overlapping banner */}
                <div className="absolute -bottom-6 left-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-card border-4 border-card shadow-surface text-xl font-bold text-muted-foreground">
                  {founder.initial}
                </div>
              </div>

              {/* ─── Header Content ─── */}
              <div className="px-6 pt-10 pb-4 shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-bold text-foreground truncate">{founder.name}</h2>
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-accent fill-accent/20" />
                    </div>
                    
                    {/* Role at Company with Favicon */}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-sm font-medium text-muted-foreground">{founder.model}</span>
                      {showAtCompanySubtitle ? (
                        <>
                          <span className="text-sm text-muted-foreground/50 italic">at</span>
                          <div className="flex items-center gap-1.5 text-accent/90">
                            {faviconDomain ? (
                              <img
                                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(faviconDomain)}&sz=32`}
                                alt=""
                                className="h-4 w-4 rounded-sm"
                              />
                            ) : (
                              <Building2 className="h-4 w-4" />
                            )}
                            <span className="text-sm font-bold tracking-tight">{orgDisplayName}</span>
                          </div>
                        </>
                      ) : null}
                    </div>

                    {(headerLinks.websiteHref ||
                      headerLinks.linkedinUrl ||
                      headerLinks.twitterUrl) && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                        {headerLinks.websiteHref && headerLinks.websiteLabel ? (
                          <a
                            href={headerLinks.websiteHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/90 hover:underline"
                          >
                            <Globe className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                            <span className="truncate">{headerLinks.websiteLabel}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                          </a>
                        ) : null}
                        <SocialIcons
                          showHeading={false}
                          compact
                          websiteUrl={null}
                          linkedinUrl={headerLinks.linkedinUrl}
                          twitterUrl={headerLinks.twitterUrl}
                        />
                      </div>
                    )}
                  </div>

                  {/* Stage and Sector moved to the right */}
                  <div className="flex flex-col items-end gap-2.5 shrink-0 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-muted-foreground/50 tracking-widest uppercase">Stage</span>
                      <Badge variant="outline" className="text-[10px] px-2 py-1 bg-amber-500/10 text-amber-700 border-amber-200/50 font-medium uppercase tracking-wider">
                        {founder.stage}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-muted-foreground/50 tracking-widest uppercase">Sector</span>
                      <Badge variant="secondary" className="text-[10px] px-2 py-1 bg-violet-500/10 text-violet-700 border-violet-200/50 font-medium uppercase tracking-wider">
                        {founder.sector}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── AI Insight ─── */}
              <div className="mx-6 mb-4 shrink-0">
                <FounderInsightCard founder={founder} displayCompany={displayCompany} />
              </div>

              {/* ─── Pill Tabs ─── */}
              <div className="mx-6 mb-4 shrink-0">
                <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-secondary/35 p-1 shadow-sm backdrop-blur-sm">
                  {tabList.map((tab) => {
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
                        {tabLabel(tab)}
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
                        <Badge variant="outline" className="text-xs px-3 py-1 whitespace-nowrap">{founder.model}</Badge>
                      </div>

                      {/* Social Icons */}
                      <SocialIcons
                        websiteUrl={founder._websiteUrl ?? founder.companyWebsite}
                        linkedinUrl={founder._linkedinUrl}
                        twitterUrl={founder._twitterUrl}
                      />
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
                            <Badge className="text-[9px] px-2 py-1 bg-success/10 text-success border-success/20 whitespace-nowrap">
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
                          <div className="items-center justify-between flex">
                            <span className="text-sm text-foreground font-medium">Current Stage</span>
                            <Badge variant="outline" className="text-[10px] py-1 whitespace-nowrap px-2">{founder.stage}</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground font-medium">Location</span>
                            <span className="text-sm text-muted-foreground">{founder.location}</span>
                          </div>
                        </div>
                      </div>

                      {/* Competition Sync: display real competitors from database */}
                      <div>
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">
                          Competitive Landscape
                        </h4>
                        <div className="rounded-xl bg-secondary/30 p-4">
                          {founder.competitors && founder.competitors.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                              {founder.competitors.map((comp) => (
                                <div key={comp} className="flex items-center gap-2 p-2 rounded-lg bg-card/40 border border-border/20">
                                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted">
                                    <Building2 className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                  <span className="text-xs font-medium text-foreground truncate">{comp}</span>
                                  <Badge className="ml-auto text-[8px] px-1 py-0 bg-accent/5 text-accent border-accent/10">MATCH</Badge>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No competitors documented in their profile yet.</p>
                          )}
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

                  {activeTab === "Jobs" && organizationId && (
                    <motion.div
                      key="jobs"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <JobsTab organizationId={organizationId} />
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
