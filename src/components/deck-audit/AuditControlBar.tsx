import { useState, useRef, useEffect } from "react";
import { RefreshCw, ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditControlBarProps {
  onRerun: (params: { profile: string; sector: string; stage: string; geo: string }) => void;
  isRunning: boolean;
  initialProfile?: string;
  initialBenchmark?: string;
}

const investorProfiles = ["Accelerator", "Pre-Seed", "Seed Funds", "Series A", "Growth Equity"];
const sectors = ["B2B SaaS", "Consumer", "Fintech", "Health Tech", "Climate Tech", "Deep Tech"];
const stages = ["Pre-Seed", "Seed", "Series A", "Series B+"];
const geos = ["US", "Europe", "LATAM", "SEA", "Global"];

function parseBenchmark(cohort: string) {
  const parts = cohort.split(" / ").map((s) => s.trim());
  return {
    sector: sectors.includes(parts[0]) ? parts[0] : sectors[0],
    stage: stages.includes(parts[1]) ? parts[1] : stages[1],
    geo: geos.includes(parts[2]) ? parts[2] : geos[0],
  };
}

export function AuditControlBar({ onRerun, isRunning, initialProfile, initialBenchmark }: AuditControlBarProps) {
  const parsed = initialBenchmark ? parseBenchmark(initialBenchmark) : null;
  const [profile, setProfile] = useState(initialProfile && investorProfiles.includes(initialProfile) ? initialProfile : "Seed Funds");
  const [sector, setSector] = useState(parsed?.sector ?? sectors[0]);
  const [stage, setStage] = useState(parsed?.stage ?? stages[1]);
  const [geo, setGeo] = useState(parsed?.geo ?? geos[0]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const benchmarkRef = useRef<HTMLDivElement>(null);

  const benchmarkLabel = `${sector} / ${stage} / ${geo}`;

  const fireRerun = () => onRerun({ profile, sector, stage, geo });

  useEffect(() => {
    if (!profileOpen && !benchmarkOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
      if (benchmarkRef.current && !benchmarkRef.current.contains(target)) setBenchmarkOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProfileOpen(false);
        setBenchmarkOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen, benchmarkOpen]);

  return (
    <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-6 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Target Investor Profile */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Target</span>
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => { setProfileOpen(!profileOpen); setBenchmarkOpen(false); }}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/40 transition-colors"
            >
              {profile}
              <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", profileOpen && "rotate-180")} />
            </button>

            {profileOpen && (
              <div className="absolute top-full left-0 mt-1 w-40 rounded-xl border border-border bg-card shadow-lg p-1 z-40">
                {investorProfiles.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setProfile(p); setProfileOpen(false); }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                      p === profile ? "bg-accent/10 text-accent" : "text-foreground hover:bg-muted"
                    )}
                  >
                    {p}
                    {p === profile && <Check className="h-3 w-3" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Benchmark Against */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Benchmark</span>
          <div className="relative" ref={benchmarkRef}>
            <button
              onClick={() => { setBenchmarkOpen(!benchmarkOpen); setProfileOpen(false); }}
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
                  onClick={() => { setBenchmarkOpen(false); fireRerun(); }}
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
          onClick={fireRerun}
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
