import { CheckCircle2, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DealDynamicsProps {
  leadPct?: number;
  requiresBoardSeat?: boolean;
  followOnReserves?: "High" | "Medium" | "Low";
}

export function DealDynamics({
  leadPct = 80,
  requiresBoardSeat = true,
  followOnReserves = "High",
}: DealDynamicsProps) {
  const coPct = 100 - leadPct;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        Deal Dynamics
      </h4>

      {/* Split Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-foreground">Prefers to Lead</span>
          <span className="text-muted-foreground">Co-Invests</span>
        </div>
        <div className="relative h-3 rounded-full overflow-hidden bg-muted">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent to-accent/80 transition-all"
            style={{ width: `${leadPct}%` }}
          />
          {/* Divider line */}
          <div
            className="absolute inset-y-0 w-0.5 bg-card z-10"
            style={{ left: `${leadPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] font-semibold">
          <span className="text-accent">{leadPct}%</span>
          <span className="text-muted-foreground">{coPct}%</span>
        </div>
      </div>

      {/* Supporting details */}
      <div className="space-y-2.5 pt-1 border-t border-border">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
          <span className="text-xs text-foreground">Requires Board Seat</span>
          {requiresBoardSeat && (
            <span className="text-[9px] font-medium text-success ml-auto">Yes</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-3.5 shrink-0 flex items-center justify-center">
            <div className={`h-2 w-2 rounded-full ${
              followOnReserves === "High" ? "bg-success" :
              followOnReserves === "Medium" ? "bg-warning" : "bg-destructive"
            }`} />
          </div>
          <span className="text-xs text-foreground">Follow-on Reserves</span>
          <span className="text-[9px] font-medium text-muted-foreground ml-auto flex items-center gap-1">
            {followOnReserves}
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px]">
                <p className="text-xs">
                  Indicates how much capital is reserved for follow-on investments in existing portfolio companies.
                </p>
              </TooltipContent>
            </Tooltip>
          </span>
        </div>
      </div>
    </div>
  );
}
