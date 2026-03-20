import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FileText } from "lucide-react";
import type { Dimension } from "./DimensionBars";

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

interface DimensionDrilldownModalProps {
  dimension: Dimension | null;
  onClose: () => void;
}

export function DimensionDrilldownModal({ dimension, onClose }: DimensionDrilldownModalProps) {
  if (!dimension) return null;

  return (
    <Dialog open={!!dimension} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-base">
            <span>{dimension.label}</span>
            <span className={cn("text-lg font-mono font-extrabold tabular-nums", getTextColor(dimension.score))}>
              {dimension.score}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Detailed AI rationale for the {dimension.label} dimension.
          </DialogDescription>
        </DialogHeader>

        {/* Score bar */}
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500 ease-out", getBarColor(dimension.score))}
            style={{ width: `${dimension.score}%` }}
          />
        </div>

        {/* Rationale cards */}
        <div className="space-y-3 mt-2 max-h-[50vh] overflow-y-auto">
          {dimension.rationale.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No detailed feedback available for this dimension.</p>
          ) : (
            dimension.rationale.map((item, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-muted/30 p-4 space-y-1.5"
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <FileText className="h-3 w-3" />
                  <span>Finding {i + 1}</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground">{item}</p>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
