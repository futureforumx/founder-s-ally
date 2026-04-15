import { ExternalLink, Briefcase, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyJobs } from "@/hooks/useCompanyJobs";

const SOURCE_LABEL: Record<string, string> = {
  WEBSITE: "Website",
  ASHBY: "Ashby",
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function JobsTab({ organizationId }: { organizationId: string }) {
  const { data, isLoading, isError, error } = useCompanyJobs(organizationId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load jobs."}
      </div>
    );
  }

  const jobs = data?.jobs ?? [];
  const lastUpdated = data?.lastUpdatedAt ?? null;
  const syncStaleAfterFailure = data?.syncStaleAfterFailure ?? false;
  const atsDetectedButNoListings = data?.atsDetectedButNoListings ?? false;
  const latestRunStatus = data?.latestRunStatus ?? null;

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8 space-y-3">
        <Briefcase className="h-8 w-8 text-muted-foreground/35 mx-auto" />
        <p className="text-sm text-muted-foreground">No current jobs found.</p>
        {latestRunStatus === "failed" ? (
          <div className="mx-auto max-w-sm rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-left">
            <p className="text-[11px] font-medium text-destructive flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Last sync failed — nothing new was indexed. Try again after the next ingest run.
            </p>
          </div>
        ) : null}
        {atsDetectedButNoListings ? (
          <div className="mx-auto max-w-sm rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-left">
            <p className="text-[11px] font-medium text-amber-900 dark:text-amber-100 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Jobs source detected but no listings parsed. The careers page may use an unsupported ATS
              or layout.
            </p>
          </div>
        ) : null}
        <p className="text-[10px] text-muted-foreground/70">
          Last updated: {formatWhen(lastUpdated)}
          <span className="block mt-1 text-muted-foreground/55">
            Uses your latest successful job sync and active listing timestamps.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {syncStaleAfterFailure ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-[11px] font-medium text-amber-950 dark:text-amber-50 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Last sync failed — data may be stale. Open roles below are from the last successful index.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {jobs.length} open role{jobs.length !== 1 ? "s" : ""}
        </span>
        <span className="text-[10px] text-muted-foreground/80 text-right max-w-[55%]">
          Last updated: {formatWhen(lastUpdated)}
        </span>
      </div>

      <ul className="space-y-3">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="rounded-xl border border-border/50 bg-secondary/25 p-3.5 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-foreground leading-snug">{job.title}</p>
                <div className="flex flex-wrap gap-1.5">
                  {job.department ? (
                    <Badge variant="secondary" className="text-[9px] font-normal px-2 py-0">
                      {job.department}
                    </Badge>
                  ) : null}
                  {job.team && job.team !== job.department ? (
                    <Badge variant="outline" className="text-[9px] font-normal px-2 py-0">
                      {job.team}
                    </Badge>
                  ) : null}
                  {job.location ? (
                    <Badge variant="outline" className="text-[9px] font-normal px-2 py-0">
                      {job.location}
                    </Badge>
                  ) : null}
                  {job.location_type ? (
                    <Badge variant="outline" className="text-[9px] font-normal px-2 py-0">
                      {job.location_type}
                    </Badge>
                  ) : null}
                  {job.employment_type ? (
                    <Badge variant="outline" className="text-[9px] font-normal px-2 py-0">
                      {job.employment_type}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <Badge className="shrink-0 text-[9px] px-2 py-0.5 bg-accent/10 text-accent border-accent/20">
                {SOURCE_LABEL[job.source_type] ?? job.source_type}
              </Badge>
            </div>

            {job.posted_at ? (
              <p className="text-[10px] text-muted-foreground">
                Posted {formatWhen(job.posted_at)}
              </p>
            ) : null}

            {job.description_snippet ? (
              <p className="text-xs text-muted-foreground line-clamp-3">{job.description_snippet}</p>
            ) : null}

            {job.compensation_text ? (
              <p className="text-[11px] text-muted-foreground">{job.compensation_text}</p>
            ) : null}

            <a
              href={job.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              Apply
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
