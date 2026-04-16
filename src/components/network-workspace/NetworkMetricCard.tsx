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
        "rounded-2xl border border-border/55 bg-card/80 px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur-sm",
        "dark:border-white/[0.07] dark:bg-white/[0.03]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
