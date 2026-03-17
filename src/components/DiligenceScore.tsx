import { AlertTriangle } from "lucide-react";

interface DiligenceScoreProps {
  score: number;
  redFlagCount: number;
  companyName: string;
}

export function DiligenceScore({ score, redFlagCount, companyName }: DiligenceScoreProps) {
  const scoreColor = score >= 70 ? "text-success" : score >= 50 ? "text-[hsl(38,92%,50%)]" : "text-destructive";

  return (
    <div className="surface-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Diligence Report
          </span>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{companyName}</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Diligence Score
            </span>
            <div className={`text-3xl font-semibold tracking-tight ${scoreColor}`}>{score}</div>
          </div>
          <div className="h-12 w-px bg-border" />
          <div className="text-right">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Red Flags
            </span>
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-3xl font-semibold tracking-tight text-destructive">{redFlagCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
