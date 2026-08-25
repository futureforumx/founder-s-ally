import { TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { fundingByMonth, monthOverMonthTotalChange } from "@/lib/fundingByMonth";
import { formatUsdCompact } from "@/lib/latestFundingFilters";
import type { RecentFundingRound } from "@/lib/recentFundingSeed";
import { cn } from "@/lib/utils";

const chartConfig = {
  seed: {
    label: "Seed",
    color: "hsl(var(--primary))",
  },
  seriesA: {
    label: "Series A",
    color: "hsl(var(--success))",
  },
  growth: {
    label: "Growth",
    color: "hsl(220 10% 62%)",
  },
  other: {
    label: "Other",
    color: "hsl(220 10% 32%)",
  },
} satisfies ChartConfig;

type Props = {
  rows: RecentFundingRound[];
};

export function InsightsFundingByMonthChart({ rows }: Props) {
  const chartData = fundingByMonth(rows);
  const rangeStart = chartData[0]
    ? `${chartData[0].month.slice(0, 3)} ${chartData[0].monthKey.slice(0, 4)}`
    : null;
  const rangeEnd = chartData[chartData.length - 1]
    ? `${chartData[chartData.length - 1].month.slice(0, 3)} ${chartData[chartData.length - 1].monthKey.slice(0, 4)}`
    : null;
  const mom = monthOverMonthTotalChange(chartData);
  const hasTotals = chartData.some((row) => row.total > 0);

  return (
    <Card className="rounded-2xl border-zinc-800 bg-[#000000] shadow-lg shadow-black/50">
      <CardHeader>
        <CardTitle className="text-lg tracking-tight text-[#eeeeee]">Total funding by month</CardTitle>
        <CardDescription className="text-[#b3b3b3]">
          {rangeStart && rangeEnd
            ? `${rangeStart} – ${rangeEnd}`
            : "Last 6 months"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasTotals ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
            <BarChart accessibilityLayer data={chartData}>
              <CartesianGrid vertical={false} stroke="hsl(220 10% 18%)" />
              <XAxis
                dataKey="month"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => String(value).slice(0, 3)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(value) => formatUsdCompact(Number(value))}
              />
              <ChartTooltip
                cursor={false}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const series = payload.filter((item) => Number(item.value) > 0);
                  if (!series.length) return null;
                  return (
                    <div className="grid min-w-[9rem] gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs shadow-xl">
                      <div className="font-medium text-[#eeeeee]">{label}</div>
                      {series.map((item) => {
                        const key = String(item.dataKey ?? "");
                        const meta = chartConfig[key as keyof typeof chartConfig];
                        return (
                          <div key={key} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-[#b3b3b3]">
                              <span
                                className="h-2 w-2 rounded-[2px]"
                                style={{ background: meta?.color }}
                              />
                              {meta?.label ?? key}
                            </span>
                            <span className="font-mono font-medium tabular-nums text-[#eeeeee]">
                              {formatUsdCompact(Number(item.value))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="seed" fill="var(--color-seed)" radius={4} />
              <Bar dataKey="seriesA" fill="var(--color-seriesA)" radius={4} />
              <Bar dataKey="growth" fill="var(--color-growth)" radius={4} />
              <Bar dataKey="other" fill="var(--color-other)" radius={4} />
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="py-10 text-center text-sm text-[#b3b3b3]">
            Disclosed round sizes will appear here as Latest funding fills in.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        {mom ? (
          <div className="flex gap-2 font-medium leading-none text-[#eeeeee]">
            {mom.direction === "down" ? "Down" : mom.direction === "flat" ? "Flat" : "Up"}{" "}
            {mom.direction === "flat" ? "this month" : `${mom.percent.toFixed(1)}% this month`}
            {mom.direction === "down" ? (
              <TrendingDown className="h-4 w-4 text-[#b3b3b3]" />
            ) : (
              <TrendingUp className={cn("h-4 w-4", mom.direction === "up" && "text-success")} />
            )}
          </div>
        ) : null}
        <div className="leading-none text-[#b3b3b3]">
          Disclosed company raises from Latest funding, grouped by stage.
        </div>
      </CardFooter>
    </Card>
  );
}
