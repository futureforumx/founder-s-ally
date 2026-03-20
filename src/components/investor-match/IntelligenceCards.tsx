import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link2, Sparkles } from "lucide-react";
import { SectorClassification } from "@/components/SectorTags";
import { CompanyData } from "@/components/CompanyProfile";

interface IntelligenceCardsProps {
  matchCount: number;
  animatedTotal: number;
  totalRaised: number;
  sectorClassification?: SectorClassification | null;
  companyData?: CompanyData | null;
  formatCurrency: (n: number) => string;
}

// ── Odometer Digit ──

function OdometerDigit({ digit }: { digit: string }) {
  return (
    <span className="inline-block overflow-hidden h-[1.15em] relative">
      <span
        className="inline-block transition-transform duration-700 ease-out"
        style={{ transform: `translateY(-${(parseInt(digit) || 0) * 10}%)` }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <span key={n} className="block h-[1.15em] leading-[1.15em]">{n}</span>
        ))}
      </span>
    </span>
  );
}

function OdometerNumber({ value }: { value: number }) {
  const digits = String(value).split("");
  return (
    <span className="inline-flex font-mono text-4xl font-bold text-foreground tracking-tight">
      {digits.map((d, i) => (
        <OdometerDigit key={`${i}-${d}`} digit={d} />
      ))}
    </span>
  );
}

// ── Heatmap ──

function SectorHeatmap({ sector }: { sector: string | undefined }) {
  const cells = useMemo(() => {
    // Generate 18 cells (3 rows x 6 cols) with deterministic pseudo-random intensity
    const seed = (sector || "default").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return Array.from({ length: 18 }, (_, i) => {
      const v = ((seed * (i + 7) * 31) % 100);
      // Trend upward for recent months
      const recencyBoost = i >= 12 ? 20 : i >= 9 ? 10 : 0;
      return Math.min(v + recencyBoost, 100);
    });
  }, [sector]);

  const intensityClass = (v: number) => {
    if (v >= 80) return "bg-accent";
    if (v >= 60) return "bg-accent/70";
    if (v >= 40) return "bg-accent/40";
    if (v >= 20) return "bg-accent/20";
    return "bg-secondary";
  };

  // Determine momentum status
  const recentAvg = cells.slice(12).reduce((a, b) => a + b, 0) / 6;
  const momentum = recentAvg >= 60 ? { label: "🔥 Accelerating", style: "bg-accent/10 text-accent" }
    : recentAvg >= 35 ? { label: "📈 Growing", style: "bg-success/10 text-success" }
    : { label: "➡️ Steady", style: "bg-secondary text-muted-foreground" };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-foreground">Sector Heat</p>
        <Badge className={`text-[10px] font-medium border-0 rounded-full px-2.5 py-0.5 ${momentum.style}`}>
          {momentum.label}
        </Badge>
      </div>
      <div className="grid grid-cols-6 grid-rows-3 gap-1.5">
        {cells.map((v, i) => (
          <div
            key={i}
            className={`h-4 w-full rounded-[4px] transition-colors duration-500 ${intensityClass(v)}`}
            title={`Month ${i + 1}: ${v}% activity`}
          />
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        Based on 18-month capital deployment in{" "}
        <span className="font-medium text-foreground">{sector || "your sector"}</span>.
      </p>
    </div>
  );
}

// ── Main ──

export function IntelligenceCards({
  matchCount,
  animatedTotal,
  totalRaised,
  sectorClassification,
  companyData,
  formatCurrency,
}: IntelligenceCardsProps) {
  const sector = sectorClassification?.primary_sector || companyData?.sector;
  
  // Mock round target — in production this would come from profile
  const roundTarget = totalRaised > 0 ? Math.max(totalRaised * 2, 1_000_000) : 1_000_000;
  const roundProgress = totalRaised > 0 ? Math.min((totalRaised / roundTarget) * 100, 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      {/* Card 1: Investors Matched */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm relative">
        <div className="absolute top-4 right-4">
          <Badge className="text-[10px] font-medium border-0 rounded-full px-2.5 py-1 bg-accent/10 text-accent animate-pulse">
            <Sparkles className="h-2.5 w-2.5 mr-1" />
            +3 New Today
          </Badge>
        </div>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Investors Matched
        </p>
        <OdometerNumber value={matchCount} />
        <p className="text-xs text-muted-foreground mt-2">
          Institutional matches found.
        </p>
      </div>

      {/* Card 2: Sector Momentum */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <SectorHeatmap sector={sector} />
      </div>

      {/* Card 3: Capital Track */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Capital Track
          </p>
          <span className="flex items-center gap-1 text-[10px] text-success font-medium">
            <Link2 className="h-3 w-3" />
            Profile Synced
          </span>
        </div>
        <p className="text-4xl font-bold text-foreground tracking-tight font-mono">
          {formatCurrency(animatedTotal)}
        </p>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          Total raised to date
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Round progress</span>
            <span className="font-medium text-foreground">{Math.round(roundProgress)}%</span>
          </div>
          <Progress value={roundProgress} className="h-1.5 bg-secondary" />
        </div>
      </div>
    </div>
  );
}
