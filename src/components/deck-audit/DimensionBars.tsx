import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MultiAxisScores } from "./types";
import { DIMENSION_LABELS } from "./types";

export interface Dimension {
  label: string;
  score: number;
  rationale: string[];
}

function dimensionsFromScores(scores: MultiAxisScores["dimensions"]): Dimension[] {
  return (Object.keys(DIMENSION_LABELS) as Array<keyof typeof DIMENSION_LABELS>).map((key) => ({
    label: DIMENSION_LABELS[key],
    score: scores[key].score,
    rationale: scores[key].rationale,
  }));
}

interface DimensionBarsProps {
  scores?: MultiAxisScores["dimensions"];
}

export function DimensionBars({ scores }: DimensionBarsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const dimensions = scores ? dimensionsFromScores(scores) : [];

  const getColor = (score: number) =>
    score >= 75 ? "bg-success" :
    score >= 50 ? "bg-warning" :
    "bg-destructive";

  if (dimensions.length === 0) return null;

  return (
    <div className="flex-1 space-y-3">
      {dimensions.map((dim) => (
        <div key={dim.label} className="space-y-1.5">
          <button
            onClick={() => setExpanded(expanded === dim.label ? null : dim.label)}
            className="flex items-center justify-between w-full group"
          >
            <span className="text-xs font-semibold text-foreground">{dim.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono tabular-nums text-muted-foreground">{dim.score}</span>
              <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", expanded === dim.label && "rotate-180")} />
            </div>
          </button>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700 ease-out", getColor(dim.score))}
              style={{ width: `${dim.score}%` }}
            />
          </div>
          {expanded === dim.label && (
            <ul className="mt-2 space-y-1.5 pl-0.5">
              {dim.rationale.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
