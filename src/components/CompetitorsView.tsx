import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, Globe, ExternalLink, Sparkles, Zap, Shield, Target, ChevronRight, X, TrendingUp, AlertTriangle, BarChart3, DollarSign, Megaphone, Rocket, UserPlus, Newspaper, Clock, Plus, Search, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CompanyData } from "@/components/CompanyProfile";
import { useCompetitors, TrackedCompetitor } from "@/hooks/useCompetitors";

interface CompetitorsViewProps {
  companyData: CompanyData | null;
  onNavigateProfile: () => void;
  onAddCompetitor?: (name: string) => void;
  onCompetitorsChanged?: (names: string[]) => void;
}

// ── Competitor Intel Database ──

interface CompetitorIntel {
  tagline: string;
  description: string;
  funding: string;
  stage: string;
  status: "Direct Competitor" | "Indirect" | "Legacy Incumbent";
  overlap: number;
  employees: string;
  pricing: string;
  advantage: string;
  tldr: string;
  strengths: string[];
  weaknesses: string[];
  killPhrases: string[];
}

const COMPETITOR_INTEL: Record<string, CompetitorIntel> = {
  stripe: {
    tagline: "Financial infrastructure for the internet",
    description: "Stripe builds economic infrastructure for the internet, offering payment processing, billing, and financial services APIs used by millions of businesses worldwide.",
    funding: "$8.7B", stage: "Late Stage", status: "Legacy Incumbent", overlap: 72, employees: "8,000+",
    pricing: "2.9% + 30¢ per transaction. Volume discounts for enterprise. Custom pricing for Stripe Atlas & Treasury.",
    advantage: "We offer 60% lower fees for startups processing under $500K/mo with zero integration overhead",
    tldr: "Market leader in payments infrastructure. Deeply entrenched with developer ecosystem. Weakness is complexity and cost for smaller teams.",
    strengths: ["Dominant developer mindshare and brand trust", "Massive integration ecosystem (1,000+ partners)", "Strong international coverage with 135+ currencies", "Comprehensive product suite beyond payments"],
    weaknesses: ["Expensive for low-volume startups", "Complex pricing tiers create billing surprises", "Support quality drops below enterprise tier", "Slow to adapt to vertical-specific needs"],
    killPhrases: [
      "Stripe is built for scale — we're built for speed. Our median integration time is 4 hours vs. their 4 weeks.",
      "We pass through interchange at cost. That alone saves our customers 40-60% versus Stripe's flat rate.",
      "Unlike Stripe, we don't require a team of engineers. Our no-code dashboard handles what their API does.",
    ],
  },
  brex: {
    tagline: "AI-powered spend platform for growing companies",
    description: "Brex provides corporate cards, expense management, and travel solutions designed specifically for startups and high-growth technology companies.",
    funding: "$1.5B", stage: "Series D", status: "Direct Competitor", overlap: 58, employees: "1,200+",
    pricing: "Starts free for startups. Premium tier at $12/user/mo. Enterprise pricing requires sales engagement.",
    advantage: "We integrate natively with your existing banking stack — no forced migration to a new card provider",
    tldr: "Strong in startup expense management. Recently pivoted upmarket to enterprise. Vulnerable in the SMB segment they're deprioritizing.",
    strengths: ["Strong brand recognition in startup ecosystem", "Integrated travel and expense in one platform", "AI-powered receipt matching and categorization", "No personal guarantee required"],
    weaknesses: ["Abandoned SMB segment to chase enterprise deals", "Limited international support outside US/CA", "Card rewards have been significantly reduced", "High customer churn after pivot away from startups"],
    killPhrases: [
      "Brex is leaving the startup market — we're doubling down on it. They literally shut down accounts under $1M ARR.",
      "We offer the same spend management features without forcing you onto a proprietary card.",
      "Our platform grows with you from pre-seed to Series C. Brex now only wants you after you've made it.",
    ],
  },
  ramp: {
    tagline: "The corporate card that helps you spend less",
    description: "Ramp provides corporate cards and financial automation software focused on helping businesses reduce spend through AI-powered insights and automated controls.",
    funding: "$1.6B", stage: "Series D", status: "Direct Competitor", overlap: 65, employees: "900+",
    pricing: "Free core product. Ramp Plus at $15/user/mo with advanced features. Enterprise custom pricing.",
    advantage: "We provide real-time cash flow forecasting — not just spend tracking after the fact",
    tldr: "Fast-growing spend management platform with strong product. Competes primarily on cost savings messaging. Limited in treasury and banking.",
    strengths: ["Fastest-growing fintech in spend management", "Strong savings-first positioning resonates with CFOs", "Clean, modern product experience", "Aggressive feature shipping cadence"],
    weaknesses: ["No banking or treasury products", "Revenue model depends on interchange (fragile)", "Limited international presence", "Relatively unproven at true enterprise scale"],
    killPhrases: [
      "Ramp shows you where you overspent last month. We predict where you'll overspend next month and prevent it.",
      "Their business model depends on you swiping their card. Ours works regardless of which card you use.",
      "We offer full treasury management alongside spend control — Ramp only does half the job.",
    ],
  },
  plaid: {
    tagline: "The platform for open finance",
    description: "Plaid connects consumer bank accounts to fintech applications, providing the data infrastructure layer that powers thousands of financial apps.",
    funding: "$734M", stage: "Series D", status: "Indirect", overlap: 45, employees: "1,000+",
    pricing: "Per-connection pricing starting at $0.30/link. Production volume discounts available. Auth verification priced separately.",
    advantage: "We provide richer transaction data with 3x faster connection speeds and real-time webhooks",
    tldr: "Market leader in bank account linking. Near-monopoly position but facing increasing regulatory scrutiny and open banking mandates that threaten their moat.",
    strengths: ["Near-monopoly in US bank account linking", "Covers 12,000+ financial institutions", "Strong brand trust with consumers", "Deep investment in identity verification"],
    weaknesses: ["Regulatory risk from open banking mandates", "Connection reliability issues with smaller banks", "Pricing pressure from free alternatives emerging", "Heavy dependency on screen-scraping legacy tech"],
    killPhrases: [
      "Plaid charges per connection. Open banking APIs will make their core product free. We're building on that future.",
      "Our direct bank integrations are 3x more reliable than Plaid's screen-scraping approach.",
      "We own the full data pipeline — Plaid is a middleman that regulations are designed to eliminate.",
    ],
  },
  mercury: {
    tagline: "Banking for startups",
    description: "Mercury provides banking services tailored for startups, including checking/savings accounts, corporate cards, and treasury management with a modern digital-first experience.",
    funding: "$163M", stage: "Series C", status: "Direct Competitor", overlap: 52, employees: "600+",
    pricing: "Free checking and savings. IO cards included. Treasury requires minimum $500K balance. Premium at $35/mo.",
    advantage: "We combine banking with automated financial ops — Mercury is just a bank account with a nice UI",
    tldr: "Best-in-class startup banking experience. Strong community and brand. Limited by banking partner constraints and regulatory complexity.",
    strengths: ["Beautiful, intuitive banking product", "Strong community-driven growth flywheel", "Good treasury and yield products", "Trusted by 100K+ startup accounts"],
    weaknesses: ["Not actually a bank — relies on banking partners", "Limited lending and credit products", "No international multi-currency accounts", "Feature set thin compared to full-stack finance platforms"],
    killPhrases: [
      "Mercury gives you a bank account. We give you a finance department. Automated AP/AR, forecasting, and treasury in one platform.",
      "They depend on Choice Financial Group and Evolve Bank. We have our own banking charter — that means faster, more reliable service.",
      "Mercury can't lend to you or underwrite your growth. We can — that's the difference between a bank and a banking app.",
    ],
  },
};

function getIntel(name: string): CompetitorIntel {
  const key = name.toLowerCase().trim();
  return COMPETITOR_INTEL[key] || {
    tagline: "Competitor in your market",
    description: `${name} operates in the same market segment. Add more details in your company profile for AI-enriched intelligence.`,
    funding: "Undisclosed", stage: "Unknown", status: "Direct Competitor" as const,
    overlap: Math.floor(Math.random() * 40) + 20, employees: "N/A",
    pricing: "Pricing information not available. Check their website for current plans.",
    advantage: "We move faster and ship more features per quarter than legacy competitors",
    tldr: `${name} competes in your space. Enrich your profile for deeper competitive intelligence.`,
    strengths: ["Established market presence", "Existing customer base"],
    weaknesses: ["Slower innovation cycle", "Less focused on your niche"],
    killPhrases: [
      `Unlike ${name}, we're purpose-built for this specific use case from day one.`,
      "We've shipped more features in 6 months than they have in 2 years.",
    ],
  };
}

function domainFromName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "") + ".com";
}

function faviconSrc(domain: string): string {
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
}

function statusColor(status: string): string {
  if (status === "Direct Competitor") return "bg-destructive/10 text-destructive";
  if (status === "Indirect") return "bg-warning/10 text-warning";
  return "bg-muted text-muted-foreground";
}

// ── Battlecard Panel ──

function BattlecardModal({ name, onClose }: { name: string; onClose: () => void }) {
  const intel = getIntel(name);
  const domain = domainFromName(name);

  return (
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

      {/* Centered Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          className="pointer-events-auto max-w-2xl w-full bg-card rounded-3xl shadow-2xl border border-border/50 overflow-hidden relative max-h-[90vh] flex flex-col"
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: "spring", damping: 28, stiffness: 350 }}
        >
          {/* Hero Banner */}
          <div className="relative h-28 w-full shrink-0" style={{ background: "linear-gradient(135deg, hsl(var(--secondary)), hsl(var(--destructive) / 0.06))" }}>
            {/* Status Badge */}
            <div className="absolute top-4 left-6">
              <Badge className={`text-[10px] font-semibold border-0 rounded-full px-3 py-1 backdrop-blur-md ${statusColor(intel.status)}`}>
                {intel.status}
              </Badge>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-card/50 hover:bg-card/80 transition-colors backdrop-blur-sm"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Logo overlapping banner */}
            <div className="absolute -bottom-6 left-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-card border-4 border-card shadow-surface overflow-hidden">
              <img
                src={faviconSrc(domain)}
                alt=""
                className="h-9 w-9"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-xl font-bold text-muted-foreground">${name.charAt(0).toUpperCase()}</span>`;
                }}
              />
            </div>
          </div>

          {/* Header Content */}
          <div className="px-6 pt-10 pb-4 shrink-0">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-foreground">{name}</h2>
                <a
                  href={`https://${domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent/80 transition-colors mt-1"
                >
                  <Globe className="h-3 w-3" /> {domain}
                </a>
              </div>
              <div className="grid grid-cols-3 gap-2 shrink-0 ml-4">
                <div className="rounded-lg bg-secondary/50 px-3 py-2 text-center">
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground font-medium">Funding</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{intel.funding}</p>
                </div>
                <div className="rounded-lg bg-secondary/50 px-3 py-2 text-center">
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground font-medium">Stage</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{intel.stage}</p>
                </div>
                <div className="rounded-lg bg-secondary/50 px-3 py-2 text-center">
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground font-medium">Team</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{intel.employees}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-5">
            {/* TL;DR */}
            <div>
              <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">TL;DR</h4>
              <p className="text-sm text-foreground leading-relaxed">{intel.tldr}</p>
            </div>

            {/* Pricing */}
            <div>
              <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Pricing Model</h4>
              <p className="text-[13px] text-foreground/80 leading-relaxed bg-secondary/30 rounded-xl px-4 py-3">{intel.pricing}</p>
            </div>

            {/* SWOT */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-[10px] font-mono uppercase tracking-wider text-destructive/70 mb-3">Their Strengths</h4>
                <ul className="space-y-2">
                  {intel.strengths.map((s, i) => (
                    <li key={i} className="border-l-2 border-destructive/40 pl-3 text-[12px] text-foreground/80 leading-relaxed">{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-[10px] font-mono uppercase tracking-wider text-success/70 mb-3">Their Weaknesses</h4>
                <ul className="space-y-2">
                  {intel.weaknesses.map((w, i) => (
                    <li key={i} className="border-l-2 border-success/40 pl-3 text-[12px] text-foreground/80 leading-relaxed">{w}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Kill Phrases */}
            <div className="bg-foreground text-background rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Target className="h-4 w-4 text-accent" />
                <h4 className="text-xs font-bold uppercase tracking-wider">How to Win</h4>
              </div>
              <p className="text-[10px] text-background/50 mb-3">
                Use these talking points when investors ask "How are you different from {name}?"
              </p>
              <ul className="space-y-3">
                {intel.killPhrases.map((phrase, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
                    <ChevronRight className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                    <span className="text-background/90">{phrase}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}

// ── Update Types & Mock Data ──

type UpdateType = "funding" | "press" | "product" | "hire" | "social" | "vulnerability";
type SignalTab = "all" | "capital" | "product_strategy" | "vulnerabilities";

interface CompetitorUpdate {
  id: string;
  competitor: string;
  type: UpdateType;
  headline: string;
  detail: string;
  impact: string;
  timeAgo: string;
  signalTab: SignalTab;
}

const UPDATE_TYPE_META: Record<UpdateType, { icon: typeof DollarSign; label: string; color: string }> = {
  funding: { icon: DollarSign, label: "Funding", color: "text-success bg-success/10" },
  press: { icon: Newspaper, label: "Press", color: "text-accent bg-accent/10" },
  product: { icon: Rocket, label: "Product", color: "text-primary bg-primary/10" },
  hire: { icon: UserPlus, label: "New Hire", color: "text-warning bg-warning/10" },
  social: { icon: Megaphone, label: "Social", color: "text-destructive bg-destructive/10" },
  vulnerability: { icon: AlertTriangle, label: "Vulnerability", color: "text-[hsl(38,92%,50%)] bg-[hsl(38,100%,95%)]" },
};

const SIGNAL_TABS: { key: SignalTab; label: string }[] = [
  { key: "all", label: "All Signals" },
  { key: "capital", label: "Capital & M&A" },
  { key: "product_strategy", label: "Product Strategy" },
  { key: "vulnerabilities", label: "Vulnerabilities" },
];

function generateUpdates(competitors: string[]): CompetitorUpdate[] {
  const templates: { type: UpdateType; signalTab: SignalTab; headline: (name: string) => string; detail: (name: string) => string; impact: (name: string) => string }[] = [
    { type: "funding", signalTab: "capital", headline: (n) => `${n} closes $45M Series C led by Sequoia`, detail: () => "New round values the company at $800M post-money. Capital earmarked for international expansion.", impact: (n) => `Values ${n} at $800M. Capital earmarked for international expansion, potentially threatening EU market share.` },
    { type: "press", signalTab: "product_strategy", headline: (n) => `${n} featured in TechCrunch for AI-first strategy`, detail: () => "Coverage highlights pivot to AI-native workflows.", impact: (n) => `${n}'s AI pivot signals a direct challenge to your automation features. Monitor their product roadmap closely for overlap.` },
    { type: "product", signalTab: "product_strategy", headline: (n) => `${n} launches real-time analytics dashboard`, detail: () => "New product directly competes with your core value proposition.", impact: (n) => `Direct feature overlap with your analytics module. Early reviews praise UX — consider accelerating your v2 roadmap to maintain differentiation.` },
    { type: "hire", signalTab: "product_strategy", headline: (n) => `${n} hires ex-Google VP of Engineering`, detail: () => "Senior engineering leadership hire signals investment in platform scalability.", impact: (n) => `Senior eng hire signals ${n} is investing heavily in platform reliability — their weakest area. Expect quality improvements within 2 quarters.` },
    { type: "social", signalTab: "capital", headline: (n) => `${n} CEO tweets about upcoming enterprise launch`, detail: () => "Thread hints at enterprise-tier pricing and SOC 2 compliance.", impact: (n) => `${n} moving upmarket creates a window in the SMB segment they're deprioritizing. Consider targeted campaigns to their churning customers.` },
    { type: "vulnerability", signalTab: "vulnerabilities", headline: (n) => `${n} users complaining about latency issues on Reddit`, detail: () => "Multiple threads report 3-5s load times on core workflows.", impact: (n) => `Performance complaints create a churn window. Target ${n}'s power users with a speed-focused comparison campaign and free migration support.` },
    { type: "product", signalTab: "product_strategy", headline: (n) => `${n} ships API v3 with breaking changes`, detail: () => "Migration required for existing customers.", impact: (n) => `Breaking API changes will frustrate ${n}'s developer community. Position your stable API as a key differentiator in developer forums.` },
    { type: "vulnerability", signalTab: "vulnerabilities", headline: (n) => `${n} loses SOC 2 compliance — security concerns raised`, detail: () => "Compliance lapse reported by industry watchdog.", impact: (n) => `Compliance gap is a critical vulnerability. Enterprise prospects evaluating ${n} will now require additional due diligence — use this in competitive deals.` },
    { type: "funding", signalTab: "capital", headline: (n) => `${n} raises bridge round from existing investors`, detail: () => "Extension round suggests insider conviction ahead of Series D.", impact: (n) => `Bridge round instead of full raise may indicate ${n} is struggling to hit growth targets. Their runway is likely 12-18 months.` },
    { type: "vulnerability", signalTab: "vulnerabilities", headline: (n) => `${n} Glassdoor rating drops to 2.8 — engineering attrition`, detail: () => "Reviews cite burnout, poor leadership, and stalled equity.", impact: (n) => `Talent exodus weakens ${n}'s execution capacity. Opportunity to recruit their top engineers and slow their product velocity.` },
  ];

  const times = ["2h ago", "5h ago", "1d ago", "2d ago", "3d ago", "4d ago", "5d ago", "1w ago", "1w ago", "2w ago"];

  const updates: CompetitorUpdate[] = [];
  let idx = 0;
  for (const t of templates) {
    const comp = competitors[idx % competitors.length];
    updates.push({
      id: `update-${idx}`,
      competitor: comp,
      type: t.type,
      headline: t.headline(comp),
      detail: t.detail(comp),
      impact: t.impact(comp),
      timeAgo: times[idx % times.length],
      signalTab: t.signalTab,
    });
    idx++;
  }
  return updates;
}

function CompetitorUpdatesFeed({ competitors, onOpenBattlecard }: { competitors: string[]; onOpenBattlecard: (name: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const [activeTab, setActiveTab] = useState<SignalTab>("all");
  const allUpdates = useMemo(() => generateUpdates(competitors), [competitors]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return allUpdates;
    return allUpdates.filter(u => u.signalTab === activeTab);
  }, [allUpdates, activeTab]);

  const visible = showAll ? filtered : filtered.slice(0, 4);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">Updates Feed</h2>
          <Badge variant="secondary" className="text-[9px] font-normal border-0 rounded-full px-2 py-0.5">
            {filtered.length} signals
          </Badge>
        </div>
      </div>

      {/* Segmented Control — outside scroll area */}
      <div className="inline-flex items-center gap-0.5 rounded-lg bg-secondary/50 p-1 mb-4">
        {SIGNAL_TABS.map(tab => {
          const count = tab.key === "all" ? allUpdates.length : allUpdates.filter(u => u.signalTab === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setShowAll(false); }}
              className={`px-3 py-1.5 text-sm rounded-md transition-all duration-200 inline-flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? "bg-card shadow-sm text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className={`text-[10px] font-medium rounded-full px-1.5 py-0 min-w-[18px] text-center ${
                activeTab === tab.key ? "bg-secondary text-foreground" : "bg-secondary/70 text-muted-foreground"
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Scrollable Feed Items */}
      <div className="max-h-[620px] overflow-y-auto pr-2 flex flex-col gap-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/60 [&::-webkit-scrollbar-track]:bg-transparent">
        <AnimatePresence initial={false} mode="popLayout">
          {filtered.map((update, i) => {
            const meta = UPDATE_TYPE_META[update.type];
            const isVulnerability = update.type === "vulnerability";
            const Icon = meta.icon;
            const domain = domainFromName(update.competitor);
            const iconStyle = isVulnerability
              ? "text-[hsl(38,92%,50%)] bg-[hsl(38,100%,95%)]"
              : meta.color;

            return (
              <motion.div
                key={update.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className={`group rounded-xl border bg-card p-4 hover:shadow-surface transition-all duration-200 cursor-pointer ${
                  isVulnerability ? "border-[hsl(38,90%,70%)]/40 hover:border-[hsl(38,90%,60%)]/60" : "border-border/50 hover:border-accent/20"
                }`}
                onClick={() => onOpenBattlecard(update.competitor)}
              >
                {/* Top Row: Metadata */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${iconStyle}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex items-center gap-2">
                      <img
                        src={faviconSrc(domain)}
                        alt=""
                        className="h-3.5 w-3.5 rounded-sm"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <span className="text-sm font-bold text-foreground">{update.competitor}</span>
                    </div>
                    <Badge className={`text-[8px] font-medium border-0 rounded-full px-1.5 py-0 ${iconStyle}`}>
                      {meta.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Clock className="h-3 w-3 text-muted-foreground/40" />
                    <span className="text-xs text-muted-foreground/50 font-medium">{update.timeAgo}</span>
                  </div>
                </div>

                {/* Middle Row: Headline */}
                <p className="text-base font-semibold text-foreground/90 mt-2 leading-snug">{update.headline}</p>

                {/* Bottom Row: AI Impact Summary */}
                <div className={`rounded-md p-3 mt-3 border ${
                  isVulnerability
                    ? "bg-[hsl(38,100%,97%)] border-[hsl(38,90%,85%)]"
                    : "bg-secondary/40 border-border/50"
                }`}>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    <span className="mr-1">✨</span>
                    <span className="font-medium text-foreground/70">Impact:</span>{" "}
                    {update.impact}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className="text-center py-10">
            <p className="text-xs text-muted-foreground">No signals in this category.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──

type CompetitorTab = "all" | "threats" | "watch";

const COMPETITOR_TABS: { key: CompetitorTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "threats", label: "Threats" },
  { key: "watch", label: "Watch" },
];

export function CompetitorsView({ companyData, onNavigateProfile, onAddCompetitor, onCompetitorsChanged }: CompetitorsViewProps) {
  const [activeCompetitor, setActiveCompetitor] = useState<string | null>(null);
  const [compTab, setCompTab] = useState<CompetitorTab>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCompName, setNewCompName] = useState("");
  const [newCompType, setNewCompType] = useState<"Direct" | "Indirect">("Direct");
  const [newCompIntent, setNewCompIntent] = useState<"Threat" | "Watch">("Threat");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [seeded, setSeeded] = useState(false);

  const {
    competitors: dbCompetitors,
    loading: dbLoading,
    adding: dbAdding,
    addCompetitor: dbAddCompetitor,
    searchCompetitors,
    updateStatus,
    removeCompetitor,
  } = useCompetitors();

  // Seed DB from companyData.competitors on first load (one-time sync)
  useEffect(() => {
    if (seeded || dbLoading) return;
    const profileComps = companyData?.competitors || [];
    if (profileComps.length === 0 || dbCompetitors.length > 0) {
      setSeeded(true);
      return;
    }
    // Profile has competitors but DB is empty — seed them
    const seedAsync = async () => {
      for (const name of profileComps) {
        await dbAddCompetitor(name);
      }
      setSeeded(true);
    };
    seedAsync();
  }, [seeded, dbLoading, companyData?.competitors, dbCompetitors.length, dbAddCompetitor]);

  // Sync DB competitors back to companyData whenever they change
  useEffect(() => {
    if (dbLoading) return;
    const names = dbCompetitors.map(tc => tc.competitor.name);
    onCompetitorsChanged?.(names);
  }, [dbCompetitors, dbLoading, onCompetitorsChanged]);

  // Use DB competitors if available, otherwise fall back to companyData
  const hasDbData = dbCompetitors.length > 0 || !dbLoading;
  const competitors = hasDbData
    ? dbCompetitors.map(tc => tc.competitor.name)
    : (companyData?.competitors || []);

  // Search debounce for add modal
  useEffect(() => {
    if (!newCompName.trim() || newCompName.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await searchCompetitors(newCompName.trim());
      setSearchResults(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [newCompName, searchCompetitors]);

  // Map DB status to view status
  const getDbStatus = useCallback((name: string): "Direct Competitor" | "Indirect" | "Legacy Incumbent" => {
    const tc = dbCompetitors.find(c => c.competitor.name.toLowerCase() === name.toLowerCase());
    if (!tc) return "Direct Competitor";
    if (tc.status === "Threat") return "Direct Competitor";
    if (tc.status === "Watch") return "Indirect";
    return "Direct Competitor";
  }, [dbCompetitors]);

  const handleAddCompetitor = useCallback(async (name: string) => {
    await dbAddCompetitor(name, newCompIntent, `type:${newCompType}`);
    onAddCompetitor?.(name);
    setNewCompName("");
    setNewCompType("Direct");
    setNewCompIntent("Threat");
    setShowAddModal(false);
    setSearchResults([]);
  }, [dbAddCompetitor, onAddCompetitor, newCompIntent, newCompType]);

  const avgOverlap = useMemo(() => {
    if (competitors.length === 0) return 0;
    const overlaps = competitors.map(n => getIntel(n).overlap);
    return Math.round(overlaps.reduce((a, b) => a + b, 0) / overlaps.length);
  }, [competitors]);

  const directCount = useMemo(() => competitors.filter(n => getIntel(n).status === "Direct Competitor").length, [competitors]);

  const topThreat = useMemo(() => {
    let max = { name: "", overlap: 0 };
    competitors.forEach(n => { const o = getIntel(n).overlap; if (o > max.overlap) max = { name: n, overlap: o }; });
    return max;
  }, [competitors]);

  if (!companyData || competitors.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Competitive Intelligence</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Battlecards and market positioning</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary mb-4">
            <Swords className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No competitors tracked yet</p>
          <p className="text-xs text-muted-foreground max-w-sm mb-4">
            Add competitors in your company profile to generate AI battlecards.
          </p>
          <button onClick={onNavigateProfile} className="text-xs font-medium text-accent hover:text-accent/80 transition-colors">
            Go to Mission Control →
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Competitive Intelligence</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {competitors.length} competitor{competitors.length !== 1 ? "s" : ""} tracked · Click a card for the full battlecard
            </p>
          </div>
          <Badge variant="secondary" className="text-[10px] font-normal gap-1">
            <Sparkles className="h-2.5 w-2.5" />
            AI-Enriched
          </Badge>
        </div>

        {/* ── Intelligence Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Competitors Tracked */}
          <div
            className="relative rounded-[24px] p-8 backdrop-blur-xl"
            style={{
              background: "hsla(0, 0%, 100%, 0.70)",
              border: "1px solid hsla(var(--border), 0.5)",
              borderTop: "1px solid hsla(0, 0%, 100%, 0.8)",
              boxShadow: "0 20px 50px hsla(var(--accent), 0.05)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.15em]">Competitors Tracked</p>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-accent-foreground bg-foreground px-3 py-1 rounded-full">
                <Swords className="h-2.5 w-2.5 text-accent" />
                {directCount} Direct
              </span>
            </div>
            <span className="inline-flex font-mono text-5xl font-extrabold text-foreground tracking-tight">{competitors.length}</span>
            <p className="text-xs text-muted-foreground mt-3">Active competitors in your landscape.</p>
          </div>

          {/* Market Overlap */}
          <div
            className="relative rounded-[24px] p-8 backdrop-blur-xl"
            style={{
              background: "hsla(0, 0%, 100%, 0.70)",
              border: "1px solid hsla(var(--border), 0.5)",
              borderTop: "1px solid hsla(0, 0%, 100%, 0.8)",
              boxShadow: "0 20px 50px hsla(var(--accent), 0.05)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.15em]">Avg. Market Overlap</p>
              <Badge variant="secondary" className={`text-[10px] font-medium border-0 rounded-full px-2.5 py-0.5 ${avgOverlap >= 60 ? "bg-destructive/10 text-destructive" : avgOverlap >= 40 ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
                {avgOverlap >= 60 ? "High Risk" : avgOverlap >= 40 ? "Moderate" : "Low Risk"}
              </Badge>
            </div>
            <span className="inline-flex font-mono text-5xl font-extrabold text-foreground tracking-tight">{avgOverlap}%</span>
            <div className="mt-4">
              <div className="relative w-full h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${avgOverlap}%`,
                    background: avgOverlap >= 60
                      ? "linear-gradient(90deg, hsl(var(--warning)), hsl(var(--destructive)))"
                      : "linear-gradient(90deg, hsl(var(--success)), hsl(var(--accent)))",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Top Threat */}
          <div
            className="relative rounded-[24px] p-8 backdrop-blur-xl"
            style={{
              background: "hsla(0, 0%, 100%, 0.70)",
              border: "1px solid hsla(var(--border), 0.5)",
              borderTop: "1px solid hsla(0, 0%, 100%, 0.8)",
              boxShadow: "0 20px 50px hsla(var(--accent), 0.05)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.15em]">Top Threat</p>
              <AlertTriangle className="h-4 w-4 text-warning" />
            </div>
            <p className="font-mono text-2xl font-extrabold text-foreground tracking-tight truncate">{topThreat.name}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge className="text-[10px] font-semibold border-0 rounded-full px-2.5 py-0.5 bg-destructive/10 text-destructive">{topThreat.overlap}% overlap</Badge>
            </div>
            <button
              onClick={() => setActiveCompetitor(topThreat.name)}
              className="mt-4 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
            >
              View battlecard →
            </button>
          </div>
        </div>

        {/* ── Two-Column Layout: Battlecards + Updates Feed ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-2">
          {/* Left Column: Tracked Competitors */}
          <div className="lg:col-span-4 flex flex-col">
            <h2 className="text-lg font-bold text-foreground mb-4">Tracked Competitors</h2>
            {/* Segmented Control + Add Button */}
            <div className="flex items-center gap-2 mb-4">
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-secondary/50 p-1">
                {COMPETITOR_TABS.map(tab => {
                  const getStatus = (n: string) => {
                    const tc = dbCompetitors.find(c => c.competitor.name.toLowerCase() === n.toLowerCase());
                    if (tc) return tc.status; // "Tracked" | "Threat" | "Watch"
                    return getIntel(n).status === "Direct Competitor" ? "Threat" : "Watch";
                  };
                  const count = tab.key === "all" ? competitors.length
                    : tab.key === "threats" ? competitors.filter(n => getStatus(n) === "Threat").length
                    : competitors.filter(n => getStatus(n) === "Watch" || getStatus(n) === "Tracked").length;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setCompTab(tab.key)}
                      className={`px-3 py-1.5 text-sm rounded-md transition-all duration-200 inline-flex items-center gap-1.5 ${
                        compTab === tab.key
                          ? "bg-card shadow-sm text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                      <span className={`text-[10px] font-medium rounded-full px-1.5 py-0 min-w-[18px] text-center ${
                        compTab === tab.key ? "bg-secondary text-foreground" : "bg-secondary/70 text-muted-foreground"
                      }`}>{count}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
            <div className="flex flex-col gap-4 max-h-[620px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/60 [&::-webkit-scrollbar-track]:bg-transparent">
              {competitors.filter(name => {
                if (compTab === "all") return true;
                const tc = dbCompetitors.find(c => c.competitor.name.toLowerCase() === name.toLowerCase());
                const s = tc ? tc.status : (getIntel(name).status === "Direct Competitor" ? "Threat" : "Watch");
                if (compTab === "threats") return s === "Threat";
                return s === "Watch" || s === "Tracked";
              }).map((name) => {
                const intel = getIntel(name);
                const domain = domainFromName(name);

                return (
                  <button
                    key={name}
                    onClick={() => setActiveCompetitor(name)}
                    className="text-left rounded-2xl border border-border bg-card p-5 shadow-surface transition-all duration-300 hover:shadow-surface-md hover:-translate-y-1 hover:border-accent/20 group"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary shrink-0 overflow-hidden">
                        <img
                          src={faviconSrc(domain)}
                          alt=""
                          className="h-6 w-6 rounded-lg object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                            (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-lg font-bold text-muted-foreground">${name.charAt(0).toUpperCase()}</span>`;
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground truncate">{name}</h3>
                          <ExternalLink className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
                        </div>
                        <Badge variant="secondary" className="text-[9px] font-normal mt-1 border-0 px-2 py-0">
                          {intel.funding} Raised
                        </Badge>
                      </div>
                    </div>

                    <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                      {intel.description}
                    </p>

                    <div className="rounded-xl bg-success/5 border border-success/10 px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-success mb-0.5">⚡ Our Advantage</p>
                      <p className="text-[11px] text-success/80 leading-relaxed">{intel.advantage}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Updates Feed */}
          <div className="lg:col-span-8">
            <CompetitorUpdatesFeed competitors={competitors} onOpenBattlecard={setActiveCompetitor} />
          </div>
        </div>
      </div>

      {/* Battlecard Floating Modal */}
      <AnimatePresence>
        {activeCompetitor && (
          <BattlecardModal name={activeCompetitor} onClose={() => setActiveCompetitor(null)} />
        )}
      </AnimatePresence>

      {/* Add Competitor Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm supports-[backdrop-filter]:bg-foreground/15"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowAddModal(false); setNewCompName(""); setNewCompType("Direct"); setNewCompIntent("Threat"); }}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                className="pointer-events-auto w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border/50 overflow-hidden"
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ type: "spring", damping: 28, stiffness: 350 }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                  <div>
                    <h3 className="text-base font-bold text-foreground">Add Competitor</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Track a new competitor for AI-powered intelligence</p>
                  </div>
                  <button
                    onClick={() => { setShowAddModal(false); setNewCompName(""); setNewCompType("Direct"); setNewCompIntent("Threat"); }}
                    className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary transition-colors"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Company Name</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <input
                        type="text"
                        value={newCompName}
                        onChange={(e) => setNewCompName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newCompName.trim()) {
                            handleAddCompetitor(newCompName.trim());
                          }
                        }}
                        placeholder="e.g. Stripe, Brex, Mercury..."
                        className="w-full rounded-xl border border-border bg-secondary/30 pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 transition-all"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Classification */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Relationship</label>
                      <div className="flex gap-1.5">
                        {(["Direct", "Indirect"] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => setNewCompType(t)}
                            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                              newCompType === t
                                ? "border-accent bg-accent/10 text-accent"
                                : "border-border bg-card text-muted-foreground hover:bg-secondary/50"
                            }`}
                          >
                            {t === "Direct" ? <><Target className="h-3 w-3 inline mr-1" />{t}</> : <><Globe className="h-3 w-3 inline mr-1" />{t}</>}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Intent</label>
                      <div className="flex gap-1.5">
                        {(["Threat", "Watch"] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => setNewCompIntent(t)}
                            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                              newCompIntent === t
                                ? t === "Threat" ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-accent/50 bg-accent/10 text-accent"
                                : "border-border bg-card text-muted-foreground hover:bg-secondary/50"
                            }`}
                          >
                            {t === "Threat" ? <><AlertTriangle className="h-3 w-3 inline mr-1" />{t}</> : <><Shield className="h-3 w-3 inline mr-1" />{t}</>}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Existing Competitors</p>
                      {searchResults.map((result: any) => (
                        <button
                          key={result.id}
                          onClick={() => handleAddCompetitor(result.name)}
                          className="w-full flex items-center gap-3 rounded-lg border border-border/50 bg-secondary/20 p-3 hover:bg-secondary/50 transition-colors text-left"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-card border border-border/50 overflow-hidden shrink-0">
                            <img
                              src={faviconSrc(domainFromName(result.name))}
                              alt=""
                              className="h-4 w-4"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">{result.name}</p>
                            {result.industry_tags?.length > 0 && (
                              <p className="text-[10px] text-muted-foreground">{result.industry_tags.slice(0, 3).join(" · ")}</p>
                            )}
                          </div>
                          <Badge variant="secondary" className="text-[9px] shrink-0">Track</Badge>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* New competitor preview */}
                  {newCompName.trim() && searchResults.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl bg-secondary/40 border border-border/50 p-3 flex items-center gap-3"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border/50 overflow-hidden shrink-0">
                        <img
                          src={faviconSrc(domainFromName(newCompName.trim()))}
                          alt=""
                          className="h-5 w-5"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                            (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-sm font-bold text-muted-foreground">${newCompName.trim().charAt(0).toUpperCase()}</span>`;
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{newCompName.trim()}</p>
                        <p className="text-[10px] text-muted-foreground">New entry · will be AI-enriched</p>
                      </div>
                      <Badge className="text-[9px] shrink-0 bg-accent/10 text-accent border-0">+ New</Badge>
                    </motion.div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border/50 bg-secondary/20">
                  <button
                    onClick={() => { setShowAddModal(false); setNewCompName(""); setNewCompType("Direct"); setNewCompIntent("Threat"); setSearchResults([]); }}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { if (newCompName.trim()) handleAddCompetitor(newCompName.trim()); }}
                    disabled={!newCompName.trim() || dbAdding}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors shadow-sm disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-2"
                  >
                    {dbAdding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Add Competitor
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
