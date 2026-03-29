import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, HelpCircle, ArrowUpRight, TrendingUp, ChevronDown, Sparkles, Search, ExternalLink, X, Building2, User, Tag, Layers, Calendar, Plus, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { FirmDeal } from "@/hooks/useInvestorProfile";

interface PortfolioTabProps {
  companySector?: string;
  onInvestorClick?: (partnerName: string) => void;
  /** When set (including `[]`), list uses `firm_recent_deals` for this firm instead of demo data */
  firmDeals?: FirmDeal[] | null;
  portfolioLoading?: boolean;
  leadPartnerName?: string | null;
  /** Partner names on the firm card (JSON + DB) — used to link deal rows to people */
  partnerNamesLower?: Set<string>;
}

type CompatibilityStatus = "compatible" | "conflict" | "unknown";

const RECENT_INVESTMENTS = [
  { name: "NovaBuild", stage: "Seed", sector: "PropTech", amount: "$4M", date: "Jan 2026", website: "novabuild.io", description: "AI-driven workflow automation for commercial construction sites.", partner: "Sarah Chen", role: "LEAD" as const, partnerInDb: true },
  { name: "Synthara Bio", stage: "Series A", sector: "Biotech", amount: "$12M", date: "Nov 2025", website: "syntharabio.com", description: "Computational drug discovery platform accelerating preclinical timelines.", partner: "James Park", role: "LEAD" as const, partnerInDb: true },
  { name: "GridShift Energy", stage: "Series A", sector: "Climate", amount: "$8M", date: "Sep 2025", website: "gridshift.energy", description: "Smart grid optimization software for renewable energy providers.", partner: "Sarah Chen", role: "CO-LED" as const, partnerInDb: true },
  { name: "CodeVault", stage: "Pre-Seed", sector: "DevTools", amount: "$1.5M", date: "Jul 2025", website: "codevault.dev", description: "Developer-first security tooling for CI/CD pipelines.", partner: "David Liu", role: "PARTICIPATED" as const, partnerInDb: false },
  { name: "FinLedger", stage: "Seed", sector: "Fintech", amount: "$3M", date: "May 2025", website: "finledger.io", description: "Real-time reconciliation engine for digital asset custodians.", partner: "James Park", role: "LEAD" as const, partnerInDb: true },
  { name: "MedScope AI", stage: "Series A", sector: "HealthTech", amount: "$10M", date: "Mar 2025", website: "medscope.ai", description: "Clinical decision support powered by multimodal medical imaging.", partner: "Sarah Chen", role: "CO-LED" as const, partnerInDb: false },
];

type InvestmentRow = {
  key: string;
  name: string;
  stage: string;
  sector: string;
  amount: string;
  date: string;
  website: string;
  description: string;
  partner: string;
  role: "LEAD" | "CO-LED" | "PARTICIPATED";
  partnerInDb: boolean;
};

function formatDealDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function guessPortfolioWebsite(companyName: string): string {
  const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 48);
  return slug ? `${slug}.com` : "company.com";
}

const MOCK_INVESTMENT_ROWS: InvestmentRow[] = RECENT_INVESTMENTS.map((co) => ({
  key: co.name,
  name: co.name,
  stage: co.stage,
  sector: co.sector,
  amount: co.amount,
  date: co.date,
  website: co.website,
  description: co.description,
  partner: co.partner,
  role: co.role,
  partnerInDb: co.partnerInDb,
}));

const NOTABLE_EXITS = ["Stripe", "Figma"];
const TOP_UNICORNS = [
  { name: "Stripe", website: "stripe.com" },
  { name: "Figma", website: "figma.com" },
  { name: "Notion", website: "notion.so" },
];

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const [triggered, setTriggered] = useState(false);

  const trigger = useCallback(() => {
    if (triggered) return;
    setTriggered(true);
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, triggered]);

  return { value: triggered ? value : target, trigger, triggered };
}

function CountUpNumber({ target, label }: { target: number; label: string }) {
  const { value, trigger, triggered } = useCountUp(target);

  return (
    <motion.span
      className="text-3xl font-extrabold text-foreground cursor-pointer select-none"
      onClick={trigger}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      title={`Click to animate ${label}`}
    >
      {triggered ? value : target}
    </motion.span>
  );
}

function CompanyLogo({ website, name, size = "w-10 h-10" }: { website: string; name: string; size?: string }) {
  const [src, setSrc] = useState(`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${website}&size=128`);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`${size} flex items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-sm font-bold text-primary shrink-0`}>
        {name.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className={`${size} rounded-xl border border-border object-contain bg-background p-1 shrink-0`}
      onError={() => {
        if (src.includes("gstatic")) {
          setSrc(`https://www.google.com/s2/favicons?domain=${website}&sz=128`);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

const COMPAT_CONFIG: Record<CompatibilityStatus, {
  icon: typeof CheckCircle2;
  iconClass: string;
  cardClass: string;
  title: string;
  subtitle: string;
}> = {
  compatible: {
    icon: CheckCircle2,
    iconClass: "text-success",
    cardClass: "bg-success/5 border-success/20",
    title: "Clear Runway",
    subtitle: "They invest in your sector, and we detect zero direct competitors in their active portfolio.",
  },
  conflict: {
    icon: AlertTriangle,
    iconClass: "text-destructive",
    cardClass: "bg-destructive/5 border-destructive/20",
    title: "Portfolio Collision",
    subtitle: "High risk. They lead a $4M Seed round in your direct competitor, Synthara Bio.",
  },
  unknown: {
    icon: HelpCircle,
    iconClass: "text-muted-foreground",
    cardClass: "bg-secondary/50 border-border",
    title: "Outside Mandate",
    subtitle: "This firm does not actively invest in your specific stage or sector. Proceed with caution.",
  },
};

const STATUS_DEFINITIONS: { status: CompatibilityStatus; title: string; icon: typeof CheckCircle2; iconClass: string; description: string }[] = [
  {
    status: "compatible",
    title: "Clear Runway",
    icon: CheckCircle2,
    iconClass: "text-success",
    description: "No direct competitors found in their active portfolio. This investor actively deploys in your sector and stage, making them a strong fit for outreach.",
  },
  {
    status: "conflict",
    title: "Portfolio Collision",
    icon: AlertTriangle,
    iconClass: "text-destructive",
    description: "We detected one or more direct competitors in their portfolio. This creates a potential conflict of interest — the investor may share proprietary information or be less likely to invest.",
  },
  {
    status: "unknown",
    title: "Outside Mandate",
    icon: HelpCircle,
    iconClass: "text-muted-foreground",
    description: "This firm does not actively invest in your specific stage or sector based on available data. They may still be open to exceptions, but proceed with caution.",
  },
];

function CompatibilityCard({ status }: { status: CompatibilityStatus }) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const cfg = COMPAT_CONFIG[status];
  const Icon = cfg.icon;

  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  return (
    <div ref={cardRef} className="relative">
      <div
        className={`rounded-2xl border relative flex flex-col cursor-pointer transition-all group ${cfg.cardClass} hover:border-success/40`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="p-5 flex flex-col justify-center">
          <div className="flex items-start justify-between">
            <Icon className={`w-8 h-8 ${cfg.iconClass} mb-2`} />
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </motion.div>
          </div>
          <h4 className="text-lg font-bold text-foreground">{cfg.title}</h4>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{cfg.subtitle}</p>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-[calc(100%+8px)] right-0 w-80 md:w-96 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="bg-secondary/50 border-b border-border p-4">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">AI Conflict Check</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Companies Scanned</span>
                <span className="text-sm font-bold text-foreground">142</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Sector Matches (SaaS)</span>
                <span className="text-sm font-bold text-foreground">32</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Direct Competitors</span>
                <span className="text-sm font-bold text-success">0</span>
              </div>
            </div>
            <div className="p-4 bg-success/5 border-t border-success/20 text-xs text-success font-medium">
              No immediate competitive threats detected in their active portfolio.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Missing Profile Modal ──
function MissingProfileModal({
  open,
  onOpenChange,
  partnerName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  partnerName: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const initials = partnerName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (!generating) { setProgress(0); return; }
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 92) { clearInterval(interval); return 92; }
        return p + Math.random() * 6;
      });
    }, 800);
    return () => clearInterval(interval);
  }, [generating]);

  const handleGenerate = () => setGenerating(true);

  useEffect(() => {
    if (!open) { setGenerating(false); setProgress(0); }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!generating) onOpenChange(v); }}>
      <DialogContent className="bg-background rounded-2xl max-w-md w-full p-0 shadow-2xl border-border overflow-hidden [&>button]:hidden">
        <AnimatePresence mode="wait">
          {!generating ? (
            <motion.div
              key="request"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground font-bold text-sm">
                  {initials}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{partnerName}</h3>
                  <p className="text-sm text-muted-foreground">Partner profile not yet generated</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                We have transactional data for this partner, but their full intelligence dossier has not been generated yet.
              </p>

              <button
                onClick={handleGenerate}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl mb-3 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Auto-Generate Profile
              </button>

              <button
                onClick={() => onOpenChange(false)}
                className="w-full text-sm font-medium text-muted-foreground hover:text-foreground py-2 transition-colors"
              >
                I have their details, let me add them manually
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-6 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Generating Profile</h3>
              <Progress value={progress} className="h-2 mb-4" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                Our AI agents are currently scanning Apollo and public sources to build <strong className="text-foreground">{partnerName}</strong>'s profile. This usually takes about 60 seconds. We will notify you when it is ready.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

export function PortfolioTab({
  companySector,
  onInvestorClick,
  firmDeals,
  portfolioLoading,
  leadPartnerName,
  partnerNamesLower,
}: PortfolioTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [missingProfilePartner, setMissingProfilePartner] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLivePortfolio = firmDeals !== undefined;

  const investmentRows = useMemo((): InvestmentRow[] => {
    if (!isLivePortfolio) return MOCK_INVESTMENT_ROWS;
    const lead = (leadPartnerName || "").trim();
    const partnerNorm = (n: string) => n.toLowerCase().trim();
    return (firmDeals ?? []).map((d) => {
      const partnerLabel = lead || "—";
      const inDb =
        !!lead &&
        (partnerNamesLower?.has(partnerNorm(lead)) ?? false);
      return {
        key: d.id,
        name: d.company_name,
        stage: d.stage?.trim() || "—",
        sector: "—",
        amount: d.amount?.trim() || "—",
        date: formatDealDate(d.date_announced),
        website: guessPortfolioWebsite(d.company_name),
        description: `Portfolio company — ${d.company_name}.`,
        partner: partnerLabel,
        role: "LEAD",
        partnerInDb: inDb,
      };
    });
  }, [isLivePortfolio, firmDeals, leadPartnerName, partnerNamesLower]);

  const allSectors = useMemo(
    () => [...new Set(investmentRows.map((i) => i.sector).filter((s) => s !== "—"))],
    [investmentRows]
  );
  const allStages = useMemo(() => [...new Set(investmentRows.map((i) => i.stage))], [investmentRows]);
  const allPartners = useMemo(
    () => [...new Set(investmentRows.map((i) => i.partner).filter((p) => p !== "—"))],
    [investmentRows]
  );

  const suggestions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];
    type Suggestion = { label: string; category: string; icon: typeof Building2; value: string };
    const results: Suggestion[] = [];

    investmentRows.forEach((co) => {
      if (co.name.toLowerCase().includes(q) && !results.some((r) => r.value === co.name && r.category === "Company"))
        results.push({ label: co.name, category: "Company", icon: Building2, value: co.name });
    });
    allPartners.forEach((p) => {
      if (p.toLowerCase().includes(q) && !results.some((r) => r.value === p && r.category === "Investor"))
        results.push({ label: p, category: "Investor", icon: User, value: p });
    });
    allSectors.forEach((s) => {
      if (s.toLowerCase().includes(q) && !results.some((r) => r.value === s && r.category === "Sector"))
        results.push({ label: s, category: "Sector", icon: Tag, value: s });
    });
    allStages.forEach((s) => {
      if (s.toLowerCase().includes(q) && !results.some((r) => r.value === s && r.category === "Stage"))
        results.push({ label: s, category: "Stage", icon: Layers, value: s });
    });
    investmentRows.forEach((co) => {
      if (co.date.toLowerCase().includes(q) && !results.some((r) => r.value === co.date && r.category === "Date"))
        results.push({ label: co.date, category: "Date", icon: Calendar, value: co.date });
    });
    investmentRows.forEach((co) => {
      if (
        co.description.toLowerCase().includes(q) &&
        !results.some((r) => r.value === co.name && r.category === "Keyword Match")
      )
        results.push({ label: co.name, category: "Keyword Match", icon: Sparkles, value: co.name });
    });
    return results.slice(0, 8);
  }, [searchQuery, allSectors, allStages, allPartners, investmentRows]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelectSuggestion = (value: string) => {
    setSearchQuery(value);
    setShowDropdown(false);
    setSelectedIdx(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && selectedIdx >= 0) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[selectedIdx].value);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const filteredInvestments = useMemo(() => {
    return investmentRows.filter((co) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        [co.name, co.description, co.sector, co.stage, co.date, co.partner, co.amount, co.role, co.website].some(
          (field) => field.toLowerCase().includes(q)
        );
      const matchesSector = sectorFilter === "all" || co.sector === sectorFilter;
      const matchesStage = stageFilter === "all" || co.stage === stageFilter;
      return matchesSearch && matchesSector && matchesStage;
    });
  }, [investmentRows, searchQuery, sectorFilter, stageFilter]);

  const compatibilityStatus: CompatibilityStatus = useMemo(() => {
    if (!companySector) return "unknown";
    const hasMatch = investmentRows.some((inv) =>
      inv.sector !== "—" ? inv.sector.toLowerCase().includes(companySector.toLowerCase()) : false
    );
    if (isLivePortfolio && !hasMatch) return "unknown";
    return hasMatch ? "conflict" : "compatible";
  }, [companySector, investmentRows, isLivePortfolio]);

  const activePortfolioCount = isLivePortfolio ? investmentRows.length : 142;

  if (portfolioLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">Loading portfolio data…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Missing Profile Modal */}
      <MissingProfileModal
        open={!!missingProfilePartner}
        onOpenChange={(v) => { if (!v) setMissingProfilePartner(null); }}
        partnerName={missingProfilePartner || ""}
      />

      {/* Top Row: Stats + Compatibility */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Portfolio Stats — spans 2 cols */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 flex items-center justify-around">
          {/* Active Portfolio */}
          <div className="w-full text-center border-r border-border">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Active Portfolio
            </p>
            <CountUpNumber target={activePortfolioCount} label="Active Portfolio" />
            {!isLivePortfolio ? (
              <>
                <div className="flex items-center gap-1 mt-1.5 text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full w-max mx-auto">
                  <TrendingUp className="w-3 h-3" /> +14 this year
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Top Sector: <span className="font-semibold text-foreground">SaaS (32%)</span></p>
              </>
            ) : (
              <p className="text-[10px] text-muted-foreground mt-1.5">From firm record · recent deals</p>
            )}
          </div>

          {/* Exits */}
          <div className="w-full text-center border-r border-border">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Exits
            </p>
            {isLivePortfolio ? (
              <p className="text-lg font-semibold text-muted-foreground">—</p>
            ) : (
              <>
                <CountUpNumber target={38} label="Exits" />
                <p className="text-[10px] text-muted-foreground mt-2">
                  Notable: {NOTABLE_EXITS.map((name, i) => (
                    <span key={name}><strong className="text-foreground">{name}</strong>{i < NOTABLE_EXITS.length - 1 ? ", " : ""}</span>
                  ))}
                </p>
              </>
            )}
          </div>

          {/* Unicorns */}
          <div className="w-full text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Unicorns
            </p>
            {isLivePortfolio ? (
              <p className="text-lg font-semibold text-muted-foreground">—</p>
            ) : (
              <>
                <CountUpNumber target={12} label="Unicorns" />
                <div className="flex items-center justify-center mt-2 -space-x-2">
                  {TOP_UNICORNS.map((u) => (
                    <CompanyLogo key={u.name} website={u.website} name={u.name} size="w-6 h-6" />
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">& 9 more</p>
              </>
            )}
          </div>
        </div>

        {/* Smart Compatibility Card */}
        <CompatibilityCard status={compatibilityStatus} />
      </div>

      {/* Recent Investments List */}
      <div>
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
          Recent Investments
        </h4>

        {/* Filter Bar */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-border mb-2">
          <div ref={searchRef} className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground z-10" />
            <Input
              ref={inputRef}
              placeholder="Search by company, sector, stage, investor, date..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); setSelectedIdx(-1); }}
              onFocus={() => { if (searchQuery.trim()) setShowDropdown(true); }}
              onKeyDown={handleKeyDown}
              className="h-8 pl-8 pr-8 text-xs bg-secondary/50 border-border"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setShowDropdown(false); inputRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors z-10"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            )}

            {/* Smart Dropdown */}
            <AnimatePresence>
              {showDropdown && suggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-[calc(100%+4px)] left-0 w-full bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden"
                >
                  {suggestions.map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={`${s.category}-${s.value}`}
                        onClick={() => handleSelectSuggestion(s.value)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                          i === selectedIdx ? "bg-primary/10" : "hover:bg-secondary/60"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium text-foreground truncate">{s.label}</span>
                        <span className="ml-auto text-[9px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">{s.category}</span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2">
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {allStages.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sectorFilter} onValueChange={setSectorFilter}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="All Sectors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sectors</SelectItem>
                {(allSectors.length ? allSectors : []).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col w-full">
          {/* Column Headers (desktop only) */}
          <div className="hidden md:grid grid-cols-12 gap-3 items-center px-4 pb-3 border-b border-border">
            <span className="col-span-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Company</span>
            <span className="col-span-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Stage</span>
            <span className="col-span-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Sector</span>
            <span className="col-span-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Investment</span>
            <span className="col-span-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Date</span>
            <span className="col-span-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Investor</span>
          </div>

          <TooltipProvider delayDuration={300}>
            {filteredInvestments.map((co) => {
              const isSectorMatch =
                companySector &&
                co.sector !== "—" &&
                co.sector.toLowerCase().includes(companySector.toLowerCase());
              return (
                <div
                  key={co.key}
                  className={`group grid grid-cols-12 gap-3 items-center px-4 py-3 border-b border-border hover:bg-secondary/40 transition-colors cursor-pointer ${
                    isSectorMatch ? "bg-primary/5 border-l-4 border-l-primary" : ""
                  }`}
                >
                  {/* Col 1: Company (4 cols) */}
                  <div className="col-span-12 md:col-span-4 flex items-center gap-3">
                    <CompanyLogo website={co.website} name={co.name} size="w-9 h-9" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-foreground truncate">{co.name}</span>
                        {isSectorMatch && (
                          <span className="flex items-center gap-0.5 text-[9px] font-semibold text-primary shrink-0">
                            <Sparkles className="w-2.5 h-2.5" /> Relevant
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{co.description}</p>
                    </div>
                  </div>

                  {/* Col 2: Stage (1 col) */}
                  <div className="col-span-4 md:col-span-1">
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium whitespace-nowrap">{co.stage}</Badge>
                  </div>

                  {/* Col 3: Sector (2 cols) */}
                  <div className="col-span-4 md:col-span-2">
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-medium whitespace-nowrap">{co.sector}</Badge>
                  </div>

                  {/* Col 4: Investment Amount & Role (2 cols) */}
                  <div className="col-span-4 md:col-span-2 flex flex-col items-start gap-1">
                    <span className="text-sm font-bold text-foreground">{co.amount}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      co.role === "LEAD" ? "bg-primary/10 text-primary" :
                      co.role === "CO-LED" ? "bg-accent/10 text-accent-foreground" :
                      "bg-secondary text-muted-foreground"
                    }`}>{co.role}</span>
                  </div>

                  {/* Col 5: Date (1 col) */}
                  <div className="col-span-6 md:col-span-1">
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{co.date}</span>
                  </div>

                  {/* Col 6: Investor (2 cols) — Conditional Routing */}
                  <div className="col-span-6 md:col-span-2 flex items-center gap-2 justify-end">
                    {co.partner !== "—" && co.partnerInDb ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onInvestorClick?.(co.partner); }}
                        className="flex items-center gap-2 text-muted-foreground hover:text-primary cursor-pointer transition-colors group/investor"
                      >
                        <div className="w-5 h-5 rounded-full bg-secondary border border-border flex items-center justify-center text-[8px] font-bold text-muted-foreground shrink-0">
                          {co.partner.charAt(0)}
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap transition-colors">{co.partner}</span>
                        <ArrowUpRight className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover/investor:opacity-100 transition-opacity shrink-0" />
                      </button>
                    ) : co.partner !== "—" ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setMissingProfilePartner(co.partner); }}
                        className="flex items-center gap-2 text-muted-foreground cursor-pointer group/missing"
                      >
                        <div className="w-5 h-5 rounded-full bg-secondary border border-dashed border-muted-foreground/40 flex items-center justify-center text-[8px] font-bold text-muted-foreground shrink-0">
                          {co.partner.charAt(0)}
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap border-b border-dashed border-muted-foreground/40 group-hover/missing:border-foreground/60 group-hover/missing:text-foreground transition-colors">{co.partner}</span>
                        <Plus className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover/missing:opacity-100 transition-opacity shrink-0" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </TooltipProvider>
          {filteredInvestments.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No investments match your filters.</p>
          )}
        </div>
      </div>
    </div>
  );
}
