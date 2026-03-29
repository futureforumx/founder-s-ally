import { useMemo, useState } from "react";
import { UpdateCard, type Update } from "./UpdateCard";

type UpdatesFilter = "all" | "posts" | "investments" | "fundNews" | "teamUpdates" | "other";

type UpdatesListProps = {
  updates: Update[];
  onSaveUpdate?: (update: Update) => void;
  onMuteUpdate?: (update: Update) => void;
  onOpenUpdate?: (update: Update) => void;
};

const FILTERS: Array<{ key: UpdatesFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "posts", label: "Posts" },
  { key: "investments", label: "Investments" },
  { key: "fundNews", label: "Fund News" },
  { key: "teamUpdates", label: "Team Updates" },
  { key: "other", label: "Other" },
];

function matchesFilter(update: Update, filter: UpdatesFilter): boolean {
  if (filter === "all") return true;
  if (filter === "posts") return update.type === "ThesisInsight";
  if (filter === "investments") return update.type === "Investment";
  if (filter === "fundNews") return update.type === "FundNews";
  if (filter === "teamUpdates") return update.type === "TeamUpdate";
  return update.type === "Other";
}

function isRecent(dateString: string, days: number): boolean {
  const publishedAt = new Date(dateString);
  if (Number.isNaN(publishedAt.getTime())) return false;

  const now = Date.now();
  const windowMs = days * 24 * 60 * 60 * 1000;
  return now - publishedAt.getTime() <= windowMs;
}

export function UpdatesList({
  updates,
  onSaveUpdate,
  onMuteUpdate,
  onOpenUpdate,
}: UpdatesListProps) {
  const [activeFilter, setActiveFilter] = useState<UpdatesFilter>("all");

  const sortedUpdates = useMemo(
    () =>
      [...updates].sort((left, right) => {
        if (right.relevanceScore !== left.relevanceScore) {
          return right.relevanceScore - left.relevanceScore;
        }

        return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
      }),
    [updates],
  );

  const filteredUpdates = useMemo(
    () => sortedUpdates.filter((update) => matchesFilter(update, activeFilter)),
    [activeFilter, sortedUpdates],
  );

  const summary = useMemo(() => {
    const recentUpdates = updates.filter((update) => isRecent(update.publishedAt, 30));

    const thesisPosts = recentUpdates.filter((update) => update.type === "ThesisInsight").length;
    const fundUpdates = recentUpdates.filter((update) => update.type === "FundNews").length;
    const teamChanges = recentUpdates.filter((update) => update.type === "TeamUpdate").length;

    return `In the last 30 days, this investor has published ${thesisPosts} thesis posts, ${fundUpdates} fund updates, ${teamChanges} team changes.`;
  }, [updates]);

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Latest posts</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Investor updates</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">{summary}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const isActive = filter.key === activeFilter;

              return (
                <button
                  key={filter.key}
                  type="button"
                  className={[
                    "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                  ].join(" ")}
                  onClick={() => setActiveFilter(filter.key)}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredUpdates.length > 0 ? (
          filteredUpdates.map((update) => (
            <UpdateCard
              key={update.id}
              update={update}
              onSave={onSaveUpdate}
              onMute={onMuteUpdate}
              onOpen={onOpenUpdate}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-700">No updates match this filter.</p>
            <p className="mt-1 text-sm text-slate-500">Try switching filters or loading a broader set of investor activity.</p>
          </div>
        )}
      </div>
    </section>
  );
}