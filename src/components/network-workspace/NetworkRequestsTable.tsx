import type { IntroRequest } from "./types";
import { NetworkRequestRow } from "./NetworkRequestRow";

export function NetworkRequestsTable({ rows }: { rows: IntroRequest[] }) {
  if (!rows.length) {
    return <p className="rounded-xl border border-dashed border-border/55 px-4 py-8 text-center text-sm text-muted-foreground">No intro requests yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border/50">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="border-b border-border/50 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Target</th>
            <th className="px-3 py-2 font-semibold">Via</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <NetworkRequestRow key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
