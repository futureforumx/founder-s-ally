type Variant = "filter_mismatch" | "feed_empty" | "load_failed";

const copy: Record<
  Variant,
  {
    title: string;
    body: string;
  }
> = {
  filter_mismatch: {
    title: "No recent funding matches this filter.",
    body: "Try another stage chip or broaden the sector—new deals sync as we ingest announcements.",
  },
  feed_empty: {
    title: "No funding announcements in the live feed yet.",
    body: "Check back soon as new deals are ingested, or adjust filters if something is too narrow.",
  },
  load_failed: {
    title: "Live funding data didn’t load.",
    body: "Refresh the page or try again shortly. This isn’t a filter mismatch—the connection to the funding feed failed.",
  },
};

export function FundingFeedEmptyState({ variant = "filter_mismatch" }: { variant?: Variant }) {
  const { title, body } = copy[variant];
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-sm font-medium text-[#eeeeee]">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[#b3b3b3]">{body}</p>
    </div>
  );
}
