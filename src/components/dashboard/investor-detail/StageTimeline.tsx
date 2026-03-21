import { useState } from "react";
import { Badge } from "@/components/ui/badge";

const STAGES = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+"] as const;

interface StageTimelineProps {
  sweetSpotStart?: string;
  sweetSpotEnd?: string;
  investsStart?: string;
  investsEnd?: string;
  checkRange?: string;
}

export function StageTimeline({
  sweetSpotStart = "Seed",
  sweetSpotEnd = "Series A",
  investsStart = "Pre-Seed",
  investsEnd = "Series B",
  checkRange = "$1M – $4M",
}: StageTimelineProps) {
  const [hoveredStage, setHoveredStage] = useState<number | null>(null);

  const ssStart = STAGES.indexOf(sweetSpotStart as typeof STAGES[number]);
  const ssEnd = STAGES.indexOf(sweetSpotEnd as typeof STAGES[number]);
  const invStart = STAGES.indexOf(investsStart as typeof STAGES[number]);
  const invEnd = STAGES.indexOf(investsEnd as typeof STAGES[number]);
  const total = STAGES.length - 1;

  return (
    <div className="rounded-xl border border-border bg-card p-4 pb-3 h-full">
      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-4">
        Stage
      </h4>

      <div className="relative px-4">
        {/* Floating badge above sweet spot */}
        <div
          className="absolute -top-1 flex justify-center pointer-events-none mb-4"
          style={{
            left: `${(ssStart / total) * 100}%`,
            width: `${((ssEnd - ssStart) / total) * 100}%`,
          }}
        >
          <Badge className="text-[9px] px-2.5 py-0.5 bg-success text-success-foreground border-success shadow-sm whitespace-nowrap">
            Sweet Spot: {checkRange}
          </Badge>
        </div>

        {/* Timeline bar */}
        <div className="relative mt-8">
          {/* Base line */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border -translate-y-1/2 rounded-full" />

          {/* Total investing area (blue) */}
          <div
            className="absolute top-1/2 h-1 rounded-full -translate-y-1/2 transition-all"
            style={{
              left: `${(invStart / total) * 100}%`,
              width: `${((invEnd - invStart) / total) * 100}%`,
              background: "hsl(var(--accent))",
            }}
          />
          <div
            className="absolute top-1/2 h-3 rounded-full -translate-y-1/2 blur-sm"
            style={{
              left: `${(invStart / total) * 100}%`,
              width: `${((invEnd - invStart) / total) * 100}%`,
              background: "hsl(var(--accent) / 0.15)",
            }}
          />

          {/* Sweet spot overlay (green) */}
          <div
            className="absolute top-1/2 h-1.5 rounded-full -translate-y-1/2 transition-all z-[1]"
            style={{
              left: `${(ssStart / total) * 100}%`,
              width: `${((ssEnd - ssStart) / total) * 100}%`,
              background: "hsl(var(--success))",
            }}
          />
          <div
            className="absolute top-1/2 h-4 rounded-full -translate-y-1/2 blur-sm z-[1]"
            style={{
              left: `${(ssStart / total) * 100}%`,
              width: `${((ssEnd - ssStart) / total) * 100}%`,
              background: "hsl(var(--success) / 0.2)",
            }}
          />

          {/* Stage nodes */}
          <div className="relative flex justify-between">
            {STAGES.map((stage, i) => {
              const isSweetSpot = i >= ssStart && i <= ssEnd;
              const isInvestArea = i >= invStart && i <= invEnd;
              const isHovered = hoveredStage === i;

              return (
                <div
                  key={stage}
                  className="flex flex-col items-center gap-2 cursor-pointer"
                  onMouseEnter={() => setHoveredStage(i)}
                  onMouseLeave={() => setHoveredStage(null)}
                >
                  <div
                    className={`relative z-10 rounded-full border-2 transition-all ${
                      isSweetSpot
                        ? `h-4 w-4 bg-success border-success shadow-[0_0_8px_hsl(var(--success)/0.4)] ${isHovered ? "scale-125" : ""}`
                        : isInvestArea
                          ? `h-3.5 w-3.5 bg-accent border-accent shadow-[0_0_6px_hsl(var(--accent)/0.3)] ${isHovered ? "scale-125" : ""}`
                          : `h-2.5 w-2.5 bg-muted border-border ${isHovered ? "scale-110" : ""}`
                    }`}
                  />
                  <span
                    className={`text-[10px] font-medium whitespace-nowrap transition-colors ${
                      isSweetSpot
                        ? "text-success font-semibold"
                        : isInvestArea
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    {stage}
                  </span>
                  {isHovered && (
                    <span className={`text-[8px] font-semibold -mt-1 ${
                      isSweetSpot ? "text-success" : isInvestArea ? "text-accent" : "text-muted-foreground"
                    }`}>
                      {isSweetSpot ? "Sweet Spot" : isInvestArea ? "Invests" : "No Activity"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2 justify-center">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-success" />
            <span className="text-[9px] font-medium text-muted-foreground">Sweet Spot</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-[9px] font-medium text-muted-foreground">Investing Area</span>
          </div>
        </div>
      </div>
    </div>
  );
}
