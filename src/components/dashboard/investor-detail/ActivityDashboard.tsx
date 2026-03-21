import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, ExternalLink, TrendingUp, TrendingDown, Minus, Pause, Play } from "lucide-react";

interface DealMonth {
  month: string;
  seed: number;
  seriesA: number;
  other: number;
  details: string;
  // Sector breakdown
  saas: number;
  fintech: number;
  health: number;
  sectorDetails: string;
}

interface RecentDeal {
  company: string;
  initial: string;
  description: string;
  amount: string;
  stage: string;
  role: string;
  date: string;
  sector: string;
}

interface ActivityDashboardProps {
  firmName: string;
  companySector?: string;
}

const DEAL_MONTHS: DealMonth[] = [
  { month: "Apr", seed: 2, seriesA: 0, other: 1, saas: 1, fintech: 1, health: 1, details: "Led 2 Pre-Seed, 1 Bridge", sectorDetails: "1 SaaS, 1 Fintech, 1 Health" },
  { month: "May", seed: 3, seriesA: 1, other: 0, saas: 2, fintech: 1, health: 1, details: "Led 3 Seed, participated 1 Series A", sectorDetails: "2 SaaS, 1 Fintech, 1 Health" },
  { month: "Jun", seed: 1, seriesA: 1, other: 1, saas: 1, fintech: 1, health: 1, details: "Led 1 Seed, 1 Series A, 1 Growth", sectorDetails: "1 SaaS, 1 Fintech, 1 Health" },
  { month: "Jul", seed: 4, seriesA: 0, other: 0, saas: 2, fintech: 1, health: 1, details: "Led 4 Seed rounds", sectorDetails: "2 SaaS, 1 Fintech, 1 Health" },
  { month: "Aug", seed: 2, seriesA: 2, other: 0, saas: 1, fintech: 2, health: 1, details: "Led 2 Seed, participated 2 Series A", sectorDetails: "1 SaaS, 2 Fintech, 1 Health" },
  { month: "Sep", seed: 3, seriesA: 1, other: 1, saas: 2, fintech: 2, health: 1, details: "Led 3 Seed, 1 Series A, 1 Bridge", sectorDetails: "2 SaaS, 2 Fintech, 1 Health" },
  { month: "Oct", seed: 5, seriesA: 1, other: 0, saas: 3, fintech: 1, health: 2, details: "Led 5 Seed, participated 1 Series A", sectorDetails: "3 SaaS, 1 Fintech, 2 Health" },
  { month: "Nov", seed: 2, seriesA: 2, other: 1, saas: 2, fintech: 1, health: 2, details: "Led 2 Seed, 2 Series A, 1 SPV", sectorDetails: "2 SaaS, 1 Fintech, 2 Health" },
  { month: "Dec", seed: 3, seriesA: 0, other: 0, saas: 1, fintech: 1, health: 1, details: "Led 3 Seed rounds", sectorDetails: "1 SaaS, 1 Fintech, 1 Health" },
  { month: "Jan", seed: 4, seriesA: 2, other: 1, saas: 3, fintech: 2, health: 2, details: "Led 4 Seed, 2 Series A, 1 Bridge", sectorDetails: "3 SaaS, 2 Fintech, 2 Health" },
  { month: "Feb", seed: 3, seriesA: 1, other: 0, saas: 2, fintech: 1, health: 1, details: "Led 3 Seed, participated 1 Series A", sectorDetails: "2 SaaS, 1 Fintech, 1 Health" },
  { month: "Mar", seed: 5, seriesA: 2, other: 1, saas: 3, fintech: 2, health: 3, details: "Led 5 Seed, 2 Series A, 1 Growth", sectorDetails: "3 SaaS, 2 Fintech, 3 Health" },
];

const RECENT_DEALS: RecentDeal[] = [
  { company: "NovaBuild", initial: "N", description: "B2B SaaS for Construction", amount: "$4M", stage: "Seed", role: "Led Round", date: "Mar 2026", sector: "PropTech" },
  { company: "Synthara Bio", initial: "S", description: "AI drug discovery platform", amount: "$12M", stage: "Series A", role: "Co-led", date: "Feb 2026", sector: "Biotech" },
  { company: "GridShift", initial: "G", description: "Smart grid optimization", amount: "$8M", stage: "Series A", role: "Led Round", date: "Jan 2026", sector: "Climate" },
  { company: "CodeVault", initial: "C", description: "Developer security tooling", amount: "$1.5M", stage: "Pre-Seed", role: "Participated", date: "Dec 2025", sector: "DevTools" },
];

const stageColor = (stage: string) => {
  if (stage.toLowerCase().includes("seed") || stage.toLowerCase().includes("pre-seed")) return "bg-success/15 text-success border-success/20";
  if (stage.toLowerCase().includes("series a")) return "bg-accent/15 text-accent border-accent/20";
  return "bg-muted text-muted-foreground border-border";
};

export function ActivityDashboard({ firmName, companySector }: ActivityDashboardProps) {
  const [paceView, setPaceView] = useState<"pace" | "trend">("pace");
  const [autoCycle, setAutoCycle] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState<"stage" | "sector">("stage");
  const [focusView, setFocusView] = useState<"stage" | "sector">("stage");
  const [focusAutoCycle, setFocusAutoCycle] = useState(true);
  const focusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCycle = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setPaceView(v => v === "pace" ? "trend" : "pace");
    }, 5000);
  }, []);

  useEffect(() => {
    if (autoCycle) startCycle();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoCycle, startCycle]);

  useEffect(() => {
    if (focusAutoCycle) {
      if (focusIntervalRef.current) clearInterval(focusIntervalRef.current);
      focusIntervalRef.current = setInterval(() => {
        setFocusView(v => v === "stage" ? "sector" : "stage");
      }, 5000);
    }
    return () => { if (focusIntervalRef.current) clearInterval(focusIntervalRef.current); };
  }, [focusAutoCycle]);
  const maxTotal = useMemo(() => Math.max(...DEAL_MONTHS.map(m => m.seed + m.seriesA + m.other)), []);
  const maxSectorTotal = useMemo(() => Math.max(...DEAL_MONTHS.map(m => m.saas + m.fintech + m.health)), []);
  const deployedPct = 40;

  // Compute pace & trend from heatmap data
  const { pace, prevPace, trendPct, trendDir } = useMemo(() => {
    const recent6 = DEAL_MONTHS.slice(-6);
    const prev6 = DEAL_MONTHS.slice(0, 6);
    const recentTotal = recent6.reduce((s, m) => s + m.seed + m.seriesA + m.other, 0);
    const prevTotal = prev6.reduce((s, m) => s + m.seed + m.seriesA + m.other, 0);
    const currentPace = +(recentTotal / 6).toFixed(1);
    const previousPace = +(prevTotal / 6).toFixed(1);
    const change = previousPace > 0 ? Math.round(((currentPace - previousPace) / previousPace) * 100) : 0;
    const dir: "up" | "down" | "flat" = change > 3 ? "up" : change < -3 ? "down" : "flat";
    return { pace: currentPace, prevPace: previousPace, trendPct: Math.abs(change), trendDir: dir };
  }, []);

  // SVG circular progress
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = (deployedPct / 100) * circumference;

  return (
    <div className="space-y-4">
      {/* Row 1: Fund Pulse Bento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card 1: Fund Status */}
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
          <div className="shrink-0">
            <svg width="68" height="68" viewBox="0 0 68 68" className="transform -rotate-90">
              <circle cx="34" cy="34" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
              <circle
                cx="34" cy="34" r={radius}
                fill="none"
                stroke="hsl(var(--success))"
                strokeWidth="5"
                strokeDasharray={`${strokeDash} ${circumference}`}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            </svg>
            <span className="block text-center text-[10px] font-bold text-foreground mt-0.5">{deployedPct}%</span>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Current Fund</p>
            <p className="text-sm font-bold text-foreground leading-tight">Fund III</p>
            <p className="text-[10px] text-muted-foreground">Vintage 2024 · Est. 40% Deployed</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              <span className="text-[10px] font-semibold text-success">Actively Writing Checks</span>
            </div>
          </div>
        </div>

        <div
          className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center items-center text-center relative overflow-hidden cursor-pointer select-none"
          onClick={() => {
            if (autoCycle) {
              setAutoCycle(false);
            } else {
              setAutoCycle(true);
            }
          }}
        >
          <button
            className="absolute top-2.5 right-2.5 p-1 rounded-md hover:bg-secondary transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setAutoCycle(v => !v);
            }}
          >
            {autoCycle ? <Pause className="w-3 h-3 text-muted-foreground" /> : <Play className="w-3 h-3 text-muted-foreground" />}
          </button>

          <AnimatePresence mode="wait">
            {paceView === "pace" ? (
              <motion.div
                key="pace"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center"
              >
                <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Investment Pace</p>
                <p className="text-4xl font-black text-foreground leading-none">{pace}</p>
                <p className="text-[10px] text-muted-foreground mt-1">New deals / month (6mo avg)</p>
              </motion.div>
            ) : (
              <motion.div
                key="trend"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center"
              >
                <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">6-Month Trend</p>
                <div className={`flex items-center gap-1.5 ${
                  trendDir === "up" ? "text-success" : trendDir === "down" ? "text-destructive" : "text-muted-foreground"
                }`}>
                  {trendDir === "up" && <TrendingUp className="w-6 h-6" />}
                  {trendDir === "down" && <TrendingDown className="w-6 h-6" />}
                  {trendDir === "flat" && <Minus className="w-6 h-6" />}
                  <span className="text-3xl font-black leading-none">
                    {trendDir === "flat" ? "0%" : `${trendDir === "up" ? "+" : "-"}${trendPct}%`}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {prevPace} → {pace} deals/mo
                </p>
                <div className={`text-[9px] font-semibold mt-1 px-2 py-0.5 rounded-full ${
                  trendDir === "up" ? "bg-success/10 text-success" : trendDir === "down" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"
                }`}>
                  {trendDir === "up" ? "Accelerating" : trendDir === "down" ? "Decelerating" : "Steady pace"}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Card 3: Stage Bias */}
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center">
          <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Recent Focus</p>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-success/15 text-success">
              70% Seed
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-accent/15 text-accent">
              30% Series A
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Based on last 6 months of activity</p>
        </div>
      </div>

      {/* Row 2: Stacked Deal Heatmap */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Deal Heatmap</p>
              <p className="text-[10px] text-muted-foreground">12-month rolling activity</p>
            </div>
            <div className="flex items-center bg-secondary rounded-lg p-0.5">
              <button
                onClick={() => setHeatmapMode("stage")}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                  heatmapMode === "stage"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Stage
              </button>
              <button
                onClick={() => setHeatmapMode("sector")}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                  heatmapMode === "sector"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sector
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
            {heatmapMode === "stage" ? (
              <>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-success/60" /> Seed</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-accent/60" /> Series A</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted-foreground/30" /> Other</span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary/60" /> SaaS</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-warning/60" /> Fintech</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive/40" /> Health</span>
              </>
            )}
          </div>
        </div>
        <TooltipProvider delayDuration={0}>
          <div className="flex items-end gap-1.5 h-20">
            {DEAL_MONTHS.map((m) => {
              if (heatmapMode === "stage") {
                const total = m.seed + m.seriesA + m.other;
                const seedH = (m.seed / maxTotal) * 100;
                const seriesH = (m.seriesA / maxTotal) * 100;
                const otherH = (m.other / maxTotal) * 100;
                return (
                  <Tooltip key={m.month}>
                    <TooltipTrigger asChild>
                      <div className="flex-1 flex flex-col items-stretch justify-end cursor-pointer group" style={{ height: "100%" }}>
                        {m.other > 0 && (
                          <div className="rounded-t-sm bg-muted-foreground/20 group-hover:bg-muted-foreground/40 transition-colors" style={{ height: `${otherH}%` }} />
                        )}
                        {m.seriesA > 0 && (
                          <div className="bg-accent/40 group-hover:bg-accent/60 transition-colors" style={{ height: `${seriesH}%` }} />
                        )}
                        {m.seed > 0 && (
                          <div className={`bg-success/40 group-hover:bg-success/60 transition-colors ${m.other === 0 && m.seriesA === 0 ? 'rounded-t-sm' : ''} rounded-b-sm`} style={{ height: `${seedH}%` }} />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-foreground text-background text-[10px] px-2.5 py-1.5 rounded-lg shadow-xl border-0 max-w-[200px]">
                      <p className="font-bold">{m.month}: {total} deals</p>
                      <p className="text-background/70">{m.details}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              } else {
                const total = m.saas + m.fintech + m.health;
                const saasH = (m.saas / maxSectorTotal) * 100;
                const fintechH = (m.fintech / maxSectorTotal) * 100;
                const healthH = (m.health / maxSectorTotal) * 100;
                return (
                  <Tooltip key={m.month}>
                    <TooltipTrigger asChild>
                      <div className="flex-1 flex flex-col items-stretch justify-end cursor-pointer group" style={{ height: "100%" }}>
                        {m.health > 0 && (
                          <div className="rounded-t-sm bg-destructive/30 group-hover:bg-destructive/50 transition-colors" style={{ height: `${healthH}%` }} />
                        )}
                        {m.fintech > 0 && (
                          <div className="bg-warning/40 group-hover:bg-warning/60 transition-colors" style={{ height: `${fintechH}%` }} />
                        )}
                        {m.saas > 0 && (
                          <div className={`bg-primary/40 group-hover:bg-primary/60 transition-colors ${m.health === 0 && m.fintech === 0 ? 'rounded-t-sm' : ''} rounded-b-sm`} style={{ height: `${saasH}%` }} />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-foreground text-background text-[10px] px-2.5 py-1.5 rounded-lg shadow-xl border-0 max-w-[200px]">
                      <p className="font-bold">{m.month}: {total} deals</p>
                      <p className="text-background/70">{m.sectorDetails}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              }
            })}
          </div>
          <div className="flex gap-1.5 mt-1">
            {DEAL_MONTHS.map((m) => (
              <span key={m.month} className="flex-1 text-center text-[8px] text-muted-foreground">{m.month}</span>
            ))}
          </div>
        </TooltipProvider>
      </div>

      {/* Row 3: Recent Transactions */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Recent Transactions</p>
        <div className="space-y-2">
          {RECENT_DEALS.map((deal) => {
            const sectorMatch = companySector && deal.sector.toLowerCase().includes(companySector.toLowerCase());
            return (
              <div key={deal.company} className="flex items-center justify-between p-3 bg-card border border-border rounded-xl hover:border-accent/30 transition-colors group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary border border-border text-xs font-bold text-muted-foreground shrink-0">
                    {deal.initial}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">{deal.company}</span>
                      {sectorMatch && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-warning/15 text-warning border border-warning/20">
                          <Sparkles className="h-2.5 w-2.5" /> Matches your sector
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{deal.description}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <Badge className={`text-[10px] px-2 py-0.5 ${stageColor(deal.stage)}`}>
                    {deal.amount} {deal.stage}
                  </Badge>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{deal.role} · {deal.date}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
