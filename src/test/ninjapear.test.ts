import { describe, expect, it, vi } from "vitest";
import {
  createNinjaPearService,
  type NinjaPearLogger,
} from "../../supabase/functions/_shared/ninjapear";
import {
  isFreshNinjaPearCache,
  ninjaPearCacheKey,
} from "../../supabase/functions/_shared/ninjapearPersistence";

const person = {
  id: "person-1",
  slug: "ada-lovelace",
  first_name: "Ada",
  last_name: "Lovelace",
  full_name: "Ada Lovelace",
  work_experience: [],
  education: [],
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function loggerSpies(): NinjaPearLogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("NinjaPear service", () => {
  it("uses the live v2 person contract, cached mode, and in-session dedupe", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request) => jsonResponse(person, 200, {
      "X-NinjaPear-Credit-Cost": "3",
      "X-NinjaPear-Cache-Age-Days": "4",
    }));
    const service = createNinjaPearService({ apiKey: "test-key", fetchImpl });

    const [first, second] = await Promise.all([
      service.enrich_person("Ada Lovelace", "analytical.engine"),
      service.enrich_person("Ada Lovelace", "analytical.engine"),
    ]);

    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/v2/employee/profile");
    expect(url.searchParams.get("first_name")).toBe("Ada");
    expect(url.searchParams.get("last_name")).toBe("Lovelace");
    expect(url.searchParams.get("employer_website")).toBe("analytical.engine");
    expect(url.searchParams.get("use_cache")).toBe("if-present");
  });

  it("resolves a role to a canonical NinjaPear profile URL", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request) => jsonResponse(person));
    const result = await createNinjaPearService({ apiKey: "test-key", fetchImpl })
      .find_role_url("Partner", "example.vc");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.url).toBe("https://nubela.co/api/v2/employee/profile?id=person-1");
    }
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.searchParams.get("role")).toBe("Partner");
    expect(url.searchParams.get("employer_website")).toBe("example.vc");
  });

  it("aggregates details, funding, customers, and competitors with bounded customer results", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/details")) {
        return jsonResponse({ name: "Example", websites: ["https://example.vc"], employee_count: 20 });
      }
      if (url.pathname.endsWith("/funding")) return jsonResponse({ funding_rounds: [] });
      if (url.pathname.includes("customer")) {
        return jsonResponse({ customers: [{ name: "A" }], investors: [], partner_platforms: [] });
      }
      return jsonResponse({ competitors: [{ website: "peer.vc" }] });
    });

    const result = await createNinjaPearService({ apiKey: "test-key", fetchImpl })
      .enrich_company("example.vc");

    expect(result.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const urls = fetchImpl.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.find((url) => url.pathname.includes("customer"))?.searchParams.get("page_size")).toBe("10");
    expect(urls.find((url) => url.pathname.endsWith("/details"))?.searchParams.get("use_cache")).toBe("if-present");
    expect(urls.filter((url) => !url.pathname.endsWith("/details"))
      .every((url) => url.searchParams.get("use_cache") === "if-present-only")).toBe(true);
    if (result.status === "ok") {
      expect(result.data.details?.employee_count).toBe(20);
      expect(result.data.relationships?.customers).toHaveLength(1);
      expect(result.data.competitors).toHaveLength(1);
    }
  });

  it("uses never for every company endpoint only on an explicit forced refresh", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/details")) return jsonResponse({ name: "Example", websites: [] });
      if (path.includes("customer")) return jsonResponse({ customers: [], investors: [], partner_platforms: [] });
      if (path.includes("competitor")) return jsonResponse({ competitors: [] });
      return jsonResponse({ funding_rounds: [] });
    });
    await createNinjaPearService({ apiKey: "test-key", fetchImpl })
      .enrich_company("example.vc", { useCache: "never" });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls.every(([input]) =>
      new URL(String(input)).searchParams.get("use_cache") === "never"
    )).toBe(true);
  });

  it("falls back to the base company profile when only paid headcount is unavailable", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/details") && url.searchParams.has("include_employee_count")) {
        return jsonResponse({ error: "Insufficient credits. Minimum balance of 5 credits required." }, 403);
      }
      if (url.pathname.endsWith("/details")) {
        return jsonResponse({ name: "Example", websites: ["https://example.vc"] }, 200, {
          "X-NinjaPear-Credit-Cost": "0",
          "X-NinjaPear-Cache-Age-Days": "0",
        });
      }
      return new Response(null, { status: 204 });
    });

    const result = await createNinjaPearService({ apiKey: "limited-key", fetchImpl })
      .enrich_company("example.vc");

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.details?.name).toBe("Example");
      expect(result.data.details?.employee_count).toBeUndefined();
      expect(result.data.partialErrors).toEqual([
        expect.objectContaining({ code: "http_403" }),
      ]);
      expect(result.meta.creditCost).toBe(0);
    }
  });

  it("does not let auxiliary company data mask a primary details failure", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/details")) {
        return jsonResponse({ message: "provider unavailable" }, 500);
      }
      return jsonResponse({ cached: true });
    });

    const result = await createNinjaPearService({ apiKey: "test-key", fetchImpl })
      .enrich_company("example.vc");

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.httpStatus).toBe(500);
    }
  });

  it("does not send unsupported use_cache to work-email and caches the session result", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request) => jsonResponse({ work_email: "ada@example.vc" }));
    const service = createNinjaPearService({ apiKey: "test-key", fetchImpl });

    const first = await service.find_work_email("Ada Lovelace", "https://www.example.vc/team");
    const second = await service.find_work_email("Ada Lovelace", "https://www.example.vc/team");

    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.searchParams.get("domain")).toBe("example.vc");
    expect(url.searchParams.has("use_cache")).toBe(false);
  });

  it("separates no-result logging from API errors", async () => {
    const logger = loggerSpies();
    const noResultFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const noResult = await createNinjaPearService({ apiKey: "test-key", fetchImpl: noResultFetch, logger })
      .enrich_person("Nobody Here", "missing.invalid");
    expect(noResult.status).toBe("not_found");
    expect(logger.warn).toHaveBeenCalledWith("ninjapear_no_result", expect.any(Object));
    expect(logger.error).not.toHaveBeenCalled();

    const apiLogger = loggerSpies();
    const errorFetch = vi.fn(async () => jsonResponse({ message: "credits exhausted" }, 403));
    const apiError = await createNinjaPearService({ apiKey: "test-key", fetchImpl: errorFetch, logger: apiLogger })
      .enrich_person("Ada Lovelace", "example.vc");
    expect(apiError.status).toBe("error");
    expect(apiLogger.error).toHaveBeenCalledWith("ninjapear_api_error", expect.any(Object));
    expect(apiLogger.warn).not.toHaveBeenCalledWith("ninjapear_no_result", expect.any(Object));
  });

  it("retries 429 responses using Retry-After without billing a real API", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: "rate limited" }, 429, { "Retry-After": "0" }))
      .mockResolvedValueOnce(jsonResponse(person));
    const sleep = vi.fn(async () => undefined);
    const result = await createNinjaPearService({ apiKey: "demo-api-key", fetchImpl, sleep })
      .enrich_person("Ada Lovelace", "example.vc");

    expect(result.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(0);
  });
});

describe("NinjaPear database cache helpers", () => {
  it("normalizes cache keys and respects the one-day expiry boundary", () => {
    expect(ninjaPearCacheKey("enrich_person", "  Ada   Lovelace ", "Example.VC"))
      .toBe("enrich_person|ada lovelace|example.vc");
    expect(isFreshNinjaPearCache(
      { fresh_until: "2026-08-20T00:00:00.000Z" },
      new Date("2026-08-19T00:00:00.000Z"),
    )).toBe(true);
    expect(isFreshNinjaPearCache(
      { fresh_until: "2026-08-19T00:00:00.000Z" },
      new Date("2026-08-19T00:00:00.000Z"),
    )).toBe(false);
  });
});
