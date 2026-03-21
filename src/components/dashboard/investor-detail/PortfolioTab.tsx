import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, HelpCircle, ArrowUpRight, TrendingUp, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PortfolioTabProps {
  companySector?: string;
}

type CompatibilityStatus = "compatible" | "conflict" | "unknown";

const RECENT_INVESTMENTS = [
  { name: "NovaBuild", stage: "Seed", sector: "PropTech", amount: "$4M", date: "Jan 2026", website: "novabuild.io" },
  { name: "Synthara Bio", stage: "Series A", sector: "Biotech", amount: "$12M", date: "Nov 2025", website: "syntharabio.com" },
  { name: "GridShift Energy", stage: "Series A", sector: "Climate", amount: "$8M", date: "Sep 2025", website: "gridshift.energy" },
  { name: "CodeVault", stage: "Pre-Seed", sector: "DevTools", amount: "$1.5M", date: "Jul 2025", website: "codevault.dev" },
];

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

function FaviconAvatar({ website, name, size = "w-10 h-10" }: { website: string; name: string; size?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`${size} flex items-center justify-center rounded-xl bg-secondary border border-border text-sm font-bold text-muted-foreground shrink-0`}>
        {name.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${website}&sz=128`}
      alt={name}
      className={`${size} rounded-xl border border-border object-contain bg-background shrink-0`}
      onError={() => setFailed(true)}
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
  const cfg = COMPAT_CONFIG[status];
  const Icon = cfg.icon;

  return (
    <div
      className={`rounded-2xl border relative overflow-hidden flex flex-col cursor-pointer transition-all ${cfg.cardClass}`}
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

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-0 border-t border-border/50">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-4 mb-3">
                Status Definitions
              </p>
              <div className="space-y-3">
                {STATUS_DEFINITIONS.map((def) => {
                  const DefIcon = def.icon;
                  const isActive = def.status === status;
                  return (
                    <div
                      key={def.status}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg transition-colors ${isActive ? "bg-foreground/5 ring-1 ring-foreground/10" : ""}`}
                    >
                      <DefIcon className={`w-4 h-4 mt-0.5 shrink-0 ${def.iconClass}`} />
                      <div>
                        <p className={`text-xs font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                          {def.title}
                          {isActive && (
                            <span className="ml-1.5 text-[9px] font-bold uppercase bg-foreground/10 text-foreground px-1.5 py-0.5 rounded">
                              Current
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{def.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PortfolioTab({ companySector }: PortfolioTabProps) {
  const compatibilityStatus: CompatibilityStatus = useMemo(() => {
    if (!companySector) return "unknown";
    const hasMatch = RECENT_INVESTMENTS.some(
      (inv) => inv.sector.toLowerCase().includes(companySector.toLowerCase())
    );
    return hasMatch ? "conflict" : "compatible";
  }, [companySector]);

  return (
    <div className="space-y-5">
      {/* Top Row: Stats + Compatibility */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Portfolio Stats — spans 2 cols */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 flex items-center justify-around">
          {/* Active Portfolio */}
          <div className="w-full text-center border-r border-border">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Active Portfolio
            </p>
            <CountUpNumber target={142} label="Active Portfolio" />
            <div className="flex items-center gap-1 mt-1.5 text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full w-max mx-auto">
              <TrendingUp className="w-3 h-3" /> +14 this year
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Top Sector: <span className="font-semibold text-foreground">SaaS (32%)</span></p>
          </div>

          {/* Exits */}
          <div className="w-full text-center border-r border-border">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Exits
            </p>
            <CountUpNumber target={38} label="Exits" />
            <p className="text-[10px] text-muted-foreground mt-2">
              Notable: {NOTABLE_EXITS.map((name, i) => (
                <span key={name}><strong className="text-foreground">{name}</strong>{i < NOTABLE_EXITS.length - 1 ? ", " : ""}</span>
              ))}
            </p>
          </div>

          {/* Unicorns */}
          <div className="w-full text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Unicorns
            </p>
            <CountUpNumber target={12} label="Unicorns" />
            <div className="flex items-center justify-center mt-2 -space-x-2">
              {TOP_UNICORNS.map((u) => (
                <FaviconAvatar key={u.name} website={u.website} name={u.name} size="w-6 h-6" />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">& 9 more</p>
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
        <div className="space-y-2">
          {RECENT_INVESTMENTS.map((co) => (
            <div
              key={co.name}
              className="group flex items-center justify-between rounded-xl border border-border bg-card p-3 hover:bg-secondary/40 hover:shadow-sm cursor-pointer transition-all"
            >
              <div className="flex items-center gap-3">
                <FaviconAvatar website={co.website} name={co.name} />
                <div>
                  <span className="text-sm font-medium text-foreground">{co.name}</span>
                  <div className="flex gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">{co.stage}</Badge>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{co.sector}</Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground font-medium">{co.date}</span>
                <span className="text-sm font-semibold text-foreground">{co.amount}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
