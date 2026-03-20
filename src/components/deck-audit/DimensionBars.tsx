import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MultiAxisScores } from "./types";
import { DIMENSION_LABELS } from "./types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DimensionDrilldownModal } from "./DimensionDrilldownModal";

export interface Dimension {
  label: string;
  key: string;
  score: number;
  rationale: string[];
}

const DIMENSION_DESCRIPTIONS: Record<string, string> = {
  story_and_flow: "Story & Flow: Evaluates narrative arc, problem framing, and slide sequencing.",
  clarity_and_density: "Clarity & Density: Measures text economy, bullet clarity, and information density.",
  market_and_financials: "Market & Financials: Evaluates TAM logic, unit economics, and traction.",
  team_credibility: "Team Credibility: Assesses founder/market fit, expertise signals, and advisory strength.",
  design_and_scannability: "Design & Scannability: Scores visual hierarchy, whitespace, and 6-second scan test.",
};

function dimensionsFromScores(scores: MultiAxisScores["dimensions"]): Dimension[] {
  return (Object.keys(DIMENSION_LABELS) as Array<keyof typeof DIMENSION_LABELS>).map((key) => ({
    label: DIMENSION_LABELS[key],
    key,
    score: scores[key].score,
    rationale: scores[key].rationale,
  }));
}

function getBarColor(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

function getTextColor(score: number) {
  if (score >= 80) return "text-emerald-500";
  if (score >= 50) return "text-amber-500";
  return "text-rose-500";
}

interface DimensionBarsProps {
  scores?: MultiAxisScores["dimensions"];
}

export function DimensionBars({ scores }: DimensionBarsProps) {
  const [drilldown, setDrilldown] = useState<Dimension | null>(null);
  const dimensions = scores ? dimensionsFromScores(scores) : [];

  if (dimensions.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex-1 space-y-2.5">
        {dimensions.map((dim) => (
          <Tooltip key={dim.label}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setDrilldown(dim)}
                className="flex items-center gap-3 w-full rounded-lg px-2 py-2 -mx-2 transition-colors duration-150 hover:bg-muted/60 cursor-pointer group"
              >
                <span className="text-xs font-semibold text-foreground w-[140px] text-left shrink-0 truncate">
                  {dim.label}
                </span>
                <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700 ease-out", getBarColor(dim.score))}
                    style={{ width: `${dim.score}%` }}
                  />
                </div>
                <span className={cn("text-xs font-mono font-bold tabular-nums w-8 text-right shrink-0", getTextColor(dim.score))}>
                  {dim.score}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-[260px] space-y-1.5 bg-popover border-border"
            >
              <p className="text-xs font-semibold text-foreground leading-snug">
                {DIMENSION_DESCRIPTIONS[dim.key] ?? dim.label}
              </p>
              <p className="text-[11px] text-primary font-medium">
                ✨ Click for specific slide details
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <DimensionDrilldownModal
        dimension={drilldown}
        onClose={() => setDrilldown(null)}
      />
    </TooltipProvider>
  );
}
