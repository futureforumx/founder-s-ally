import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, Globe, ExternalLink, Sparkles, Zap, Shield, Target, ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CompanyData } from "@/components/CompanyProfile";

interface CompetitorsViewProps {
  companyData: CompanyData | null;
  onNavigateProfile: () => void;
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

function BattlecardPanel({ name, onClose }: { name: string; onClose: () => void }) {
  const intel = getIntel(name);
  const domain = domainFromName(name);

  return (
    <>
      {/* Header */}
      <SheetHeader className="pb-4 border-b border-border">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary shrink-0 overflow-hidden">
            <img
              src={faviconSrc(domain)}
              alt=""
              className="h-8 w-8"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-xl font-bold text-muted-foreground">${name.charAt(0).toUpperCase()}</span>`;
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-lg font-bold text-foreground">{name}</SheetTitle>
            <div className="flex items-center gap-2 mt-1.5">
              <a
                href={`https://${domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent/80 transition-colors"
              >
                <Globe className="h-3 w-3" /> {domain}
              </a>
              <Badge className={`text-[9px] font-semibold border-0 rounded-full px-2 py-0.5 ${statusColor(intel.status)}`}>
                {intel.status}
              </Badge>
            </div>
          </div>
        </div>
      </SheetHeader>

      {/* Body */}
      <div className="mt-6 space-y-6 overflow-y-auto flex-1">
        {/* TL;DR */}
        <div>
          <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">TL;DR</h4>
          <p className="text-sm text-foreground leading-relaxed">{intel.tldr}</p>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-secondary/50 px-3 py-2.5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Funding</p>
            <p className="text-sm font-bold text-foreground mt-1">{intel.funding}</p>
          </div>
          <div className="rounded-lg bg-secondary/50 px-3 py-2.5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Stage</p>
            <p className="text-sm font-bold text-foreground mt-1">{intel.stage}</p>
          </div>
          <div className="rounded-lg bg-secondary/50 px-3 py-2.5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Team</p>
            <p className="text-sm font-bold text-foreground mt-1">{intel.employees}</p>
          </div>
        </div>

        {/* Pricing */}
        <div>
          <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Pricing Model</h4>
          <p className="text-[13px] text-foreground/80 leading-relaxed bg-secondary/30 rounded-lg px-4 py-3">{intel.pricing}</p>
        </div>

        {/* SWOT - Strengths & Weaknesses */}
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
    </>
  );
}

// ── Main Component ──

export function CompetitorsView({ companyData, onNavigateProfile }: CompetitorsViewProps) {
  const [activeCompetitor, setActiveCompetitor] = useState<string | null>(null);
  const competitors = companyData?.competitors || [];

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

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {competitors.map((name) => {
            const intel = getIntel(name);
            const domain = domainFromName(name);

            return (
              <button
                key={name}
                onClick={() => setActiveCompetitor(name)}
                className="text-left rounded-2xl border border-border bg-card p-6 shadow-surface transition-all duration-300 hover:shadow-surface-md hover:-translate-y-1 hover:border-accent/20 group"
              >
                {/* Card Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary shrink-0 overflow-hidden">
                    <img
                      src={faviconSrc(domain)}
                      alt=""
                      className="h-7 w-7 rounded-lg object-cover"
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

                {/* Description */}
                <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2 mb-4">
                  {intel.description}
                </p>

                {/* Advantage Kicker */}
                <div className="rounded-xl bg-success/5 border border-success/10 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-success mb-1">
                    ⚡ Our Advantage
                  </p>
                  <p className="text-[11px] text-success/80 leading-relaxed">
                    {intel.advantage}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Battlecard Slide-Over */}
      <Sheet open={!!activeCompetitor} onOpenChange={(open) => { if (!open) setActiveCompetitor(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto border-border bg-card flex flex-col">
          {activeCompetitor && (
            <BattlecardPanel name={activeCompetitor} onClose={() => setActiveCompetitor(null)} />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
