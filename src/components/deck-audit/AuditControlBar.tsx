import { useState } from "react";
import { RefreshCw, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditControlBarProps {
  onRerun: () => void;
  isRunning: boolean;
}

const investorProfiles = ["Pre-Seed Angels", "Seed Funds", "Series A", "Growth Equity"];
const sectors = ["B2B SaaS", "Consumer", "Fintech", "Health Tech", "Climate Tech", "Deep Tech"];
const stages = ["Pre-Seed", "Seed", "Series A", "Series B+"];
const geos = ["US", "Europe", "LATAM", "SEA", "Global"];

export function AuditControlBar({ onRerun, isRunning }: AuditControlBarProps) {
  const [profile, setProfile] = useState(investorProfiles[1]);
  const [sector, setSector] = useState(sectors[0]);
  const [stage, setStage] = useState(stages[1]);
  const [geo, setGeo] = useState(geos[0]);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);

  const benchmarkLabel = `${sector} / ${stage} / ${geo}`;

  return (
    <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-6 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Target Investor Profile */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Target</span>
          <div className="relative">
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              className="appearance-none rounded-lg border border-border bg-card px-3 py-1.5 pr-8 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 cursor-pointer"
            >
              {investorProfiles.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Benchmark Against */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Benchmark</span>
          <div className="relative">
            <button
              onClick={() => setBenchmarkOpen(!benchmarkOpen)}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/40 transition-colors"
            >
              <Search className="h-3 w-3 text-muted-foreground" />
              {benchmarkLabel}
              <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", benchmarkOpen && "rotate-180")} />
            </button>

            {benchmarkOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 rounded-xl border border-border bg-card shadow-lg p-3 space-y-3 z-40">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Sector</label>
                  <select value={sector} onChange={(e) => setSector(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground">
                    {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Stage</label>
                  <select value={stage} onChange={(e) => setStage(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground">
                    {stages.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Geo</label>
                  <select value={geo} onChange={(e) => setGeo(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground">
                    {geos.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button
                  onClick={() => { setBenchmarkOpen(false); onRerun(); }}
                  className="w-full rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1" />

        {/* Re-run */}
        <button
          onClick={onRerun}
          disabled={isRunning}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", isRunning && "animate-spin")} />
          Re-run Audit
        </button>
      </div>
    </div>
  );
}
