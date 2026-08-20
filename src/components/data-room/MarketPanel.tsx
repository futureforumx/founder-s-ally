import { useId, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  DollarSign,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FirmLogo } from "@/components/ui/firm-logo";
import { InvestorDetailPanel } from "@/components/dashboard/InvestorDetailPanel";
import type { InvestorEntry } from "@/components/dashboard/investor-detail/types";
import { useVCDirectory, type VCFirm } from "@/hooks/useVCDirectory";
import { resolveCompanyGeo } from "@/lib/resolveCompanyGeo";
import type { CompanyData } from "@/components/company-profile/types";
import {
  buildMarketDummySnapshot,
  formatPct,
  formatUsdCompact,
  type DummyCagrPoint,
  type DummyInvestor,
  type DummyQuarter,
  type DummyRecentDeal,
  type DummyRecommendation,
} from "./marketDummyData";

const PRIMARY = "hsl(var(--primary))";
const SUCCESS = "hsl(var(--success))";
const MUTED_GRID = "hsl(var(--border))";

interface MarketPanelProps {
  profile: CompanyData | null;
}

function ChartTooltipFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 px-3 py-2.5 shadow-lg backdrop-blur-md">
      {children}
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  hint,
  children,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Icon className="h-3.5 w-3.5 text-accent" />
            {title}
          </h3>
          {hint ? <p className="mt-1 text-[11px] text-muted-foreground/80">{hint}</p> : null}
        </div>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: number;
  hint: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      {delta != null ? (
        <p className={cn("mt-1 text-[11px] font-medium tabular-nums", up ? "text-success" : "text-destructive")}>
          {formatPct(delta)} <span className="font-normal text-muted-foreground">vs prior year</span>
        </p>
      ) : null}
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="rounded-md border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

function FundingActivityChart({ data }: { data: DummyQuarter[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={MUTED_GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="quarter"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="usd"
            tickFormatter={(v) => formatUsdCompact(Number(v))}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <YAxis
            yAxisId="deals"
            orientation="right"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as DummyQuarter;
              return (
                <ChartTooltipFrame>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {formatUsdCompact(row.amount)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{row.deals} deals closed</p>
                </ChartTooltipFrame>
              );
            }}
          />
          <Bar yAxisId="usd" dataKey="amount" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Line
            yAxisId="deals"
            type="monotone"
            dataKey="deals"
            stroke={SUCCESS}
            strokeWidth={2}
            dot={{ r: 3, fill: SUCCESS, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function CagrOutlookChart({ data }: { data: DummyCagrPoint[] }) {
  const gid = useId().replace(/:/g, "");
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={`cagr-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.35} />
              <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={MUTED_GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `$${v}B`}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as DummyCagrPoint;
              return (
                <ChartTooltipFrame>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">${row.value.toFixed(1)}B</p>
                  <p className="text-[11px] text-muted-foreground">{row.projected ? "Projected" : "Observed"}</p>
                </ChartTooltipFrame>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={PRIMARY}
            strokeWidth={2}
            fill={`url(#cagr-${gid})`}
            dot={{ r: 3, fill: PRIMARY, strokeWidth: 0 }}
            activeDot={{ r: 4, fill: PRIMARY, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function hostFromUrl(raw?: string | null): string | null {
  const u = String(raw ?? "").trim();
  if (!u) return null;
  try {
    const parsed = new URL(/^[a-z]+:\/\//i.test(u) ? u : `https://${u}`);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase() || null;
  }
}

function firmMatchKeys(name: string): string[] {
  const normalized = name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
  if (!normalized) return [];
  const keys = new Set<string>([normalized]);
  if (normalized.includes("andreessenhorowitz")) keys.add("a16z");
  if (normalized === "a16z") keys.add("andreessenhorowitz");
  const stemmed = normalized
    .replace(/(venturepartners|partners|ventures|capital|management|group|fund|llc|lp|vc)$/g, "");
  if (stemmed && stemmed !== normalized) keys.add(stemmed);
  return [...keys];
}

function resolveDirectoryFirm(
  investor: DummyInvestor,
  byHost: Map<string, VCFirm>,
  byKey: Map<string, VCFirm>,
): VCFirm | null {
  const hostHit = byHost.get(investor.domain.toLowerCase());
  if (hostHit) return hostHit;
  for (const k of firmMatchKeys(investor.name)) {
    const hit = byKey.get(k);
    if (hit) return hit;
  }
  return null;
}

type RankedInvestorRow = {
  investor: DummyInvestor;
  firm: VCFirm | null;
  websiteUrl: string;
  logoUrl: string | null;
};

function toInvestorEntry(row: RankedInvestorRow): InvestorEntry {
  return {
    name: row.investor.name,
    sector: "",
    stage: "",
    description: "",
    location: "",
    model: "",
    initial: (row.investor.name.charAt(0) || "?").toUpperCase(),
    matchReason: null,
    category: "investor",
    logo_url: row.logoUrl,
    websiteUrl: row.websiteUrl,
  };
}

function InvestorRankList({
  investors,
  onOpen,
}: {
  investors: DummyInvestor[];
  onOpen: (row: RankedInvestorRow) => void;
}) {
  const { firms } = useVCDirectory();
  const max = Math.max(...investors.map((i) => i.deals), 1);

  const rows = useMemo(() => {
    const byHost = new Map<string, VCFirm>();
    const byKey = new Map<string, VCFirm>();
    for (const firm of firms) {
      const host = hostFromUrl(firm.website_url);
      if (host && !byHost.has(host)) byHost.set(host, firm);
      for (const k of firmMatchKeys(firm.name)) {
        if (!byKey.has(k)) byKey.set(k, firm);
      }
      for (const alias of firm.aliases ?? []) {
        for (const k of firmMatchKeys(alias)) {
          if (!byKey.has(k)) byKey.set(k, firm);
        }
      }
    }

    return investors.map((investor) => {
      const firm = resolveDirectoryFirm(investor, byHost, byKey);
      return {
        investor,
        firm,
        websiteUrl: firm?.website_url || `https://${investor.domain}`,
        logoUrl: firm?.logo_url ?? null,
      } satisfies RankedInvestorRow;
    });
  }, [investors, firms]);

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.investor.name}>
          <button
            type="button"
            onClick={() => onOpen(row)}
            className="group flex w-full items-center gap-2.5 rounded-lg px-1 py-1 -mx-1 text-left transition-colors hover:bg-muted/40"
            aria-label={`Open ${row.investor.name} profile`}
          >
            <FirmLogo
              firmName={row.investor.name}
              logoUrl={row.logoUrl}
              websiteUrl={row.websiteUrl}
              size="sm"
              className="rounded-lg"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                  {row.investor.name}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {row.investor.deals} · {formatUsdCompact(row.investor.deployed)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(8, (row.investor.deals / max) * 100)}%` }}
                />
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RecentFundingList({ deals }: { deals: DummyRecentDeal[] }) {
  return (
    <ul className="divide-y divide-border/60">
      {deals.map((deal) => (
        <li key={`${deal.company}-${deal.date}`} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{deal.company}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {deal.round} · {deal.lead}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold tabular-nums text-foreground">{formatUsdCompact(deal.amount)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{deal.date}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecommendationCard({ item }: { item: DummyRecommendation }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
      <div className="flex gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="min-w-0 text-[10px] font-mono font-bold uppercase tracking-widest text-accent/80">{item.title}</p>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{item.confidence}%</span>
          </div>
          <p className="text-[12.5px] leading-relaxed text-foreground/90">{item.body}</p>
        </div>
      </div>
    </div>
  );
}

export function MarketPanel({ profile }: MarketPanelProps) {
  const sector = profile?.sector?.trim() || "";
  const stage = profile?.stage?.trim() || "";
  const subsectors = profile?.subsectors?.filter((s) => s.trim()) ?? [];
  const geo = resolveCompanyGeo(profile?.hqLocation);
  const [openInvestor, setOpenInvestor] = useState<RankedInvestorRow | null>(null);
  const { getPartnersForFirm } = useVCDirectory();

  const snapshot = useMemo(
    () => buildMarketDummySnapshot(sector, stage, subsectors),
    [sector, stage, subsectors.join("|")],
  );

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-border/60 bg-card/50 px-4 py-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Primary market</p>
            <h2 className="text-xl font-semibold leading-snug text-foreground">
              {sector || "Not set — choose a primary sector in Company Profile"}
            </h2>
          </div>
          <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Sample data
          </span>
        </div>

        {subsectors.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {subsectors.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <MetaItem label="Stage" value={stage || "Not set"} />
          <MetaItem label="Geo" value={geo} />
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total funding"
          value={formatUsdCompact(snapshot.totalFunding)}
          delta={snapshot.totalFundingDeltaPct}
          hint="Trailing 24 months in-market"
        />
        <KpiCard
          label="Funding activity"
          value={`${snapshot.dealCount12m.toLocaleString()} deals`}
          delta={snapshot.dealCountDeltaPct}
          hint={`Median ${formatUsdCompact(snapshot.medianDealSize)} · avg ${formatUsdCompact(snapshot.avgDealSize)}`}
        />
        <KpiCard
          label="Round mix"
          value={`${Math.round(snapshot.seedSharePct)}% seed`}
          hint={`${Math.round(snapshot.growthSharePct)}% Series A+ by count`}
        />
        <KpiCard
          label="CAGR outlook"
          value={`${snapshot.cagrPct.toFixed(1)}%`}
          hint="Projected annual growth through 2028"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <SectionCard
          icon={Activity}
          title="Funding activity"
          hint="Quarterly capital deployed (bars) and deal count (line)"
          className="lg:col-span-3"
        >
          <FundingActivityChart data={snapshot.activity} />
        </SectionCard>
        <SectionCard
          icon={DollarSign}
          title="Recent funding"
          hint="Latest disclosed rounds in this market"
          className="lg:col-span-2"
        >
          <RecentFundingList deals={snapshot.recentDeals} />
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard icon={Users} title="Most active investors" hint="Round count in-market, last 12 months">
          <InvestorRankList investors={snapshot.investors} onOpen={setOpenInvestor} />
        </SectionCard>
        <SectionCard
          icon={TrendingUp}
          title="CAGR outlook"
          hint="Category funding pool ($B). 2026–2028 is projected."
        >
          <CagrOutlookChart data={snapshot.cagrOutlook} />
        </SectionCard>
      </div>

      <SectionCard icon={Sparkles} title="AI recommendations" hint="Generated from your primary market and stage">
        <div className="grid gap-3 md:grid-cols-3">
          {snapshot.recommendations.map((item) => (
            <RecommendationCard key={item.title} item={item} />
          ))}
        </div>
      </SectionCard>

      <InvestorDetailPanel
        investor={openInvestor ? toInvestorEntry(openInvestor) : null}
        vcFirm={openInvestor?.firm ?? null}
        vcPartners={openInvestor?.firm ? getPartnersForFirm(openInvestor.firm.id) : []}
        companyName={profile?.name}
        companyData={
          profile
            ? {
                name: profile.name,
                sector: profile.sector,
                stage: profile.stage,
                model: profile.businessModel?.join(", "),
                description: profile.description,
              }
            : null
        }
        onClose={() => setOpenInvestor(null)}
      />
    </div>
  );
}
