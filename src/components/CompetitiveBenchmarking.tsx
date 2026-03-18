import { TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, XCircle, Shield, ShieldAlert, ShieldQuestion, ArrowUpRight, Minus, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CompanyData, AnalysisResult, ConfidenceLevel } from "./company-profile/types";

// ── helpers ──

function parseNum(v: string | undefined | null): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
}

type BenchmarkStatus = "outperforming" | "on-track" | "needs-attention" | "unknown";

const statusCfg: Record<BenchmarkStatus, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  outperforming: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", label: "Outperforming" },
  "on-track": { icon: TrendingUp, color: "text-accent", bg: "bg-accent/10", label: "On Track" },
  "needs-attention": { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Needs Attention" },
  unknown: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10", label: "No Data" },
};

const confCfg: Record<ConfidenceLevel, { icon: typeof Shield; color: string; label: string }> = {
  high: { icon: Shield, color: "text-success", label: "High" },
  medium: { icon: ShieldAlert, color: "text-amber-500", label: "Med" },
  low: { icon: ShieldQuestion, color: "text-destructive", label: "Low" },
};

interface DynamicRow {
  metric: string;
  yourValue: string | null;
  target: string;
  status: BenchmarkStatus;
  confidence: ConfidenceLevel;
  numericValue: number | null;
  numericTarget: number | null;
  higherIsBetter: boolean;
}

// ── target mapping ──

function buildRows(company: CompanyData | null, analysis: AnalysisResult | null): DynamicRow[] {
  const stage = company?.stage || "";
  const bizModel = company?.businessModel || "";
  const isMarketplace = bizModel === "Marketplace";
  const isSeedOrEarlier = !stage || stage === "Pre-Seed" || stage === "Seed";

  const metrics = analysis?.metrics;
  const arrStr = company?.currentARR;
  const growthStr = company?.yoyGrowth;
  const arrNum = parseNum(arrStr);
  const growthNum = parseNum(growthStr);

  // Derived calculations
  const burnRateNum = parseNum(metrics?.burnRate?.value);
  const mrrNum = parseNum(metrics?.mrr?.value);

  // Rule of 40 = Growth % + Profit Margin %. We approximate profit margin from MRR & burn.
  let ruleOf40: number | null = null;
  if (growthNum != null && mrrNum != null && burnRateNum != null && mrrNum > 0) {
    const profitMarginApprox = ((mrrNum - burnRateNum) / mrrNum) * 100;
    ruleOf40 = growthNum + profitMarginApprox;
  }

  // Burn Multiple = Net Burn / Net New ARR
  let burnMultiple: number | null = null;
  if (burnRateNum != null && arrNum != null && growthNum != null) {
    const netNewARR = arrNum * (growthNum / 100);
    if (netNewARR > 0) burnMultiple = (burnRateNum * 12) / netNewARR;
  }

  const cacNum = parseNum(metrics?.cac?.value);
  const ltvNum = parseNum(metrics?.ltv?.value);
  const ltvCac = cacNum && ltvNum && cacNum > 0 ? ltvNum / cacNum : null;

  // CAC Payback (months) – approximate from CAC & MRR per customer
  const cacPayback = cacNum && mrrNum && mrrNum > 0 ? cacNum / mrrNum : null;

  const evalStatus = (val: number | null, target: number, higher: boolean): BenchmarkStatus => {
    if (val == null) return "unknown";
    if (higher) return val > target * 1.05 ? "outperforming" : val >= target * 0.95 ? "on-track" : "needs-attention";
    return val < target * 0.95 ? "outperforming" : val <= target * 1.05 ? "on-track" : "needs-attention";
  };

  const getConf = (metricKey?: string): ConfidenceLevel => {
    // User-entered → high, deck-extracted → medium, website → low
    if (metricKey && company) {
      const key = metricKey as keyof CompanyData;
      const val = company[key];
      if (val && typeof val === "string" && val.trim()) return "high";
    }
    if (metricKey && metrics) {
      const m = (metrics as any)[metricKey];
      if (m?.confidence) return m.confidence;
    }
    return "low";
  };

  const rows: DynamicRow[] = [];

  // NRR or GMV Retention
  if (isMarketplace) {
    rows.push({
      metric: "GMV Retention",
      yourValue: null,
      target: "> 80%",
      numericValue: null, numericTarget: 80,
      status: "unknown", confidence: "low", higherIsBetter: true,
    });
  } else {
  const isSeriesB = stage === "Series B";
    const isSeriesCPlus = stage === "Series C+";
    const nrrTarget = isSeedOrEarlier ? 100 : (isSeriesB || isSeriesCPlus) ? 115 : 110;
    rows.push({
      metric: "Net Revenue Retention (NRR)",
      yourValue: null,
      target: `> ${nrrTarget}%`,
      numericValue: null, numericTarget: nrrTarget,
      status: "unknown", confidence: "low", higherIsBetter: true,
    });
  }

  // Gross Margin or Take Rate
  if (isMarketplace) {
    rows.push({
      metric: "Take Rate",
      yourValue: null,
      target: "> 15%",
      numericValue: null, numericTarget: 15,
      status: "unknown", confidence: "low", higherIsBetter: true,
    });
  } else {
    rows.push({
      metric: "Gross Margin",
      yourValue: null,
      target: "≥ 75%",
      numericValue: null, numericTarget: 75,
      status: "unknown", confidence: "low", higherIsBetter: true,
    });
  }

  // CAC Payback
  const cacTarget = isSeedOrEarlier ? 12 : 18;
  rows.push({
    metric: "CAC Payback (months)",
    yourValue: cacPayback != null ? `${cacPayback.toFixed(1)} mo` : null,
    target: `< ${cacTarget} mo`,
    numericValue: cacPayback, numericTarget: cacTarget,
    status: evalStatus(cacPayback, cacTarget, false),
    confidence: getConf("cac"), higherIsBetter: false,
  });

  // LTV / CAC
  rows.push({
    metric: "LTV / CAC Ratio",
    yourValue: ltvCac != null ? `${ltvCac.toFixed(1)}x` : null,
    target: "≥ 3.0x",
    numericValue: ltvCac, numericTarget: 3,
    status: evalStatus(ltvCac, 3, true),
    confidence: ltvCac != null ? "medium" : "low", higherIsBetter: true,
  });

  // Rule of 40
  rows.push({
    metric: "Rule of 40",
    yourValue: ruleOf40 != null ? `${ruleOf40.toFixed(0)}%` : null,
    target: "≥ 40%",
    numericValue: ruleOf40, numericTarget: 40,
    status: evalStatus(ruleOf40, 40, true),
    confidence: ruleOf40 != null ? "medium" : "low", higherIsBetter: true,
  });

  // Burn Multiple
  const burnTarget = isSeedOrEarlier ? 3 : 2;
  rows.push({
    metric: "Burn Multiple",
    yourValue: burnMultiple != null ? `${burnMultiple.toFixed(1)}x` : null,
    target: `< ${burnTarget}.0x`,
    numericValue: burnMultiple, numericTarget: burnTarget,
    status: evalStatus(burnMultiple, burnTarget, false),
    confidence: burnMultiple != null ? "medium" : "low", higherIsBetter: false,
  });

  // ARR Growth
  rows.push({
    metric: "ARR Growth (YoY)",
    yourValue: growthNum != null ? `${growthNum}%` : null,
    target: isSeedOrEarlier ? "> 200%" : "> 100%",
    numericValue: growthNum, numericTarget: isSeedOrEarlier ? 200 : 100,
    status: evalStatus(growthNum, isSeedOrEarlier ? 200 : 100, true),
    confidence: getConf("yoyGrowth"), higherIsBetter: true,
  });

  // Magic Number
  rows.push({
    metric: "Magic Number",
    yourValue: null,
    target: "≥ 0.75",
    numericValue: null, numericTarget: 0.75,
    status: "unknown", confidence: "low", higherIsBetter: true,
  });

  return rows;
}

// ── Component ──

interface CompetitiveBenchmarkingProps {
  metricTable?: AnalysisResult["metricTable"];
  companyData?: CompanyData | null;
  analysisResult?: AnalysisResult | null;
  onScrollToProfile?: () => void;
  isLocked?: boolean;
}

export function CompetitiveBenchmarking({ metricTable, companyData, analysisResult, onScrollToProfile, isLocked }: CompetitiveBenchmarkingProps) {
  const rows = buildRows(companyData ?? null, analysisResult ?? null);

  const summaryCards = rows.filter(r => r.yourValue != null).slice(0, 4);
  // If fewer than 4 with data, pad with first rows
  while (summaryCards.length < 4 && rows.length > summaryCards.length) {
    const next = rows.find(r => !summaryCards.includes(r));
    if (next) summaryCards.push(next);
    else break;
  }

  return (
    <div className="relative space-y-6">
      {isLocked && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-6 py-4 shadow-surface">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Confirm your Company Profile to unlock</p>
              <p className="text-xs text-muted-foreground">Benchmarking requires a verified profile</p>
            </div>
          </div>
        </div>
      )}
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Competitive Benchmarking</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Dynamic scorecard based on your company profile
          {companyData?.stage && <> · <span className="font-medium text-foreground">{companyData.stage}</span></>}
          {companyData?.businessModel && <> · {companyData.businessModel}</>}
        </p>
      </div>

      {/* Table */}
      <div className="surface-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Metric</th>
              <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Your Value</th>
              <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Target</th>
              <th className="px-4 py-3 text-center text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Confidence</th>
              <th className="px-4 py-3 text-right text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const st = statusCfg[row.status];
              const StIcon = st.icon;
              const cf = confCfg[row.confidence];
              const CfIcon = cf.icon;
              return (
                <tr key={i} className="border-b border-border/50 last:border-none hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{row.metric}</td>
                  <td className="px-4 py-3 text-sm font-mono text-foreground">
                    {row.yourValue ?? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">—</span>
                        {onScrollToProfile && (
                          <button onClick={onScrollToProfile}
                            className="text-[10px] text-accent hover:underline font-sans">
                            Add Data
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{row.target}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-mono ${cf.color}`}>
                      <CfIcon className="h-3 w-3" /> {cf.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-medium tracking-wider ${st.bg} ${st.color}`}>
                      <StIcon className="h-3 w-3" /> {st.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary Cards */}
      <div className="surface-card p-5">
        <h3 className="text-sm font-semibold tracking-tight text-foreground mb-3">Key Scorecard</h3>
        <div className="grid grid-cols-4 gap-3">
          {summaryCards.map((card) => {
            const st = statusCfg[card.status];
            const StIcon = st.icon;
            return (
              <div key={card.metric} className="rounded-lg bg-muted/40 px-3 py-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground line-clamp-1">{card.metric}</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-lg font-semibold tracking-tight text-foreground">
                    {card.yourValue ?? "—"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground">Target: {card.target}</span>
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-mono ${st.color}`}>
                    <StIcon className="h-2.5 w-2.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
