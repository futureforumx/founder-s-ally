import type { IntroRequest, IntroRequestStatus } from "./types";
import { cn } from "@/lib/utils";

const statusStyle: Record<IntroRequestStatus, string> = {
  draft: "bg-muted text-foreground/80 border-border/60",
  sent: "bg-sky-500/10 text-sky-800 dark:text-sky-200 border-sky-500/25",
  pending: "bg-amber-500/10 text-amber-900 dark:text-amber-100 border-amber-500/25",
  accepted: "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 border-emerald-500/25",
  declined: "bg-rose-500/10 text-rose-900 dark:text-rose-100 border-rose-500/25",
  completed: "bg-violet-500/10 text-violet-900 dark:text-violet-100 border-violet-500/25",
};

export function NetworkRequestRow({ row }: { row: IntroRequest }) {
  const d = new Date(row.updatedAt);
  const dateStr = Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="px-3 py-2.5 align-top">
        <p className="text-sm font-medium text-foreground">{row.targetName}</p>
        {row.targetFirm ? <p className="text-[11px] text-muted-foreground">{row.targetFirm}</p> : null}
      </td>
      <td className="px-3 py-2.5 align-top text-[12px] text-muted-foreground">{row.viaIntroducerName}</td>
      <td className="px-3 py-2.5 align-top">
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            statusStyle[row.status],
          )}
        >
          {row.status}
        </span>
      </td>
      <td className="px-3 py-2.5 align-top text-[11px] text-muted-foreground tabular-nums">{dateStr}</td>
    </tr>
  );
}
