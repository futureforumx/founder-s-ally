import { AlertTriangle, Brain, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StageClassificationCardProps {
  stageClassification: {
    detected_stage: string;
    confidence_score: number;
    reasoning: string;
    conflicting_signals?: string;
  };
  currentStage?: string;
}

export function StageClassificationCard({ stageClassification, currentStage }: StageClassificationCardProps) {
  const confidence = Math.round(stageClassification.confidence_score * 100);
  const isHigh = stageClassification.confidence_score >= 0.8;
  const isMedium = stageClassification.confidence_score >= 0.5;

  return (
    <div className="surface-card border border-border">
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
              <Brain className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">AI Stage Classification</h3>
              <p className="text-[10px] text-muted-foreground">Linguistic heuristic analysis of your materials</p>
            </div>
          </div>
          <Badge
            variant="secondary"
            className={`text-[10px] px-2 py-0.5 gap-1 ${
              isHigh ? "bg-success/10 text-success border-success/20" :
              isMedium ? "bg-accent/10 text-accent border-accent/20" :
              "bg-warning/10 text-warning border-warning/20"
            }`}
          >
            <TrendingUp className="h-3 w-3" />
            {confidence}% confidence
          </Badge>
        </div>

        {/* Detected stage */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Detected</span>
          <Badge variant="secondary" className="text-xs px-2.5 py-0.5 bg-accent/10 text-accent border-accent/20 font-medium">
            {stageClassification.detected_stage}
          </Badge>
          {currentStage && currentStage !== stageClassification.detected_stage && (
            <>
              <span className="text-[11px] text-muted-foreground">vs. stated</span>
              <Badge variant="secondary" className="text-xs px-2.5 py-0.5 bg-muted text-muted-foreground font-medium">
                {currentStage}
              </Badge>
            </>
          )}
        </div>

        {/* Reasoning */}
        <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 space-y-2">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Evidence</p>
          <p className="text-xs text-foreground/80 leading-relaxed">{stageClassification.reasoning}</p>
        </div>

        {/* Conflicting signals */}
        {stageClassification.conflicting_signals && (
          <div className="flex items-start gap-2.5 rounded-lg bg-warning/5 border border-warning/20 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[11px] font-mono uppercase tracking-wider text-warning">Conflicting Signals</p>
              <p className="text-xs text-foreground/70 leading-relaxed">{stageClassification.conflicting_signals}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
