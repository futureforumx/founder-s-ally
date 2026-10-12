import { Eye } from "lucide-react";
import { useDeckShares } from "@/hooks/useDeckShares";

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Opens of files shared through a /share/:token link. */
export function RecentActivityPanel() {
  const { views, shares, loading } = useDeckShares();

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Recent Activity
        </h3>
        <p className="text-[13px] leading-[18px] text-muted-foreground">Shared file views</p>
      </div>

      {loading ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">Loading…</p>
      ) : views.length === 0 ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {shares.length === 0
            ? "No files shared yet. Create a share link in the Share tab and views will appear here."
            : "No one has opened your shared files yet."}
        </p>
      ) : (
        <div>
          {views.slice(0, 8).map((view) => (
            <div
              key={view.id}
              className="flex items-center gap-4 border-b border-border py-4"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-5 text-foreground">
                  {view.recipientName}
                  {view.recipientFirm ? (
                    <span className="font-normal text-muted-foreground"> · {view.recipientFirm}</span>
                  ) : null}
                </p>
                <p className="mt-1 truncate text-[13px] leading-[18px] text-muted-foreground">
                  Viewed {view.fileName}
                </p>
              </div>
              <span className="w-16 shrink-0 text-right text-[13px] leading-[18px] tabular-nums text-muted-foreground">
                {relativeTime(view.viewedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RecentActivityPanel;
