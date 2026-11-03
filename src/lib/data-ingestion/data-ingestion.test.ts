import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseCsv } from "./import";
import { cleanName, normalizeCountry, normalizeDate, normalizeSourceRecord, normalizeWebsite } from "./normalize";
import { processSourceRecord } from "./pipeline";
import { resolveEntity } from "./matching";
import { dataQualityScore, normalizeRoundType, validateEntity } from "./validate";
import { AuthorizedApiConnector, browserExtractionEnabled } from "./connectors";
import { decideFieldMerge, reverseFieldChange } from "./merge";
import type { MatchCandidate, SourceRecord } from "./types";

const base = (payload: Record<string, unknown>, sourceId = "provider-1"): SourceRecord => ({
  provider: "crunchbase", entityType: "company", sourceId, sourceUrl: "https://www.crunchbase.com/organization/acme?utm_source=test",
  retrievedAt: "2026-11-02T12:00:00.000Z", payload, payloadHash: "", importJobId: "test-job", licenseScope: "fixture-only",
});

describe("authorized market data ingestion cleaning", () => {
  it("runs the deliberately messy four-record fixture as a dry-run quality sample", async () => {
    const fixture = JSON.parse(readFileSync("tests/fixtures/market-data-messy.json", "utf8")) as Array<{ provider: SourceRecord["provider"]; entityType: SourceRecord["entityType"]; sourceId: string; payload: Record<string, unknown> }>;
    const outputs = await Promise.all(fixture.map((row) => processSourceRecord({ ...base(row.payload, row.sourceId), provider: row.provider, entityType: row.entityType })));
    expect(outputs).toHaveLength(4);
    expect(outputs.filter((item) => item.status === "quarantined")).toHaveLength(3);
    expect(outputs.filter((item) => item.status === "staged")).toHaveLength(1);
    expect(outputs[0].normalized.name).toBe("Acme & Co");
    expect(outputs[0].normalized.foundedDate).toBe("2021");
    expect(outputs[3].normalized.currency).toBeNull();
  });

  it("cleans markup, Unicode, whitespace and duplicate legal suffixes", () => {
    expect(cleanName("  Acme&nbsp; &amp; Co., Inc. Inc.  ").value).toBe("Acme & Co");
    expect(cleanName("Founder").placeholder).toBe(true);
    expect(cleanName("Ada Lovelace — Founder").embeddedTitle).toBe(true);
  });

  it("normalizes domains and drops tracking parameters", () => {
    expect(normalizeWebsite("http://www.Example.com/path/?utm_campaign=x&keep=yes")).toEqual({ url: "https://example.com/path?keep=yes", domain: "example.com" });
    expect(normalizeWebsite("not a domain").domain).toBeNull();
  });

  it("maps countries and round labels without assuming amounts are USD", () => {
    expect(normalizeCountry("United States")).toBe("US");
    expect(normalizeCountry("Atlantis")).toBeNull();
    expect(normalizeRoundType("SERIES_A")).toBe("Series A");
    expect(normalizeDate("2023")).toBe("2023");
    expect(normalizeDate("2023-04")).toBe("2023-04");
    const normalized = normalizeSourceRecord(base({ name: "Acme Inc.", funding_amount: "1250000", country: "India" }));
    expect(normalized.amount).toBe(1250000);
    expect(normalized.currency).toBeNull();
    expect(validateEntity(normalized).map((issue) => issue.code)).toContain("funding_currency_missing");
  });

  it("quarantines malformed names and retains actionable validation issues", async () => {
    const output = await processSourceRecord(base({ name: "Unknown", country: "United States", founded_on: "not a date" }));
    expect(output.status).toBe("quarantined");
    expect(output.validation.map((issue) => issue.code)).toContain("missing_or_placeholder_name");
    expect(output.validation.map((issue) => issue.code)).toContain("invalid_date");
    expect(output.source.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("automatically matches strong identifiers and sends name-only matches to review", () => {
    const company = normalizeSourceRecord(base({ name: "Acme", website: "acme.example", country: "US" }));
    const domainCandidate: MatchCandidate = { id: "startup-1", entityType: "company", name: "Acme Corporation", domain: "acme.example" };
    expect(resolveEntity(company, [domainCandidate]).decision).toBe("auto_match");
    const nameOnly = normalizeSourceRecord(base({ name: "Acme", country: "US" }));
    expect(resolveEntity(nameOnly, [{ id: "startup-2", entityType: "company", name: "Acme", countryCode: "US" }]).decision).toBe("manual_review");
    expect(resolveEntity(nameOnly, [{ id: "person-1", entityType: "person", name: "Acme", countryCode: "US" }]).candidateId).toBeNull();
  });

  it("preserves verified values, queues provider conflicts, and reverses only unchanged fields", () => {
    const existing = { value: "Founder supplied", source: "vekta", sourceUrl: null, retrievedAt: "2026-10-01", confidence: 1, verified: true, userManaged: false };
    const incoming = { value: "Provider value", source: "crunchbase", sourceUrl: "https://example.invalid", retrievedAt: "2026-11-01", confidence: 0.99, verified: false, userManaged: false };
    expect(decideFieldMerge(existing, incoming, { vekta: 0.9, crunchbase: 1 }).reason).toBe("preserve_user_managed_or_verified_value");
    const manual = { ...existing, verified: false };
    expect(decideFieldMerge(manual, incoming, { vekta: 0.9, crunchbase: 0.8 }).action).toBe("review");
    const change = { entityType: "firm", entityId: "fixture", field: "description", before: "old", after: "new", source: "tracxn", sourceUrl: null, confidence: 0.9, status: "applied" as const };
    expect(reverseFieldChange(change, "new").after).toBe("old");
    expect(() => reverseFieldChange(change, "changed later")).toThrow(/manual review/);
  });

  it("parses quoted commas, escaped quotes, and rejects malformed CSV", () => {
    expect(parseCsv('id,name,description\n1,"Acme, Inc.","Raised ""a round"""')[0]).toEqual({ id: "1", name: "Acme, Inc.", description: 'Raised "a round"' });
    expect(() => parseCsv('id,name\n1,"unclosed')).toThrow(/open quoted field/);
  });

  it("calculates a data-quality score separate from business intelligence scores", () => {
    const entity = normalizeSourceRecord(base({ name: "Acme", website: "https://acme.example", country: "US" }));
    expect(dataQualityScore(entity)).toBeGreaterThan(0);
  });

  it("bounds Tracxn API pages and retries transient responses without exposing credentials in errors", async () => {
    let calls = 0;
    const connector = new AuthorizedApiConnector("tracxn", {
      baseUrl: "https://api.example.invalid/v1/companies", token: "test-token", licenseScope: "fixture",
      minIntervalMs: 0,
      requestFactory: ({ baseUrl, token }) => ({ url: new URL(baseUrl), init: { method: "POST", headers: { accessToken: token }, body: JSON.stringify({ size: 20 }) } }),
      parseResponse: (payload) => ({ records: payload.items as Record<string, unknown>[], nextCursor: String(payload.next_page ?? "") || null }),
      fetchImpl: async (_input, init) => {
        calls += 1;
        expect(new Headers(init?.headers).get("accessToken")).toBe("test-token");
        expect(JSON.parse(String(init?.body)).size).toBe(20);
        if (calls === 1) return new Response("busy", { status: 503 });
        return new Response(JSON.stringify({ items: [{ id: "x" }], next_page: "next" }), { status: 200 });
      },
    });
    const page = await connector.fetchPage("company");
    expect(calls).toBe(2);
    expect(page).toEqual({ records: [{ id: "x" }], nextCursor: "next" });
  });

  it("uses Crunchbase's official keyset search request and extracts its last-UUID cursor", async () => {
    let capturedUrl = ""; let capturedBody: Record<string, unknown> = {};
    const connector = new AuthorizedApiConnector("crunchbase", {
      token: "api-token", licenseScope: "approved-field-package", fieldIds: ["identifier", "short_description"], query: [], batchSize: 2, minIntervalMs: 0,
      fetchImpl: async (input, init) => {
        capturedUrl = String(input); capturedBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ entities: [{ uuid: "uuid-a", properties: { name: "Acme" } }, { uuid: "uuid-b", properties: { name: "Beta" } }] }), { status: 200 });
      },
    });
    const page = await connector.fetchPage("company");
    expect(capturedUrl).toBe("https://api.crunchbase.com/v4/data/searches/organizations");
    expect(capturedBody).toMatchObject({ field_ids: ["identifier", "short_description"], limit: 2 });
    expect(page.records.map((record) => record.id)).toEqual(["uuid-a", "uuid-b"]);
    expect(page.nextCursor).toBe("uuid-b");
  });

  it("does not retry authentication failures and stops pagination when cancelled", async () => {
    let calls = 0;
    const connector = new AuthorizedApiConnector("crunchbase", {
      baseUrl: "https://api.example.invalid/v4/search", token: "fixture-token", licenseScope: "fixture", minIntervalMs: 0,
      fetchImpl: async () => { calls += 1; return new Response("unauthorized", { status: 401 }); },
    });
    await expect(connector.fetchPage("company")).rejects.toThrow(/401/);
    expect(calls).toBe(1);
    const controller = new AbortController(); controller.abort();
    const cancelled = new AuthorizedApiConnector("tracxn", { baseUrl: "https://api.example.invalid", token: "fixture", licenseScope: "fixture", minIntervalMs: 0, requestFactory: ({ baseUrl }) => ({ url: new URL(baseUrl), init: {} }), parseResponse: () => ({ records: [], nextCursor: null }), fetchImpl: async () => { calls += 1; return new Response("unexpected", { status: 200 }); } });
    const cancelledPages = [];
    for await (const page of cancelled.iterate("company", null, controller.signal)) cancelledPages.push(page);
    expect(cancelledPages).toEqual([]);
    expect(calls).toBe(1);
    expect(browserExtractionEnabled("tracxn", { writtenPermission: true, licenseAllowsAutomation: true })).toBe(false);
    expect(browserExtractionEnabled("crunchbase", { writtenPermission: false, licenseAllowsAutomation: true })).toBe(false);
    expect(browserExtractionEnabled("crunchbase", { writtenPermission: true, licenseAllowsAutomation: true })).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });
});
