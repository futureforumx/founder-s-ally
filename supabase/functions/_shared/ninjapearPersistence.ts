import {
  getNinjaPearService,
  type CompanyEnrichment,
  type NinjaPearCacheMode,
  type NinjaPearResult,
  type PersonProfile,
  type WorkEmailResult,
} from "./ninjapear.ts";

type QueryResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

export interface SupabaseLike {
  from(table: string): {
    select(columns?: string): any;
    insert(values: unknown): QueryResult<unknown>;
    update(values: unknown): any;
    upsert(values: unknown, options?: unknown): QueryResult<unknown>;
  };
}

export interface ShortlistCandidate {
  personId?: string | null;
  organizationId?: string | null;
  firmInvestorId?: string | null;
  firmId?: string | null;
  includeWorkEmail?: boolean;
  forceRefresh?: boolean;
}

export interface ShortlistEnrichmentSummary {
  person: NinjaPearResult<PersonProfile>["status"] | "skipped";
  company: NinjaPearResult<CompanyEnrichment>["status"] | "skipped";
  workEmail: NinjaPearResult<WorkEmailResult>["status"] | "skipped";
  cached: boolean;
}

interface CacheRecord {
  cache_key: string;
  status: "ok" | "not_found";
  payload: unknown;
  fresh_until: string;
  credit_cost: number | null;
  vendor_cache_age_days: number | null;
}

interface PersonRecord {
  id: string;
  canonicalName: string;
  firstName: string | null;
  lastName: string | null;
}

interface OrganizationRecord {
  id: string;
  canonicalName: string;
  domain: string | null;
  website: string | null;
}

export function ninjaPearCacheKey(operation: string, ...parts: Array<string | null | undefined>): string {
  return [operation, ...parts.map((part) => (part ?? "").trim().toLowerCase().replace(/\s+/g, " "))].join("|");
}

export function isFreshNinjaPearCache(record: Pick<CacheRecord, "fresh_until">, now = new Date()): boolean {
  const expiresAt = new Date(record.fresh_until).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

function cachedResult<T>(record: CacheRecord, endpoint: string): NinjaPearResult<T> {
  const meta = {
    endpoint,
    creditCost: record.credit_cost,
    cacheAgeDays: record.vendor_cache_age_days,
    enrichmentStatus: null,
    attempts: 0,
  };
  return record.status === "ok"
    ? { status: "ok", data: record.payload as T, meta }
    : { status: "not_found", data: null, meta };
}

async function readCache(
  supabase: SupabaseLike,
  cacheKey: string,
): Promise<CacheRecord | null> {
  const { data, error } = await supabase
    .from("ninjapear_enrichment_cache")
    .select("cache_key,status,payload,fresh_until,credit_cost,vendor_cache_age_days")
    .eq("cache_key", cacheKey)
    .gt("fresh_until", new Date().toISOString())
    .maybeSingle();
  if (error) {
    console.error("ninjapear_cache_error", { cacheKey, message: error.message });
    return null;
  }
  return data as CacheRecord | null;
}

async function persistResult<T>(
  supabase: SupabaseLike,
  operation: string,
  cacheKey: string,
  result: NinjaPearResult<T>,
  ids: Pick<ShortlistCandidate, "personId" | "organizationId" | "firmInvestorId" | "firmId">,
) {
  const attempt = {
    cache_key: cacheKey,
    operation,
    outcome: result.status === "error" ? "api_error" : result.status,
    person_id: ids.personId ?? null,
    organization_id: ids.organizationId ?? null,
    endpoint: result.meta.endpoint,
    http_status: result.status === "error" ? result.error.httpStatus : null,
    error_code: result.status === "error" ? result.error.code : null,
    error_message: result.status === "error" ? result.error.message : null,
    credit_cost: result.meta.creditCost,
    vendor_cache_age_days: result.meta.cacheAgeDays,
  };
  const { error: attemptError } = await supabase.from("ninjapear_enrichment_attempts").insert(attempt);
  if (attemptError) console.error("ninjapear_attempt_log_error", { cacheKey, message: attemptError.message });

  // API errors are intentionally not cached for a day; transient failures may retry later.
  if (result.status === "error") return;
  const now = new Date();
  const { error } = await supabase.from("ninjapear_enrichment_cache").upsert({
    cache_key: cacheKey,
    operation,
    status: result.status,
    person_id: ids.personId ?? null,
    organization_id: ids.organizationId ?? null,
    firm_investor_id: ids.firmInvestorId ?? null,
    firm_id: ids.firmId ?? null,
    payload: result.status === "ok" ? result.data : null,
    fetched_at: now.toISOString(),
    fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
    credit_cost: result.meta.creditCost,
    vendor_cache_age_days: result.meta.cacheAgeDays,
  }, { onConflict: "cache_key" });
  if (error) console.error("ninjapear_cache_error", { cacheKey, message: error.message });
}

async function runCached<T>(
  supabase: SupabaseLike,
  operation: string,
  cacheKey: string,
  endpoint: string,
  forceRefresh: boolean,
  ids: Pick<ShortlistCandidate, "personId" | "organizationId" | "firmInvestorId" | "firmId">,
  call: (useCache: NinjaPearCacheMode) => Promise<NinjaPearResult<T>>,
): Promise<{ result: NinjaPearResult<T>; cached: boolean }> {
  if (!forceRefresh) {
    const existing = await readCache(supabase, cacheKey);
    if (existing && isFreshNinjaPearCache(existing)) {
      return { result: cachedResult<T>(existing, endpoint), cached: true };
    }
  }
  const result = await call(forceRefresh ? "never" : "if-present");
  await persistResult(supabase, operation, cacheKey, result, ids);
  return { result, cached: false };
}

async function persistPerson(
  supabase: SupabaseLike,
  ids: ShortlistCandidate,
  result: NinjaPearResult<PersonProfile>,
) {
  if (result.status !== "ok") return;
  const values = {
    ninjapear_profile: result.data,
    ninjapear_profile_id: result.data.id ?? null,
    ninjapear_enriched_at: new Date().toISOString(),
  };
  if (ids.personId) {
    const { error } = await supabase.from("people").update(values).eq("id", ids.personId);
    if (error) console.error("ninjapear_persist_error", { table: "people", message: error.message });
  }
  if (ids.firmInvestorId) {
    const { error } = await supabase.from("firm_investors").update(values).eq("id", ids.firmInvestorId);
    if (error) console.error("ninjapear_persist_error", { table: "firm_investors", message: error.message });
  }
}

async function persistWorkEmail(
  supabase: SupabaseLike,
  ids: ShortlistCandidate,
  result: NinjaPearResult<WorkEmailResult>,
) {
  const checkedAt = new Date().toISOString();
  const values = {
    ninjapear_work_email: result.status === "ok" ? result.data.work_email : null,
    ninjapear_work_email_checked_at: checkedAt,
  };
  if (ids.personId) {
    const { error } = await supabase.from("people").update(values).eq("id", ids.personId);
    if (error) console.error("ninjapear_persist_error", { table: "people", message: error.message });
  }
  if (ids.firmInvestorId) {
    const { error } = await supabase.from("firm_investors").update(values).eq("id", ids.firmInvestorId);
    if (error) console.error("ninjapear_persist_error", { table: "firm_investors", message: error.message });
  }
}

async function persistCompany(
  supabase: SupabaseLike,
  ids: ShortlistCandidate,
  result: NinjaPearResult<CompanyEnrichment>,
) {
  if (result.status !== "ok") return;
  const now = new Date().toISOString();
  const employeeCount = result.data.details?.employee_count;
  let growth: Record<string, unknown> | null = null;

  if (typeof employeeCount === "number" && (ids.organizationId || ids.firmId)) {
    let query = supabase
      .from("ninjapear_headcount_snapshots")
      .select("employee_count,observed_at")
      .order("observed_at", { ascending: false })
      .limit(1);
    query = ids.organizationId
      ? query.eq("organization_id", ids.organizationId)
      : query.eq("firm_id", ids.firmId);
    const { data: previous, error: previousError } = await query.maybeSingle();
    if (previousError) {
      console.error("ninjapear_headcount_error", { message: previousError.message });
    } else if (previous && typeof previous.employee_count === "number") {
      const absolute = employeeCount - previous.employee_count;
      growth = {
        previous_count: previous.employee_count,
        current_count: employeeCount,
        absolute_change: absolute,
        percent_change: previous.employee_count > 0
          ? Math.round((absolute / previous.employee_count) * 10_000) / 100
          : null,
        previous_observed_at: previous.observed_at,
        current_observed_at: now,
      };
    }
    const { error: snapshotError } = await supabase.from("ninjapear_headcount_snapshots").insert({
      organization_id: ids.organizationId ?? null,
      firm_id: ids.firmId ?? null,
      employee_count: employeeCount,
      observed_at: now,
      vendor_cache_age_days: result.meta.cacheAgeDays,
    });
    if (snapshotError) console.error("ninjapear_headcount_error", { message: snapshotError.message });
  }

  const values = {
    ninjapear_company_profile: result.data,
    ninjapear_enriched_at: now,
    ninjapear_headcount: typeof employeeCount === "number" ? employeeCount : null,
    ninjapear_headcount_observed_at: typeof employeeCount === "number" ? now : null,
    ninjapear_headcount_growth: growth,
  };
  if (ids.organizationId) {
    const { error } = await supabase.from("organizations").update(values).eq("id", ids.organizationId);
    if (error) console.error("ninjapear_persist_error", { table: "organizations", message: error.message });
  }
  if (ids.firmId) {
    const { error } = await supabase.from("firm_records").update(values).eq("id", ids.firmId);
    if (error) console.error("ninjapear_persist_error", { table: "firm_records", message: error.message });
  }
}

/**
 * Enrich one candidate immediately before it is written to a shortlist.
 * All failures are converted to status summaries so recommendation generation
 * keeps working when NinjaPear is unavailable or has no result.
 */
export async function enrichShortlistCandidate(
  supabase: SupabaseLike,
  candidate: ShortlistCandidate,
): Promise<ShortlistEnrichmentSummary> {
  const summary: ShortlistEnrichmentSummary = {
    person: "skipped",
    company: "skipped",
    workEmail: "skipped",
    cached: true,
  };
  try {
    const [personResponse, organizationResponse] = await Promise.all([
      candidate.personId
        ? supabase.from("people").select("id,canonicalName,firstName,lastName").eq("id", candidate.personId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      candidate.organizationId
        ? supabase.from("organizations").select("id,canonicalName,domain,website").eq("id", candidate.organizationId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (personResponse.error) throw new Error(`people lookup failed: ${personResponse.error.message}`);
    if (organizationResponse.error) throw new Error(`organization lookup failed: ${organizationResponse.error.message}`);

    const person = personResponse.data as PersonRecord | null;
    const organization = organizationResponse.data as OrganizationRecord | null;
    const personName = person?.canonicalName || [person?.firstName, person?.lastName].filter(Boolean).join(" ");
    const company = organization?.website || organization?.domain || organization?.canonicalName || "";
    const forceRefresh = candidate.forceRefresh === true;
    const service = getNinjaPearService();

    const personPromise = personName && company
      ? runCached(
          supabase,
          "enrich_person",
          ninjaPearCacheKey("enrich_person", personName, company),
          "/api/v2/employee/profile",
          forceRefresh,
          candidate,
          (useCache) => service.enrich_person(personName, company, { useCache }),
        )
      : null;
    const companyPromise = company
      ? runCached(
          supabase,
          "enrich_company",
          ninjaPearCacheKey("enrich_company", company),
          "/api/v1/company/details",
          forceRefresh,
          candidate,
          (useCache) => service.enrich_company(company, { useCache }),
        )
      : null;

    const [personRun, companyRun] = await Promise.all([
      personPromise ?? Promise.resolve(null),
      companyPromise ?? Promise.resolve(null),
    ]);
    if (personRun) {
      summary.person = personRun.result.status;
      summary.cached = summary.cached && personRun.cached;
      await persistPerson(supabase, candidate, personRun.result);
    }
    if (companyRun) {
      summary.company = companyRun.result.status;
      summary.cached = summary.cached && companyRun.cached;
      await persistCompany(supabase, candidate, companyRun.result);
    }

    if (candidate.includeWorkEmail && personName && company) {
      const emailRun = await runCached(
        supabase,
        "find_work_email",
        ninjaPearCacheKey("find_work_email", personName, company),
        "/api/v1/employee/work-email",
        forceRefresh,
        candidate,
        () => service.find_work_email(personName, company),
      );
      summary.workEmail = emailRun.result.status;
      summary.cached = summary.cached && emailRun.cached;
      await persistWorkEmail(supabase, candidate, emailRun.result);
    }
  } catch (error) {
    console.error("ninjapear_pipeline_error", {
      personId: candidate.personId,
      organizationId: candidate.organizationId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return summary;
}
