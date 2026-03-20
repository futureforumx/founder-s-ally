import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Dimension {
  label: string;
  score: number;
  rationale: string[];
}

const MOCK_DIMENSIONS: Dimension[] = [
  {
    label: "Story & Flow",
    score: 72,
    rationale: [
      "Narrative arc follows problem → solution → traction but the 'why now' moment is buried on slide 8.",
      "Transition from market size to product feels abrupt — consider a bridging slide.",
    ],
  },
  {
    label: "Clarity & Density",
    score: 58,
    rationale: [
      "Slides 4-6 are text-heavy — averaging 120+ words per slide vs. the 40-word benchmark.",
      "Key metrics are scattered across 3 slides. Consolidate into a single data slide.",
    ],
  },
  {
    label: "Market & Financials",
    score: 45,
    rationale: [
      "TAM uses only top-down sizing. Add a bottom-up calculation to increase credibility.",
      "No clear unit economics breakdown — LTV:CAC ratio missing entirely.",
      "Revenue projections lack assumption backing (growth rate source unclear).",
    ],
  },
  {
    label: "Team Credibility",
    score: 81,
    rationale: [
      "Strong founder-market fit articulation. Domain expertise is clear.",
      "Consider adding advisor network or key hire pipeline to strengthen bench depth.",
    ],
  },
  {
    label: "Design & Scannability",
    score: 67,
    rationale: [
      "Consistent color palette and typography. Visual hierarchy is generally strong.",
      "Several slides rely on tables that are hard to parse at pitch speed — switch to charts.",
    ],
  },
];

interface DimensionBarsProps {
  dimensions?: Dimension[];
}

export function DimensionBars({ dimensions = MOCK_DIMENSIONS }: DimensionBarsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const getColor = (score: number) =>
    score >= 75 ? "bg-success" :
    score >= 50 ? "bg-warning" :
    "bg-destructive";

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
