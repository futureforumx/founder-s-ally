import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, HelpCircle, ArrowUpRight, TrendingUp } from "lucide-react";
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

function AnimatedNumber({ value }: { value: number }) {
  return (
    <motion.span
      className="text-3xl font-extrabold text-foreground"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {value}
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

function CompatibilityCard({ status }: { status: CompatibilityStatus }) {
  const cfg = COMPAT_CONFIG[status];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-2xl border p-5 relative overflow-hidden flex flex-col justify-center ${cfg.cardClass}`}>
      <Icon className={`w-8 h-8 ${cfg.iconClass} mb-2`} />
      <h4 className="text-lg font-bold text-foreground">{cfg.title}</h4>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{cfg.subtitle}</p>
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
            <AnimatedNumber value={142} />
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
            <AnimatedNumber value={38} />
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
            <AnimatedNumber value={12} />
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
