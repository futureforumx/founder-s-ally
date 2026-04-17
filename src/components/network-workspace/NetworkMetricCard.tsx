import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function NetworkMetricCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
        "dark:border-white/[0.06] dark:bg-white/[0.02]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        {Icon ? <Icon className="h-3 w-3 shrink-0 text-muted-foreground/55" aria-hidden /> : null}
      </div>
      <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
