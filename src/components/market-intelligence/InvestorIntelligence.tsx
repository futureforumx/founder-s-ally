import { TrendingUp, TrendingDown, Zap, Users, Target, Lightbulb, ArrowRight, Radio } from "lucide-react";

// ── Summary Card Component ──
interface SummaryCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  accentColor?: string;
}

function SummaryCard({ label, value, change, icon, accentColor = "hsl(var(--success))" }: SummaryCardProps) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 hover:border-border/70 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div style={{ color: accentColor }}>{icon}</div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {change !== undefined && (
          <span className="text-xs font-medium" style={{ color: change >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
            {change >= 0 ? "↑" : "↓"}{Math.abs(change)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ── Live Status Badge ──
function LiveBadge() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      <span className="text-[11px] font-medium text-success">LIVE</span>
    </div>
  );
}

// ── Activity Feed Item ──
interface ActivityItem {
  id: string;
  type: "investment" | "partnership" | "launch" | "thesis";
  firm: string;
  detail: string;
  time: string;
  amount?: string;
  sector?: string;
}

function ActivityFeedItem({ item }: { item: ActivityItem }) {
  const typeColors = {
    investment: "bg-blue-500/10 text-blue-600 border-blue-200",
    partnership: "bg-purple-500/10 text-purple-600 border-purple-200",
    launch: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    thesis: "bg-amber-500/10 text-amber-600 border-amber-200",
  };

  const typeLabels = {
    investment: "Investment",
    partnership: "Partnership",
    launch: "Fund Launch",
    thesis: "Thesis Update",
  };

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/30 last:border-0">
      <div className={`px-2 py-1 rounded-lg border text-[10px] font-semibold ${typeColors[item.type]}`}>
        {typeLabels[item.type].split(" ")[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{item.firm}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
        {item.amount && <p className="text-xs font-semibold text-foreground mt-1">{item.amount}</p>}
      </div>
      <span className="text-[11px] text-muted-foreground shrink-0">{item.time}</span>
    </div>
  );
}

// ── Sector Heat Card (simplified) ──
function SectorMomentumCard({ sector }: { sector?: string }) {
  const heatData = [65, 72, 58, 81, 76, 69, 83, 77, 72, 88, 79, 74, 85, 81, 76, 92, 88, 84];
  
  const getTierClass = (v: number) => {
    if (v >= 80) return "bg-heat-4";
    if (v >= 60) return "bg-heat-3";
    if (v >= 40) return "bg-heat-2";
    if (v >= 20) return "bg-heat-1";
    return "bg-heat-0";
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Sector Momentum</h3>
          <p className="text-xs text-muted-foreground mt-1">{sector || "Your sector"}</p>
        </div>
        <div className="px-2 py-1 rounded-lg bg-success/10 text-success text-[10px] font-semibold border border-success/20">
          🔥 Accelerating
        </div>
      </div>

      <div className="grid grid-cols-9 gap-1">
        {heatData.map((v, i) => (
          <div key={i} className={`h-6 rounded-sm ${getTierClass(v)} hover:ring-2 hover:ring-accent/50 transition-all`} title={`${v}%`} />
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>12 mo ago</span>
        <span>Current</span>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-border/30">
        <TrendingUp className="h-3.5 w-3.5 text-success" />
        <span className="text-xs font-medium text-foreground">
          +28.4% <span className="text-muted-foreground font-normal">vs 6 mo ago</span>
        </span>
      </div>
    </div>
  );
}

// ── Top Active Firms Card ──
interface Firm {
  name: string;
  checks: number;
  stage: string;
  recent: boolean;
}

function TopActiveFirmsCard() {
  const firms: Firm[] = [
    { name: "Sequoia Capital", checks: 47, stage: "Series A-C", recent: true },
    { name: "Andreessen Horowitz", checks: 43, stage: "Seed-C", recent: true },
    { name: "Y Combinator", checks: 38, stage: "Seed-A", recent: false },
    { name: "Accel Partners", checks: 35, stage: "Series B+", recent: true },
    { name: "Khosla Ventures", checks: 32, stage: "Deep Tech", recent: false },
  ];

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Top Active Firms</h3>
        <p className="text-xs text-muted-foreground mt-1">In your sector this quarter</p>
      </div>

      <div className="space-y-2">
        {firms.map((firm) => (
          <div key={firm.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30 transition-colors">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{firm.name}</p>
              <p className="text-xs text-muted-foreground">{firm.stage}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {firm.recent && <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />}
              <span className="text-sm font-semibold text-foreground">{firm.checks}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AI Insights Card ──
function AIInsightsCard() {
  const insights = [
    "Seed rounds in AI infrastructure up 156% YoY - strong tailwind for your positioning",
    "Emerging 3-person teams getting $500k+ checks - lower barrier to entry",
    "Series B-C investors showing 2.3x more interest in unit economics than market share",
  ];

  return (
    <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-amber-50/40 to-orange-50/20 dark:from-amber-500/5 dark:to-orange-500/5 p-5 space-y-3 border-amber-200/30 dark:border-amber-500/20">
      <div className="flex items-start gap-2">
        <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">AI Insights</h3>
          <p className="text-xs text-muted-foreground mt-1">Pattern recognition from recent activity</p>
        </div>
      </div>

      <div className="space-y-2">
        {insights.map((insight, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-foreground">
            <span className="text-amber-600 dark:text-amber-400 font-bold shrink-0">→</span>
            <p>{insight}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──
export function MarketIntelligenceInvestors({ sector, stage }: { sector?: string; stage?: string }) {
  const recentActivities: ActivityItem[] = [
    { id: "1", type: "investment", firm: "Sequoia Capital", detail: "Led Series B in cloud infrastructure startup", time: "2h ago", amount: "$45M" },
    { id: "2", type: "partnership", firm: "A16Z", detail: "Announced partnership with enterprise SaaS portfolio", time: "4h ago" },
    { id: "3", type: "launch", firm: "Khosla Ventures", detail: "Launched new climate tech fund", time: "6h ago", amount: "$250M" },
    { id: "4", type: "thesis", firm: "Accel Partners", detail: "Updated thesis on AI-first enterprise tools", time: "1d ago" },
    { id: "5", type: "investment", firm: "Y Combinator", detail: "Portfolio company acquisition by Stripe", time: "1d ago" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Investor Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time market signals and investor activity</p>
        </div>
        <LiveBadge />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Active Investors"
          value="1,247"
          change={12}
          icon={<Users className="h-4 w-4" />}
          accentColor="hsl(var(--success))"
        />
        <SummaryCard
          label="New Investments"
          value="384"
          change={28}
          icon={<TrendingUp className="h-4 w-4" />}
          accentColor="hsl(var(--accent))"
        />
        <SummaryCard
          label="Emerging Sectors"
          value="12"
          change={45}
          icon={<Target className="h-4 w-4" />}
          accentColor="hsl(var(--destructive))"
        />
        <SummaryCard
          label="Thesis Matches"
          value="89"
          change={-3}
          icon={<Zap className="h-4 w-4" />}
          accentColor="hsl(var(--amber))"
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Live Activity Feed */}
        <div className="lg:col-span-2 rounded-2xl border border-border/50 bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Live Activity</h2>
            <Radio className="h-4 w-4 text-success animate-pulse" />
          </div>
          <div className="space-y-0">
            {recentActivities.map((item) => (
              <ActivityFeedItem key={item.id} item={item} />
            ))}
          </div>
          <button className="w-full py-2 text-xs font-medium text-accent hover:text-accent/80 transition-colors flex items-center justify-center gap-1 rounded-lg hover:bg-muted/30">
            View All Activity <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* Right: Sector & Insights */}
        <div className="space-y-6">
          <SectorMomentumCard sector={sector} />
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopActiveFirmsCard />
        <AIInsightsCard />
      </div>
    </div>
  );
}
