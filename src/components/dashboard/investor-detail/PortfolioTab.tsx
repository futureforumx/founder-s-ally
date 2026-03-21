import { useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, HelpCircle, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PortfolioTabProps {
  companySector?: string;
}

type CompatibilityStatus = "compatible" | "conflict" | "unknown";

const PORTFOLIO_STATS = [
  { label: "Active Portfolio", value: 142 },
  { label: "Exits", value: 38 },
  { label: "Unicorns", value: 12 },
];

const RECENT_INVESTMENTS = [
  { name: "NovaBuild", stage: "Seed", sector: "PropTech", amount: "$4M" },
  { name: "Synthara Bio", stage: "Series A", sector: "Biotech", amount: "$12M" },
  { name: "GridShift Energy", stage: "Series A", sector: "Climate", amount: "$8M" },
  { name: "CodeVault", stage: "Pre-Seed", sector: "DevTools", amount: "$1.5M" },
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
          {PORTFOLIO_STATS.map((stat, i) => (
            <div
              key={stat.label}
              className={`w-full text-center ${i < PORTFOLIO_STATS.length - 1 ? "border-r border-border" : ""}`}
            >
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                {stat.label}
              </p>
              <AnimatedNumber value={stat.value} />
            </div>
          ))}
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
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 hover:border-accent/20 transition-colors"
            >
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
    </div>
  );
}
