/**
 * NinjaPear REST wrapper for Supabase Edge Functions.
 *
 * The official JS SDK is pinned in package.json for Node tooling, but its
 * current npm release (1.6.0) still targets the v1 person endpoint and does
 * not expose the live v2 Person Profile / Employee Search contract. Edge
 * Functions therefore call the documented REST API directly so response
 * headers, 204s, streaming error bodies, and cache modes remain observable.
 */

export const NINJAPEAR_HOST = "https://nubela.co";

export type NinjaPearCacheMode =
  | "if-recent"
  | "if-present"
  | "if-present-only"
  | "never";

export interface NinjaPearMeta {
  endpoint: string;
  creditCost: number | null;
  cacheAgeDays: number | null;
  enrichmentStatus: string | null;
  attempts: number;
}

export type NinjaPearResult<T> =
  | { status: "ok"; data: T; meta: NinjaPearMeta }
  | { status: "not_found"; data: null; meta: NinjaPearMeta }
  | {
      status: "error";
      data: null;
      meta: NinjaPearMeta;
      error: {
        code: string;
        message: string;
        httpStatus: number | null;
        retryable: boolean;
      };
    };

export interface WorkExperience {
  role: string;
  company_name: string;
  company_website: string | null;
  description?: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface Education {
  major: string;
  school: string;
  start_date: string | null;
  end_date: string | null;
}

export interface PersonProfile {
  id?: string;
  slug?: string;
  profile_pic_url?: string | null;
  first_name: string;
  middle_name?: string | null;
  last_name?: string | null;
  full_name: string;
  bio?: string | null;
  follower_count?: number | null;
  following_count?: number | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  x_handle?: string | null;
  x_profile_url?: string | null;
  personal_website?: string | null;
  work_experience: WorkExperience[];
  education: Education[];
  work_email_lookup?: string | null;
  similar_people?: string | null;
  [key: string]: unknown;
}

export interface CompanyDetails {
  websites: string[];
  description?: string | null;
  industry?: number | null;
  company_type?: string | null;
  founded_year?: number | null;
  specialties?: string[];
  name: string;
  tagline?: string | null;
  logo_url?: string | null;
  cover_pic_url?: string | null;
  facebook_url?: string | null;
  twitter_url?: string | null;
  instagram_url?: string | null;
  employee_count?: number | null;
  employee_count_range_min?: number | null;
  employee_count_range_max?: number | null;
  addresses?: Array<Record<string, unknown>>;
  executives?: Array<Record<string, unknown>>;
  public_listing?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface CompanyEnrichment {
  input: string;
  details: CompanyDetails | null;
  funding: Record<string, unknown> | null;
  relationships: {
    customers: Array<Record<string, unknown>>;
    investors: Array<Record<string, unknown>>;
    partner_platforms: Array<Record<string, unknown>>;
  } | null;
  competitors: Array<Record<string, unknown>> | null;
  partialErrors: Array<{ endpoint: string; code: string; message: string }>;
}

export interface ProfileUrlResult {
  url: string | null;
  profile: PersonProfile;
}

export interface WorkEmailResult {
  work_email: string;
}

export interface NinjaPearLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface NinjaPearServiceOptions {
  apiKey: string;
  host?: string;
  fetchImpl?: typeof fetch;
  logger?: NinjaPearLogger;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  maxAttempts?: number;
}

export interface EnrichmentOptions {
  useCache?: NinjaPearCacheMode;
  /** Allow variable-cost funding/customer/competitor calls to enrich on a cache miss. */
  includeExtendedLive?: boolean;
}

const defaultLogger: NinjaPearLogger = {
  info: (message, context) => console.info(message, context ?? {}),
  warn: (message, context) => console.warn(message, context ?? {}),
  error: (message, context) => console.error(message, context ?? {}),
};

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function splitName(fullName: string) {
  const parts = normalize(fullName).split(" ").filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : undefined,
    lastName: parts.length > 1 ? parts.at(-1) : undefined,
  };
}

function domainFromCompany(company: string): string {
  const trimmed = normalize(company);
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return trimmed;
  }
}

function parseNumberHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function makeMeta(response: Response | null, endpoint: string, attempts: number): NinjaPearMeta {
  return {
    endpoint,
    creditCost: response ? parseNumberHeader(response, "X-NinjaPear-Credit-Cost") : null,
    cacheAgeDays: response ? parseNumberHeader(response, "X-NinjaPear-Cache-Age-Days") : null,
    enrichmentStatus: response?.headers.get("X-NinjaPear-Enrichment-Status") ?? null,
    attempts,
  };
}

function profileUrl(profile: PersonProfile): string | null {
  const url = new URL("/api/v2/employee/profile", NINJAPEAR_HOST);
  if (profile.id) url.searchParams.set("id", profile.id);
  else if (profile.slug) url.searchParams.set("slug", profile.slug);
  else return null;
  return url.toString();
}

export function createNinjaPearService(options: NinjaPearServiceOptions) {
  const host = options.host ?? NINJAPEAR_HOST;
  const fetchImpl = options.fetchImpl ?? fetch;
  const logger = options.logger ?? defaultLogger;
  const sleep = options.sleep ?? wait;
  const timeoutMs = options.timeoutMs ?? 100_000;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const sessionCache = new Map<string, NinjaPearResult<unknown>>();
  const inFlight = new Map<string, Promise<NinjaPearResult<unknown>>>();

  async function request<T>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined>,
    useCache?: NinjaPearCacheMode,
    sendUseCacheParameter = true,
  ): Promise<NinjaPearResult<T>> {
    if (!options.apiKey) {
      return {
        status: "error",
        data: null,
        meta: { endpoint, creditCost: null, cacheAgeDays: null, enrichmentStatus: null, attempts: 0 },
        error: {
          code: "not_configured",
          message: "NINJAPEAR_API_KEY is not configured",
          httpStatus: null,
          retryable: false,
        },
      };
    }
    const url = new URL(endpoint, host);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    if (useCache && sendUseCacheParameter) url.searchParams.set("use_cache", useCache);

    const cacheKey = url.toString();
    if (useCache !== "never") {
      const cached = sessionCache.get(cacheKey);
      if (cached) return cached as NinjaPearResult<T>;
      const pending = inFlight.get(cacheKey);
      if (pending) return pending as Promise<NinjaPearResult<T>>;
    }

    const execute = async (): Promise<NinjaPearResult<T>> => {
      let lastResponse: Response | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            lastResponse = await fetchImpl(url, {
              method: "GET",
              headers: {
                Authorization: `Bearer ${options.apiKey}`,
                Accept: "application/json",
              },
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timer);
          }

          const meta = makeMeta(lastResponse, endpoint, attempt);
          if (lastResponse.status === 204 || lastResponse.status === 404) {
            logger.warn("ninjapear_no_result", { endpoint, status: lastResponse.status });
            return { status: "not_found", data: null, meta };
          }

          if ((lastResponse.status === 429 || lastResponse.status === 503) && attempt < maxAttempts) {
            const retryAfterSeconds = Number(lastResponse.headers.get("Retry-After"));
            const delay = Number.isFinite(retryAfterSeconds)
              ? Math.min(30_000, Math.max(0, retryAfterSeconds * 1_000))
              : Math.min(8_000, 500 * 2 ** (attempt - 1));
            logger.warn("ninjapear_retry", { endpoint, status: lastResponse.status, attempt, delay });
            await sleep(delay);
            continue;
          }

          let body: unknown = null;
          const raw = await lastResponse.text();
          if (raw) {
            try {
              body = JSON.parse(raw);
            } catch {
              body = { message: raw.slice(0, 500) };
            }
          }

          const record = body && typeof body === "object" ? body as Record<string, unknown> : null;
          // Company Funding can return HTTP 200 with an error body after streaming begins.
          if (lastResponse.ok && record?.error_code) {
            const code = String(record.error_code);
            const message = String(record.error ?? record.message ?? "NinjaPear streaming request failed");
            logger.error("ninjapear_api_error", { endpoint, status: 200, code, message });
            return {
              status: "error",
              data: null,
              meta,
              error: { code, message, httpStatus: 200, retryable: code === "service_temp_unavailable" },
            };
          }

          if (!lastResponse.ok) {
            const code = String(record?.error_code ?? `http_${lastResponse.status}`);
            const message = String(record?.message ?? record?.error ?? lastResponse.statusText ?? "NinjaPear request failed");
            logger.error("ninjapear_api_error", { endpoint, status: lastResponse.status, code, message });
            return {
              status: "error",
              data: null,
              meta,
              error: {
                code,
                message,
                httpStatus: lastResponse.status,
                retryable: lastResponse.status === 429 || lastResponse.status === 503,
              },
            };
          }

          if (!record || Object.keys(record).length === 0) {
            logger.warn("ninjapear_no_result", { endpoint, status: lastResponse.status });
            return { status: "not_found", data: null, meta };
          }

          logger.info("ninjapear_success", {
            endpoint,
            creditCost: meta.creditCost,
            cacheAgeDays: meta.cacheAgeDays,
          });
          return { status: "ok", data: record as T, meta };
        } catch (error) {
          if (attempt < maxAttempts) {
            await sleep(Math.min(8_000, 500 * 2 ** (attempt - 1)));
            continue;
          }
          const message = error instanceof Error ? error.message : String(error);
          const meta = makeMeta(lastResponse, endpoint, attempt);
          logger.error("ninjapear_api_error", { endpoint, code: "network_error", message });
          return {
            status: "error",
            data: null,
            meta,
            error: { code: "network_error", message, httpStatus: null, retryable: true },
          };
        }
      }

      throw new Error("unreachable");
    };

    const promise = execute();
    if (useCache !== "never") inFlight.set(cacheKey, promise as Promise<NinjaPearResult<unknown>>);
    const result = await promise;
    if (useCache !== "never") {
      inFlight.delete(cacheKey);
      sessionCache.set(cacheKey, result as NinjaPearResult<unknown>);
    }
    return result;
  }

  async function enrich_person(
    name: string,
    company: string,
    enrichmentOptions: EnrichmentOptions = {},
  ): Promise<NinjaPearResult<PersonProfile>> {
    const { firstName, middleName, lastName } = splitName(name);
    if (!firstName || !normalize(company)) {
      return invalidInput<PersonProfile>("name and company are required", "/api/v2/employee/profile");
    }
    return request<PersonProfile>(
      "/api/v2/employee/profile",
      {
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        employer_website: normalize(company),
        enrichment: "fast",
      },
      enrichmentOptions.useCache ?? "if-present",
    );
  }

  async function enrich_company(
    nameOrDomain: string,
    enrichmentOptions: EnrichmentOptions = {},
  ): Promise<NinjaPearResult<CompanyEnrichment>> {
    const input = normalize(nameOrDomain);
    if (!input) return invalidInput<CompanyEnrichment>("nameOrDomain is required", "/api/v1/company/details");
    const useCache = enrichmentOptions.useCache ?? "if-present";
    // Relationship endpoints have variable and sometimes high costs. The
    // shortlist path reads vendor cache only unless a caller explicitly opts
    // into live extended data or requests a forced refresh.
    const extendedUseCache: NinjaPearCacheMode = useCache === "never"
      ? "never"
      : enrichmentOptions.includeExtendedLive
      ? useCache
      : "if-present-only";
    const [requestedDetails, funding, relationships, competitors] = await Promise.all([
      request<CompanyDetails>("/api/v1/company/details", { website: input, include_employee_count: true }, useCache),
      request<Record<string, unknown>>("/api/v1/company/funding", { website: input }, extendedUseCache),
      request<Record<string, unknown>>("/api/v1/customer/listing", { website: input, page_size: 10 }, extendedUseCache),
      request<Record<string, unknown>>("/api/v1/competitor/listing", { website: input }, extendedUseCache),
    ]);

    // NinjaPear requires a minimum credit balance for employee counts even
    // when the base company profile is already in its cache. Preserve the
    // headcount failure as a partial error, then degrade to the base profile
    // instead of discarding otherwise useful firmographics.
    const headcountError = requestedDetails.status === "error" &&
        requestedDetails.error.httpStatus === 403 &&
        /insufficient credits|minimum balance/i.test(requestedDetails.error.message)
      ? {
          endpoint: requestedDetails.meta.endpoint,
          code: requestedDetails.error.code,
          message: requestedDetails.error.message,
        }
      : null;
    const details = headcountError
      ? await request<CompanyDetails>("/api/v1/company/details", { website: input }, useCache)
      : requestedDetails;

    const calls = [details, funding, relationships, competitors];
    const partialErrors = [
      ...(headcountError ? [headcountError] : []),
      ...calls.flatMap((result) =>
      result.status === "error"
        ? [{ endpoint: result.meta.endpoint, code: result.error.code, message: result.error.message }]
        : []
      ),
    ];
    // Auxiliary funding/relationship cache hits must never mask a failure of
    // the primary company-details request.
    if (details.status === "error") {
      return { ...details, data: null } as NinjaPearResult<CompanyEnrichment>;
    }
    if (calls.every((result) => result.status === "not_found")) {
      return { status: "not_found", data: null, meta: details.meta };
    }

    const relationshipData = relationships.status === "ok" ? relationships.data : null;
    const competitorData = competitors.status === "ok" ? competitors.data : null;
    return {
      status: "ok",
      data: {
        input,
        details: details.status === "ok" ? details.data : null,
        funding: funding.status === "ok" ? funding.data : null,
        relationships: relationshipData
          ? {
              customers: Array.isArray(relationshipData.customers) ? relationshipData.customers as Array<Record<string, unknown>> : [],
              investors: Array.isArray(relationshipData.investors) ? relationshipData.investors as Array<Record<string, unknown>> : [],
              partner_platforms: Array.isArray(relationshipData.partner_platforms) ? relationshipData.partner_platforms as Array<Record<string, unknown>> : [],
            }
          : null,
        competitors: competitorData && Array.isArray(competitorData.competitors)
          ? competitorData.competitors as Array<Record<string, unknown>>
          : null,
        partialErrors,
      },
      meta: details.meta,
    };
  }

  async function find_person_url(
    name: string,
    company: string,
    enrichmentOptions: EnrichmentOptions = {},
  ): Promise<NinjaPearResult<ProfileUrlResult>> {
    const result = await enrich_person(name, company, enrichmentOptions);
    if (result.status !== "ok") return result as NinjaPearResult<ProfileUrlResult>;
    return { ...result, data: { url: profileUrl(result.data), profile: result.data } };
  }

  async function find_role_url(
    role: string,
    company: string,
    enrichmentOptions: EnrichmentOptions = {},
  ): Promise<NinjaPearResult<ProfileUrlResult>> {
    if (!normalize(role) || !normalize(company)) {
      return invalidInput<ProfileUrlResult>("role and company are required", "/api/v2/employee/profile");
    }
    const result = await request<PersonProfile>(
      "/api/v2/employee/profile",
      { employer_website: normalize(company), role: normalize(role), enrichment: "fast" },
      enrichmentOptions.useCache ?? "if-present",
    );
    if (result.status !== "ok") return result as NinjaPearResult<ProfileUrlResult>;
    return { ...result, data: { url: profileUrl(result.data), profile: result.data } };
  }

  async function find_work_email(
    name: string,
    company: string,
    enrichmentOptions: EnrichmentOptions = {},
  ): Promise<NinjaPearResult<WorkEmailResult>> {
    const { firstName, lastName } = splitName(name);
    if (!firstName || !normalize(company)) {
      return invalidInput<WorkEmailResult>("name and company are required", "/api/v1/employee/work-email");
    }
    const result = await request<{ work_email: string | null }>(
      "/api/v1/employee/work-email",
      { first_name: firstName, last_name: lastName, domain: domainFromCompany(company) },
      enrichmentOptions.useCache ?? "if-present",
      false,
    );
    if (result.status !== "ok") return result as NinjaPearResult<WorkEmailResult>;
    if (!result.data.work_email) {
      logger.warn("ninjapear_no_result", { endpoint: result.meta.endpoint, reason: "work_email_null" });
      return { status: "not_found", data: null, meta: result.meta };
    }
    return { ...result, data: { work_email: result.data.work_email } };
  }

  return { enrich_person, enrich_company, find_person_url, find_role_url, find_work_email };
}

function invalidInput<T>(message: string, endpoint: string): NinjaPearResult<T> {
  return {
    status: "error",
    data: null,
    meta: { endpoint, creditCost: null, cacheAgeDays: null, enrichmentStatus: null, attempts: 0 },
    error: { code: "invalid_input", message, httpStatus: null, retryable: false },
  };
}

let defaultService: ReturnType<typeof createNinjaPearService> | null = null;

export function getNinjaPearService() {
  if (defaultService) return defaultService;
  const deno = (globalThis as typeof globalThis & {
    Deno?: { env: { get(name: string): string | undefined } };
  }).Deno;
  defaultService = createNinjaPearService({ apiKey: deno?.env.get("NINJAPEAR_API_KEY") ?? "" });
  return defaultService;
}

// Requested Vekta service surface.
export const enrich_person = (...args: Parameters<ReturnType<typeof createNinjaPearService>["enrich_person"]>) =>
  getNinjaPearService().enrich_person(...args);
export const enrich_company = (...args: Parameters<ReturnType<typeof createNinjaPearService>["enrich_company"]>) =>
  getNinjaPearService().enrich_company(...args);
export const find_person_url = (...args: Parameters<ReturnType<typeof createNinjaPearService>["find_person_url"]>) =>
  getNinjaPearService().find_person_url(...args);
export const find_role_url = (...args: Parameters<ReturnType<typeof createNinjaPearService>["find_role_url"]>) =>
  getNinjaPearService().find_role_url(...args);
export const find_work_email = (...args: Parameters<ReturnType<typeof createNinjaPearService>["find_work_email"]>) =>
  getNinjaPearService().find_work_email(...args);
