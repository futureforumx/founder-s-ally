import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, supabasePublicDirectory } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type CompanyJobRow = Database["public"]["Tables"]["company_jobs"]["Row"];

type IngestRunRow = Pick<
  Database["public"]["Tables"]["company_job_ingestion_runs"]["Row"],
  "status" | "finished_at" | "started_at" | "source_detection_json"
>;

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function atsHintsNonEmpty(json: unknown): boolean {
  if (json == null || typeof json !== "object") return false;
  const hints = (json as { atsHints?: unknown }).atsHints;
  return Array.isArray(hints) && hints.length > 0;
}

export interface CompanyJobsBundle {
  jobs: CompanyJobRow[];
  lastUpdatedAt: string | null;
  /** Most recent run status (`running` | `success` | `failed`), by `started_at`. */
  latestRunStatus: string | null;
  /** True when the latest completed run failed but active listings still exist (stale risk). */
  syncStaleAfterFailure: boolean;
  /** True when the latest successful run stored ATS hints but there are zero active jobs. */
  atsDetectedButNoListings: boolean;
}

export function useCompanyJobs(organizationId: string | null) {
  return useQuery({
    queryKey: ["company-jobs", organizationId],
    enabled: Boolean(organizationId && isSupabaseConfigured),
    staleTime: 60_000,
    queryFn: async (): Promise<CompanyJobsBundle> => {
      if (!organizationId) {
        return {
          jobs: [],
          lastUpdatedAt: null,
          latestRunStatus: null,
          syncStaleAfterFailure: false,
          atsDetectedButNoListings: false,
        };
      }

      const [jobsRes, runsRes] = await Promise.all([
        supabasePublicDirectory
          .from("company_jobs")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("last_seen_at", { ascending: false }),
        supabasePublicDirectory
          .from("company_job_ingestion_runs")
          .select("status, finished_at, started_at, source_detection_json")
          .eq("organization_id", organizationId)
          .order("started_at", { ascending: false })
          .limit(12),
      ]);

      if (jobsRes.error) throw new Error(jobsRes.error.message);
      if (runsRes.error) throw new Error(runsRes.error.message);

      const jobs = (jobsRes.data ?? []) as CompanyJobRow[];
      const runs = (runsRes.data ?? []) as IngestRunRow[];

      const latestRun = runs[0] ?? null;
      const latestSuccess = runs.find((r) => r.status === "success") ?? null;

      let last: string | null = latestSuccess?.finished_at ?? null;
      if (!last && latestSuccess?.started_at) last = latestSuccess.started_at;
      for (const j of jobs) {
        last = maxIso(last, j.updated_at);
      }

      const latestRunStatus = latestRun?.status ?? null;
      const syncStaleAfterFailure =
        jobs.length > 0 && latestRunStatus === "failed";

      /** Only when the newest run succeeded but stored ATS hints and parsed zero jobs. */
      const atsDetectedButNoListings =
        jobs.length === 0 &&
        latestRun?.status === "success" &&
        atsHintsNonEmpty(latestRun.source_detection_json);

      return {
        jobs,
        lastUpdatedAt: last,
        latestRunStatus,
        syncStaleAfterFailure,
        atsDetectedButNoListings,
      };
    },
  });
}
