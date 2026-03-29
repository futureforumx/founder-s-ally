import { Bookmark, ExternalLink, Forward, BellOff } from "lucide-react";

export type Update = {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  publishedAt: string;
  readTimeMinutes?: number;
  type: "FundNews" | "Investment" | "TeamUpdate" | "ThesisInsight" | "Other";
  snippet: string;
  tags: string[];
  relevanceScore: number;
  signalStrength: "low" | "medium" | "high";
  takeaway: string;
  suggestedAction?: string;
  ogImageUrl?: string | null;
};

type UpdateCardProps = {
  update: Update;
  onSave?: (update: Update) => void;
  onMute?: (update: Update) => void;
  onOpen?: (update: Update) => void;
};

const TYPE_META: Record<Update["type"], { label: string; pillClass: string }> = {
  FundNews: {
    label: "Fund News",
    pillClass: "bg-amber-50 text-amber-700",
  },
  Investment: {
    label: "Investment",
    pillClass: "bg-emerald-50 text-emerald-700",
  },
  TeamUpdate: {
    label: "Team Update",
    pillClass: "bg-violet-50 text-violet-700",
  },
  ThesisInsight: {
    label: "Thesis / Insight",
    pillClass: "bg-amber-50 text-amber-700",
  },
  Other: {
    label: "Other",
    pillClass: "bg-slate-100 text-slate-700",
  },
};

const SIGNAL_META: Record<Update["signalStrength"], { dotClass: string; label: string }> = {
  low: {
    dotClass: "bg-slate-400",
    label: "Low signal",
  },
  medium: {
    dotClass: "bg-amber-400",
    label: "Medium signal",
  },
  high: {
    dotClass: "bg-emerald-500",
    label: "High signal",
  },
};

function formatPublishedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function visibleTags(tags: string[]): { items: string[]; overflow: number } {
  const items = tags.slice(0, 3);
  return {
    items,
    overflow: Math.max(tags.length - items.length, 0),
  };
}

function stopCardAction(event: React.MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
}

export function UpdateCard({ update, onSave, onMute, onOpen }: UpdateCardProps) {
  const typeMeta = TYPE_META[update.type];
  const signalMeta = SIGNAL_META[update.signalStrength];
  const { items, overflow } = visibleTags(update.tags);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {update.ogImageUrl ? (
          <a
            href={update.url}
            target="_blank"
            rel="noreferrer"
            className="block w-full overflow-hidden rounded-lg sm:mr-4 sm:h-16 sm:w-24 sm:flex-shrink-0"
          >
            <img
              src={update.ogImageUrl}
              alt=""
              className="h-40 w-full rounded-lg object-cover sm:h-16 sm:w-24"
              loading="lazy"
            />
          </a>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${typeMeta.pillClass}`}>
                {typeMeta.label}
              </span>
              <span className="font-medium text-slate-600">{update.sourceName}</span>
              <span className="text-slate-300">•</span>
              <span>{formatPublishedAt(update.publishedAt)}</span>
              {typeof update.readTimeMinutes === "number" ? (
                <>
                  <span className="text-slate-300">•</span>
                  <span>{update.readTimeMinutes} min read</span>
                </>
              ) : null}
            </div>

            <div className="mt-2 min-w-0">
              <a
                href={update.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-base font-semibold text-slate-900 transition-colors hover:text-sky-700"
              >
                {update.title}
              </a>
              <p className="mt-1 truncate text-sm text-slate-500">{update.snippet}</p>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
              <Forward className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="min-w-0">
                <span className="mr-1 font-semibold">Takeaway for you:</span>
                <span>{update.takeaway}</span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {items.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
                >
                  {tag}
                </span>
              ))}
              {overflow > 0 ? (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
                  +{overflow} more
                </span>
              ) : null}
            </div>

            {update.suggestedAction ? (
              <p className="mt-3 text-sm text-slate-500">
                <span className="font-medium text-slate-700">Suggested next step:</span>{" "}
                {update.suggestedAction}
              </p>
            ) : null}
          </div>

          <div className="flex flex-row items-center justify-between gap-3 border-t border-slate-100 pt-3 md:min-w-[132px] md:flex-col md:items-end md:justify-start md:border-t-0 md:pt-0">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-full ${signalMeta.dotClass}`} />
              <span>{signalMeta.label}</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Save update"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                onClick={(event) => {
                  stopCardAction(event);
                  onSave?.(update);
                }}
              >
                <Bookmark className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Mute similar updates"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                onClick={(event) => {
                  stopCardAction(event);
                  onMute?.(update);
                }}
              >
                <BellOff className="h-4 w-4" />
              </button>
              <a
                href={update.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open update in new tab"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                onClick={() => onOpen?.(update)}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}