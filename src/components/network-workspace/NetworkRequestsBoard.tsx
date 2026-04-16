import type { IntroRequest, IntroRequestStatus } from "./types";
import { cn } from "@/lib/utils";

const ORDER: IntroRequestStatus[] = ["draft", "sent", "pending", "accepted", "declined", "completed"];

const label: Record<IntroRequestStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  completed: "Completed",
};

function RequestCard({ row }: { row: IntroRequest }) {
  const d = new Date(row.updatedAt);
  const when = Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="rounded-xl border border-border/50 bg-card/70 px-3 py-2.5 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
      <p className="text-[13px] font-semibold leading-tight text-foreground">{row.targetName}</p>
      {row.targetFirm ? <p className="mt-0.5 text-[11px] text-muted-foreground">{row.targetFirm}</p> : null}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Via <span className="font-medium text-foreground/85">{row.viaIntroducerName}</span>
      </p>
      <p className="mt-1.5 text-[10px] tabular-nums text-muted-foreground/80">Updated {when}</p>
      {row.notes ? <p className="mt-2 line-clamp-3 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">{row.notes}</p> : null}
    </div>
  );
}

export function NetworkRequestsBoard({ rows }: { rows: IntroRequest[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:thin]">
      {ORDER.map((status) => {
        const col = rows.filter((r) => r.status === status);
        return (
          <div key={status} className="flex min-w-[min(100%,220px)] max-w-[280px] shrink-0 flex-1 flex-col">
            <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label[status]}</h3>
              <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{col.length}</span>
            </div>
            <div
              className={cn(
                "min-h-[120px] flex-1 space-y-2 rounded-xl border border-dashed border-border/45 bg-muted/15 p-2",
                col.length === 0 && "flex items-center justify-center",
              )}
            >
              {col.length === 0 ? (
                <p className="px-2 text-center text-[11px] text-muted-foreground/80">None</p>
              ) : (
                col.map((r) => <RequestCard key={r.id} row={r} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
