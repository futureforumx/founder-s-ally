import { Badge } from "@/components/ui/badge";

const STAGES = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+"] as const;

interface StageTimelineProps {
  sweetSpotStart?: string;
  sweetSpotEnd?: string;
  checkRange?: string;
}

export function StageTimeline({
  sweetSpotStart = "Seed",
  sweetSpotEnd = "Series A",
  checkRange = "$1M – $4M",
}: StageTimelineProps) {
  const startIdx = STAGES.indexOf(sweetSpotStart as typeof STAGES[number]);
  const endIdx = STAGES.indexOf(sweetSpotEnd as typeof STAGES[number]);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-6">
        Target Stage & Sweet Spot
      </h4>

      <div className="relative px-4">
        {/* Floating badge above sweet spot */}
        <div
          className="absolute -top-1 flex justify-center pointer-events-none"
          style={{
            left: `${(startIdx / (STAGES.length - 1)) * 100}%`,
            width: `${((endIdx - startIdx) / (STAGES.length - 1)) * 100}%`,
          }}
        >
          <Badge className="text-[9px] px-2.5 py-0.5 bg-accent text-accent-foreground border-accent shadow-sm whitespace-nowrap">
            Sweet Spot: {checkRange}
          </Badge>
        </div>

        {/* Timeline bar */}
        <div className="relative mt-8">
          {/* Base line */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border -translate-y-1/2 rounded-full" />

          {/* Highlight bar */}
          <div
            className="absolute top-1/2 h-1 bg-accent rounded-full -translate-y-1/2 transition-all"
            style={{
              left: `${(startIdx / (STAGES.length - 1)) * 100}%`,
              width: `${((endIdx - startIdx) / (STAGES.length - 1)) * 100}%`,
            }}
          />

          {/* Glow effect */}
          <div
            className="absolute top-1/2 h-3 bg-accent/20 rounded-full -translate-y-1/2 blur-sm"
            style={{
              left: `${(startIdx / (STAGES.length - 1)) * 100}%`,
              width: `${((endIdx - startIdx) / (STAGES.length - 1)) * 100}%`,
            }}
          />

          {/* Stage nodes */}
          <div className="relative flex justify-between">
            {STAGES.map((stage, i) => {
              const isInRange = i >= startIdx && i <= endIdx;
              return (
                <div key={stage} className="flex flex-col items-center gap-2">
                  <div
                    className={`relative z-10 rounded-full border-2 transition-all ${
                      isInRange
                        ? "h-4 w-4 bg-accent border-accent shadow-[0_0_8px_hsl(var(--accent)/0.4)]"
                        : "h-2.5 w-2.5 bg-muted border-border"
                    }`}
                  />
                  <span
                    className={`text-[10px] font-medium whitespace-nowrap ${
                      isInRange ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {stage}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
