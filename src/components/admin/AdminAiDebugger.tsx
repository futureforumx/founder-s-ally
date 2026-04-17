import { useState } from "react";
import { RefreshCw, Brain, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";

const DENSITY_DATA = [
  { category: "Pricing", count: 342, color: "#2EE6A6" },
  { category: "GTM", count: 287, color: "#00D4FF" },
  { category: "Engineering", count: 198, color: "#A855F7" },
  { category: "Fundraising", count: 456, color: "#FFB800" },
  { category: "Team", count: 124, color: "#FF6B6B" },
  { category: "Product", count: 311, color: "#34D399" },
];

const SNIPPETS = [
  { id: 1, text: "Founder struggling with Series A pricing — TAM underestimated by 3x", category: "Pricing", time: "2m ago" },
  { id: 2, text: "GTM motion shifting from PLG to enterprise sales in Q2", category: "GTM", time: "5m ago" },
  { id: 3, text: "Engineering team scaling bottleneck — CTO seeking VP Eng", category: "Engineering", time: "8m ago" },
  { id: 4, text: "Pre-seed founder exploring SAFE vs priced round trade-offs", category: "Fundraising", time: "12m ago" },
  { id: 5, text: "Product-market fit signal: NPS jumped from 32 to 67 in 30 days", category: "Product", time: "15m ago" },
  { id: 6, text: "Burn rate concern — 8 months runway with current spend trajectory", category: "Fundraising", time: "18m ago" },
  { id: 7, text: "Competitive moat weakening — 2 new entrants in vertical SaaS space", category: "GTM", time: "22m ago" },
  { id: 8, text: "Hiring velocity: 3 senior engineers onboarded, 2 more in pipeline", category: "Team", time: "25m ago" },
];

const CATEGORY_COLORS: Record<string, string> = {
  Pricing: "#2EE6A6",
  GTM: "#00D4FF",
  Engineering: "#A855F7",
  Fundraising: "#FFB800",
  Team: "#FF6B6B",
  Product: "#34D399",
};

export function AdminAiDebugger() {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      toast.success("AI intelligence refreshed", { description: "8 new snippets ingested" });
    }, 1500);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white/90">AI Brain Debugger</h1>
          <p className="mt-1 font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            Semantic intelligence insights · Embedding context viewer
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
          style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Vector Density Chart */}
        <div className="col-span-2 rounded-xl border p-5" style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0a0a0a" }}>
          <div className="mb-4 flex items-center gap-2">
            <Brain className="h-4 w-4" style={{ color: "#2EE6A6" }} />
            <span className="text-sm font-semibold text-white/80">Vector Density</span>
          </div>
          <p className="mb-4 font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Categories the AI is learning most about
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={DENSITY_DATA} layout="vertical" margin={{ left: 10, right: 10 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="category"
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "monospace" }}
                width={85}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#111",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "#e0e0e0",
                }}
                cursor={{ fill: "rgba(255,255,255,0.02)" }}
                formatter={(value: number) => [`${value} vectors`, "Count"]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
                {DENSITY_DATA.map((entry, i) => (
                  <Cell key={i} fill={entry.color} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Intelligence Snippets Feed */}
        <div className="col-span-3 rounded-xl border p-5" style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0a0a0a" }}>
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "#FFB800" }} />
            <span className="text-sm font-semibold text-white/80">Intelligence Snippets</span>
            <span className="ml-auto font-mono text-[10px] rounded-full px-2 py-0.5" style={{ background: "rgba(255,184,0,0.1)", color: "#FFB800" }}>
              {SNIPPETS.length} recent
            </span>
          </div>

          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {SNIPPETS.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border p-3 transition-colors hover:border-white/10"
                style={{ borderColor: "rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.01)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[12px] leading-relaxed text-white/70">{s.text}</p>
                  <span className="shrink-0 font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.2)" }}>
                    {s.time}
                  </span>
                </div>
                <div className="mt-2">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 font-mono text-[9px] font-bold"
                    style={{
                      background: `${CATEGORY_COLORS[s.category]}12`,
                      color: CATEGORY_COLORS[s.category],
                    }}
                  >
                    {s.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
