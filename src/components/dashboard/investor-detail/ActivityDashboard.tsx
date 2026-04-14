import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, Pause, Play, ExternalLink, Landmark, BarChart2 } from "lucide-react";
import { supabaseVcDirectory, isSupabaseConfigured } from "@/integrations/supabase/client";
import type { FirmDeal } from "@/hooks/useInvestorProfile";
import { looksLikeFirmRecordsUuid } from "@/lib/pickFirmXUrl";
import { safeLower, safeTrim } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface FundRecord {
  id: string;
  fund_name: string;
  fund_status?: string | null;
  vintage_year?: number | null;
  size_usd?: number | null;
  actively_deploying?: boolean | null;
  deployed_pct?: number | null;
  strategy?: string | null;
}

interface DealRow {
  id: string;
  firm_id: string;
  company_name: string;
  amount: string | null;
  stage: string | null;
  date_announced: string | null;
  created_at: string;
}

interface ActivityDashboardProps {
  firmName: string;
  firmDisplayName?: string | null;
  firmRecordsId?: string | null;
  vcDirectoryFirmId?: string | null;
  companySector?: string;
  /** Pre-loaded deals from liveProfile — supplements DB query */
  deals?: FirmDeal[] | null;
  fallbackAum?: string | null;
  fallbackIsActivelyDeploying?: boolean | null;
  fallbackRecentDeals?: string[] | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DB = supabaseVcDirectory as unknown as { from: (t: string) => any };

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function parseAmountUsd(amount: string | null): number | null {
  const s = safeTrim(amount);
  if (!s) return null;
  const lower = s.toLowerCase().replace(/[,\s]/g, "");
  const multiplier = lower.includes("billion") || /\db$/.test(lower) ? 1e9
    : lower.includes("million") || lower.includes("mn") || /\dm$/.test(lower) ? 1e6
    : lower.includes("thousand") || /\dk$/.test(lower) ? 1e3
    : 1;
  const num = parseFloat(lower.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? null : num * multiplier;
}

function inferStage(amount: string | null): "Pre-Seed" | "Seed" | "Series A" | "Series B+" | null {
  const usd = parseAmountUsd(amount);
  if (usd == null) return null;
  if (usd < 1_500_000) return "Pre-Seed";
  if (usd < 8_000_000) return "Seed";
  if (usd < 30_000_000) return "Series A";
  return "Series B+";
}

function dealDate(d: DealRow): Date {
  return new Date(d.date_announced ?? d.created_at);
}

/** Build a 12-month rolling array ending at the current month */
function buildMonthBuckets(deals: DealRow[]): { label: string; count: number; stages: Record<string, number> }[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-indexed
    const matching = deals.filter((deal) => {
      const dt = dealDate(deal);
      return dt.getFullYear() === year && dt.getMonth() === month;
    });
    const stages: Record<string, number> = {};
    matching.forEach((deal) => {
      const s = inferStage(deal.amount) ?? "Unknown";
      stages[s] = (stages[s] ?? 0) + 1;
    });
    return { label: MONTH_LABELS[month], count: matching.length, stages };
  });
}

const STAGE_ORDER: Record<string, number> = { "Pre-Seed": 0, "Seed": 1, "Series A": 2, "Series B+": 3 };

async function resolveFirmRecordId(
  firmRecordsId: string | null,
  vcDirectoryFirmId: string | null,
  firmDisplayName: string | null,
): Promise<string | null> {
  const trimmedFirmId = safeTrim(firmRecordsId) || null;
  if (trimmedFirmId && looksLikeFirmRecordsUuid(trimmedFirmId)) return trimmedFirmId;

  const candidateVcDirectoryId =
    safeTrim(vcDirectoryFirmId) ||
    (trimmedFirmId && !looksLikeFirmRecordsUuid(trimmedFirmId) ? trimmedFirmId : null);
  if (candidateVcDirectoryId) {
    const { data: byPrisma } = await DB
      .from("firm_records")
      .select("id")
      .eq("prisma_firm_id", candidateVcDirectoryId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    const prismaId = (byPrisma as { id: string } | null)?.id ?? null;
    if (prismaId) return prismaId;
  }

  const displayTrim = safeTrim(firmDisplayName);
  if (!displayTrim) return null;
  const trimmed = displayTrim;

  const { data: exact } = await DB
    .from("firm_records")
    .select("id")
    .ilike("firm_name", trimmed)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const exactId = (exact as { id: string } | null)?.id ?? null;
  if (exactId) return exactId;

  const { data: partial } = await DB
    .from("firm_records")
    .select("id")
    .ilike("firm_name", `%${trimmed}%`)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return (partial as { id: string } | null)?.id ?? null;
}

// ── Data hooks ───────────────────────────────────────────────────────────────

function useActiveFund(firmRecordsId: string | null, vcDirectoryFirmId: string | null, firmDisplayName: string | null) {
  return useQuery<FundRecord | null>({
    queryKey: ["activity-active-fund", firmRecordsId, vcDirectoryFirmId, safeLower(firmDisplayName)],
    queryFn: async () => {
      const resolvedId = await resolveFirmRecordId(firmRecordsId, vcDirectoryFirmId, firmDisplayName);
      if (!resolvedId) return null;

      const { data, error } = await DB
        .from("fund_records")
        .select("id, fund_name, fund_status, vintage_year, size_usd, actively_deploying, deployed_pct, strategy")
        .eq("firm_id", resolvedId)
        .is("deleted_at", null)
        .order("vintage_year", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return (data as FundRecord | null) ?? null;
    },
    enabled: Boolean((safeTrim(firmRecordsId) || safeTrim(vcDirectoryFirmId) || safeTrim(firmDisplayName)) && isSupabaseConfigured),
    retry: false,
  });
}

function useRecentDeals(firmRecordsId: string | null, vcDirectoryFirmId: string | null, firmDisplayName: string | null) {
  return useQuery<DealRow[]>({
    queryKey: ["activity-deals", firmRecordsId, vcDirectoryFirmId, safeLower(firmDisplayName)],
    queryFn: async () => {
      const resolvedId = await resolveFirmRecordId(firmRecordsId, vcDirectoryFirmId, firmDisplayName);
      if (!resolvedId) return [];
      const { data, error } = await DB
        .from("firm_recent_deals")
        .select("id, firm_id, company_name, amount, stage, date_announced, created_at")
        .eq("firm_id", resolvedId)
        .order("date_announced", { ascending: false, nullsFirst: false });
      if (error) return [];
      return (data ?? []) as DealRow[];
    },
    enabled: Boolean((safeTrim(firmRecordsId) || safeTrim(vcDirectoryFirmId) || safeTrim(firmDisplayName)) && isSupabaseConfigured),
    retry: false,
  });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CurrentFundCard({
  fund,
  loading,
  fallbackAum,
  fallbackIsActivelyDeploying,
}: {
  fund: FundRecord | null | undefined;
  loading: boolean;
  fallbackAum?: string | null;
  fallbackIsActivelyDeploying?: boolean | null;
}) {
  const pct = fund?.deployed_pct ?? null;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = pct != null ? (Math.min(pct, 100) / 100) * circumference : 0;
  const isDeploying = fund?.actively_deploying === true;

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
        <Skeleton className="h-[68px] w-[68px] rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    );
  }

  if (!fund) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
        <div className="shrink-0 h-[68px] w-[68px] rounded-full border border-border/60 flex items-center justify-center bg-secondary/30">
          <Landmark className="h-5 w-5 text-muted-foreground/40" />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Current Fund</p>
          {fallbackAum ? (
            <>
              <p className="text-sm font-semibold text-foreground">{fallbackAum} AUM</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {fallbackIsActivelyDeploying ? "Actively deploying" : "Firm-level data available; fund breakdown pending"}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-muted-foreground">No fund data</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Not yet synced from VC directory</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
      <div className="shrink-0 relative">
        <svg width="68" height="68" viewBox="0 0 68 68" className="transform -rotate-90">
          <circle cx="34" cy="34" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
          {pct != null && (
            <circle
              cx="34" cy="34" r={radius}
              fill="none"
              stroke={isDeploying ? "hsl(var(--success))" : "hsl(var(--muted-foreground))"}
              strokeWidth="5"
              strokeDasharray={`${strokeDash} ${circumference}`}
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
          {pct != null ? `${pct.toFixed(0)}%` : "—"}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Current Fund</p>
        <p className="text-sm font-bold text-foreground leading-tight truncate">{fund.fund_name}</p>
        <p className="text-[10px] text-muted-foreground">
          {fund.vintage_year ? `Vintage ${fund.vintage_year} · ` : ""}
          {fund.size_usd ? `${fmtUsd(fund.size_usd)} · ` : ""}
          {pct != null ? `Est. ${pct.toFixed(0)}% Deployed` : "Deployment data pending"}
        </p>
        {isDeploying && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-[10px] font-semibold text-success">Actively Writing Checks</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ActivityDashboard({
  firmName,
  firmDisplayName,
  firmRecordsId,
  vcDirectoryFirmId,
  companySector,
  deals: dealsProp,
  fallbackAum,
  fallbackIsActivelyDeploying,
  fallbackRecentDeals,
}: ActivityDashboardProps) {
  const [paceView, setPaceView] = useState<"pace" | "trend">("pace");
  const [autoCycle, setAutoCycle] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState<"stage" | "sector">("stage");
  const [focusAutoCycle, setFocusAutoCycle] = useState(true);
  const [focusView, setFocusView] = useState<"stage" | "sector">("stage");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const focusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: activeFund, isLoading: fundLoading } = useActiveFund(
    firmRecordsId ?? null,
    vcDirectoryFirmId ?? null,
    firmDisplayName ?? firmName,
  );
  const { data: dbDeals = [], isLoading: dealsLoading } = useRecentDeals(
    firmRecordsId ?? null,
    vcDirectoryFirmId ?? null,
    firmDisplayName ?? firmName,
  );

  // Merge DB deals with prop deals (prop deals may have more context)
  const allDeals = useMemo((): DealRow[] => {
    const db = dbDeals ?? [];
    // If we have prop deals but no DB deals, convert prop deals to DealRow shape
    if (db.length === 0 && dealsProp?.length) {
      return dealsProp.map((d) => ({
        id: d.id,
        firm_id: "",
        company_name: d.company_name,
        amount: d.amount,
        stage: d.stage,
        date_announced: d.date_announced,
        created_at: d.date_announced ?? new Date().toISOString(),
      }));
    }
    return db;
  }, [dbDeals, dealsProp]);

  const buckets = useMemo(() => buildMonthBuckets(allDeals), [allDeals]);
  const maxCount = useMemo(() => Math.max(...buckets.map((b) => b.count), 1), [buckets]);
  const totalDeals = useMemo(() => allDeals.length, [allDeals]);

  // Investment pace: last 6 months vs previous 6
  const { pace, prevPace, trendPct, trendDir } = useMemo(() => {
    const recent6 = buckets.slice(6).reduce((s, b) => s + b.count, 0);
    const prev6 = buckets.slice(0, 6).reduce((s, b) => s + b.count, 0);
    const currentPace = +(recent6 / 6).toFixed(1);
    const previousPace = +(prev6 / 6).toFixed(1);
    const change = previousPace > 0 ? Math.round(((currentPace - previousPace) / previousPace) * 100) : 0;
    const dir: "up" | "down" | "flat" = change > 5 ? "up" : change < -5 ? "down" : "flat";
    return { pace: currentPace, prevPace: previousPace, trendPct: Math.abs(change), trendDir: dir };
  }, [buckets]);

  // Stage distribution from real deal data
  const stageBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    allDeals.forEach((d) => {
      const stage = inferStage(d.amount) ?? "Unknown";
      counts[stage] = (counts[stage] ?? 0) + 1;
    });
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return Object.entries(counts)
      .filter(([k]) => k !== "Unknown")
      .sort((a, b) => (STAGE_ORDER[a[0]] ?? 99) - (STAGE_ORDER[b[0]] ?? 99))
      .map(([stage, count]) => ({ stage, pct: total > 0 ? Math.round((count / total) * 100) : 0 }));
  }, [allDeals]);

  // Sector distribution from stage field (which holds company category)
  const sectorBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    allDeals.forEach((d) => {
      const tag = safeTrim(d.stage);
      if (tag) counts[tag] = (counts[tag] ?? 0) + 1;
    });
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sector, count]) => ({ sector, pct: total > 0 ? Math.round((count / total) * 100) : 0 }));
  }, [allDeals]);

  // Auto-cycle timers
  const startCycle = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => setPaceView((v) => v === "pace" ? "trend" : "pace"), 5000);
  }, []);
  useEffect(() => {
    if (autoCycle) startCycle();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoCycle, startCycle]);

  useEffect(() => {
    if (focusAutoCycle) {
      if (focusIntervalRef.current) clearInterval(focusIntervalRef.current);
      focusIntervalRef.current = setInterval(() => setFocusView((v) => v === "stage" ? "sector" : "stage"), 5000);
    }
    return () => { if (focusIntervalRef.current) clearInterval(focusIntervalRef.current); };
  }, [focusAutoCycle]);

  // Stage color helpers
  const STAGE_COLORS: Record<string, string> = {
    "Pre-Seed": "bg-success/15 text-success",
    "Seed": "bg-success/20 text-success",
    "Series A": "bg-accent/15 text-accent",
    "Series B+": "bg-primary/15 text-primary",
  };
  const SECTOR_COLORS = ["bg-primary/15 text-primary", "bg-warning/15 text-warning", "bg-destructive/15 text-destructive"];

  const hasEnoughData = totalDeals > 0;

  return (
    <div className="space-y-4">
      {/* Row 1: Fund Pulse Bento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        {/* Card 1: Current Fund (live from fund_records) */}
        <CurrentFundCard
          fund={activeFund}
          loading={fundLoading}
          fallbackAum={fallbackAum}
          fallbackIsActivelyDeploying={fallbackIsActivelyDeploying}
        />

        {/* Card 2: Investment Pace (live from deal data) */}
        <div
          className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center items-center text-center relative overflow-hidden cursor-pointer select-none"
          onClick={() => setAutoCycle((v) => !v)}
        >
          <button
            className="absolute top-2.5 right-2.5 p-1 rounded-md hover:bg-secondary transition-colors"
            onClick={(e) => { e.stopPropagation(); setAutoCycle((v) => !v); }}
          >
            {autoCycle ? <Pause className="w-3 h-3 text-muted-foreground" /> : <Play className="w-3 h-3 text-muted-foreground" />}
          </button>

          {dealsLoading ? (
            <div className="space-y-2 w-full flex flex-col items-center">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-10 w-16" />
              <Skeleton className="h-3 w-36" />
            </div>
          ) : !hasEnoughData ? (
            <div className="flex flex-col items-center gap-1.5">
              <BarChart2 className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Investment Pace</p>
              <p className="text-xs text-muted-foreground/60">No deal data recorded yet</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {paceView === "pace" ? (
                <motion.div key="pace" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }} className="flex flex-col items-center">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Investment Pace</p>
                  <p className="text-4xl font-black text-foreground leading-none">{pace}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Deals / month (6mo avg)</p>
                  <p className="text-[9px] text-muted-foreground/60 mt-0.5">{totalDeals} total deals tracked</p>
                </motion.div>
              ) : (
                <motion.div key="trend" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }} className="flex flex-col items-center">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">6-Month Trend</p>
                  <div className={`flex items-center gap-1.5 ${trendDir === "up" ? "text-success" : trendDir === "down" ? "text-destructive" : "text-muted-foreground"}`}>
                    {trendDir === "up" && <TrendingUp className="w-6 h-6" />}
                    {trendDir === "down" && <TrendingDown className="w-6 h-6" />}
                    {trendDir === "flat" && <Minus className="w-6 h-6" />}
                    <span className="text-3xl font-black leading-none">
                      {trendDir === "flat" ? "0%" : `${trendDir === "up" ? "+" : "-"}${trendPct}%`}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">{prevPace} → {pace} deals/mo</p>
                  <div className={`text-[9px] font-semibold mt-1 px-2 py-0.5 rounded-full ${trendDir === "up" ? "bg-success/10 text-success" : trendDir === "down" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>
                    {trendDir === "up" ? "Accelerating" : trendDir === "down" ? "Decelerating" : "Steady pace"}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Card 3: Stage / Sector Bias (computed from live deals) */}
        <div
          className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center relative overflow-hidden cursor-pointer select-none"
          onClick={() => setFocusAutoCycle((v) => !v)}
        >
          <button
            className="absolute top-2.5 right-2.5 p-1 rounded-md hover:bg-secondary transition-colors"
            onClick={(e) => { e.stopPropagation(); setFocusAutoCycle((v) => !v); }}
          >
            {focusAutoCycle ? <Pause className="w-3 h-3 text-muted-foreground" /> : <Play className="w-3 h-3 text-muted-foreground" />}
          </button>

          {dealsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <div className="flex gap-2">
                <Skeleton className="h-7 w-20 rounded-full" />
                <Skeleton className="h-7 w-20 rounded-full" />
              </div>
            </div>
          ) : !hasEnoughData ? (
            <div>
              <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Recent Focus</p>
              <p className="text-xs text-muted-foreground/60">Insufficient data</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {focusView === "stage" ? (
                <motion.div key="focus-stage" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Recent Focus · Stage</p>
                  {stageBreakdown.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {stageBreakdown.map(({ stage, pct }) => (
                        <span key={stage} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${STAGE_COLORS[stage] ?? "bg-muted text-muted-foreground"}`}>
                          {pct}% {stage}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60">Stage data not available</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2">Based on {totalDeals} recorded deal{totalDeals !== 1 ? "s" : ""}</p>
                </motion.div>
              ) : (
                <motion.div key="focus-sector" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Recent Focus · Sector</p>
                  {sectorBreakdown.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {sectorBreakdown.map(({ sector, pct }, i) => (
                        <span key={sector} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${SECTOR_COLORS[i] ?? "bg-muted text-muted-foreground"}`}>
                          {pct > 0 ? `${pct}% ` : ""}{sector}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60">Sector data not available</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2">Based on {totalDeals} recorded deal{totalDeals !== 1 ? "s" : ""}</p>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Row 2: Deal Heatmap (live, by month) */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Deal Heatmap</p>
              <p className="text-[10px] text-muted-foreground">12-month rolling · {totalDeals} deal{totalDeals !== 1 ? "s" : ""} recorded</p>
            </div>
            {hasEnoughData && (
              <div className="flex items-center bg-secondary rounded-lg p-0.5">
                <button
                  onClick={() => setHeatmapMode("stage")}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${heatmapMode === "stage" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Stage
                </button>
                <button
                  onClick={() => setHeatmapMode("sector")}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${heatmapMode === "sector" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Sector
                </button>
              </div>
            )}
          </div>
          {hasEnoughData && (
            <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-success/60" /> Seed</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-accent/60" /> Series A</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted-foreground/30" /> Other</span>
            </div>
          )}
        </div>

        {dealsLoading ? (
          <div className="flex items-end gap-1.5 h-24">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${20 + Math.random() * 60}%` }} />
            ))}
          </div>
        ) : !hasEnoughData ? (
          <div className="h-24 flex items-center justify-center">
            <div className="text-center">
              <BarChart2 className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/50">Deal history data not yet available for {firmDisplayName ?? firmName}</p>
            </div>
          </div>
        ) : (
          <TooltipProvider delayDuration={0}>
            <div className="flex items-end gap-1.5 h-24">
              {buckets.map((b) => {
                const seedCount = b.stages["Seed"] ?? 0;
                const preCount = b.stages["Pre-Seed"] ?? 0;
                const aCount = b.stages["Series A"] ?? 0;
                const otherCount = b.count - seedCount - preCount - aCount;
                const seedH = ((seedCount + preCount) / maxCount) * 100;
                const aH = (aCount / maxCount) * 100;
                const otherH = (Math.max(otherCount, 0) / maxCount) * 100;
                return (
                  <Tooltip key={b.label}>
                    <TooltipTrigger asChild>
                      <div className="flex-1 flex flex-col items-center justify-end cursor-pointer group" style={{ height: "100%" }}>
                        {b.count > 0 && (
                          <span className="text-[9px] font-bold text-muted-foreground mb-0.5 group-hover:text-foreground transition-colors">{b.count}</span>
                        )}
                        {otherH > 0 && <div className="w-full rounded-t-sm bg-muted-foreground/20 group-hover:bg-muted-foreground/40 transition-colors" style={{ height: `${otherH}%` }} />}
                        {aH > 0 && <div className="w-full bg-accent/40 group-hover:bg-accent/60 transition-colors" style={{ height: `${aH}%` }} />}
                        {seedH > 0 && <div className={`w-full bg-success/40 group-hover:bg-success/60 transition-colors ${otherH === 0 && aH === 0 ? "rounded-t-sm" : ""} rounded-b-sm`} style={{ height: `${seedH}%` }} />}
                        {b.count === 0 && <div className="w-full rounded-sm bg-border/30" style={{ height: "4px" }} />}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-foreground text-background text-[10px] px-2.5 py-1.5 rounded-lg shadow-xl border-0 max-w-[200px]">
                      <p className="font-bold">{b.label}: {b.count} deal{b.count !== 1 ? "s" : ""}</p>
                      {b.count > 0 && (
                        <p className="text-background/70">
                          {Object.entries(b.stages).map(([s, n]) => `${n} ${s}`).join(", ")}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <div className="flex gap-1.5 mt-1">
              {buckets.map((b) => (
                <span key={b.label} className="flex-1 text-center text-[8px] text-muted-foreground">{b.label}</span>
              ))}
            </div>
          </TooltipProvider>
        )}
      </div>

      {/* Row 3: Recent Transactions (live from firm_recent_deals) */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Recent Transactions</p>
          {!hasEnoughData && !dealsLoading && (
            <p className="text-[9px] text-muted-foreground/60">No transactions recorded</p>
          )}
        </div>
        <div className="divide-y divide-border">
          {dealsLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <Skeleton className="h-7 w-7 rounded-md shrink-0" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            ))
          ) : !hasEnoughData && !(fallbackRecentDeals && fallbackRecentDeals.length > 0) ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-muted-foreground/50">Transaction history not yet available for {firmDisplayName ?? firmName}</p>
            </div>
          ) : (
            hasEnoughData ? allDeals.slice(0, 8).map((deal) => {
              const stage = inferStage(deal.amount);
              const dateStr = deal.date_announced
                ? new Date(deal.date_announced).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                : new Date(deal.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" });
              const sectorMatch =
                companySector && safeLower(deal.stage).includes(companySector.toLowerCase());
              const initial = safeTrim(deal.company_name).charAt(0).toUpperCase() || "?";
              const stageColor = stage === "Seed" || stage === "Pre-Seed"
                ? "bg-success/15 text-success border-success/20"
                : stage === "Series A"
                  ? "bg-accent/15 text-accent border-accent/20"
                  : "bg-muted text-muted-foreground border-border";

              return (
                <div key={deal.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-2 hover:bg-secondary/50 transition-colors cursor-pointer group">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary border border-border text-[10px] font-bold text-muted-foreground shrink-0">
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground">{deal.company_name}</span>
                      {sectorMatch && <span className="text-[8px] text-warning">★</span>}
                    </div>
                    {deal.stage && (
                      <p className="text-[10px] text-muted-foreground truncate">{deal.stage}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 w-16 text-center">{dateStr}</span>
                  {deal.amount && (
                    <span className="text-[10px] font-medium text-foreground shrink-0 w-14 text-right">{deal.amount}</span>
                  )}
                  {stage && (
                    <Badge className={`text-[9px] px-1.5 py-0 shrink-0 ${stageColor}`}>{stage}</Badge>
                  )}
                  <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover:text-accent shrink-0 transition-colors" />
                </div>
              );
            }) : (fallbackRecentDeals ?? []).slice(0, 8).map((deal, i) => (
              <div key={`${firmName}-fallback-deal-${i}`} className="flex items-center gap-3 px-4 py-2 hover:bg-secondary/50 transition-colors">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary border border-border text-[10px] font-bold text-muted-foreground shrink-0">
                  {(deal.charAt(0).toUpperCase() || "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground truncate">{deal}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">Firm-level recent deal signal</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
