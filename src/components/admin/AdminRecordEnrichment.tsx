import { useQuery } from "@tanstack/react-query";
import { Inbox, RefreshCw, Sparkles } from "lucide-react";
import { entityLabel, fetchEnrichmentReviewSummary, type EnrichmentReviewBucket } from "@/lib/adminEnrichmentReview";

const CARD_STYLE = { borderColor: "rgba(255,255,255,0.06)", background: "#0a0a0a" } as const;
const MUTED = "rgba(255,255,255,0.35)";

interface InsightCardProps {
  testId: string;
  icon: typeof Sparkles;
  accent: string;
  title: string;
  description: string;
  bucket: EnrichmentReviewBucket | undefined;
  loading: boolean;
  footnote?: string | null;
}

function InsightCard({ testId, icon: Icon, accent, title, description, bucket, loading, footnote }: InsightCardProps) {
  return (
    <div data-testid={testId} className="rounded-xl border p-5" style={CARD_STYLE}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
          {title}
        </span>
        <Icon className="h-4 w-4" style={{ color: accent }} />
      </div>
      <p className="mt-2 font-mono text-3xl font-bold" style={{ color: accent }}>
        {loading ? "…" : (bucket?.records ?? 0).toLocaleString()}
      </p>
      <p className="mt-1 text-xs" style={{ color: MUTED }}>
        {description}
      </p>
      {!loading && bucket && (
        <div className="mt-4 space-y-1.5 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {bucket.byEntity.length === 0 ? (
            <p className="text-xs text-white/40">Nothing waiting for review.</p>
          ) : (
            bucket.byEntity.map((e) => (
              <div key={e.entityType} className="flex items-center justify-between text-xs">
                <span className="text-white/60">{entityLabel(e.entityType)}</span>
                <span className="font-mono text-white/80">{e.records.toLocaleString()}</span>
              </div>
            ))
          )}
          <div className="flex items-center justify-between pt-1 text-[11px]" style={{ color: MUTED }}>
            <span>{bucket.fields.toLocaleString()} proposed values</span>
            <span>{bucket.identityReviews.toLocaleString()} identity matches</span>
          </div>
          {footnote && (
            <p className="text-[11px]" style={{ color: MUTED }}>
              {footnote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminRecordEnrichment() {
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-enrichment-review-summary"],
    queryFn: () => fetchEnrichmentReviewSummary(7),
    staleTime: 60_000,
    retry: false,
  });

  const recentDays = data?.recentDays ?? 7;
  const backlogFootnote = data
    ? data.backlog.olderRecords > 0
      ? `${data.backlog.olderRecords.toLocaleString()} older than ${recentDays} days`
      : `None older than ${recentDays} days`
    : null;

  return (
    <section data-testid="record-enrichment-section" className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white/80">Record Enrichment</h2>
          <p className="mt-0.5 text-xs" style={{ color: MUTED }}>
            Records where enrichment proposed changes that were not applied automatically and need a hand review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="Refresh enrichment review counts"
          className="rounded-md border p-2 text-white/50 transition-colors hover:text-white/80 disabled:opacity-40"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border p-5 text-xs" style={{ ...CARD_STYLE, borderColor: "rgba(255,107,53,0.3)", color: "#FF6B35" }}>
          {error instanceof Error ? error.message : "Could not load enrichment review counts."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InsightCard
            testId="enrichment-card-needs-review"
            icon={Sparkles}
            accent="#5B5CFF"
            title="Needs Review"
            description={`Newly enriched records (last ${recentDays} days) that need hand review`}
            bucket={data?.needsReview}
            loading={isLoading}
          />
          <InsightCard
            testId="enrichment-card-backlog"
            icon={Inbox}
            accent="#2EE6A6"
            title="Backlog"
            description="All records that still need review"
            bucket={data?.backlog}
            loading={isLoading}
            footnote={backlogFootnote}
          />
        </div>
      )}
    </section>
  );
}
