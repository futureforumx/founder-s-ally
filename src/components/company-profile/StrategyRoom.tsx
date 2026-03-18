import { useState } from "react";
import { Brain, TrendingUp, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

interface StrategyRoomProps {
  stageClassification: {
    detected_stage: string;
    confidence_score: number;
    reasoning: string;
    conflicting_signals?: string;
  };
  currentStage?: string;
}

function parseSignals(reasoning: string): string[] {
  // Split reasoning into bullet-point-worthy sentences
  return reasoning
    .split(/[.;]/)
    .map(s => s.trim())
    .filter(s => s.length > 15);
}

function parseRisks(conflicting?: string): string[] {
  if (!conflicting) return [];
  return conflicting
    .split(/[.;]/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

export function StrategyRoom({ stageClassification, currentStage }: StrategyRoomProps) {
  const [open, setOpen] = useState(true);
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const confidence = Math.round(stageClassification.confidence_score * 100);
  const isHigh = stageClassification.confidence_score >= 0.8;
  const isMedium = stageClassification.confidence_score >= 0.5;

  const growthSignals = parseSignals(stageClassification.reasoning);
  const riskAlerts = parseRisks(stageClassification.conflicting_signals);

  const mismatch = currentStage && currentStage !== stageClassification.detected_stage;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="surface-card border border-border" id="strategy-room">
        <CollapsibleTrigger asChild>
          <button className="w-full p-5 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                <Brain className="h-4 w-4 text-accent" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold text-foreground">Strategy Room</h3>
                <p className="text-[10px] text-muted-foreground">Growth signals, risk alerts, and strategic context</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={`text-[10px] px-2 py-0.5 gap-1 ${
                  isHigh ? "bg-success/10 text-success border-success/20" :
                  isMedium ? "bg-accent/10 text-accent border-accent/20" :
                  "bg-warning/10 text-warning border-warning/20"
                }`}
              >
                {stageClassification.detected_stage}
                <span className="opacity-60">·</span>
                {confidence}%
              </Badge>
              {mismatch && (
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-warning/10 text-warning border-warning/20">
                  Stage mismatch
                </Badge>
              )}
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-5 pb-5 space-y-4">
            {/* Two-column layout */}
            <div className="grid grid-cols-2 gap-4">
              {/* Column 1: Growth Signals */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-success" />
                  <h4 className="text-[11px] font-mono uppercase tracking-wider text-success">Growth Signals</h4>
                </div>
                <ul className="space-y-2">
                  {growthSignals.slice(0, evidenceExpanded ? undefined : 3).map((signal, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground/80 leading-relaxed">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-success/60 shrink-0" />
                      {signal}
                    </li>
                  ))}
                  {growthSignals.length === 0 && (
                    <li className="text-xs text-muted-foreground italic">No growth signals detected yet</li>
                  )}
                </ul>
              </div>

              {/* Column 2: Risk Alerts */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  <h4 className="text-[11px] font-mono uppercase tracking-wider text-warning">Risk Alerts</h4>
                </div>
                <ul className="space-y-2">
                  {riskAlerts.map((risk, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground/80 leading-relaxed">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-warning/60 shrink-0" />
                      {risk}
                    </li>
                  ))}
                  {mismatch && (
                    <li className="flex items-start gap-2 text-xs text-foreground/80 leading-relaxed">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-warning/60 shrink-0" />
                      Stated stage ({currentStage}) differs from detected ({stageClassification.detected_stage})
                    </li>
                  )}
                  {riskAlerts.length === 0 && !mismatch && (
                    <li className="text-xs text-muted-foreground italic">No risk alerts identified</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Expand for details toggle */}
            {growthSignals.length > 3 && (
              <button
                onClick={() => setEvidenceExpanded(!evidenceExpanded)}
                className="flex items-center gap-1.5 text-[11px] text-accent hover:text-accent/80 transition-colors font-medium"
              >
                <ChevronRight className={`h-3 w-3 transition-transform ${evidenceExpanded ? "rotate-90" : ""}`} />
                {evidenceExpanded ? "Collapse Details" : `Expand for Details (${growthSignals.length - 3} more)`}
              </button>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
