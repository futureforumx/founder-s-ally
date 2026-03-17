import { AlertTriangle, Eye } from "lucide-react";
import { useState } from "react";

interface RedFlagCardProps {
  severity: "high" | "medium" | "low";
  title: string;
  body: string;
  requiredFix: string;
  slideRef?: string;
}

const severityConfig = {
  high: { label: "High Severity", borderClass: "border-l-destructive" },
  medium: { label: "Medium Severity", borderClass: "border-l-[hsl(38,92%,50%)]" },
  low: { label: "Low Severity", borderClass: "border-l-muted-foreground" },
};

export function RedFlagCard({ severity, title, body, requiredFix, slideRef }: RedFlagCardProps) {
  const [status, setStatus] = useState<"open" | "addressed" | "contested">("open");
  const config = severityConfig[severity];

  return (
    <div className={`surface-card-hover border-l-4 ${config.borderClass} p-5`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-destructive">
          {config.label}
        </span>
        {slideRef && (
          <span className="text-[10px] text-muted-foreground">{slideRef}</span>
        )}
      </div>

      <h3 className="mt-2 text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>

      <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Required Fix</span>
        <p className="mt-0.5 text-xs text-foreground/80">{requiredFix}</p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {status === "open" ? (
          <>
            <button
              onClick={() => setStatus("addressed")}
              className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Mark Addressed
            </button>
            <button
              onClick={() => setStatus("contested")}
              className="rounded-md bg-secondary px-3 py-1.5 text-[11px] font-medium text-secondary-foreground transition-colors hover:bg-muted"
            >
              Contest
            </button>
          </>
        ) : (
          <span className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium ${
            status === "addressed" ? "bg-success/10 text-success" : "bg-accent/10 text-accent"
          }`}>
            {status === "addressed" ? "✓ Addressed" : "⚡ Contested"}
          </span>
        )}
        <button className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Eye className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
