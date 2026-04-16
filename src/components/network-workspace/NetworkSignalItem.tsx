import type { RelationshipSignal } from "./types";
import { cn } from "@/lib/utils";

const sevDot: Record<RelationshipSignal["severity"], string> = {
  low: "bg-slate-400 dark:bg-slate-500",
  medium: "bg-amber-500",
  high: "bg-rose-500",
};

export function NetworkSignalItem({ signal }: { signal: RelationshipSignal }) {
  const t = new Date(signal.occurredAt);
  const when = Number.isNaN(t.getTime()) ? "" : t.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex gap-3 rounded-xl border border-border/45 bg-card/50 px-3 py-2.5">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", sevDot[signal.severity])} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{signal.title}</p>
          {when ? <span className="text-[10px] tabular-nums text-muted-foreground">{when}</span> : null}
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{signal.detail}</p>
      </div>
    </div>
  );
}
